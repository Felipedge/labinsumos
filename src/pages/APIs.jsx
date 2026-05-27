// src/pages/APIs.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, Search, FileText } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'

const LABORATORIOS = ['Lab. Chile', 'Novartis', 'MSN', 'Ascend', 'Galenicum', 'Grunenthal', 'BPH', 'Otro']
const UBICACIONES  = ['Desecador', 'Refrigerador', 'Freezer', 'Refrigerador controlado', 'Desecador Validaciones', 'Otro']

function capitalizar(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export default function APIs() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')
  const puedeBaja    = puedoHacer(rol, 'darDeBaja')

  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({})
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [ordenCampo, setOrdenCampo] = useState('nombre')
  const [ordenDir, setOrdenDir]     = useState('asc')
  const [docInsumo, setDocInsumo]   = useState(null)
  const [verPapelera, setVerPapelera] = useState(false)

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'apis'), orderBy('creadoEn', 'desc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setItems(DEMO) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!form.codigo || !form.nombre || !form.laboratorio) {
      setMsg('Código, nombre y laboratorio son obligatorios'); return
    }
    try {
      await addDoc(collection(db, 'apis'), {
        codigo:           form.codigo.toUpperCase(),
        nombre:           capitalizar(form.nombre),
        lote:             form.lote || '',
        laboratorio:      form.laboratorio,
        ubicacion:        form.ubicacion || 'Desecador',
        fechaVencimiento: form.vencimiento ? new Date(form.vencimiento) : null,
        cantidadRecibida: form.cantidad || '',
        observacion:      capitalizar(form.observacion || ''),
        stock:            true,
        estado:           'Pendiente de aprobación',
        creadoPorRol:     rol,
        creadoPor:        user.email,
        creadoEn:         serverTimestamp(),
        actualizadoEn:    serverTimestamp(),
      })
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const darDeBaja = async (id, codigo) => {
    const razon = window.prompt(`Razón para dar de baja ${codigo}:`)
    if (!razon) return
    try {
      await updateDoc(doc(db, 'apis', id), {
        estado: 'Dado de baja', bajaPor: user.email,
        bajaRazon: capitalizar(razon),
        bajaFecha: serverTimestamp(), actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const restaurar = async (id) => {
    try {
      await updateDoc(doc(db, 'apis', id), {
        estado: 'ACTIVO', bajaPor: null, bajaRazon: null,
        bajaFecha: null, actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }

  const activos  = items.filter(i => i.estado !== 'Dado de baja')
  const papelera = items.filter(i => i.estado === 'Dado de baja')

  const filtrados = (verPapelera ? papelera : activos)
    .filter(i => {
      const q = search.toLowerCase()
      const matchQ = !q || i.codigo?.toLowerCase().includes(q) ||
        i.nombre?.toLowerCase().includes(q) ||
        i.laboratorio?.toLowerCase().includes(q)
      const matchE = !filtroEst || i.estado === filtroEst
      return matchQ && matchE
    })
    .sort((a, b) => {
      let valA, valB
      if (ordenCampo === 'nombre') {
        valA = a.nombre?.toLowerCase() || ''
        valB = b.nombre?.toLowerCase() || ''
      } else if (ordenCampo === 'codigo') {
        valA = a.codigo?.toLowerCase() || ''
        valB = b.codigo?.toLowerCase() || ''
      } else if (ordenCampo === 'vencimiento') {
        const getTs = (i) => {
          if (i.fechaVencimiento?.toDate) return i.fechaVencimiento.toDate().getTime()
          if (i.fechaVencimiento) return new Date(i.fechaVencimiento).getTime()
          return 9999999999999
        }
        return ordenDir === 'asc' ? getTs(a) - getTs(b) : getTs(b) - getTs(a)
      }
      if (valA < valB) return ordenDir === 'asc' ? -1 : 1
      if (valA > valB) return ordenDir === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      {docInsumo && (
        <DocumentosPanel
          insumoId={docInsumo.id}
          modulo="apis"
          nombreInsumo={`${docInsumo.nombre} — ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)}
        />
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>APIs — Principios Activos</h2>
        <div style={{display:'flex',gap:8}}>
          {puedeBaja && (
            <button className="btn btn-sm"
              style={verPapelera?{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}:{}}
              onClick={()=>{setVerPapelera(!verPapelera);setSearch('');setFiltroEst('')}}>
              🗑 Papelera {papelera.length>0&&`(${papelera.length})`}
            </button>
          )}
          {puedeAgregar && !verPapelera && (
            <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(!showForm)}>
              <Plus size={14}/> Nuevo API
            </button>
          )}
        </div>
      </div>

      {showForm && puedeAgregar && !verPapelera && (
        <div className="card">
          <div className="card-title">Registrar nuevo API</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Código *</label>
              <input placeholder="ej: API-034" onChange={f('codigo')} style={{textTransform:'uppercase'}}/>
            </div>
            <div className="form-group"><label>Nombre *</label>
              <input placeholder="ej: Metilfenidato HCl" onChange={e=>setForm(p=>({...p,nombre:capitalizar(e.target.value)}))}/>
            </div>
            <div className="form-group"><label>Laboratorio *</label>
              <select onChange={f('laboratorio')}>
                <option value="">Seleccionar...</option>
                {LABORATORIOS.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Lote</label>
              <input onChange={f('lote')}/>
            </div>
            <div className="form-group"><label>Fecha vencimiento</label>
              <input type="date" onChange={f('vencimiento')}/>
            </div>
            <div className="form-group"><label>Ubicación</label>
              <select onChange={f('ubicacion')}>
                {UBICACIONES.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Cantidad recibida</label>
              <input placeholder="ej: 20 g" onChange={f('cantidad')}/>
            </div>
            <div className="form-group"><label>Observaciones</label>
              <input onChange={e=>setForm(p=>({...p,observacion:capitalizar(e.target.value)}))}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar API</button>
            <button className="btn btn-sm" onClick={()=>{setShowForm(false);setForm({});setMsg('')}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Barra búsqueda y ordenamiento */}
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
        <div className="search-bar">
          <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o laboratorio..." style={{flex:1}}/>
          {!verPapelera && (
            <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="VENCIDO">Vencido</option>
              <option value="SIN STOCK">Sin stock</option>
              <option value="RETIRADO">Retirado</option>
              <option value="Pendiente de aprobación">Pendiente</option>
            </select>
          )}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'var(--text-2)',alignSelf:'center'}}>Ordenar por:</span>
          {[
            { campo:'nombre',      label:'Nombre' },
            { campo:'codigo',      label:'Código' },
            { campo:'vencimiento', label:'Vencimiento' },
          ].map(o => (
            <button key={o.campo} className="btn btn-sm"
              style={ordenCampo===o.campo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
              onClick={()=>toggleOrden(o.campo)}>
              {o.label} {ordenCampo===o.campo?(ordenDir==='asc'?'↑':'↓'):'↕'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
        {[
          { label:'Total', valor: activos.length, color:'var(--accent)' },
          { label:'Activos', valor: activos.filter(i=>i.estado==='ACTIVO').length, color:'var(--ok)' },
          { label:'Vencidos', valor: activos.filter(i=>i.estado==='VENCIDO').length, color:'var(--danger)' },
          { label:'Pendientes', valor: activos.filter(i=>i.estado==='Pendiente de aprobación').length, color:'var(--warn)' },
        ].map(k=>(
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{color:k.color}}>{k.valor}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Nombre</th><th>Laboratorio</th>
              <th>Lote</th><th>Ubicación</th><th>Cantidad</th>
              <th>Vencimiento</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(i => {
              const vence    = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
              const sem      = calcularSemaforo(vence)
              const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
              const estCls   = {
                'ACTIVO':                  'badge-ok',
                'VENCIDO':                 'badge-danger',
                'SIN STOCK':               'badge-warn',
                'RETIRADO':                'badge-gray',
                'Dado de baja':            'badge-gray',
                'Pendiente de aprobación': 'badge-warn',
              }[i.estado] || 'badge-gray'

              return (
                <tr key={i.id}>
                  <td className="mono" style={{fontWeight:600}}>{i.codigo}</td>
                  <td style={{fontWeight:500}}>{i.nombre}</td>
                  <td style={{color:'var(--text-2)'}}>{i.laboratorio}</td>
                  <td style={{color:'var(--text-2)',fontSize:11}}>{i.lote || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:11}}>{i.ubicacion || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:11}}>{i.cantidadRecibida || '—'}</td>
                  <td>
                    {vence
                      ? <span className={`badge ${badgeCls}`}>{sem.texto}</span>
                      : <span style={{color:'var(--text-3)'}}>—</span>
                    }
                  </td>
                  <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                  <td style={{display:'flex',gap:4}}>
                    <button className="btn btn-sm" onClick={()=>setDocInsumo(i)} title="Ver documentos">
                      <FileText size={13}/>
                    </button>
                    {puedeBaja && !verPapelera && (
                      <button className="btn btn-sm"
                        style={{color:'var(--danger)',borderColor:'var(--danger)'}}
                        onClick={()=>darDeBaja(i.id, i.codigo)}>🗑</button>
                    )}
                    {puedeBaja && verPapelera && (
                      <button className="btn btn-sm" onClick={()=>restaurar(i.id)}>Restaurar</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                {verPapelera ? 'La papelera está vacía' : 'No hay APIs que coincidan'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

const DEMO = [
  { id:'1', codigo:'API-001', nombre:'Metilfenidato HCl', laboratorio:'Lab. Chile', lote:'O1D-00026', ubicacion:'Refrigerador controlado', cantidadRecibida:'', fechaVencimiento:'2027-01-31', estado:'ACTIVO' },
  { id:'2', codigo:'API-017', nombre:'Brinzolamida', laboratorio:'Novartis', lote:'221112A', ubicacion:'Desecador', cantidadRecibida:'15,03 g', fechaVencimiento:'2027-08-31', estado:'ACTIVO' },
  { id:'3', codigo:'API-028', nombre:'Pirfenidona', laboratorio:'Lab. Chile', lote:'1122400494', ubicacion:'Desecador', cantidadRecibida:'30 g', fechaVencimiento:'2027-06-30', estado:'ACTIVO' },
]
