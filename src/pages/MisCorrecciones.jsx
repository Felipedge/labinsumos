// src/pages/MisCorrecciones.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useClientes } from '../hooks/useClientes.jsx'

const MODULOS = [
  { id: 'estandares', label: 'Estándares' },
  { id: 'columnas',   label: 'Columnas'   },
  { id: 'reactivos',  label: 'Reactivos'  },
  { id: 'placebo',    label: 'Placebo'    },
  { id: 'apis',       label: 'APIs'       },
]

const CATEGORIAS_R = ['HPLC','Solventes','Sales / buffer','Ácidos','Bases','Indicadores','Otro']
const UNIDADES_R   = ['mL','L','g','kg','mg','unid']
const PRESENTACIONES_P = ['Polvo','Ampolla','Comprimido']
const FASES_C = ['C18','C8','CN','Fenil','RP18','RP8','PH','CPS','Quiral','SCX','T3','RP','SIL','Alquimide','NAP','ODS 3V','ODS 2','C1','L9','ODS 3','MOS','ODS','AMINO','Otro']
const ALMACENES_E = ['Desecador','Refrigerador','Freezer','Desecador-controlado','Refrigerador-controlado','Freezer-controlado']
const UBICACIONES_A = ['Desecador','Refrigerador','Freezer','Refrigerador controlado','Desecador Validaciones','Otro']

function nombreInsumo(item) {
  if (item.modulo === 'estandares') return `${item.nombre || ''} — ${item.codigo || ''}`
  if (item.modulo === 'columnas')   return `${item.codigo || ''} — ${item.fase || ''}`
  if (item.modulo === 'reactivos')  return `${item.nombre || ''} — ${item.codigo || ''}`
  if (item.modulo === 'placebo')    return `${item.productoReferencia || ''} — ${item.codigo || ''}`
  if (item.modulo === 'apis')       return `${item.nombre || ''} — ${item.codigo || ''}`
  return item.codigo || '—'
}

