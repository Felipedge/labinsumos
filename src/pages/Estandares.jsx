// src/pages/Estandares.jsx
import { useState, useEffect } from 'react'
import { getEstandares, crearEstandar, registrarPesada, calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { Plus, Search } from 'lucide-react'

const CLIENTES = ['Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Prater','MSN','Otro']
const SECTORES = ['FQ','VAL','FQ/VAL','MB','T-R']
const ESTADOS  = ['EN USO','CERRADO','VENCIDO','SIN STOCK']
const ALMACENES= ['Desecador','Refrigerador','Freezer','Desecador-Oncológico','Refrigerador-Oncológico','Refrigerador-Controlado']

export default function Estandares() {
  const { user } = useAuth()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [pesadaId, setPesadaId] = useState(null)
  const [form, setForm]         = useState({})
  const [msg, setMsg]           = useState('')
  const [search, setSearch]     = useState('')
  const [filtroEst, setFiltroEst] = useState('')

  const load = async () => {
    try { setItems(await getEstandares()) }
    catch { setItems(DEMO_E) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!form.codigo || !form.nombre || !form.cliente) { setMsg('Código, nombre y cliente son obligatorios'); return }
    try {
      await crearEstandar({
        codigo:         form.codigo,
        nombre:         form.nombre,
        cas:            form.cas || '',
        lote:           form.lote || '',
        cliente:        form.cliente,
        producto:       form.producto || '',
        potencia:       parseFloat(form.potencia) || null,
        sector:         form.sector || 'FQ',
        vial:           form.vial || 'A',
        almacenamiento: form.almacen || 'Desecador',
        fabricante:     form.fabricante || '',
        stockRestante:  parseFloat(form.stock) || 0,
        cantPorAnalisis: parseFloat(form.xAnalisis) || 200,
        fechaVencimiento: form.vencimiento || null,
        estado:         'CERRADO',
      }, user.email)
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const pesada = async () => {
    if (!pesadaId || !form.mg) { setMsg('Ingresa la cantidad pesada'); return }
    try {
      await registrarPesada({
        estandarId: pesadaId,
        mgPesados:  parseFloat(form.mg),
        nAnalisis:  form.nAnalisis || '',
        producto:   form.producto2 || '',
        analista:   user.displayName || user.email,
        email:      user.email,
      })
      setPesadaId(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const filtrados = items.filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.cliente?.toLowerCase().includes(q)
    const matchE = !filtroEst || i.estado === filtroEst
    return matchQ && matchE
  })

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Estándares — inventario</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setPesadaId(null); setForm({}) }}>
          <Plus size={14} /> Nuevo estándar
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Ingresar vial al inventario</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Código *</label><input placeholder="ej: Std-0025/MAR24/LRAD4238/A" onChange={f('codigo')} style={{fontFamily:'var(--font-mono)',fontSize:12}} /></div>
            <div className="form-group"><label>Nombre *</label><input placeholder="ej: Cilostazol" onChange={f('nombre')} /></div>
            <div className="form-group"><label>N° CAS</label><input placeholder="ej: 73963-72-1" onChange={f('cas')} /></div>
            <div className="form-group"><label>Lote</label><input onChange={f('lote')} /></div>
            <div className="form-group"><label>Cliente *</label>
              <select onChange={f('cliente')}><option value="">Seleccionar...</option>{CLIENTES.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div className="form-group"><label>Producto</label><input placeholder="ej: Cilosvitae 100" onChange={f('producto')} /></div>
            <div className="form-group"><label>Potencia (%)</label><input type="number" step="0.001" placeholder="ej: 99.9" onChange={f('potencia')} /></div>
            <div className="form-group"><label>Sector</label>
              <select onChange={f('sector')}>{SECTORES.map(s=><option key={s}>{s}</option>)}</select>
            </div>
            <div className="form-group"><label>N° vial</label><input placeholder="ej: A, B, C" onChange={f('vial')} /></div>
            <div className="form-group"><label>Almacenamiento</label>
              <select onChange={f('almacen')}>{ALMACENES.map(a=><option key={a}>{a}</option>)}</select>
            </div>
            <div className="form-group"><label>Fabricante</label><input onChange={f('fabricante')} /></div>
            <div className="form-group"><label>Stock inicial (mg)</label><input type="number" step="0.01" onChange={f('stock')} /></div>
            <div className="form-group"><label>Cant. por análisis (mg)</label><input type="number" step="0.01" defaultValue={200} onChange={f('xAnalisis')} /></div>
            <div className="form-group"><label>Fecha vencimiento</label><input type="date" onChange={f('vencimiento')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar vial</button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      {pesadaId && (
        <div className="card">
          <div className="card-title">Registrar pesada — {items.find(i=>i.id===pesadaId)?.nombre}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Cantidad pesada (mg) *</label><input type="number" step="0.01" placeholder="ej: 10.25" onChange={f('mg')} /></div>
            <div className="form-group"><label>N° análisis</label><input onChange={f('nAnalisis')} /></div>
            <div className="form-group"><label>Producto / análisis</label><input onChange={f('producto2')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={pesada}>Confirmar pesada</button>
            <button className="btn btn-sm" onClick={() => { setPesadaId(null); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="search-bar">
        <Search size={16} style={{ color:'var(--text-3)', flexShrink:0 }} />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, nombre o cliente..." style={{ flex:1 }} />
        <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e=><option key={e}>{e}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Cliente</th><th>Sector</th><th>Stock (mg)</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtrados.map(i => {
              const vence = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
              const sem   = calcularSemaforo(vence)
              const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
              const estCls = {'EN USO':'badge-ok','CERRADO':'badge-info','VENCIDO':'badge-danger','SIN STOCK':'badge-warn'}[i.estado] || 'badge-gray'
              return (
                <tr key={i.id}>
                  <td className="mono" style={{ fontSize:10 }}>{i.codigo}</td>
                  <td style={{ fontWeight:500 }}>{i.nombre}</td>
                  <td style={{ color:'var(--text-2)' }}>{i.cliente}</td>
                  <td><span className="badge badge-gray">{i.sector}</span></td>
                  <td><strong>{i.stockRestante ?? '—'}</strong></td>
                  <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                  <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                  <td><button className="btn btn-sm" disabled={i.estado==='SIN STOCK'||i.estado==='VENCIDO'} onClick={() => { setPesadaId(i.id); setShowForm(false); setForm({}) }}>Pesada</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const DEMO_E = [
  { id:'1', codigo:'Std-0025/MAR24/LRAD4238/A', nombre:'Cilostazol', cliente:'Galenicum', sector:'FQ', stockRestante:440.69, fechaVencimiento:'2026-11-30', estado:'EN USO' },
  { id:'2', codigo:'Std-0040/NOV23/R11500/B', nombre:'Irbesartan', cliente:'Galenicum', sector:'FQ', stockRestante:184.71, fechaVencimiento:'2025-11-12', estado:'EN USO' },
  { id:'3', codigo:'Std-0053/MAY24/LRAD4836/A', nombre:'Alcohol Bencílico', cliente:'Ascend', sector:'FQ', stockRestante:976.99, fechaVencimiento:'2027-09-30', estado:'EN USO' },
  { id:'4', codigo:'Std-0685/MAR25/G1303069/A', nombre:'Blexit', cliente:'Laboratorio Chile', sector:'FQ', stockRestante:92.4, fechaVencimiento:'2026-03-20', estado:'EN USO' },
  { id:'5', codigo:'Std-0024/OCT22/LRAD1294/A', nombre:'Rifaximina', cliente:'Grunenthal', sector:'FQ', stockRestante:0, fechaVencimiento:'2025-11-30', estado:'VENCIDO' },
]
