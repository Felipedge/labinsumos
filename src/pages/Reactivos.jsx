// src/pages/Reactivos.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getReactivos, registrarRetiroReactivo, calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CATEGORIAS        = ['HPLC','Solventes','Sales / buffer','Ácidos','Bases','Indicadores','Otro']
const UNIDADES          = ['mL','L','g','kg','mg','unid']
const CONDICION_RECEPCION = ['Temperatura ambiente','Refrigerado','Congelado']
const TIPO_REACTIVO     = ['Sólido','Líquido','Gas']
const TIPO_ENVASE       = ['Envase protegido de la luz','Envase ámbar','Frasco plástico','Frasco vidrio','Bidón','Otro']
const INTEGRIDAD_ENVASE = ['Envase se recepciona sellado','Envase con daño menor','Envase se recepciona abierto']
const DOCUMENTACION_OPTS = ['Ficha de seguridad, Certificado de calidad','Solo ficha de seguridad','Solo certificado de calidad','Sin documentación']
const PROVEEDORES       = ['Merck','Farmalatina','Sigma-Aldrich','Supelco','Chemix','Carlo Erba','Panreac','Otro']
const SI_NO             = ['Sí','No']

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

async function getSiguienteNumeroReactivo() {
  try {
    const snap = await getDocs(query(collection(db, 'reactivos'), orderBy('numeroReactivo', 'desc'), limit(1)))
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroReactivo || 0) + 1
  } catch { return 1 }
}

function generarCodigoReactivo(numero, lote, fechaRecepcion, envase) {
  const num = String(numero).padStart(2, '0')
  const d   = fechaRecepcion ? new Date(fechaRecepcion + 'T12:00:00') : new Date()
  const mes = MESES_ES[d.getMonth()]
  const anio = d.getFullYear()
  return `A-${num}/${lote}/${mes}${anio}/${envase}`
}

const FORM_INICIAL = {
  nombre: '', lote: '', fechaRecepcion: '', fechaVencimiento: '',
  categoria: '', tipoReactivo: '', condicionRecepcion: '',
  proveedor: '', numeroFactura: '', ordenCompra: '',
  tipoEnvase: '', integridadEnvase: '', documentacion: '',
  cantidadPorEnvase: '', unidad: 'mL', stockMinimo: '',
  requiereRefrigeracion: '', controlTemperatura: '',
  observaciones: '', cantidadEnvases: '1',
}

