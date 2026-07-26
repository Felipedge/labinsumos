// src/pages/Aprobaciones.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, updateDoc, doc,
         serverTimestamp, addDoc, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer, puedeAprobarA } from '../lib/roles'
import { CheckCircle, XCircle, Clock, Shield, AlertTriangle } from 'lucide-react'

const MODULOS = [
  { id: 'estandares', label: 'Estándares', color: 'badge-ok' },
  { id: 'columnas',   label: 'Columnas',   color: 'badge-purple' },
  { id: 'reactivos',  label: 'Reactivos',  color: 'badge-info' },
  { id: 'placebo',    label: 'Placebo',    color: 'badge-warn' },
  { id: 'apis',       label: 'APIs',       color: 'badge-gray' },
]

function estadoTrasAprobacion(item) {
  if (item.modulo === 'columnas') return 'Cerrado'
  return 'Cerrado'
}

function nombreInsumo(item, modulo) {
  if (modulo === 'estandares') return `${item.nombre} — ${item.codigo}`
  if (modulo === 'columnas')   return `${item.codigo} — ${item.fase || ''} ${item.tamanoParticula || ''}`
  if (modulo === 'reactivos')  return `${item.nombre} — ${item.codigo}`
  if (modulo === 'placebo')    return `${item.productoReferencia} — ${item.codigo}`
  if (modulo === 'apis')       return `${item.nombre} — ${item.codigo}`
  return item.codigo || item.nombre || '—'
}

