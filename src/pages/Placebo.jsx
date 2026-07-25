// src/pages/Placebo.jsx
import { useState, useEffect } from 'react'
import { getPlacebos, crearPlacebo, registrarUsoPlacebo, calcularSemaforo, ponerEnUsoInsumo, retirarInsumo } from '../lib/db'
import { doc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search, Package, History, PlayCircle, PackageX, RefreshCw } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'

const PRESENTACIONES = ['Polvo', 'Ampolla', 'Comprimido']

function colorAlmacen(almacen = '') {
  const a = (almacen || '').toLowerCase()
  if (a.includes('freezer'))      return { bg:'#fee2e2', fg:'#b91c1c' }
  if (a.includes('refrigerador')) return { bg:'#fef9c3', fg:'#854d0e' }
  return                                  { bg:'#dcfce7', fg:'#15803d' }
}

async function getSiguienteNumeroPlacebo(db) {
  try {
    const snap = await getDocs(query(collection(db, 'placebo'), orderBy('creadoEn', 'desc'), limit(200)))
    let max = 0
    snap.docs.forEach(d => {
      const m = (d.data().codigo || '').match(/^SI-(\d+)/i)
      if (m) { const n = parseInt(m[1]); if (n > max) max = n }
    })
    return max + 1
  } catch { return 1 }
}

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}

const BADGE_ESTADO = {
  'Espera Aprobación':   'badge badge-warn',
  'En uso':              'badge badge-ok',
  'Cerrado':             'badge badge-info',
  'Sin stock':           'badge badge-warn',
  'Vencido':             'badge badge-danger',
  'Retirado por cliente':'badge badge-purple',
}