export default function Reactivos() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')

  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [retiroId, setRetiroId]   = useState(null)
  const [form, setForm]           = useState({ ...FORM_INICIAL })
  const [msg, setMsg]             = useState('')
  const [filtro, setFiltro]       = useState('')
  const [docInsumo, setDocInsumo] = useState(null)
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)

  const load = async () => {
    try { setItems(await getReactivos()) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    const { nombre, lote, fechaRecepcion, cantidadPorEnvase, unidad, cantidadEnvases } = form
    if (!nombre || !lote || !fechaRecepcion || !cantidadPorEnvase) {
      setMsg('Nombre, lote, fecha de recepción y cantidad por envase son obligatorios')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const numero    = await getSiguienteNumeroReactivo()
      const numEnv    = Math.max(1, Math.min(parseInt(cantidadEnvases) || 1, 26))
      const codigoGen = `A-${String(numero).padStart(2, '0')}`

      for (let i = 0; i < numEnv; i++) {
        const letra  = LETRAS[i]
        const codigo = generarCodigoReactivo(numero, lote, fechaRecepcion, letra)
        await addDoc(collection(db, 'reactivos'), {
          numeroReactivo:      numero,
          codigoGeneral:       codigoGen,
          codigo,
          envase:              letra,
          nombre:              form.nombre.trim(),
          lote:                lote.trim(),
          fechaRecepcion:      fechaRecepcion || null,
          fechaVencimiento:    form.fechaVencimiento || null,
          categoria:           form.categoria || 'Otro',
          tipoReactivo:        form.tipoReactivo || '',
          condicionRecepcion:  form.condicionRecepcion || '',
          proveedor:           form.proveedor || '',
          numeroFactura:       form.numeroFactura || '',
          ordenCompra:         form.ordenCompra || '',
          tipoEnvase:          form.tipoEnvase || '',
          integridadEnvase:    form.integridadEnvase || '',
          documentacion:       form.documentacion || '',
          stockRestante:       parseFloat(cantidadPorEnvase) || 0,
          stockMinimo:         parseFloat(form.stockMinimo) || 0,
          unidad,
          requiereRefrigeracion: form.requiereRefrigeracion || '',
          controlTemperatura:  form.controlTemperatura || '',
          observaciones:       form.observaciones || '',
          estado:              i === 0 ? 'En uso' : 'Cerrado',
          recepcionadoPor:     user.displayName || user.email,
          creadoPorRol:        rol,
          creadoEn:            serverTimestamp(),
        })
      }
      setShowForm(false)
      setForm({ ...FORM_INICIAL })
      load()
    } catch(e) { setMsg(e.message) }
    finally { setSaving(false) }
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
      setRetiroId(null); setForm({ ...FORM_INICIAL }); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const filtrados = items.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || r.codigo?.toLowerCase().includes(q) || r.nombre?.toLowerCase().includes(q) || r.lote?.toLowerCase().includes(q)
    const matchC = !filtro || r.categoria === filtro
    return matchQ && matchC
  })

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      {docInsumo && (
        <DocumentosPanel
          insumoId={docInsumo.id}
          modulo="reactivos"
          nombreInsumo={`${docInsumo.nombre} — ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)}
        />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Reactivos</h2>
        {puedeAgregar && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setRetiroId(null); setForm({ ...FORM_INICIAL }) }}>
            <Plus size={14} /> Nuevo reactivo
          </button>
        )}
      </div>

      {showForm && puedeAgregar && (
        <div className="card">
          <div className="card-title">Registrar reactivo</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}

          <div className="card-title" style={{fontSize:12,marginTop:8,marginBottom:4,color:'var(--text-2)'}}>Identificación</div>
          <div className="form-grid">
            <div className="form-group"><label>Nombre *</label><input placeholder="ej: Acetonitrilo" value={form.nombre} onChange={f('nombre')} /></div>
            <div className="form-group"><label>Lote *</label><input placeholder="ej: K50203021" value={form.lote} onChange={f('lote')} /></div>
            <div className="form-group"><label>Categoría</label>
              <select value={form.categoria} onChange={f('categoria')}>
                <option value="">Seleccionar...</option>
                {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Tipo de reactivo</label>
              <select value={form.tipoReactivo} onChange={f('tipoReactivo')}>
                <option value="">Seleccionar...</option>
                {TIPO_REACTIVO.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="card-title" style={{fontSize:12,marginTop:12,marginBottom:4,color:'var(--text-2)'}}>Recepción</div>
          <div className="form-grid">
            <div className="form-group"><label>Fecha de recepción *</label><input type="date" value={form.fechaRecepcion} onChange={f('fechaRecepcion')} /></div>
            <div className="form-group"><label>Fecha de vencimiento</label><input type="date" value={form.fechaVencimiento} onChange={f('fechaVencimiento')} /></div>
            <div className="form-group"><label>Condición de recepción</label>
              <select value={form.condicionRecepcion} onChange={f('condicionRecepcion')}>
                <option value="">Seleccionar...</option>
                {CONDICION_RECEPCION.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Proveedor</label>
              <select value={form.proveedor} onChange={f('proveedor')}>
                <option value="">Seleccionar...</option>
                {PROVEEDORES.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group"><label>N° factura</label><input placeholder="ej: 0001-00012345" value={form.numeroFactura} onChange={f('numeroFactura')} /></div>
            <div className="form-group"><label>Orden de compra</label><input placeholder="ej: OC-2024-001" value={form.ordenCompra} onChange={f('ordenCompra')} /></div>
            <div className="form-group"><label>Documentación recibida</label>
              <select value={form.documentacion} onChange={f('documentacion')}>
                <option value="">Seleccionar...</option>
                {DOCUMENTACION_OPTS.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="card-title" style={{fontSize:12,marginTop:12,marginBottom:4,color:'var(--text-2)'}}>Envase y almacenamiento</div>
          <div className="form-grid">
            <div className="form-group"><label>Tipo de envase</label>
              <select value={form.tipoEnvase} onChange={f('tipoEnvase')}>
                <option value="">Seleccionar...</option>
                {TIPO_ENVASE.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Integridad del envase</label>
              <select value={form.integridadEnvase} onChange={f('integridadEnvase')}>
                <option value="">Seleccionar...</option>
                {INTEGRIDAD_ENVASE.map(i=><option key={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Requiere refrigeración</label>
              <select value={form.requiereRefrigeracion} onChange={f('requiereRefrigeracion')}>
                <option value="">Seleccionar...</option>
                {SI_NO.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Control de temperatura</label>
              <select value={form.controlTemperatura} onChange={f('controlTemperatura')}>
                <option value="">Seleccionar...</option>
                {SI_NO.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="card-title" style={{fontSize:12,marginTop:12,marginBottom:4,color:'var(--text-2)'}}>Stock</div>
          <div className="form-grid">
            <div className="form-group"><label>Cantidad por envase *</label><input type="number" step="0.01" placeholder="ej: 500" value={form.cantidadPorEnvase} onChange={f('cantidadPorEnvase')} /></div>
            <div className="form-group"><label>Unidad</label>
              <select value={form.unidad} onChange={f('unidad')}>
                {UNIDADES.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group"><label>N° de envases recibidos</label>
              <input type="number" min="1" max="26" placeholder="1" value={form.cantidadEnvases} onChange={f('cantidadEnvases')} />
            </div>
            <div className="form-group"><label>Stock mínimo alerta</label><input type="number" step="0.01" value={form.stockMinimo} onChange={f('stockMinimo')} /></div>
          </div>

          <div className="form-grid" style={{marginTop:8}}>
            <div className="form-group" style={{gridColumn:'1/-1'}}><label>Observaciones</label>
              <textarea rows={2} value={form.observaciones} onChange={f('observaciones')} style={{resize:'vertical'}} />
            </div>
          </div>

          <div style={{marginTop:8,padding:'8px 0',borderTop:'1px solid var(--border)',color:'var(--text-2)',fontSize:12}}>
            Producto recepcionado por: <strong>{user?.displayName || user?.email}</strong>
          </div>

          {form.lote && form.fechaRecepcion && (
            <div style={{marginTop:4,fontSize:11,color:'var(--text-3)'}}>
              Código generado (preview): <code>A-XX/{form.lote}/{MESES_ES[new Date(form.fechaRecepcion + 'T12:00:00').getMonth()]}{new Date(form.fechaRecepcion + 'T12:00:00').getFullYear()}/A</code>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({ ...FORM_INICIAL }); setMsg('') }}>Cancelar</button>
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
            <button className="btn btn-sm" onClick={() => { setRetiroId(null); setForm({ ...FORM_INICIAL }); setMsg('') }}>Cancelar</button>
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

      <div className="search-bar">
        <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, nombre o lote..." style={{flex:1}}/>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código único</th>
              <th>Nombre</th>
              <th>Env.</th>
              <th>Lote</th>
              <th>Tipo</th>
              <th>Stock</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(r => {
              const vence = r.fechaVencimiento?.toDate?.() || (r.fechaVencimiento ? new Date(r.fechaVencimiento + 'T12:00:00') : null)
              const sem   = calcularSemaforo(vence)
              const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
              const esPendiente = r.estado === 'Pendiente de aprobación'
              const estCls = r.estado==='En uso'?'badge-ok':r.estado==='Cerrado'?'badge-gray':esPendiente?'badge-warn':'badge-danger'
              return (
                <tr key={r.id}>
                  <td className="mono" style={{fontSize:11}}>{r.codigo || r.codigoGeneral}</td>
                  <td style={{ fontWeight:500 }}>{r.nombre}</td>
                  <td style={{textAlign:'center'}}><span className="badge badge-info">{r.envase || '—'}</span></td>
                  <td style={{ color:'var(--text-2)', fontSize:12 }}>{r.lote || '—'}</td>
                  <td style={{ color:'var(--text-2)', fontSize:12 }}>{r.tipoReactivo || '—'}</td>
                  <td><strong>{r.stockRestante ?? '—'}</strong> <span style={{ color:'var(--text-3)', fontSize:11 }}>{r.unidad}</span></td>
                  <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                  <td><span className={`badge ${estCls}`}>{r.estado}</span></td>
                  <td style={{display:'flex',gap:4}}>
                    {puedeOperar && !esPendiente && r.estado === 'En uso' && (
                      <button className="btn btn-sm" onClick={() => { setRetiroId(r.id); setShowForm(false); setForm({ ...FORM_INICIAL }) }}>Retirar</button>
                    )}
                    <button className="btn btn-sm" onClick={()=>setDocInsumo(r)} title="Ver documentos">
                      <FileText size={13}/>
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay reactivos que coincidan</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}