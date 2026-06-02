// src/pages/Placebo.jsx
import { useState, useEffect } from 'react'
import { getPlacebos, crearPlacebo, registrarUsoPlacebo, calcularSemaforo } from '../lib/db'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search, Package, History } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'
 
const FORMAS = ['Comprimido','Cápsula','Inyectable','Solución oral','Crema / ungüento','Otro']
 
function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}
 
export default function Placebo() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')
 
  const [tab, setTab]             = useState('inventario')
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [usoId, setUsoId]         = useState(null)
  const [form, setForm]           = useState({})
  const [msg, setMsg]             = useState('')
  const [docInsumo, setDocInsumo] = useState(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [search, setSearch]       = useState('')
  const [ordenCampo, setOrdenCampo] = useState('productoReferencia')
  const [ordenDir, setOrdenDir]     = useState('asc')
 
  // Historial
  const [usos, setUsos]           = useState([])
  const [loadingH, setLoadingH]   = useState(false)
  const [searchH, setSearchH]     = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
 
  const load = async () => {
    try { setItems(await getPlacebos()) }
    catch { setItems(DEMO_P) }
    finally { setLoading(false) }
  }
 
  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(query(collection(db, 'usos_placebo'), orderBy('fecha', 'desc'), limit(500)))
      setUsos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setUsos([]) }
    finally { setLoadingH(false) }
  }
 
  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'historial' && usos.length === 0) loadHistorial() }, [tab])
 
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
 
  const guardar = async () => {
    if (!form.codigo || !form.productoReferencia || !form.cliente) { setMsg('Código, producto y cliente son obligatorios'); return }
    try {
      await crearPlacebo({
        codigo: form.codigo, productoReferencia: form.productoReferencia,
        cliente: form.cliente, lote: form.lote || '',
        formaFarmaceutica: form.forma || '', dosis: form.dosis || '',
        stockUnidades: parseInt(form.stock) || 0,
        fechaVencimiento: form.vencimiento || null,
        almacenamiento: form.almacen || 'Temperatura ambiente',
        estado: 'Pendiente de aprobación', creadoPorRol: rol,
      }, user.email)
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const registrarUso = async () => {
    if (!usoId || !form.unidades) { setMsg('Ingresa las unidades'); return }
    try {
      await registrarUsoPlacebo({
        placeboId: usoId, unidades: parseInt(form.unidades),
        nAnalisis: form.nAnalisis || '',
        analista: user.displayName || user.email, email: user.email,
      })
      setUsoId(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }
 
  const filtrados = items
    .filter(p => {
      const q = search.toLowerCase()
      const matchQ = !q || p.codigo?.toLowerCase().includes(q) || p.productoReferencia?.toLowerCase().includes(q) || p.cliente?.toLowerCase().includes(q)
      const matchC = !filtroCliente || p.cliente === filtroCliente
      return matchQ && matchC
    })
    .sort((a, b) => {
      let valA, valB
      if (ordenCampo === 'productoReferencia') {
        valA = a.productoReferencia?.toLowerCase() || ''
        valB = b.productoReferencia?.toLowerCase() || ''
      } else if (ordenCampo === 'codigo') {
        valA = a.codigo?.toLowerCase() || ''
        valB = b.codigo?.toLowerCase() || ''
      } else if (ordenCampo === 'vencimiento') {
        valA = a.fechaVencimiento?.toDate?.()?.getTime() || (a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : 9999999999999)
        valB = b.fechaVencimiento?.toDate?.()?.getTime() || (b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : 9999999999999)
        return ordenDir === 'asc' ? valA - valB : valB - valA
      }
      if (valA < valB) return ordenDir === 'asc' ? -1 : 1
      if (valA > valB) return ordenDir === 'asc' ? 1 : -1
      return 0
    })
 
  const usuariosUnicos = [...new Set(usos.map(u => u.analista || u.email).filter(Boolean))]
 
  const usosFiltrados = usos.filter(u => {
    const q = searchH.toLowerCase()
    const matchQ = !q || u.codigo?.toLowerCase().includes(q) || u.productoReferencia?.toLowerCase().includes(q) || u.nAnalisis?.toLowerCase().includes(q)
    const matchU = !filtroUsuario || (u.analista || u.email) === filtroUsuario
    const fecha  = u.fecha?.toDate ? u.fecha.toDate() : null
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchQ && matchU && matchD && matchH
  })
 
  const totalUnidades = usosFiltrados.reduce((acc, u) => acc + (parseInt(u.unidades) || 0), 0)
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      {docInsumo && (
        <DocumentosPanel insumoId={docInsumo.id} modulo="placebo"
          nombreInsumo={`${docInsumo.productoReferencia} — ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)} />
      )}
 
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Placebo</h2>
        <div style={{display:'flex',gap:8}}>
          {tab==='historial' && <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>}
          {tab==='inventario' && puedeAgregar && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setUsoId(null); setForm({}) }}>
              <Plus size={14} /> Nuevo lote
            </button>
          )}
        </div>
      </div>
 
      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[
          { id:'inventario', label:'Inventario', count:items.length },
          { id:'historial',  label:'Historial de usos', count:usos.length },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 16px',
            fontSize:13,cursor:'pointer',border:'none',background:'none',
            color:tab===t.id?'var(--accent)':'var(--text-2)',
            borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
            fontWeight:tab===t.id?500:400,marginBottom:-1,
          }}>
            {t.id==='inventario'?<Package size={14}/>:<History size={14}/>}
            {t.label}
            {t.count>0&&<span style={{fontSize:11,padding:'1px 6px',borderRadius:10,background:'var(--bg)',color:'var(--text-2)'}}>{t.count}</span>}
          </button>
        ))}
      </div>
 
      {tab==='inventario' && (
        <>
          {showForm && puedeAgregar && (
            <div className="card">
              <div className="card-title">Registrar lote de placebo</div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Código interno *</label><input placeholder="ej: PL-038" onChange={f('codigo')} /></div>
                <div className="form-group"><label>Producto de referencia *</label><input placeholder="ej: Cilosvitae 100 mg" onChange={f('productoReferencia')} /></div>
                <div className="form-group"><label>Cliente *</label>
                  <select onChange={f('cliente')}><option value="">Seleccionar...</option>{listaClientes.map(c=><option key={c}>{c}</option>)}</select>
                </div>
                <div className="form-group"><label>Lote</label><input onChange={f('lote')} /></div>
                <div className="form-group"><label>Forma farmacéutica</label>
                  <select onChange={f('forma')}><option value="">Seleccionar...</option>{FORMAS.map(fo=><option key={fo}>{fo}</option>)}</select>
                </div>
                <div className="form-group"><label>Dosis</label><input placeholder="ej: 100 mg" onChange={f('dosis')} /></div>
                <div className="form-group"><label>Stock inicial (unidades)</label><input type="number" onChange={f('stock')} /></div>
                <div className="form-group"><label>Fecha vencimiento</label><input type="date" onChange={f('vencimiento')} /></div>
                <div className="form-group"><label>Almacenamiento</label><input placeholder="ej: Temperatura ambiente" onChange={f('almacen')} /></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar lote</button>
                <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setMsg('') }}>Cancelar</button>
              </div>
            </div>
          )}
 
          {usoId && puedeOperar && (
            <div className="card">
              <div className="card-title">Registrar uso — {items.find(p=>p.id===usoId)?.productoReferencia}</div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Unidades utilizadas *</label><input type="number" placeholder="ej: 10" onChange={f('unidades')} /></div>
                <div className="form-group"><label>N° análisis</label><input onChange={f('nAnalisis')} /></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={registrarUso}>Confirmar</button>
                <button className="btn btn-sm" onClick={() => { setUsoId(null); setForm({}); setMsg('') }}>Cancelar</button>
              </div>
            </div>
          )}
 
          <div className="search-bar">
            <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, producto o cliente..." style={{flex:1}}/>
            <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
              <option value="">Todos los clientes</option>
              {listaClientes.map(c=><option key={c}>{c}</option>)}
            </select>
            {[
              { campo:'productoReferencia', label:'Nombre' },
              { campo:'codigo',             label:'Código' },
              { campo:'vencimiento',        label:'Vencimiento' },
            ].map(o => (
              <button key={o.campo} className="btn btn-sm"
                style={ordenCampo===o.campo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
                onClick={()=>toggleOrden(o.campo)}>
                {o.label} {ordenCampo===o.campo?(ordenDir==='asc'?'↑':'↓'):'↕'}
              </button>
            ))}
          </div>
 
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Producto</th><th>Cliente</th><th>Forma farm.</th><th>Stock (unid.)</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filtrados.map(p => {
                  const vence = p.fechaVencimiento?.toDate?.() || (p.fechaVencimiento ? new Date(p.fechaVencimiento) : null)
                  const sem   = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const esPendiente = p.estado === 'Pendiente de aprobación'
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.codigo}</td>
                      <td style={{ fontWeight:500 }}>{p.productoReferencia}</td>
                      <td>{p.cliente}</td>
                      <td><span className="badge badge-gray">{p.formaFarmaceutica || '—'}</span></td>
                      <td><strong>{p.stockUnidades ?? '—'}</strong></td>
                      <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td>
                        {esPendiente
                          ? <span className="badge badge-warn">Pendiente</span>
                          : <span className={p.estado==='ACTIVO'?'badge badge-ok':'badge badge-danger'}>{p.estado}</span>
                        }
                      </td>
                      <td style={{display:'flex',gap:4}}>
                        {puedeOperar && !esPendiente && (
                          <button className="btn btn-sm" onClick={() => { setUsoId(p.id); setShowForm(false); setForm({}) }}>Registrar uso</button>
                        )}
                        <button className="btn btn-sm" onClick={()=>setDocInsumo(p)} title="Ver documentos">
                          <FileText size={13}/>
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay lotes que coincidan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
 
      {tab==='historial' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div className="kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value info">{usosFiltrados.length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total unidades usadas</div><div className="kpi-value">{totalUnidades}</div></div>
            <div className="kpi-card"><div className="kpi-label">Analistas</div><div className="kpi-value">{usuariosUnicos.length}</div></div>
          </div>
 
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group"><label>Buscar</label><input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, producto o N° análisis..."/></div>
              <div className="form-group"><label>Analista</label>
                <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                  <option value="">Todos</option>{usuariosUnicos.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Desde</label><input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/></div>
              <div className="form-group"><label>Hasta</label><input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/></div>
              <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                <button className="btn btn-sm" onClick={()=>{setSearchH('');setFiltroUsuario('');setFechaDesde('');setFechaHasta('')}}>Limpiar</button>
              </div>
            </div>
          </div>
 
          {loadingH ? (
            <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Analista</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Unidades usadas</th>
                    <th>Stock antes</th>
                    <th>Stock después</th>
                    <th>N° análisis</th>
                  </tr>
                </thead>
                <tbody>
                  {usosFiltrados.map(u => (
                    <tr key={u.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>{formatFecha(u.fecha)}</td>
                      <td>
                        <div style={{fontSize:12,fontWeight:500}}>{u.analista||'—'}</div>
                        <div style={{fontSize:10,color:'var(--text-3)'}}>{u.email}</div>
                      </td>
                      <td className="mono">{u.codigo||'—'}</td>
                      <td style={{fontWeight:500}}>{u.productoReferencia||u.insumoNombre||'—'}</td>
                      <td><strong style={{color:'var(--accent)'}}>{u.unidades}</strong></td>
                      <td style={{color:'var(--text-2)'}}>{u.stockAntes??'—'}</td>
                      <td style={{color:'var(--text-2)'}}>{u.stockDespues??'—'}</td>
                      <td style={{color:'var(--text-2)'}}>{u.nAnalisis||'—'}</td>
                    </tr>
                  ))}
                  {usosFiltrados.length===0 && (
                    <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay registros que coincidan</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}