export default function Placebo() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar    = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar     = puedoHacer(rol, 'registrarUso')
  const puedePonerEnUso = puedoHacer(rol, 'ponerEnUso') && rol !== 'analista'

  const [tab, setTab]             = useState('inventario')
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [usoId, setUsoId]         = useState(null)
  const [retiroItem, setRetiroItem]     = useState(null)
  const [retiroFecha, setRetiroFecha]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [form, setForm]           = useState({})
  const [msg, setMsg]             = useState('')
  const [docInsumo, setDocInsumo] = useState(null)
  const [reposicionItem, setReposicionItem] = useState(null)
  const [rForm, setRForm]                   = useState({})
  const [rMsg, setRMsg]                     = useState('')
  const [guardandoR, setGuardandoR]         = useState(false)
  const [codigoGeneradoPl, setCodigoGeneradoPl] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [search, setSearch]       = useState('')
  const [ordenCampo, setOrdenCampo] = useState('productoReferencia')
  const [ordenDir, setOrdenDir]     = useState('asc')
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

  const abrirFormulario = async (currentlyOpen) => {
    if (!currentlyOpen) {
      const n = await getSiguienteNumeroPlacebo(db)
      const cod = `SI-${String(n).padStart(4, '0')}`
      setCodigoGeneradoPl(cod)
      setForm({ codigo: cod })
    } else {
      setForm({})
      setCodigoGeneradoPl('')
    }
    setShowForm(p => !p)
    setEditItem(null)
    setUsoId(null)
  }

  const abrirEdicion = (item) => {
    setEditItem(item)
    setForm({
      codigo:             item.codigo || '',
      productoReferencia: item.productoReferencia || '',
      cliente:            item.cliente || '',
      lote:               item.lote || '',
      presentacion:       item.presentacion || '',
      dosis:              item.dosis || '',
      stock:              item.presentacion === 'Polvo'
                            ? String(item.stockGramos ?? '')
                            : String(item.stockUnidades ?? ''),
      vencimiento:        item.fechaVencimiento || '',
      almacen:            item.almacenamiento || '',
    })
    setShowForm(true)
    setUsoId(null)
    setMsg('')
  }

  const guardar = async () => {
    if (!form.codigo || !form.productoReferencia || !form.cliente) {
      setMsg('Código, producto y cliente son obligatorios'); return
    }
    const esPolvo = form.presentacion === 'Polvo'
    const payload = {
      codigo:             form.codigo,
      productoReferencia: form.productoReferencia,
      cliente:            form.cliente,
      lote:               form.lote || '',
      presentacion:       form.presentacion || '',
      dosis:              form.dosis || '',
      stockUnidades:      esPolvo ? 0 : (parseInt(form.stock) || 0),
      stockGramos:        esPolvo ? (parseFloat(form.stock) || 0) : 0,
      fechaVencimiento:   form.vencimiento || null,
      almacenamiento:     form.almacen || 'Temperatura ambiente',
    }
    try {
      if (editItem) {
        await updateDoc(doc(db, 'placebo', editItem.id), payload)
        setShowForm(false); setEditItem(null); setForm({}); setMsg(''); load()
      } else {
        await crearPlacebo({
          ...payload,
          estado:       rol === 'administrativo' ? 'Espera Aprobación' : 'Cerrado',
          creadoPorRol: rol,
        }, user.email)
        setShowForm(false); setForm({}); setMsg(''); load()
      }
    } catch(e) { setMsg(e.message) }
  }

  const registrarUso = async () => {
    const item = items.find(p => p.id === usoId)
    const esPolvo = item?.presentacion === 'Polvo'
    if (!usoId || !form.cantidad) { setMsg('Ingresa la cantidad'); return }
    try {
      await registrarUsoPlacebo({
        placeboId:  usoId,
        unidades:   esPolvo ? 0 : (parseInt(form.cantidad) || 0),
        gramos:     esPolvo ? (parseFloat(form.cantidad) || 0) : 0,
        nAnalisis:  form.nAnalisis || '',
        analista:   user.displayName || user.email,
        email:      user.email,
      })
      setUsoId(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const handlePonerEnUso = async (item) => {
    try {
      await ponerEnUsoInsumo({ coleccion:'placebo', insumoId:item.id,
        usuario: user.displayName || user.email, email: user.email })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const confirmarRetiro = async () => {
    if (!retiroFecha) { alert('Indica la fecha de retiro'); return }
    try {
      await retirarInsumo({ coleccion:'placebo', insumoId:retiroItem.id,
        fechaRetiro: retiroFecha,
        motivo: retiroMotivo || 'Cliente solicitó devolución del insumo',
        usuario: user.displayName || user.email, email: user.email })
      setRetiroItem(null); setRetiroFecha(''); setRetiroMotivo(''); load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const guardarReposicion = async () => {
    if (!rForm.lote || !rForm.stock) { setRMsg('Lote y stock son obligatorios'); return }
    setGuardandoR(true)
    try {
      const esPolvo = reposicionItem.presentacion === 'Polvo'
      await crearPlacebo({
        ...reposicionItem, id: undefined,
        lote:             rForm.lote.toUpperCase(),
        fechaVencimiento: rForm.vencimiento || null,
        stockUnidades:    esPolvo ? 0 : (parseInt(rForm.stock) || 0),
        stockGramos:      esPolvo ? (parseFloat(rForm.stock) || 0) : 0,
        estado:           rol === 'administrativo' ? 'Espera Aprobación' : 'Cerrado',
        creadoPorRol:     rol,
        bajaPor: null, bajaRazon: null, bajaFecha: null,
      }, user.email)
      setReposicionItem(null); setRForm({}); load()
    } catch(e) { setRMsg('Error: ' + e.message) }
    finally { setGuardandoR(false) }
  }

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }

  const filtrados = items
    .filter(p => {
      const q = search.toLowerCase()
      const matchQ = !q ||
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.productoReferencia || '').toLowerCase().includes(q) ||
        (p.cliente || '').toLowerCase().includes(q) ||
        (p.estado || '').toLowerCase().includes(q) ||
        (p.almacenamiento || '').toLowerCase().includes(q) ||
        (p.presentacion || '').toLowerCase().includes(q)
      const matchC = !filtroCliente || p.cliente === filtroCliente
      return matchQ && matchC
    })
    .sort((a, b) => {
      let valA, valB
      if (ordenCampo === 'productoReferencia') {
        valA = (a.productoReferencia || '').toLowerCase()
        valB = (b.productoReferencia || '').toLowerCase()
      } else if (ordenCampo === 'codigo') {
        valA = (a.codigo || '').toLowerCase()
        valB = (b.codigo || '').toLowerCase()
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
    const matchQ = !q ||
      (u.codigo || '').toLowerCase().includes(q) ||
      (u.productoReferencia || '').toLowerCase().includes(q) ||
      (u.nAnalisis || '').toLowerCase().includes(q)
    const matchU = !filtroUsuario || (u.analista || u.email) === filtroUsuario
    const fecha  = u.fecha?.toDate ? u.fecha.toDate() : null
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchQ && matchU && matchD && matchH
  })

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      {reposicionItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:460}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Reposición de stock — Placebo</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{reposicionItem.productoReferencia} · {reposicionItem.codigo}</p>
            {rMsg && <div className="alert-item danger" style={{marginBottom:10}}>{rMsg}</div>}
            <div className="form-grid">
              <div className="form-group"><label>N° Lote nuevo *</label>
                <input value={rForm.lote||''} onChange={e=>setRForm(p=>({...p,lote:e.target.value.toUpperCase()}))} placeholder="ej: LOT9999"/>
              </div>
              <div className="form-group"><label>Fecha vencimiento</label>
                <input type="date" value={rForm.vencimiento||''} onChange={e=>setRForm(p=>({...p,vencimiento:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label>Stock inicial ({reposicionItem.presentacion === 'Polvo' ? 'g' : 'unidades'}) *</label>
                <input type="number" value={rForm.stock||''} onChange={e=>setRForm(p=>({...p,stock:e.target.value}))} placeholder="ej: 200"/>
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={guardarReposicion} disabled={guardandoR}>
                {guardandoR?<div className="spinner" style={{width:14,height:14,borderWidth:2}}/>:<RefreshCw size={14}/>} Guardar reposición
              </button>
              <button className="btn btn-sm" onClick={()=>{setReposicionItem(null);setRForm({})}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {retiroItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:440}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Retirar por cliente</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{retiroItem.codigo} — {retiroItem.productoReferencia}</p>
            <div className="form-group" style={{marginBottom:10}}>
              <label>Fecha de retiro *</label>
              <input type="date" value={retiroFecha} onChange={e=>setRetiroFecha(e.target.value)}/>
            </div>
            <div className="form-group" style={{marginBottom:16}}>
              <label>Motivo / observación</label>
              <input value={retiroMotivo} onChange={e=>setRetiroMotivo(e.target.value)}
                placeholder="ej: Cliente solicitó devolución del insumo"/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={confirmarRetiro}>Confirmar retiro</button>
              <button className="btn btn-sm" onClick={()=>{setRetiroItem(null);setRetiroFecha('');setRetiroMotivo('')}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
            <button className="btn btn-primary btn-sm" onClick={() => abrirFormulario(showForm)}>
              <Plus size={14} /> Nuevo lote
            </button>
          )}
        </div>
      </div>

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
              <div className="card-title">{editItem ? 'Editar placebo' : 'Registrar lote de placebo'}</div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Código interno *</label>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input value={form.codigo||''} onChange={f('codigo')}
                      style={{flex:1,textTransform:'uppercase',fontFamily:'var(--font-mono)',fontWeight:600}}
                      readOnly={!!editItem}/>
                    {!editItem && codigoGeneradoPl && form.codigo?.toUpperCase() !== codigoGeneradoPl && (
                      <button type="button" title="Restaurar código sugerido"
                        onClick={()=>setForm(p=>({...p,codigo:codigoGeneradoPl}))}
                        style={{padding:'3px 7px',fontSize:13,border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',background:'var(--bg)',cursor:'pointer',flexShrink:0}}>↺</button>
                    )}
                    {!editItem && codigoGeneradoPl && form.codigo?.toUpperCase() === codigoGeneradoPl && (
                      <span style={{fontSize:11,color:'var(--ok)',whiteSpace:'nowrap'}}>✓ Auto</span>
                    )}
                  </div>
                </div>
                <div className="form-group"><label>Producto de referencia *</label>
                  <input placeholder="ej: Cilosvitae 100 mg" value={form.productoReferencia||''} onChange={f('productoReferencia')} />
                </div>
                <div className="form-group"><label>Cliente *</label>
                  <select value={form.cliente||''} onChange={f('cliente')}>
                    <option value="">Seleccionar...</option>
                    {listaClientes.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Lote</label>
                  <input value={form.lote||''} onChange={f('lote')} />
                </div>
                <div className="form-group"><label>Presentación</label>
                  <select value={form.presentacion||''} onChange={f('presentacion')}>
                    <option value="">Seleccionar...</option>
                    {PRESENTACIONES.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Dosis</label>
                  <input placeholder="ej: 100 mg" value={form.dosis||''} onChange={f('dosis')} />
                </div>
                <div className="form-group">
                  <label>Stock inicial ({form.presentacion === 'Polvo' ? 'g' : 'unidades'})</label>
                  <input type="number" step={form.presentacion === 'Polvo' ? '0.01' : '1'}
                    value={form.stock||''} onChange={f('stock')} />
                </div>
                <div className="form-group"><label>Fecha vencimiento</label>
                  <input type="date" value={form.vencimiento||''} onChange={f('vencimiento')} />
                </div>
                <div className="form-group"><label>Almacenamiento</label>
                  <input placeholder="ej: Temperatura ambiente, Refrigerador" value={form.almacen||''} onChange={f('almacen')} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={guardar}>
                  {editItem ? 'Guardar cambios' : 'Guardar lote'}
                </button>
                <button className="btn btn-sm" onClick={() => {
                  setShowForm(false); setEditItem(null); setForm({}); setMsg(''); setCodigoGeneradoPl('')
                }}>Cancelar</button>
              </div>
            </div>
          )}

          {usoId && puedeOperar && (
            <div className="card">
              {(() => {
                const item = items.find(p => p.id === usoId)
                const esPolvo = item?.presentacion === 'Polvo'
                return (
                  <>
                    <div className="card-title">Registrar {esPolvo ? 'pesada' : 'uso'} — {item?.productoReferencia}</div>
                    {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
                    <div className="form-grid">
                      <div className="form-group">
                        <label>{esPolvo ? 'Cantidad pesada (g) *' : 'Unidades utilizadas *'}</label>
                        <input type="number" step={esPolvo ? '0.01' : '1'} placeholder={esPolvo ? 'ej: 2.35' : 'ej: 10'} onChange={f('cantidad')} />
                      </div>
                      <div className="form-group"><label>N° análisis</label><input onChange={f('nAnalisis')} /></div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-primary btn-sm" onClick={registrarUso}>Confirmar</button>
                      <button className="btn btn-sm" onClick={() => { setUsoId(null); setForm({}); setMsg('') }}>Cancelar</button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          <div className="search-bar">
            <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por código, producto, cliente, estado..." style={{flex:1}}/>
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
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th><th>Cliente</th><th>Presentación</th>
                  <th>Stock</th><th>Almacenamiento</th><th>Vencimiento</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const vence = p.fechaVencimiento?.toDate?.() || (p.fechaVencimiento ? new Date(p.fechaVencimiento) : null)
                  const sem   = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const esPolvo  = p.presentacion === 'Polvo'
                  const stockVal = esPolvo ? (p.stockGramos ?? 0) : (p.stockUnidades ?? '—')
                  const stockUnit = esPolvo ? 'g' : 'unid'
                  const almColor = colorAlmacen(p.almacenamiento || '')
                  const esPendiente = p.estado === 'Espera Aprobación'
                  const estaInactiva = p.estado === 'Retirado por cliente' || p.estado === 'Sin stock' || p.estado === 'Vencido'
                  return (
                    <tr key={p.id} style={estaInactiva?{opacity:0.6}:{}}>
                      <td className="mono">{p.codigo}</td>
                      <td style={{ fontWeight:500 }}>{p.productoReferencia}</td>
                      <td>{p.cliente}</td>
                      <td>
                        {p.presentacion
                          ? <span className="badge badge-gray">{p.presentacion}</span>
                          : <span style={{color:'var(--text-3)'}}>—</span>}
                      </td>
                      <td><strong>{stockVal}</strong> <span style={{color:'var(--text-3)',fontSize:11}}>{stockUnit}</span></td>
                      <td>
                        {p.almacenamiento
                          ? <span className="badge" style={{background:almColor.bg,color:almColor.fg}}>{p.almacenamiento}</span>
                          : <span style={{color:'var(--text-3)'}}>—</span>}
                      </td>
                      <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td>
                        <span className={BADGE_ESTADO[p.estado] || 'badge badge-gray'}>{p.estado}</span>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <span style={{visibility: puedePonerEnUso && p.estado==='Cerrado' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Poner en uso" onClick={()=>handlePonerEnUso(p)}><PlayCircle size={13}/></button>
                          </span>
                          <span style={{visibility: puedeOperar && p.estado==='En uso' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Registrar uso" onClick={()=>{setUsoId(p.id);setShowForm(false);setEditItem(null);setForm({})}}><FileText size={13}/></button>
                          </span>
                          <span style={{visibility: puedeAgregar && esPendiente ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Editar" onClick={()=>abrirEdicion(p)}>✏️</button>
                          </span>
                          <span style={{visibility: puedeAgregar ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Reposición de stock" onClick={()=>{setReposicionItem(p);setRForm({});setRMsg('')}}><RefreshCw size={13}/></button>
                          </span>
                          <button className="btn btn-sm" onClick={()=>setDocInsumo(p)} title="Ver documentos"><FileText size={13}/></button>
                          <span style={{visibility: puedeAgregar && !estaInactiva && !esPendiente ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Retirar por cliente" onClick={()=>setRetiroItem(p)}><PackageX size={13}/></button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay lotes que coincidan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab==='historial' && (
        <>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group"><label>Buscar</label>
                <input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, producto o N° análisis..."/>
              </div>
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
                    <th>Fecha y hora</th><th>Analista</th><th>Código</th><th>Producto</th>
                    <th>Cantidad usada</th><th>Stock antes</th><th>Stock después</th><th>N° análisis</th>
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
                      <td>
                        <strong style={{color:'var(--accent)'}}>
                          {u.gramos != null && u.gramos > 0 ? `${u.gramos} g` : u.unidades}
                        </strong>
                      </td>
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