export default function Aprobaciones() {
  const { user }  = useAuth()
  const { rol }   = useRole()
  const puedeAprobar = puedoHacer(rol, 'aprobarInsumos')

  const [pendientes, setPendientes]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [filtroModulo, setFiltroModulo]     = useState('')
  const [rechazandoId, setRechazandoId]     = useState(null)
  const [razonRechazo, setRazonRechazo]     = useState('')
  const [corrigiendoId, setCorrigiendoId]   = useState(null)
  const [motivoCorreccion, setMotivoCorreccion] = useState('')
  const [procesando, setProcesando]         = useState(false)
  const [msg, setMsg]                       = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const todos = []
      for (const modulo of MODULOS) {
        const snap = await getDocs(
          query(collection(db, modulo.id), where('estado', '==', 'Espera Aprobación'))
        )
        snap.docs.forEach(d => {
          todos.push({ id: d.id, modulo: modulo.id, ...d.data() })
        })
      }
      todos.sort((a, b) => {
        const fa = a.creadoEn?.toDate?.() || new Date(0)
        const fb = b.creadoEn?.toDate?.() || new Date(0)
        return fa - fb
      })
      setPendientes(todos)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const puedeAprobarItem = (item) => {
    if (rol === 'admin') return true
    return puedeAprobarA(rol, item.creadoPorRol || 'administrativo')
  }

  const aprobar = async (item) => {
    if (!puedeAprobarItem(item)) {
      setMsg('No tienes jerarquía suficiente para aprobar este insumo')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    setProcesando(true)
    try {
      const estadoFinal = estadoTrasAprobacion(item)
      await updateDoc(doc(db, item.modulo, item.id), {
        estado:         estadoFinal,
        aprobadoPor:    user.email,
        aprobadoNombre: user.displayName || user.email,
        aprobadoEn:     serverTimestamp(),
        actualizadoEn:  serverTimestamp(),
      })
      await addDoc(collection(db, 'aprobaciones_log'), {
        insumoId:     item.id,
        modulo:       item.modulo,
        codigo:       item.codigo || '',
        nombre:       nombreInsumo(item, item.modulo),
        cliente:      item.cliente || '',
        accion:       'aprobado',
        estadoFinal,
        aprobadoPor:  user.email,
        aprobadoRol:  rol,
        ingresadoPor: item.creadoPor || '',
        ingresadoRol: item.creadoPorRol || '',
        fecha:        serverTimestamp(),
      })
      setMsg(`✅ ${nombreInsumo(item, item.modulo)} aprobado → estado: ${estadoFinal}`)
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch(e) { setMsg('Error al aprobar: ' + e.message) }
    finally { setProcesando(false) }
  }

  const rechazar = async (item) => {
    if (!razonRechazo.trim()) { setMsg('Ingresa la razón del rechazo'); return }
    if (!puedeAprobarItem(item)) {
      setMsg('No tienes jerarquía suficiente para rechazar este insumo')
      return
    }
    setProcesando(true)
    try {
      await updateDoc(doc(db, item.modulo, item.id), {
        estado:          'Rechazado',
        rechazadoPor:    user.email,
        rechazadoNombre: user.displayName || user.email,
        rechazadoEn:     serverTimestamp(),
        razonRechazo:    razonRechazo,
        actualizadoEn:   serverTimestamp(),
      })
      await addDoc(collection(db, 'aprobaciones_log'), {
        insumoId:     item.id,
        modulo:       item.modulo,
        codigo:       item.codigo || '',
        nombre:       nombreInsumo(item, item.modulo),
        cliente:      item.cliente || '',
        accion:       'rechazado',
        razon:        razonRechazo,
        rechazadoPor: user.email,
        rechazadoRol: rol,
        ingresadoPor: item.creadoPor || '',
        ingresadoRol: item.creadoPorRol || '',
        fecha:        serverTimestamp(),
      })
      setRechazandoId(null)
      setRazonRechazo('')
      setMsg('❌ Insumo rechazado. El encargado verá la razón en el inventario.')
      setTimeout(() => setMsg(''), 4000)
      load()
    } catch(e) { setMsg('Error al rechazar: ' + e.message) }
    finally { setProcesando(false) }
  }

  const solicitarCorreccion = async (item) => {
    if (!motivoCorreccion.trim()) { setMsg('Indica qué debe corregirse'); return }
    if (!puedeAprobarItem(item)) {
      setMsg('No tienes jerarquía suficiente')
      return
    }
    setProcesando(true)
    try {
      await updateDoc(doc(db, item.modulo, item.id), {
        estado:           'Requiere corrección',
        motivoCorreccion: motivoCorreccion,
        correccionPor:    user.email,
        correccionEn:     serverTimestamp(),
        actualizadoEn:    serverTimestamp(),
      })
      await addDoc(collection(db, 'aprobaciones_log'), {
        insumoId:     item.id,
        modulo:       item.modulo,
        codigo:       item.codigo || '',
        nombre:       nombreInsumo(item, item.modulo),
        cliente:      item.cliente || '',
        accion:       'correccion_solicitada',
        motivo:       motivoCorreccion,
        solicitadoPor: user.email,
        solicitadoRol: rol,
        ingresadoPor:  item.creadoPor || '',
        ingresadoRol:  item.creadoPorRol || '',
        fecha:         serverTimestamp(),
      })
      setCorrigiendoId(null)
      setMotivoCorreccion('')
      setMsg('⚠️ Corrección solicitada. El encargado deberá corregir y reenviar.')
      setTimeout(() => setMsg(''), 4000)
      load()
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setProcesando(false) }
  }

  if (!puedeAprobar) {
    return (
      <div className="empty">
        <Shield size={40}/>
        <p>Solo Jefe de laboratorio y Administrador pueden acceder a esta sección</p>
      </div>
    )
  }

  const filtrados = filtroModulo
    ? pendientes.filter(p => p.modulo === filtroModulo)
    : pendientes

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>
          Aprobaciones pendientes
          {pendientes.length > 0 && (
            <span className="badge badge-danger" style={{marginLeft:8}}>{pendientes.length}</span>
          )}
        </h2>
        <button className="btn btn-sm" onClick={load}>↻ Actualizar</button>
      </div>

      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        <button className="btn btn-sm"
          style={!filtroModulo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
          onClick={()=>setFiltroModulo('')}>
          Todos ({pendientes.length})
        </button>
        {MODULOS.map(m => {
          const count = pendientes.filter(p=>p.modulo===m.id).length
          return (
            <button key={m.id} className="btn btn-sm"
              style={filtroModulo===m.id?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
              onClick={()=>setFiltroModulo(m.id)}>
              {m.label} {count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {msg && (
        <div className="alert-item" style={{
          background: msg.includes('✅') ? 'var(--ok-lt)' : msg.includes('❌') ? 'var(--danger-lt)' : 'var(--warn-lt)',
          border: `1px solid ${msg.includes('✅') ? 'var(--ok)' : msg.includes('❌') ? 'var(--danger)' : 'var(--warn)'}`,
          marginBottom:12
        }}>
          {msg}
        </div>
      )}

      {filtrados.length === 0 && (
        <div className="empty" style={{padding:60}}>
          <CheckCircle size={40}/>
          <p>No hay insumos pendientes de aprobación</p>
        </div>
      )}

      {filtrados.map(item => {
        const esRechazando  = rechazandoId  === item.id
        const esCorrigiendo = corrigiendoId === item.id
        const fechaIngreso  = item.creadoEn?.toDate?.()
        const puedeEste     = puedeAprobarItem(item)
        const estadoSiAprueba = estadoTrasAprobacion(item)

        return (
          <div key={item.id} className="card" style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
                  <span className={`badge ${MODULOS.find(m=>m.id===item.modulo)?.color||'badge-gray'}`}>
                    {MODULOS.find(m=>m.id===item.modulo)?.label}
                  </span>
                  <span className="badge badge-warn">
                    <Clock size={10} style={{marginRight:3}}/> Espera Aprobación
                  </span>
                  {!puedeEste && (
                    <span className="badge badge-gray">Sin permiso para aprobar</span>
                  )}
                </div>

                <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>
                  {nombreInsumo(item, item.modulo)}
                </p>
                <div style={{display:'flex',gap:12,fontSize:11,color:'var(--text-2)',flexWrap:'wrap'}}>
                  {item.cliente    && <span>Cliente: {item.cliente}</span>}
                  {item.sector     && <span>Sector: {item.sector}</span>}
                  {item.creadoPor  && <span>Ingresado por: {item.creadoPor}</span>}
                  {fechaIngreso    && <span>Fecha: {fechaIngreso.toLocaleDateString('es-CL')} {fechaIngreso.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>}
                </div>

                <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
                  {item.modulo === 'estandares' && (
                    <>
                      {item.tipoPotencia && (
                        <span className="badge badge-gray">
                          {item.tipoPotencia === 'tal_cual'      ? `${item.potencia}% Tal cual`
                           : item.tipoPotencia === 'base_seca'   ? `${item.potencia}% Base seca`
                           : item.tipoPotencia === 'cualitativo' ? 'Cualitativo'
                           : 'Sin potencia'}
                        </span>
                      )}
                      {item.esUSP        && <span className="badge badge-info">🔵 USP</span>}
                      {item.karlFischer  && <span className="badge badge-warn">💧 Karl Fischer</span>}
                      {item.secadoPrevio && <span className="badge badge-warn">🌡️ Secado previo</span>}
                      <span className="badge badge-gray">Stock: {item.stockInicial} mg</span>
                      <span className="badge badge-gray">Frasco {item.frasco}</span>
                    </>
                  )}
                  {item.modulo === 'columnas' && (
                    <>
                      <span className="badge badge-purple">{item.fase} · {item.tamanoParticula}</span>
                      {item.area        && <span className="badge badge-gray">{item.area}</span>}
                      {item.loteSerie   && <span className="badge badge-gray">Lote: {item.loteSerie}</span>}
                      {item.fabricante  && <span className="badge badge-gray">{item.fabricante}</span>}
                    </>
                  )}
                  {item.modulo === 'reactivos' && (
                    <>
                      <span className="badge badge-info">{item.categoria}</span>
                      <span className="badge badge-gray">Stock: {item.stockRestante} {item.unidad}</span>
                    </>
                  )}
                  {item.modulo === 'placebo' && (
                    <>
                      <span className="badge badge-gray">{item.formaFarmaceutica}</span>
                      <span className="badge badge-gray">Stock: {item.stockUnidades} unidades</span>
                    </>
                  )}
                  {item.modulo === 'apis' && (
                    <>
                      {item.laboratorio && <span className="badge badge-gray">{item.laboratorio}</span>}
                      {item.lote        && <span className="badge badge-gray">Lote: {item.lote}</span>}
                    </>
                  )}
                  {item.observacion && (
                    <span style={{fontSize:11,color:'var(--text-2)',fontStyle:'italic'}}>
                      Obs: {item.observacion}
                    </span>
                  )}
                </div>

                {puedeEste && (
                  <div style={{marginTop:8,fontSize:11,color:'var(--text-3)'}}>
                    Al aprobar, el insumo pasará a estado{' '}
                    <span className="badge badge-info" style={{fontSize:10}}>{estadoSiAprueba}</span>
                    {' '}— deberá ser puesto en uso manualmente.
                  </div>
                )}

                {/* Formulario rechazo */}
                {esRechazando && (
                  <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <input
                      value={razonRechazo}
                      onChange={e=>setRazonRechazo(e.target.value)}
                      placeholder="Razón del rechazo (obligatorio)"
                      style={{flex:1,minWidth:200,padding:'6px 10px',border:'1px solid var(--danger)',borderRadius:'var(--radius-sm)',fontSize:13}}
                      autoFocus
                    />
                    <button className="btn btn-sm" style={{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}}
                      onClick={()=>rechazar(item)} disabled={procesando}>
                      Confirmar rechazo
                    </button>
                    <button className="btn btn-sm" onClick={()=>{setRechazandoId(null);setRazonRechazo('')}}>
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Formulario corrección */}
                {esCorrigiendo && (
                  <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <input
                      value={motivoCorreccion}
                      onChange={e=>setMotivoCorreccion(e.target.value)}
                      placeholder="¿Qué debe corregirse? (obligatorio)"
                      style={{flex:1,minWidth:200,padding:'6px 10px',border:'1px solid var(--warn)',borderRadius:'var(--radius-sm)',fontSize:13}}
                      autoFocus
                    />
                    <button className="btn btn-sm"
                      style={{background:'var(--warn-lt)',color:'var(--warn)',borderColor:'var(--warn)'}}
                      onClick={()=>solicitarCorreccion(item)} disabled={procesando}>
                      Solicitar corrección
                    </button>
                    <button className="btn btn-sm" onClick={()=>{setCorrigiendoId(null);setMotivoCorreccion('')}}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              {!esRechazando && !esCorrigiendo && puedeEste && (
                <div style={{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap'}}>
                  <button className="btn btn-sm"
                    style={{background:'var(--ok-lt)',color:'var(--ok)',borderColor:'var(--ok)'}}
                    onClick={()=>aprobar(item)} disabled={procesando}>
                    <CheckCircle size={14}/> Aprobar
                  </button>
                  <button className="btn btn-sm"
                    style={{background:'var(--warn-lt)',color:'var(--warn)',borderColor:'var(--warn)'}}
                    onClick={()=>{setCorrigiendoId(item.id);setMotivoCorreccion('');setRechazandoId(null)}}
                    disabled={procesando}>
                    <AlertTriangle size={14}/> Corrección
                  </button>
                  <button className="btn btn-sm"
                    style={{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}}
                    onClick={()=>{setRechazandoId(item.id);setRazonRechazo('');setCorrigiendoId(null)}}
                    disabled={procesando}>
                    <XCircle size={14}/> Rechazar
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}