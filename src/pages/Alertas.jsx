// src/pages/Alertas.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getEstandares, getColumnas, getReactivos, getPlacebos,
         calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { FlaskConical, Cylinder, Droplets, Pill, AlertTriangle,
         Clock, X, History, CheckCircle, XCircle } from 'lucide-react'
 
const ICONOS = { Estándar: FlaskConical, Columna: Cylinder, Reactivo: Droplets, Placebo: Pill, API: FlaskConical }
 
// ── Modal para solicitar cierre de alerta ────────────────────
function ModalCierre({ alerta, onConfirmar, onCancelar }) {
  const [razon, setRazon] = useState('')
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',
        padding:24,width:'100%',maxWidth:460}}>
        <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Solicitar cierre de alerta</p>
        <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>
          {alerta.nombre} · {alerta.codigo}
        </p>
        <div className="form-group">
          <label>Razón del cierre *</label>
          <input value={razon} onChange={e=>setRazon(e.target.value)}
            placeholder="ej: Insumo repuesto, análisis finalizado, vencimiento justificado..."/>
          <p style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
            Esta solicitud será revisada y aprobada por un usuario con rol superior.
          </p>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn btn-primary btn-sm"
            onClick={()=>{ if(razon.trim()) onConfirmar(razon) }}
            disabled={!razon.trim()}>
            Enviar solicitud
          </button>
          <button className="btn btn-sm" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
 
