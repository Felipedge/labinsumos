// src/pages/APIs.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calcularSemaforo, registrarPesadaAPI, ponerEnUsoInsumo, retirarInsumo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, Search, FileText, Package, History, PlayCircle, PackageX, RefreshCw } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'
 
const UBICACIONES = ['Desecador', 'Refrigerador', 'Freezer', 'Refrigerador controlado', 'Desecador Validaciones', 'Otro']
const ESTADOS = ['Espera Aprobación','En uso','Cerrado','Sin stock','Vencido','Retirado por cliente']

async function getSiguienteNumeroAPI(db) {
  try {
    const snap = await getDocs(query(collection(db, 'apis'), orderBy('creadoEn', 'desc'), limit(200)))
    let max = 0
    snap.docs.forEach(d => {
      const m = (d.data().codigo || '').match(/^API-(\d+)/i)
      if (m) { const n = parseInt(m[1]); if (n > max) max = n }
    })
    return max + 1
  } catch { return 1 }
}
 
function capitalizar(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}
 
function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}
 
export default function APIs() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar    = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar     = puedoHacer(rol, 'registrarUso')
  const puedePonerEnUso = puedoHacer(rol, 'ponerEnUso') && rol !== 'analista'

  const [tab, setTab]             = useState('inventario')
  const [items, setItems]         = useState([])
  const [retiroItem, setRetiroItem]     = useState(null)
  const [retiroFecha, setRetiroFecha]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [pesadaId, setPesadaId]   = useState(null)
  const [form, setForm]           = useState({})
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [ordenCampo, setOrdenCampo] = useState('nombre')
  const [ordenDir, setOrdenDir]     = useState('asc')
  const [docInsumo, setDocInsumo]   = useState(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [reposicionItem, setReposicionItem] = useState(null)
  const [rForm, setRForm]                   = useState({})
  const [rMsg, setRMsg]                     = useState('')
  const [guardandoR, setGuardandoR]         = useState(false)
  const [codigoGeneradoAPI, setCodigoGeneradoAPI] = useState('')

  const [pesadas, setPesadas]         = useState([])
  const [loadingH, setLoadingH]       = useState(false)
  const [searchH, setSearchH]         = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
 
  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'apis'), orderBy('creadoEn', 'desc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setItems([]) }
    finally { setLoading(false) }
  }
 
  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(query(collection(db, 'usos_apis'), orderBy('fecha', 'desc'), limit(500)))
      setPesadas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setPesadas([]) }
    finally { setLoadingH(false) }
  }
 
  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'historial' && pesadas.length === 0) loadHistorial() }, [tab])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const abrirFormulario = async () => {
    if (!showForm) {
      const n = await getSiguienteNumeroAPI(db)
      const cod = `API-${String(n).padStart(3, '0')}`
      setCodigoGeneradoAPI(cod)
      setForm({ codigo: cod })
    } else {
      setForm({})
      setCodigoGeneradoAPI('')
    }
    setShowForm(p => !p)
    setPesadaId(null)
  }
 
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
        stockRestante:    parseFloat(form.stock) || 0,
        observacion:      capitalizar(form.observacion || ''),
        stock:            true,
        estado:           rol === 'administrativo' ? 'Espera Aprobación' : 'Cerrado',
        creadoPorRol:     rol,
        creadoPor:        user.email,
        creadoEn:         serverTimestamp(),
        actualizadoEn:    serverTimestamp(),
      })
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const registrarPesada = async () => {
    if (!pesadaId || !form.mg) { setMsg('Ingresa la cantidad pesada'); return }
    try {
      await registrarPesadaAPI({
        apiId:    pesadaId,
        mgPesados: parseFloat(form.mg),
        nAnalisis: form.nAnalisis || '',
        producto:  capitalizar(form.producto || ''),
        analista:  user.displayName || user.email,
        email:     user.email,
      })
      setPesadaId(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const handlePonerEnUso = async (item) => {
    try {
      await ponerEnUsoInsumo({ coleccion:'apis', insumoId:item.id,
        usuario: user.displayName || user.email, email: user.email })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }
 
  const confirmarRetiro = async () => {
    if (!retiroFecha) { alert('Indica la fecha de retiro'); return }
    try {
      await retirarInsumo({ coleccion:'apis', insumoId:retiroItem.id,
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
      await addDoc(collection(db, 'apis'), {
        ...reposicionItem, id: undefined,
        lote: rForm.lote.toUpperCase(),
        fechaVencimiento: rForm.vencimiento ? new Date(rForm.vencimiento) : null,
        stockRestante: parseFloat(rForm.stock) || 0,
        observacion: rForm.observacion || '',
        estado: rol === 'administrativo' ? 'Espera Aprobación' : 'Cerrado',
        creadoPor: user.email, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
        bajaPor: null, bajaRazon: null, bajaFecha: null,
      })
      setReposicionItem(null); setRForm({}); load()
    } catch(e) { setRMsg('Error: ' + e.message) }
    finally { setGuardandoR(false) }
  }

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }
 
  const filtrados = items
    .filter(i => {
      const q = search.toLowerCase()
      const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.laboratorio?.toLowerCase().includes(q)
      const matchE = !filtroEst || i.estado === filtroEst
      const matchC = !filtroCliente || i.laboratorio === filtroCliente
      return matchQ && matchE && matchC
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
 
  const usuariosUnicos = [...new Set(pesadas.map(p => p.analista || p.email).filter(Boolean))]
 
  const pesadasFiltradas = pesadas.filter(p => {
    const q = searchH.toLowerCase()
    const matchQ = !q || p.codigo?.toLowerCase().includes(q) || p.nombre?.toLowerCase().includes(q) || p.nAnalisis?.toLowerCase().includes(q)
    const matchU = !filtroUsuario || (p.analista || p.email) === filtroUsuario
    const fecha  = p.fecha?.toDate ? p.fecha.toDate() : null
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchQ && matchU && matchD && matchH
  })
 
  const totalMg = pesadasFiltradas.reduce((acc, p) => acc + (parseFloat(p.mgPesados) || 0), 0)
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      {reposicionItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:460}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Reposición de stock — API</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{reposicionItem.nombre} · {reposicionItem.codigo}</p>
            {rMsg && <div className="alert-item danger" style={{marginBottom:10}}>{rMsg}</div>}
            <div className="form-grid">
              <div className="form-group"><label>N° Lote nuevo *</label><input value={rForm.lote||''} onChange={e=>setRForm(p=>({...p,lote:e.target.value.toUpperCase()}))} placeholder="ej: LOT9999"/></div>
              <div className="form-group"><label>Fecha vencimiento</label><input type="date" value={rForm.vencimiento||''} onChange={e=>setRForm(p=>({...p,vencimiento:e.target.value}))}/></div>
              <div className="form-group"><label>Stock inicial (mg) *</label><input type="number" step="0.01" value={rForm.stock||''} onChange={e=>setRForm(p=>({...p,stock:e.target.value}))} placeholder="ej: 20000"/></div>
              <div className="form-group" style={{gridColumn:'1/-1'}}><label>Observaciones</label><input value={rForm.observacion||''} onChange={e=>setRForm(p=>({...p,observacion:e.target.value}))}/></div>
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
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:440}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Retirar por cliente</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{retiroItem.codigo} — {retiroItem.nombre}</p>
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
        <DocumentosPanel
          insumoId={docInsumo.id} modulo="apis"
          nombreInsumo={`${docInsumo.nombre} — ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)}
        />
      )}
 
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>APIs — Principios Activos</h2>
        <div style={{display:'flex',gap:8}}>
          {tab==='historial' && <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>}
          {tab==='inventario' && puedeAgregar && (
            <button className="btn btn-primary btn-sm" onClick={abrirFormulario}>
              <Plus size={14}/> Nuevo API
            </button>
          )}
        </div>
      </div>
 
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[
          { id:'inventario', label:'Inventario', count:items.length },
          { id:'historial',  label:'Historial de pesadas', count:pesadas.length },
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
              <div className="card-title">Registrar nuevo API</div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Código *</label>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input value={form.codigo||''} onChange={f('codigo')} style={{flex:1,textTransform:'uppercase',fontFamily:'var(--font-mono)',fontWeight:600}}/>
                    {codigoGeneradoAPI && form.codigo?.toUpperCase() !== codigoGeneradoAPI && (
                      <button type="button" title="Restaurar código sugerido" onClick={()=>setForm(p=>({...p,codigo:codigoGeneradoAPI}))}
                        style={{padding:'3px 7px',fontSize:13,border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',background:'var(--bg)',cursor:'pointer',flexShrink:0}}>↺</button>
                    )}
                    {codigoGeneradoAPI && form.codigo?.toUpperCase() === codigoGeneradoAPI && (
                      <span style={{fontSize:11,color:'var(--ok)',whiteSpace:'nowrap'}}>✓ Auto</span>
                    )}
                  </div>
                </div>
                <div className="form-group"><label>Nombre *</label>
                  <input placeholder="ej: Metilfenidato HCl" onChange={e=>setForm(p=>({...p,nombre:capitalizar(e.target.value)}))}/>
                </div>
                <div className="form-group"><label>Laboratorio *</label>
                  <select onChange={f('laboratorio')}>
                    <option value="">Seleccionar...</option>
                    {listaClientes.map(l=><option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Lote</label><input onChange={f('lote')}/></div>
                <div className="form-group"><label>Fecha vencimiento</label><input type="date" onChange={f('vencimiento')}/></div>
                <div className="form-group"><label>Ubicación</label>
                  <select onChange={f('ubicacion')}>{UBICACIONES.map(u=><option key={u}>{u}</option>)}</select>
                </div>
                <div className="form-group"><label>Stock inicial (mg)</label>
                  <input type="number" step="0.01" placeholder="ej: 20000" onChange={f('stock')}/>
                </div>
                <div className="form-group"><label>Observaciones</label>
                  <input onChange={e=>setForm(p=>({...p,observacion:capitalizar(e.target.value)}))}/>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar API</button>
                <button className="btn btn-sm" onClick={()=>{setShowForm(false);setForm({});setMsg('');setCodigoGeneradoAPI('')}}>Cancelar</button>
              </div>
            </div>
          )}
 
          {pesadaId && puedeOperar && (
            <div className="card">
              <div className="card-title">Registrar pesada — {items.find(i=>i.id===pesadaId)?.nombre}</div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Cantidad pesada (mg) *</label>
                  <input type="number" step="0.01" placeholder="ej: 10.25" onChange={f('mg')}/>
                </div>
                <div className="form-group"><label>N° análisis</label><input onChange={f('nAnalisis')}/></div>
                <div className="form-group"><label>Producto / análisis</label><input onChange={f('producto')}/></div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={registrarPesada}>Confirmar pesada</button>
                <button className="btn btn-sm" onClick={()=>{setPesadaId(null);setForm({});setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}
 
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
            <div className="search-bar">
              <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por código, nombre o laboratorio..." style={{flex:1}}/>
              <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
                <option value="">Todos los laboratorios</option>
                {listaClientes.map(c=><option key={c}>{c}</option>)}
              </select>
              <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
                <option value="">Todos los estados</option>
                {ESTADOS.map(e=><option key={e}>{e}</option>)}
              </select>
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
 
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
            {[
              { label:'Total',      valor: items.length, color:'var(--accent)' },
              { label:'En uso',     valor: items.filter(i=>i.estado==='En uso').length, color:'var(--ok)' },
              { label:'Vencidos',   valor: items.filter(i=>i.estado==='Vencido').length, color:'var(--danger)' },
              { label:'Cerrados',   valor: items.filter(i=>i.estado==='Cerrado').length, color:'var(--warn)' },
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
                  <th>Código</th><th>Nombre / Obs.</th><th>Laboratorio</th>
                  <th>Lote</th><th>Stock (mg)</th><th>Vencimiento</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => {
                  const vence    = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
                  const sem      = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const estCls   = {
                    'Espera Aprobación':'badge-warn',
                    'En uso':'badge-ok','Cerrado':'badge-info',
                    'Sin stock':'badge-warn','Vencido':'badge-danger',
                    'Retirado por cliente':'badge-purple',
                  }[i.estado] || 'badge-gray'
                  const estaInactivo = ['Retirado por cliente','Vencido','Sin stock'].includes(i.estado)
                  return (
                    <tr key={i.id} style={estaInactivo?{opacity:0.6}:{}}>
                      <td className="mono" style={{fontWeight:600}}>{i.codigo}</td>
                      <td style={{fontWeight:500}}>
                        <div>{i.nombre}</div>
                        {i.observacion && <div style={{fontSize:10,color:'var(--text-3)',fontStyle:'italic'}}>{i.observacion}</div>}
                      </td>
                      <td style={{color:'var(--text-2)'}}>{i.laboratorio}</td>
                      <td style={{color:'var(--text-2)',fontSize:11}}>{i.lote || '—'}</td>
                      <td><strong>{i.stockRestante ?? '—'}</strong></td>
                      <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                      <td>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <span style={{visibility: puedePonerEnUso && i.estado==='Cerrado' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Poner en uso" onClick={()=>handlePonerEnUso(i)}><PlayCircle size={13}/></button>
                          </span>
                          <span style={{visibility: puedeOperar && i.estado==='En uso' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Registrar pesada" onClick={()=>{setPesadaId(i.id);setShowForm(false);setForm({})}}><FileText size={13}/></button>
                          </span>
                          <span style={{visibility: puedeAgregar && !estaInactivo ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Reposición de stock" onClick={()=>{setReposicionItem(i);setRForm({});setRMsg('')}}><RefreshCw size={13}/></button>
                          </span>
                          <button className="btn btn-sm" onClick={()=>setDocInsumo(i)} title="Ver documentos"><FileText size={13}/></button>
                          <span style={{visibility: puedeAgregar && !estaInactivo && i.estado!=='Retirado por cliente' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Retirar por cliente" onClick={()=>setRetiroItem(i)}><PackageX size={13}/></button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                    No hay APIs que coincidan
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
 
      {tab==='historial' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div className="kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value info">{pesadasFiltradas.length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total mg pesados</div><div className="kpi-value">{totalMg.toFixed(2)} mg</div></div>
            <div className="kpi-card"><div className="kpi-label">Analistas</div><div className="kpi-value">{usuariosUnicos.length}</div></div>
          </div>
 
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group"><label>Buscar</label>
                <input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, nombre o N° análisis..."/>
              </div>
              <div className="form-group"><label>Analista</label>
                <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                  <option value="">Todos</option>{usuariosUnicos.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Desde</label>
                <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/>
              </div>
              <div className="form-group"><label>Hasta</label>
                <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/>
              </div>
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
                    <th>Fecha y hora</th><th>Analista</th><th>Código</th><th>Nombre</th>
                    <th>Mg pesados</th><th>Stock antes</th><th>Stock después</th><th>N° análisis</th>
                  </tr>
                </thead>
                <tbody>
                  {pesadasFiltradas.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>{formatFecha(p.fecha)}</td>
                      <td>
                        <div style={{fontSize:12,fontWeight:500}}>{p.analista||'—'}</div>
                        <div style={{fontSize:10,color:'var(--text-3)'}}>{p.email}</div>
                      </td>
                      <td className="mono">{p.codigo||'—'}</td>
                      <td style={{fontWeight:500}}>{p.nombre||'—'}</td>
                      <td><strong style={{color:'var(--accent)'}}>{p.mgPesados} mg</strong></td>
                      <td style={{color:'var(--text-2)'}}>{p.stockAntes?.toFixed?.(2)??p.stockAntes??'—'}</td>
                      <td style={{color:'var(--text-2)'}}>{p.stockDespues?.toFixed?.(2)??p.stockDespues??'—'}</td>
                      <td style={{color:'var(--text-2)'}}>{p.nAnalisis||'—'}</td>
                    </tr>
                  ))}
                  {pesadasFiltradas.length===0 && (
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