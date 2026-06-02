// src/pages/AuditLog.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Shield, RefreshCw } from 'lucide-react'

const MODULOS = ['estandares', 'columnas', 'reactivos', 'placebo']

const ACCIONES = ['crear', 'pesada', 'uso', 'retiro', 'reasignar',
                  'dar_de_baja', 'restaurar', 'aprobar', 'rechazar',
                  'verificacion_usp', 'poner_en_uso']

const ETIQUETAS_ACCION = {
  crear:            'Crear',
  pesada:           'Pesada',
  uso:              'Uso',
  retiro:           'Retiro',
  reasignar:        'Reasignar',
  dar_de_baja:      'Dar de baja',
  restaurar:        'Restaurar',
  aprobar:          'Aprobar',
  rechazar:         'Rechazar',
  verificacion_usp: 'Verificación USP',
  poner_en_uso:     'Poner en uso',
}

const COLORES_ACCION = {
  crear:            'badge-ok',
  pesada:           'badge-info',
  uso:              'badge-info',
  retiro:           'badge-purple',
  reasignar:        'badge-gray',
  dar_de_baja:      'badge-danger',
  restaurar:        'badge-ok',
  aprobar:          'badge-ok',
  rechazar:         'badge-danger',
  verificacion_usp: 'badge-info',
  poner_en_uso:     'badge-ok',
}

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
}

function DiffValor({ antes, despues }) {
  if (!antes && !despues) return <span style={{color:'var(--text-3)'}}>—</span>

  const keys = [...new Set([
    ...Object.keys(antes || {}),
    ...Object.keys(despues || {}),
  ])]

  return (
    <div style={{fontSize:11}}>
      {keys.map(k => {
        const a = antes?.[k]
        const d = despues?.[k]
        const cambio = JSON.stringify(a) !== JSON.stringify(d)
        return (
          <div key={k} style={{display:'flex',gap:6,alignItems:'center',marginBottom:2}}>
            <span style={{color:'var(--text-3)',minWidth:80}}>{k}:</span>
            {cambio && a !== undefined && (
              <span style={{color:'var(--danger)',textDecoration:'line-through'}}>{String(a)}</span>
            )}
            {cambio && <span style={{color:'var(--text-3)'}}>→</span>}
            {d !== undefined && (
              <span style={{color:cambio?'var(--ok)':'var(--text-2)',fontWeight:cambio?600:400}}>{String(d)}</span>
            )}
            {!cambio && <span style={{color:'var(--text-2)'}}>{String(a ?? d)}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function AuditLog() {
  const { rol } = useRole()
  const puedeVer = rol === 'admin' || rol === 'jefe'

  const [registros, setRegistros]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [filtroModulo, setFiltroModulo]   = useState('')
  const [filtroAccion, setFiltroAccion]   = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [fechaDesde, setFechaDesde]       = useState('')
  const [fechaHasta, setFechaHasta]       = useState('')
  const [expandido, setExpandido]         = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'audit_log'), orderBy('timestamp', 'desc'), limit(500))
      )
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (puedeVer) load() }, [puedeVer])

  if (!puedeVer) {
    return (
      <div className="empty">
        <Shield size={40}/>
        <p>Solo Administrador y Jefe de laboratorio pueden ver el registro de auditoría</p>
      </div>
    )
  }

  // Usuarios únicos
  const usuariosUnicos = [...new Set(registros.map(r => r.email).filter(Boolean))].sort()

  // Filtrado
  const filtrados = registros.filter(r => {
    const matchM = !filtroModulo  || r.coleccion === filtroModulo
    const matchA = !filtroAccion  || r.accion    === filtroAccion
    const matchU = !filtroUsuario || r.email      === filtroUsuario
    const fecha  = r.timestamp?.toDate?.()
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchM && matchA && matchU && matchD && matchH
  })

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>
          Registro de auditoría
          <span style={{fontSize:12,fontWeight:400,color:'var(--text-2)',marginLeft:8}}>
            CFR 21 §11.10(e) — GAMP 5
          </span>
        </h2>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13}/> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        <div className="kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value info">{registros.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Filtrados</div><div className="kpi-value">{filtrados.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Usuarios activos</div><div className="kpi-value">{usuariosUnicos.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Último registro</div>
          <div className="kpi-value" style={{fontSize:11}}>
            {registros[0]?.timestamp ? formatFecha(registros[0].timestamp).split(' ')[0] : '—'}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-title">Filtros</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Módulo</label>
            <select value={filtroModulo} onChange={e=>setFiltroModulo(e.target.value)}>
              <option value="">Todos los módulos</option>
              {MODULOS.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Acción</label>
            <select value={filtroAccion} onChange={e=>setFiltroAccion(e.target.value)}>
              <option value="">Todas las acciones</option>
              {ACCIONES.map(a=><option key={a} value={a}>{ETIQUETAS_ACCION[a]||a}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Usuario</label>
            <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
              <option value="">Todos los usuarios</option>
              {usuariosUnicos.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Desde</label>
            <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/>
          </div>
          <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
            <button className="btn btn-sm" onClick={()=>{setFiltroModulo('');setFiltroAccion('');setFiltroUsuario('');setFechaDesde('');setFechaHasta('')}}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Módulo</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>Cambios</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(r => (
                <>
                  <tr key={r.id}
                    onClick={()=>setExpandido(expandido===r.id ? null : r.id)}
                    style={{cursor:'pointer', background: expandido===r.id ? 'var(--accent-lt)' : undefined}}>
                    <td style={{fontSize:11,whiteSpace:'nowrap',color:'var(--text-2)'}}>{formatFecha(r.timestamp)}</td>
                    <td>
                      <div style={{fontSize:12,fontWeight:500}}>{r.usuario}</div>
                      <div style={{fontSize:10,color:'var(--text-3)'}}>{r.email}</div>
                    </td>
                    <td><span className="badge badge-gray">{r.coleccion}</span></td>
                    <td><span className={`badge ${COLORES_ACCION[r.accion]||'badge-gray'}`}>{ETIQUETAS_ACCION[r.accion]||r.accion}</span></td>
                    <td style={{fontSize:11,color:'var(--text-2)',maxWidth:250}}>{r.detalle || '—'}</td>
                    <td style={{fontSize:11,color:'var(--text-3)'}}>
                      {(r.antes || r.despues) ? '▼ Ver cambios' : '—'}
                    </td>
                  </tr>
                  {expandido === r.id && (r.antes || r.despues) && (
                    <tr key={r.id+'_expand'}>
                      <td colSpan={6} style={{background:'var(--bg)',padding:'10px 16px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                          {r.antes && (
                            <div>
                              <p style={{fontSize:11,fontWeight:600,color:'var(--danger)',marginBottom:6}}>ANTES</p>
                              <DiffValor antes={r.antes} despues={null}/>
                            </div>
                          )}
                          {r.despues && (
                            <div>
                              <p style={{fontSize:11,fontWeight:600,color:'var(--ok)',marginBottom:6}}>DESPUÉS</p>
                              <DiffValor antes={null} despues={r.despues}/>
                            </div>
                          )}
                        </div>
                        {r.antes && r.despues && (
                          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
                            <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:6}}>DIFERENCIAS</p>
                            <DiffValor antes={r.antes} despues={r.despues}/>
                          </div>
                        )}
                        <div style={{marginTop:8,fontSize:10,color:'var(--text-3)'}}>
                          ID documento: {r.documentoId}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                  No hay registros que coincidan con los filtros
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}