function FormCorreccion({ item, onGuardar, onCancelar, listaClientes }) {
  const [form, setForm] = useState({})
  const [msg, setMsg]   = useState('')
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    // Pre-cargar con datos existentes
    if (item.modulo === 'estandares') {
      setForm({
        nombre:      item.nombre || '',
        lote:        item.lote || '',
        frasco:      item.frasco || '',
        potencia:    item.potencia || '',
        almacen:     item.almacenamiento || '',
        vencimiento: item.fechaVencimiento || '',
        fabricante:  item.fabricante || '',
        sector:      item.sector || '',
      })
    } else if (item.modulo === 'columnas') {
      setForm({
        fase:           item.fase || '',
        fabricante:     item.fabricante || '',
        loteSerie:      item.loteSerie || '',
        fechaRecepcion: item.fechaRecepcion || '',
        fechaInicioUso: item.fechaInicioUso || '',
        largo:          item.largo || '',
        diametro:       item.diametro || '',
        micra:          item.micra || '',
        area:           item.area || '',
        producto:       item.producto || '',
      })
    } else if (item.modulo === 'reactivos') {
      setForm({
        nombre:      item.nombre || '',
        lote:        item.lote || '',
        categoria:   item.categoria || '',
        fabricante:  item.fabricante || '',
        stock:       item.stockRestante ?? '',
        unidad:      item.unidad || '',
        umbralAlerta:item.umbralAlerta ?? '',
        vencimiento: item.fechaVencimiento || '',
        almacen:     item.almacenamiento || '',
      })
    } else if (item.modulo === 'placebo') {
      setForm({
        productoReferencia: item.productoReferencia || '',
        cliente:    item.cliente || '',
        lote:       item.lote || '',
        presentacion: item.presentacion || '',
        dosis:      item.dosis || '',
        stock:      item.presentacion === 'Polvo' ? (item.stockGramos ?? '') : (item.stockUnidades ?? ''),
        vencimiento: item.fechaVencimiento || '',
        almacen:    item.almacenamiento || '',
      })
    } else if (item.modulo === 'apis') {
      setForm({
        nombre:      item.nombre || '',
        lote:        item.lote || '',
        laboratorio: item.laboratorio || '',
        ubicacion:   item.ubicacion || '',
        vencimiento: item.fechaVencimiento || '',
        stock:       item.stockRestante ?? '',
        observacion: item.observacion || '',
      })
    }
  }, [item])

  const guardar = () => {
    if (item.modulo === 'estandares' && !form.nombre) { setMsg('El nombre es obligatorio'); return }
    if (item.modulo === 'reactivos'  && !form.nombre) { setMsg('El nombre es obligatorio'); return }
    if (item.modulo === 'placebo'    && !form.productoReferencia) { setMsg('El producto es obligatorio'); return }
    if (item.modulo === 'apis'       && (!form.nombre || !form.laboratorio)) { setMsg('Nombre y laboratorio son obligatorios'); return }

    let payload = {}

    if (item.modulo === 'estandares') {
      payload = {
        nombre:          form.nombre,
        lote:            form.lote || '',
        frasco:          form.frasco || '',
        potencia:        parseFloat(form.potencia) || item.potencia,
        almacenamiento:  form.almacen || '',
        fechaVencimiento:form.vencimiento || null,
        fabricante:      form.fabricante || '',
        sector:          form.sector || '',
      }
    } else if (item.modulo === 'columnas') {
      payload = {
        fase:           form.fase || '',
        fabricante:     form.fabricante || '',
        loteSerie:      form.loteSerie || '',
        fechaRecepcion: form.fechaRecepcion || '',
        fechaInicioUso: form.fechaInicioUso || '',
        largo:          parseFloat(form.largo) || 0,
        diametro:       parseFloat(form.diametro) || 0,
        micra:          parseFloat(form.micra) || 0,
        area:           form.area || '',
        producto:       form.producto || '',
      }
    } else if (item.modulo === 'reactivos') {
      payload = {
        nombre:          form.nombre,
        lote:            form.lote || '',
        categoria:       form.categoria || '',
        fabricante:      form.fabricante || '',
        stockRestante:   parseFloat(form.stock) || 0,
        unidad:          form.unidad || '',
        umbralAlerta:    parseFloat(form.umbralAlerta) || 0,
        fechaVencimiento:form.vencimiento || null,
        almacenamiento:  form.almacen || '',
      }
    } else if (item.modulo === 'placebo') {
      const esPolvo = form.presentacion === 'Polvo'
      payload = {
        productoReferencia: form.productoReferencia,
        cliente:            form.cliente || '',
        lote:               form.lote || '',
        presentacion:       form.presentacion || '',
        dosis:              form.dosis || '',
        stockUnidades:      esPolvo ? 0 : (parseInt(form.stock) || 0),
        stockGramos:        esPolvo ? (parseFloat(form.stock) || 0) : 0,
        fechaVencimiento:   form.vencimiento || null,
        almacenamiento:     form.almacen || '',
      }
    } else if (item.modulo === 'apis') {
      payload = {
        nombre:           form.nombre,
        lote:             form.lote || '',
        laboratorio:      form.laboratorio || '',
        ubicacion:        form.ubicacion || '',
        fechaVencimiento: form.vencimiento ? new Date(form.vencimiento) : null,
        stockRestante:    parseFloat(form.stock) || 0,
        observacion:      form.observacion || '',
      }
    }

    onGuardar(item, payload)
  }

  return (
    <div style={{marginTop:12,background:'var(--bg)',borderRadius:'var(--radius-md)',padding:'14px 16px'}}>
      {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
      <div className="form-grid">

        {item.modulo === 'estandares' && <>
          <div className="form-group"><label>Nombre *</label>
            <input value={form.nombre||''} onChange={f('nombre')}/>
          </div>
          <div className="form-group"><label>Lote</label>
            <input value={form.lote||''} onChange={f('lote')}/>
          </div>
          <div className="form-group"><label>Frasco</label>
            <input value={form.frasco||''} onChange={f('frasco')}/>
          </div>
          <div className="form-group"><label>Potencia (%)</label>
            <input type="number" step="0.01" value={form.potencia||''} onChange={f('potencia')}/>
          </div>
          <div className="form-group"><label>Almacenamiento</label>
            <select value={form.almacen||''} onChange={f('almacen')}>
              <option value="">Seleccionar...</option>
              {ALMACENES_E.map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Fecha vencimiento</label>
            <input type="date" value={form.vencimiento||''} onChange={f('vencimiento')}/>
          </div>
          <div className="form-group"><label>Fabricante</label>
            <input value={form.fabricante||''} onChange={f('fabricante')}/>
          </div>
        </>}

        {item.modulo === 'columnas' && <>
          <div className="form-group"><label>Fase estacionaria</label>
            <select value={form.fase||''} onChange={f('fase')}>
              <option value="">Seleccionar...</option>
              {FASES_C.map(x=><option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Fabricante</label>
            <input value={form.fabricante||''} onChange={f('fabricante')}/>
          </div>
          <div className="form-group"><label>Lote / Serie</label>
            <input value={form.loteSerie||''} onChange={f('loteSerie')}/>
          </div>
          <div className="form-group"><label>Largo (mm)</label>
            <input type="number" value={form.largo||''} onChange={f('largo')}/>
          </div>
          <div className="form-group"><label>Diámetro (mm)</label>
            <input type="number" step="0.1" value={form.diametro||''} onChange={f('diametro')}/>
          </div>
          <div className="form-group"><label>Micra (µm)</label>
            <input type="number" step="0.1" value={form.micra||''} onChange={f('micra')}/>
          </div>
          <div className="form-group"><label>Fecha recepción</label>
            <input type="date" value={form.fechaRecepcion||''} onChange={f('fechaRecepcion')}/>
          </div>
          <div className="form-group"><label>Producto / método</label>
            <input value={form.producto||''} onChange={f('producto')}/>
          </div>
        </>}

        {item.modulo === 'reactivos' && <>
          <div className="form-group"><label>Nombre *</label>
            <input value={form.nombre||''} onChange={f('nombre')}/>
          </div>
          <div className="form-group"><label>Lote</label>
            <input value={form.lote||''} onChange={f('lote')}/>
          </div>
          <div className="form-group"><label>Categoría</label>
            <select value={form.categoria||''} onChange={f('categoria')}>
              <option value="">Seleccionar...</option>
              {CATEGORIAS_R.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Fabricante</label>
            <input value={form.fabricante||''} onChange={f('fabricante')}/>
          </div>
          <div className="form-group"><label>Stock inicial</label>
            <input type="number" step="0.01" value={form.stock||''} onChange={f('stock')}/>
          </div>
          <div className="form-group"><label>Unidad</label>
            <select value={form.unidad||''} onChange={f('unidad')}>
              {UNIDADES_R.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Umbral de alerta</label>
            <input type="number" step="0.01" value={form.umbralAlerta||''} onChange={f('umbralAlerta')}/>
          </div>
          <div className="form-group"><label>Fecha vencimiento</label>
            <input type="date" value={form.vencimiento||''} onChange={f('vencimiento')}/>
          </div>
          <div className="form-group"><label>Almacenamiento</label>
            <input value={form.almacen||''} onChange={f('almacen')}/>
          </div>
        </>}

        {item.modulo === 'placebo' && <>
          <div className="form-group"><label>Producto de referencia *</label>
            <input value={form.productoReferencia||''} onChange={f('productoReferencia')}/>
          </div>
          <div className="form-group"><label>Cliente</label>
            <select value={form.cliente||''} onChange={f('cliente')}>
              <option value="">Seleccionar...</option>
              {listaClientes.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Lote</label>
            <input value={form.lote||''} onChange={f('lote')}/>
          </div>
          <div className="form-group"><label>Presentación</label>
            <select value={form.presentacion||''} onChange={f('presentacion')}>
              <option value="">Seleccionar...</option>
              {PRESENTACIONES_P.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Dosis</label>
            <input value={form.dosis||''} onChange={f('dosis')}/>
          </div>
          <div className="form-group">
            <label>Stock ({form.presentacion === 'Polvo' ? 'g' : 'unidades'})</label>
            <input type="number" step={form.presentacion === 'Polvo' ? '0.01' : '1'} value={form.stock||''} onChange={f('stock')}/>
          </div>
          <div className="form-group"><label>Fecha vencimiento</label>
            <input type="date" value={form.vencimiento||''} onChange={f('vencimiento')}/>
          </div>
          <div className="form-group"><label>Almacenamiento</label>
            <input value={form.almacen||''} onChange={f('almacen')}/>
          </div>
        </>}

        {item.modulo === 'apis' && <>
          <div className="form-group"><label>Nombre *</label>
            <input value={form.nombre||''} onChange={f('nombre')}/>
          </div>
          <div className="form-group"><label>Lote</label>
            <input value={form.lote||''} onChange={f('lote')}/>
          </div>
          <div className="form-group"><label>Laboratorio *</label>
            <input value={form.laboratorio||''} onChange={f('laboratorio')}/>
          </div>
          <div className="form-group"><label>Ubicación</label>
            <select value={form.ubicacion||''} onChange={f('ubicacion')}>
              <option value="">Seleccionar...</option>
              {UBICACIONES_A.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Stock restante</label>
            <input type="number" step="0.01" value={form.stock||''} onChange={f('stock')}/>
          </div>
          <div className="form-group"><label>Fecha vencimiento</label>
            <input type="date" value={form.vencimiento||''} onChange={f('vencimiento')}/>
          </div>
          <div className="form-group"><label>Observación</label>
            <input value={form.observacion||''} onChange={f('observacion')}/>
          </div>
        </>}

      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar y reenviar</button>
        <button className="btn btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

export default function MisCorrecciones() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()

  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [msg, setMsg]             = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const todos = []
      for (const modulo of MODULOS) {
        const snap = await getDocs(
          query(collection(db, modulo.id),
            where('estado', '==', 'Requiere corrección'),
            where('creadoPor', '==', user.email)
          )
        )
        snap.docs.forEach(d => {
          todos.push({ id: d.id, modulo: modulo.id, ...d.data() })
        })
      }
      todos.sort((a, b) => {
        const fa = a.correccionEn?.toDate?.() || new Date(0)
        const fb = b.correccionEn?.toDate?.() || new Date(0)
        return fb - fa
      })
      setItems(todos)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (user?.email) load() }, [user])

  const guardarCorreccion = async (item, payload) => {
    try {
      await updateDoc(doc(db, item.modulo, item.id), {
        ...payload,
        estado:           'Espera Aprobación',
        motivoCorreccion: null,
        correccionEn:     null,
        correccionPor:    null,
        actualizadoEn:    serverTimestamp(),
      })
      setEditandoId(null)
      setMsg('✅ Insumo corregido y reenviado a aprobación.')
      setTimeout(() => setMsg(''), 4000)
      load()
    } catch(e) { setMsg('Error: ' + e.message) }
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>
          Mis correcciones pendientes
          {items.length > 0 && (
            <span className="badge badge-warn" style={{marginLeft:8}}>{items.length}</span>
          )}
        </h2>
        <button className="btn btn-sm" onClick={load}>↻ Actualizar</button>
      </div>

      {msg && (
        <div className="alert-item" style={{
          background: msg.includes('✅') ? 'var(--ok-lt)' : 'var(--danger-lt)',
          border: `1px solid ${msg.includes('✅') ? 'var(--ok)' : 'var(--danger)'}`,
          marginBottom:12
        }}>
          {msg}
        </div>
      )}

      {items.length === 0 && (
        <div className="empty" style={{padding:60}}>
          <CheckCircle size={40}/>
          <p>No tienes insumos pendientes de corrección</p>
        </div>
      )}

      {items.map(item => {
        const moduloLabel = MODULOS.find(m => m.id === item.modulo)?.label || item.modulo
        const fechaCorreccion = item.correccionEn?.toDate?.()
        const estaEditando = editandoId === item.id

        return (
          <div key={item.id} className="card" style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
                  <span className="badge badge-gray">{moduloLabel}</span>
                  <span className="badge badge-warn">
                    <AlertTriangle size={10} style={{marginRight:3}}/> Requiere corrección
                  </span>
                </div>

                <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>
                  {nombreInsumo(item)}
                </p>

                {item.motivoCorreccion && (
                  <div style={{
                    marginTop:8, padding:'10px 14px',
                    background:'var(--warn-lt)', border:'1px solid var(--warn)',
                    borderRadius:'var(--radius-sm)', fontSize:13, color:'var(--text-1)'
                  }}>
                    <strong style={{fontSize:11,color:'var(--warn)',display:'block',marginBottom:4}}>
                      ¿QUÉ CORREGIR?
                    </strong>
                    {item.motivoCorreccion}
                  </div>
                )}

                {fechaCorreccion && (
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:6}}>
                    Solicitado por {item.correccionPor} · {fechaCorreccion.toLocaleDateString('es-CL')} {fechaCorreccion.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                )}

                {estaEditando && (
                  <FormCorreccion
                    item={item}
                    listaClientes={listaClientes}
                    onGuardar={guardarCorreccion}
                    onCancelar={()=>setEditandoId(null)}
                  />
                )}
              </div>

              {!estaEditando && (
                <button className="btn btn-primary btn-sm" style={{flexShrink:0}}
                  onClick={()=>setEditandoId(item.id)}>
                  ✏️ Corregir
                </button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}