export default function Alertas() {
  const { user } = useAuth()
  const { rol }  = useRole()
 
  const puedeSolicitar = rol === 'admin' || rol === 'jefe' || rol === 'encargado'
  const puedeAprobar   = rol === 'admin' || rol === 'jefe'
 
  const [alertas, setAlertas]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [filtro, setFiltro]           = useState('todas')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [tab, setTab]                 = useState('activas')
  const [historial, setHistorial]     = useState([])
  const [loadingH, setLoadingH]       = useState(false)
  const [alertaCierre, setAlertaCierre] = useState(null)
  const [pendientesAprobacion, setPendientesAprobacion] = useState([])
  const [procesando, setProcesando]   = useState(false)
  const [msg, setMsg]                 = useState('')
 
  // Cargar alertas activas
  useEffect(() => {
    async function load() {
      try {
        const [stds, cols, reacts, pls] = await Promise.all([
          getEstandares(), getColumnas(), getReactivos(), getPlacebos()
        ])
        const all = []
 
        stds.forEach(s => {
          if (s.estado === 'SIN STOCK') return
          const vence = s.fechaVencimiento?.toDate?.() || (s.fechaVencimiento ? new Date(s.fechaVencimiento) : null)
          // USP
          if (s.esUSP) {
            const dias = s.proximaRevisionUSP
              ? Math.round((new Date(s.proximaRevisionUSP) - new Date()) / 86400000)
              : null
            if (dias !== null && dias <= 60) {
              all.push({ tipo:'Estándar', codigo:s.codigo, nombre:s.nombre,
                cliente:s.cliente || '—', insumoId:s.id,
                sem: { color: dias <= 30 ? 'danger' : 'warning', texto: `USP revisar en ${dias}d`, dias },
                detalle:`Revisión USP requerida`, accion:'Verificar vigencia en catálogo USP' })
            }
            return
          }
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success') {
            all.push({ tipo:'Estándar', codigo:s.codigo, nombre:s.nombre,
              cliente:s.cliente || '—', insumoId:s.id, sem,
              detalle:`Stock: ${s.stockRestante ?? '—'} mg`,
              accion: sem.color==='danger'?'Solicitar reposición urgente':'Planificar reposición o re-test' })
          }
        })
 
        // Las columnas ya no generan alertas por inyecciones; su baja es manual
        // (retiro solicitado por el cliente). Se omiten del cálculo de alertas.
 
        reacts.forEach(r => {
          const vence = r.fechaVencimiento?.toDate?.() || (r.fechaVencimiento ? new Date(r.fechaVencimiento) : null)
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success' || r.estado === 'STOCK BAJO') {
            all.push({ tipo:'Reactivo', codigo:r.codigo, nombre:r.nombre,
              cliente:'—', insumoId:r.id, sem,
              detalle:`Stock: ${r.stockRestante ?? '—'} ${r.unidad||''}`,
              accion:'Reponer stock o verificar alternativo' })
          }
        })
 
        pls.forEach(p => {
          const vence = p.fechaVencimiento?.toDate?.() || (p.fechaVencimiento ? new Date(p.fechaVencimiento) : null)
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success') {
            all.push({ tipo:'Placebo', codigo:p.codigo, nombre:p.productoReferencia,
              cliente:p.cliente || '—', insumoId:p.id, sem,
              detalle:`Stock: ${p.stockUnidades ?? '—'} unidades`,
              accion:'Solicitar nuevo lote al cliente' })
          }
        })
 
        all.sort((a,b) => (a.sem.dias ?? 9999) - (b.sem.dias ?? 9999))
        setAlertas(all)
      } catch { setAlertas([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])
 
  // Cargar solicitudes pendientes de aprobación
  useEffect(() => {
    if (!puedeAprobar) return
    async function loadPendientes() {
      try {
        const snap = await getDocs(
          query(collection(db, 'alertas_cierre'),
            where('estado', '==', 'pendiente'),
            orderBy('creadoEn', 'desc'))
        )
        setPendientesAprobacion(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch(e) { console.error(e) }
    }
    loadPendientes()
  }, [puedeAprobar])
 
  // Cargar historial de alertas cerradas
  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'alertas_cierre'),
          where('estado', '==', 'aprobado'),
          orderBy('aprobadoEn', 'desc'))
      )
      setHistorial(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    finally { setLoadingH(false) }
  }
 
  useEffect(() => {
    if (tab === 'historial') loadHistorial()
  }, [tab])
 
  // Solicitar cierre de alerta
  const solicitarCierre = async (alerta, razon) => {
    setProcesando(true)
    try {
      await addDoc(collection(db, 'alertas_cierre'), {
        insumoId:     alerta.insumoId || '',
        tipo:         alerta.tipo,
        codigo:       alerta.codigo,
        nombre:       alerta.nombre,
        cliente:      alerta.cliente,
        semColor:     alerta.sem.color,
        semTexto:     alerta.sem.texto,
        detalle:      alerta.detalle,
        razon,
        estado:       rol === 'admin' ? 'aprobado' : 'pendiente',
        solicitadoPor:  user.email,
        solicitadoRol:  rol,
        solicitadoNombre: user.displayName || user.email,
        creadoEn:     serverTimestamp(),
        // Si es admin, se auto-aprueba
        ...(rol === 'admin' ? {
          aprobadoPor:    user.email,
          aprobadoNombre: user.displayName || user.email,
          aprobadoEn:     serverTimestamp(),
        } : {})
      })
      setAlertaCierre(null)
      setMsg(rol === 'admin'
        ? '✅ Alerta cerrada y movida al historial'
        : '✅ Solicitud enviada — pendiente de aprobación por Jefe o Admin')
      setTimeout(() => setMsg(''), 4000)
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setProcesando(false) }
  }
 
  // Aprobar cierre
  const aprobarCierre = async (solicitud) => {
    setProcesando(true)
    try {
      await updateDoc(doc(db, 'alertas_cierre', solicitud.id), {
        estado:         'aprobado',
        aprobadoPor:    user.email,
        aprobadoNombre: user.displayName || user.email,
        aprobadoEn:     serverTimestamp(),
      })
      setPendientesAprobacion(p => p.filter(x => x.id !== solicitud.id))
      setMsg('✅ Cierre de alerta aprobado')
      setTimeout(() => setMsg(''), 3000)
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setProcesando(false) }
  }
 
  // Rechazar cierre
  const rechazarCierre = async (solicitud) => {
    const razon = window.prompt('Razón del rechazo:')
    if (!razon) return
    setProcesando(true)
    try {
      await updateDoc(doc(db, 'alertas_cierre', solicitud.id), {
        estado:          'rechazado',
        rechazadoPor:    user.email,
        rechazadoNombre: user.displayName || user.email,
        razonRechazo:    razon,
        rechazadoEn:     serverTimestamp(),
      })
      setPendientesAprobacion(p => p.filter(x => x.id !== solicitud.id))
      setMsg('❌ Solicitud rechazada')
      setTimeout(() => setMsg(''), 3000)
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setProcesando(false) }
  }
 
  // Clientes únicos para filtro
  const clientesUnicos = [...new Set(alertas.map(a => a.cliente).filter(c => c && c !== '—'))].sort()
 
  const filtradas = alertas
    .filter(a => {
      const matchF = filtro === 'todas' ? true
        : filtro === 'criticas'    ? a.sem.color === 'danger'
        : filtro === 'advertencia' ? a.sem.color === 'warning'
        : a.tipo === filtro
      const matchC = !filtroCliente || a.cliente === filtroCliente
      return matchF && matchC
    })
 
  const criticas    = alertas.filter(a => a.sem.color === 'danger').length
  const advertencia = alertas.filter(a => a.sem.color === 'warning').length
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      {alertaCierre && (
        <ModalCierre
          alerta={alertaCierre}
          onConfirmar={(razon) => solicitarCierre(alertaCierre, razon)}
          onCancelar={() => setAlertaCierre(null)}
        />
      )}
 
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>Alertas</h2>
        {puedeAprobar && pendientesAprobacion.length > 0 && (
          <span className="badge badge-danger">{pendientesAprobacion.length} solicitudes pendientes</span>
        )}
      </div>
 
      {/* KPIs */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))',marginBottom:16}}>
        <div className="kpi-card">
          <div className="kpi-label"><AlertTriangle size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}}/>Críticas</div>
          <div className="kpi-value danger">{criticas}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Clock size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}}/>Advertencia</div>
          <div className="kpi-value warn">{advertencia}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total activas</div>
          <div className="kpi-value">{alertas.length}</div>
        </div>
      </div>
 
      {/* Pestañas */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[
          { id:'activas',   label:'Alertas activas', count: alertas.length },
          { id:'pendientes', label:'Solicitudes pendientes', count: pendientesAprobacion.length, hidden: !puedeAprobar },
          { id:'historial', label:'Historial cerradas' },
        ].filter(t => !t.hidden).map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 16px',
            fontSize:13,cursor:'pointer',border:'none',background:'none',
            color:tab===t.id?'var(--accent)':'var(--text-2)',
            borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
            fontWeight:tab===t.id?500:400,marginBottom:-1,
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{fontSize:11,padding:'1px 6px',borderRadius:10,
                background: t.id==='pendientes' ? 'var(--danger)' : 'var(--bg)',
                color: t.id==='pendientes' ? '#fff' : 'var(--text-2)'}}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
 
      {msg && (
        <div className="alert-item" style={{
          background: msg.includes('✅') ? 'var(--ok-lt)' : 'var(--danger-lt)',
          border: `1px solid ${msg.includes('✅') ? 'var(--ok)' : 'var(--danger)'}`,
          marginBottom:12
        }}>{msg}</div>
      )}
 
      {/* ── TAB ALERTAS ACTIVAS ── */}
      {tab === 'activas' && (
        <>
          {/* Filtros */}
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[
                { k:'todas',       l:'Todas' },
                { k:'criticas',    l:'Críticas' },
                { k:'advertencia', l:'Advertencia' },
                { k:'Estándar',    l:'Estándares' },
                { k:'Reactivo',    l:'Reactivos' },
                { k:'Placebo',     l:'Placebo' },
              ].map(({ k, l }) => (
                <button key={k} className="btn btn-sm"
                  style={filtro===k?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
                  onClick={() => setFiltro(k)}>{l}</button>
              ))}
            </div>
            {/* Filtro por cliente */}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,color:'var(--text-2)'}}>Cliente:</span>
              <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}
                style={{fontSize:12,padding:'4px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-md)'}}>
                <option value="">Todos los clientes</option>
                {clientesUnicos.map(c=><option key={c}>{c}</option>)}
              </select>
              {filtroCliente && (
                <button className="btn btn-sm" onClick={()=>setFiltroCliente('')}>✕ Limpiar</button>
              )}
            </div>
          </div>
 
          {filtradas.length === 0 && (
            <div className="empty"><AlertTriangle size={32}/><p>Sin alertas en esta categoría</p></div>
          )}
 
          {filtradas.map((a, i) => {
            const Icon = ICONOS[a.tipo] || FlaskConical
            const cls  = a.sem.color === 'danger' ? 'danger' : 'warn'
            return (
              <div key={i} className={`alert-item ${cls}`} style={{alignItems:'flex-start'}}>
                <Icon size={15} style={{flexShrink:0,marginTop:2}}/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <strong>{a.nombre}</strong>
                    <span className="badge badge-gray">{a.tipo}</span>
                    <span className="mono" style={{color:'var(--text-3)',fontSize:11}}>{a.codigo}</span>
                    {a.cliente !== '—' && <span style={{color:'var(--text-3)',fontSize:11}}>· {a.cliente}</span>}
                  </div>
                  <div style={{marginTop:3,fontSize:12,color:'var(--text-2)'}}>
                    {a.detalle} · <strong>{a.sem.texto}</strong>
                  </div>
                  <div style={{marginTop:2,fontSize:11,color:'var(--text-3)'}}>
                    Acción: {a.accion}
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
                  <span className={`badge badge-${cls === 'danger' ? 'danger' : 'warn'}`}>
                    {a.sem.color === 'danger' ? 'Crítico' : 'Advertencia'}
                  </span>
                  {puedeSolicitar && (
                    <button className="btn btn-sm"
                      style={{fontSize:11,padding:'3px 8px'}}
                      onClick={()=>setAlertaCierre(a)}
                      title="Solicitar cierre de esta alerta">
                      <X size={11}/> Cerrar alerta
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
 
      {/* ── TAB SOLICITUDES PENDIENTES ── */}
      {tab === 'pendientes' && puedeAprobar && (
        <>
          {pendientesAprobacion.length === 0 && (
            <div className="empty"><CheckCircle size={32}/><p>No hay solicitudes pendientes</p></div>
          )}
          {pendientesAprobacion.map(s => (
            <div key={s.id} className="card" style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:6}}>
                    <span className="badge badge-warn">Pendiente de aprobación</span>
                    <span className="badge badge-gray">{s.tipo}</span>
                    <span className={`badge ${s.semColor==='danger'?'badge-danger':'badge-warn'}`}>
                      {s.semColor==='danger'?'Crítico':'Advertencia'}
                    </span>
                  </div>
                  <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>{s.nombre}</p>
                  <div style={{fontSize:11,color:'var(--text-2)',display:'flex',gap:12,flexWrap:'wrap',marginBottom:6}}>
                    <span>Código: {s.codigo}</span>
                    {s.cliente && s.cliente !== '—' && <span>Cliente: {s.cliente}</span>}
                    <span>Solicitado por: {s.solicitadoNombre}</span>
                  </div>
                  <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'8px 12px',fontSize:12}}>
                    <strong>Razón del cierre:</strong> {s.razon}
                  </div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button className="btn btn-sm"
                    style={{background:'var(--ok-lt)',color:'var(--ok)',borderColor:'var(--ok)'}}
                    onClick={()=>aprobarCierre(s)} disabled={procesando}>
                    <CheckCircle size={13}/> Aprobar
                  </button>
                  <button className="btn btn-sm"
                    style={{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}}
                    onClick={()=>rechazarCierre(s)} disabled={procesando}>
                    <XCircle size={13}/> Rechazar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
 
      {/* ── TAB HISTORIAL ── */}
      {tab === 'historial' && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>
          </div>
          {loadingH ? (
            <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
          ) : historial.length === 0 ? (
            <div className="empty"><History size={32}/><p>No hay alertas cerradas</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha cierre</th><th>Tipo</th><th>Insumo</th><th>Cliente</th>
                    <th>Razón</th><th>Solicitado por</th><th>Aprobado por</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(h => (
                    <tr key={h.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>
                        {h.aprobadoEn?.toDate?.()?.toLocaleDateString('es-CL') || '—'}
                      </td>
                      <td><span className="badge badge-gray">{h.tipo}</span></td>
                      <td>
                        <div style={{fontWeight:500,fontSize:13}}>{h.nombre}</div>
                        <div style={{fontSize:10,color:'var(--text-3)'}}>{h.codigo}</div>
                      </td>
                      <td style={{color:'var(--text-2)',fontSize:12}}>{h.cliente || '—'}</td>
                      <td style={{fontSize:12,color:'var(--text-2)',maxWidth:200}}>{h.razon}</td>
                      <td style={{fontSize:11,color:'var(--text-2)'}}>{h.solicitadoNombre || h.solicitadoPor}</td>
                      <td style={{fontSize:11,color:'var(--text-2)'}}>{h.aprobadoNombre || h.aprobadoPor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}