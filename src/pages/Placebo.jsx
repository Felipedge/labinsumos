// src/pages/Placebo.jsx
import { useState, useEffect } from 'react'
import { getPlacebos, crearPlacebo, registrarUsoPlacebo, calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'

const CLIENTES   = ['Ascend','Galenicum','Grunenthal','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Otro']
const FORMAS     = ['Comprimido','Cápsula','Inyectable','Solución oral','Crema / ungüento','Otro']

export default function Placebo() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')

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

  const load = async () => {
    try { setItems(await getPlacebos()) }
    catch { setItems(DEMO_P) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      {docInsumo && (
        <DocumentosPanel insumoId={docInsumo.id} modulo="placebo"
          nombreInsumo={`${docInsumo.productoReferencia} — ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)} />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Placebo — lotes activos</h2>
        {puedeAgregar && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setUsoId(null); setForm({}) }}>
            <Plus size={14} /> Nuevo lote
          </button>
        )}
      </div>

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
              <select onChange={f('forma')}><option value="">Seleccionar...</option>{FORMAS.map(f=><option key={f}>{f}</option>)}</select>
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

      {/* Barra búsqueda y ordenamiento */}
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
  )
}

const DEMO_P = [
  { id:'1', codigo:'PL-018', productoReferencia:'Cilosvitae 100 mg', cliente:'Galenicum', formaFarmaceutica:'Comprimido', stockUnidades:80, fechaVencimiento:'2026-07-10', estado:'ACTIVO' },
  { id:'2', codigo:'PL-024', productoReferencia:'Irbevitae 150 mg', cliente:'Galenicum', formaFarmaceutica:'Comprimido', stockUnidades:200, fechaVencimiento:'2027-03-30', estado:'ACTIVO' },
]
