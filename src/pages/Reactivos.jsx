// src/pages/Reactivos.jsx
import { useState, useEffect } from 'react'
import { getReactivos, crearReactivo, registrarRetiroReactivo, calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus } from 'lucide-react'

const CATEGORIAS = ['HPLC','Solventes','Sales / buffer','Ácidos','Bases','Indicadores','Otro']
const UNIDADES   = ['mL','L','g','kg','mg','unid']

export default function Reactivos() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')

  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [retiroId, setRetiroId] = useState(null)
  const [form, setForm]         = useState({})
  const [msg, setMsg]           = useState('')
  const [filtro, setFiltro]     = useState('')

  const load = async () => {
    try { setItems(await getReactivos()) }
    catch { setItems(DEMO_R) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!form.codigo || !form.nombre) { setMsg('Código y nombre son obligatorios'); return }
    try {
      await crearReactivo({
        codigo:        form.codigo,
        nombre:        form.nombre,
        lote:          form.lote || '',
        categoria:     form.categoria || 'Otro',
        grado:         form.grado || '',
        fabricante:    form.fabricante || '',
        stockRestante: parseFloat(form.stock) || 0,
        stockMinimo:   parseFloat(form.minimo) || 0,
        unidad:        form.unidad || 'mL',
        fechaVencimiento: form.vencimiento || null,
        almacenamiento: form.almacen || '',
        estado:       'Pendiente de aprobación',
        creadoPorRol: rol,      }, user.email)
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const retiro = async () => {
    if (!retiroId || !form.cantidad) { setMsg('Ingresa la cantidad'); return }
    try {
      await registrarRetiroReactivo({
        reactivoId: retiroId,
        cantidad:   parseFloat(form.cantidad),
        unidad:     form.unidad2 || '',
        nAnalisis:  form.nAnalisis || '',
        analista:   user.displayName || user.email,
        email:      user.email,
      })
      setRetiroId(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const filtrados = filtro ? items.filter(r => r.categoria === filtro) : items

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Reactivos</h2>
        {puedeAgregar && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setRetiroId(null); setForm({}) }}>
            <Plus size={14} /> Nuevo reactivo
          </button>
        )}
      </div>

      {showForm && puedeAgregar && (
        <div className="card">
          <div className="card-title">Registrar reactivo</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Código interno *</label><input placeholder="ej: REA-064" onChange={f('codigo')} /></div>
            <div className="form-group"><label>Nombre *</label><input placeholder="ej: Acetonitrilo" onChange={f('nombre')} /></div>
            <div className="form-group"><label>Lote</label><input onChange={f('lote')} /></div>
            <div className="form-group"><label>Categoría</label>
              <select onChange={f('categoria')}><option value="">Seleccionar...</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div className="form-group"><label>Grado / calidad</label><input placeholder="ej: HPLC, PA, Reactivo" onChange={f('grado')} /></div>
            <div className="form-group"><label>Fabricante</label><input onChange={f('fabricante')} /></div>
            <div className="form-group"><label>Stock inicial</label><input type="number" step="0.01" onChange={f('stock')} /></div>
            <div className="form-group"><label>Unidad</label>
              <select onChange={f('unidad')}>{UNIDADES.map(u=><option key={u}>{u}</option>)}</select>
            </div>
            <div className="form-group"><label>Stock mínimo alerta</label><input type="number" step="0.01" onChange={f('minimo')} /></div>
            <div className="form-group"><label>Fecha vencimiento</label><input type="date" onChange={f('vencimiento')} /></div>
            <div className="form-group"><label>Almacenamiento</label><input placeholder="ej: Solventes, Ácidos, Freezer" onChange={f('almacen')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar</button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      {retiroId && puedeOperar && (
        <div className="card">
          <div className="card-title">Registrar retiro — {items.find(r=>r.id===retiroId)?.nombre}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Cantidad retirada *</label><input type="number" step="0.01" onChange={f('cantidad')} /></div>
            <div className="form-group"><label>Unidad</label>
              <select onChange={f('unidad2')}>{UNIDADES.map(u=><option key={u}>{u}</option>)}</select>
            </div>
            <div className="form-group"><label>N° análisis</label><input onChange={f('nAnalisis')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={retiro}>Confirmar retiro</button>
            <button className="btn btn-sm" onClick={() => { setRetiroId(null); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        {['', ...CATEGORIAS].map(c => (
          <button key={c} className="btn btn-sm"
            style={filtro===c?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
            onClick={() => setFiltro(c)}>{c || 'Todos'}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Grado</th><th>Stock</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtrados.map(r => {
              const vence = r.fechaVencimiento?.toDate?.() || (r.fechaVencimiento ? new Date(r.fechaVencimiento) : null)
              const sem   = calcularSemaforo(vence)
              const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
              const estCls = r.estado==='ACTIVO'?'badge-ok':r.estado==='STOCK BAJO'?'badge-warn':'badge-danger'
              return (
                <tr key={r.id}>
                  <td className="mono">{r.codigo}</td>
                  <td style={{ fontWeight:500 }}>{r.nombre}</td>
                  <td><span className="badge badge-info">{r.categoria}</span></td>
                  <td style={{ color:'var(--text-2)' }}>{r.grado || '—'}</td>
                  <td><strong>{r.stockRestante ?? '—'}</strong> <span style={{ color:'var(--text-3)' }}>{r.unidad}</span></td>
                  <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                  <td><span className={`badge ${estCls}`}>{r.estado}</span></td>
                  <td>
                    {puedeOperar && (
                      <button className="btn btn-sm" onClick={() => { setRetiroId(r.id); setShowForm(false); setForm({}) }}>Retirar</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const DEMO_R = [
  { id:'1', codigo:'REA-041', nombre:'Acetonitrilo', categoria:'HPLC', grado:'HPLC', stockRestante:2.1, unidad:'L', fechaVencimiento:'2026-06-22', estado:'ACTIVO' },
  { id:'2', codigo:'REA-018', nombre:'Metanol', categoria:'HPLC', grado:'HPLC', stockRestante:8.5, unidad:'L', fechaVencimiento:'2027-01-15', estado:'ACTIVO' },
  { id:'3', codigo:'REA-027', nombre:'Ác. Fosfórico 85%', categoria:'Ácidos', grado:'PA', stockRestante:0.4, unidad:'L', fechaVencimiento:'2026-05-28', estado:'STOCK BAJO' },
  { id:'4', codigo:'REA-055', nombre:'Fosfato monobásico', categoria:'Sales / buffer', grado:'PA', stockRestante:320, unidad:'g', fechaVencimiento:'2026-09-30', estado:'ACTIVO' },
]
