// src/pages/Placebo.jsx
import { useState, useEffect } from 'react'
import { getPlacebos, crearPlacebo, registrarUsoPlacebo, calcularSemaforo, ponerEnUsoInsumo, retirarInsumo } from '../lib/db'
import { collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search, Package, History, PlayCircle, PackageX } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'
 
const FORMAS = ['Comprimido','Cápsula','Inyectable','Solución oral','Crema / ungüento','Otro']
const ALMACENAMIENTOS = ['Ambiente','Refrigerado','Refrigerado Oncológico','Ambiente Oncológico','Freezer','Freezer Oncológico']
const MESES_NUM = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const MESES     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

async function getSiguienteNumeroPL(db) {
  try {
    const q = query(collection(db, 'placebo'), orderBy('numeroPL', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroPL || 0) + 1
  } catch { return 1 }
}

function generarCodigoPL(numero, mes, anio, lote, frasco) {
  const num = String(numero).padStart(3,'0')
  const mesStr = MESES_NUM[parseInt(mes)-1]
  const anioStr = String(anio).slice(-2)
  return `PL-${num}/${mesStr}${anioStr}/${(lote||'SL').toUpperCase()}/${frasco}`
}
 
function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}
 
export default function Placebo() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar    = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar     = puedoHacer(rol, 'registrarUso')
  const puedeBaja       = puedoHacer(rol, 'darDeBaja')
  const puedePonerEnUso = puedoHacer(rol, 'ponerEnUso')
 
  const [tab, setTab]             = useState('inventario')
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [usoId, setUsoId]         = useState(null)
  const [retiroItem, setRetiroItem]     = useState(null)
  const [retiroFecha, setRetiroFecha]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [form, setForm]           = useState({})
  const ahora = new Date()
  const mesActual  = String(ahora.getMonth()+1).padStart(2,'0')
  const anioActual = String(ahora.getFullYear())
  const [sigNumPL, setSigNumPL]   = useState(null)
  const [frascos, setFrascos]     = useState([{letra:'A',stock:''}])
  const [fProd, setFProd]         = useState('')
  const [fCliente, setFCliente]   = useState('')
  const [fLote, setFLote]         = useState('')
  const [fMes, setFMes]           = useState(mesActual)
  const [fAnio, setFAnio]         = useState(anioActual)
  const [fForma, setFForma]       = useState('')
  const [fDosis, setFDosis]       = useState('')
  const [fVenc, setFVenc]         = useState('')
  const [fAlmacen, setFAlmacen]   = useState('Ambiente')
  const [guardando, setGuardando]     = useState(false)
  const [reposItem, setReposItem]     = useState(null)
  const [reposFrascos, setReposFrascos] = useState([{letra:'A',stock:''}])
  const [reposLote, setReposLote]     = useState('')
  const [reposMes, setReposMes]       = useState('')
  const [reposAnio, setReposAnio]     = useState('')
  const [reposVenc, setReposVenc]     = useState('')
  const [reposGuardando, setReposGuardando] = useState(false)
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
 
  const agregarFrascoPL = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const sig = letras[frascos.length]
    if (sig) setFrascos(p => [...p, {letra:sig,stock:''}])
  }
  const quitarFrascoPL = (i) => { if (frascos.length>1) setFrascos(p=>p.filter((_,j)=>j!==i)) }
  const updateFrascoPL = (i,val) => setFrascos(p=>p.map((fr,j)=>j===i?{...fr,stock:val}:fr))

  const guardar = async () => {
    if (!fProd || !fCliente) { setMsg('Producto y cliente son obligatorios'); return }
    if (!fLote)              { setMsg('El lote es obligatorio'); return }
    if (frascos.some(fr=>!fr.stock||isNaN(parseInt(fr.stock)))) {
      setMsg('Ingresa el stock inicial de cada frasco'); return
    }
    setGuardando(true)
    try {
      const numero = sigNumPL || await getSiguienteNumeroPL(db)
      for (const fr of frascos) {
        const codigo = generarCodigoPL(numero, fMes, fAnio, fLote, fr.letra)
        await crearPlacebo({
          codigo, numeroPL: numero, frasco: fr.letra,
          productoReferencia: fProd,
          cliente:           fCliente,
          lote:              fLote.toUpperCase(),
          formaFarmaceutica: fForma,
          dosis:             fDosis,
          stockUnidades:     parseInt(fr.stock),
          stockInicial:      parseInt(fr.stock),
          fechaVencimiento:  fVenc || null,
          almacenamiento:    fAlmacen,
          estado:            'Cerrado',
          creadoPorRol:      rol,
        }, user.email)
      }
      setShowForm(false); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
    finally { setGuardando(false) }
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
 
  const guardarReposicionPL = async () => {
    if (!reposLote) { setMsg('El lote es obligatorio'); return }
    if (reposFrascos.some(fr => !fr.stock || isNaN(parseInt(fr.stock)))) {
      setMsg('Ingresa el stock de cada frasco'); return
    }
    setReposGuardando(true)
    try {
      const base = reposItem
      const mes  = reposMes  || String(new Date().getMonth()+1).padStart(2,'0')
      const anio = reposAnio || String(new Date().getFullYear())
      for (const fr of reposFrascos) {
        const codigo = generarCodigoPL(base.numeroPL, mes, anio, reposLote, fr.letra)
        await crearPlacebo({
          codigo, numeroPL: base.numeroPL, frasco: fr.letra,
          productoReferencia: base.productoReferencia,
          cliente: base.cliente, lote: reposLote.toUpperCase(),
          formaFarmaceutica: base.formaFarmaceutica || '',
          dosis: base.dosis || '',
          stockUnidades: parseInt(fr.stock),
          stockInicial: parseInt(fr.stock),
          fechaVencimiento: reposVenc || null,
          almacenamiento: base.almacenamiento || 'Ambiente',
          area: base.area || null,
          estado: 'Cerrado', creadoPorRol: rol,
        }, user.email)
      }
      setReposItem(null); setReposFrascos([{letra:'A',stock:''}])
      setReposLote(''); setReposVenc(''); setMsg(''); load()
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setReposGuardando(false) }
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
      {retiroItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
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
      {reposItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:480}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Reposición — {reposItem.productoReferencia}</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>
              Código base: <span style={{fontFamily:'var(--font-mono)',fontWeight:600}}>SI-{String(reposItem.numeroPL).padStart(4,'0')}</span>
            </p>
            {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
            <div className="form-grid">
              <div className="form-group"><label>N° Lote nuevo *</label>
                <input value={reposLote} onChange={e=>setReposLote(e.target.value.toUpperCase())} placeholder="ej: AB12345"/>
              </div>
              <div className="form-group"><label>Fecha vencimiento</label>
                <input type="date" value={reposVenc} onChange={e=>setReposVenc(e.target.value)}/>
              </div>
              <div className="form-group"><label>Mes ingreso</label>
                <select value={reposMes} onChange={e=>setReposMes(e.target.value)}>
                  {Array.from({length:12},(_,i)=>(<option key={i+1} value={String(i+1).padStart(2,'0')}>{MESES[i]}</option>))}
                </select>
              </div>
              <div className="form-group"><label>Año ingreso</label>
                <select value={reposAnio} onChange={e=>setReposAnio(e.target.value)}>
                  {[2024,2025,2026,2027].map(a=><option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS</label>
                <button className="btn btn-sm" onClick={()=>setReposFrascos(p=>[...p,{letra:String.fromCharCode(65+p.length),stock:''}])}><Plus size={12}/> Frasco</button>
              </div>
              {reposFrascos.map((fr,i)=>(
                <div key={i} style={{display:'flex',gap:8,alignItems:'flex-end',marginBottom:6}}>
                  <div className="form-group" style={{width:80,margin:0}}>
                    <input value={fr.letra} maxLength={3}
                      onChange={e=>setReposFrascos(p=>p.map((x,j)=>j===i?{...x,letra:e.target.value.toUpperCase()}:x))}
                      style={{textTransform:'uppercase',textAlign:'center',fontWeight:700}}/>
                  </div>
                  <div className="form-group" style={{flex:1,margin:0}}>
                    <input type="number" placeholder="Stock inicial (unidades)" value={fr.stock}
                      onChange={e=>setReposFrascos(p=>p.map((x,j)=>j===i?{...x,stock:e.target.value}:x))}/>
                  </div>
                  {reposFrascos.length>1 && <button className="btn btn-sm" style={{color:'var(--danger)'}} onClick={()=>setReposFrascos(p=>p.filter((_,j)=>j!==i))}>✕</button>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={guardarReposicionPL} disabled={reposGuardando}>
                {reposGuardando?'Guardando...':'Confirmar reposición'}
              </button>
              <button className="btn btn-sm" onClick={()=>{setReposItem(null);setReposFrascos([{letra:'A',stock:''}]);setReposLote('');setReposVenc('');setMsg('')}}>Cancelar</button>
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
            <button className="btn btn-primary btn-sm" onClick={async()=>{
              if (!showForm) {
                const n = await getSiguienteNumeroPL(db)
                setSigNumPL(n)
                setFrascos([{letra:'A',stock:''}])
                setFProd(''); setFCliente(''); setFLote('')
                setFMes(String(new Date().getMonth()+1).padStart(2,'0'))
                setFAnio(String(new Date().getFullYear()))
                setFForma(''); setFDosis(''); setFVenc('')
                setFAlmacen('Ambiente'); setMsg('')
              }
              setShowForm(!showForm); setUsoId(null)
            }}>
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
              <div className="card-title">
                Ingresar nuevo placebo
                {sigNumPL && <span className="badge badge-purple">N°: PL-{String(sigNumPL).padStart(3,'0')}</span>}
              </div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}

              <div className="form-grid">
                <div className="form-group"><label>Producto de referencia *</label>
                  <input value={fProd} onChange={e=>setFProd(e.target.value)} placeholder="ej: Cilosvitae 100 mg"/>
                </div>
                <div className="form-group"><label>Cliente *</label>
                  <select value={fCliente} onChange={e=>setFCliente(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {listaClientes.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>N° Lote *</label>
                  <input value={fLote} onChange={e=>setFLote(e.target.value.toUpperCase())} placeholder="ej: AB12345"/>
                </div>
                <div className="form-group"><label>Mes ingreso</label>
                  <select value={fMes} onChange={e=>setFMes(e.target.value)}>
                    {Array.from({length:12},(_,i)=>(<option key={i+1} value={String(i+1).padStart(2,'0')}>{MESES[i]}</option>))}
                  </select>
                </div>
                <div className="form-group"><label>Año ingreso</label>
                  <select value={fAnio} onChange={e=>setFAnio(e.target.value)}>
                    {[2024,2025,2026,2027].map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Forma farmacéutica</label>
                  <select value={fForma} onChange={e=>setFForma(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {FORMAS.map(fo=><option key={fo}>{fo}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Dosis</label>
                  <input placeholder="ej: 100 mg" value={fDosis} onChange={e=>setFDosis(e.target.value)}/>
                </div>
                <div className="form-group"><label>Fecha vencimiento</label>
                  <input type="date" value={fVenc} onChange={e=>setFVenc(e.target.value)}/>
                </div>
                <div className="form-group"><label>Almacenamiento</label>
                  <select value={fAlmacen} onChange={e=>setFAlmacen(e.target.value)}>
                    {ALMACENAMIENTOS.map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              {/* Frascos — mismo estilo que Estándares */}
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS DEL ENVÍO</label>
                  <button className="btn btn-sm" onClick={agregarFrascoPL}><Plus size={12}/> Agregar frasco</button>
                </div>
                {frascos.map((fr,i) => (
                  <div key={fr.letra} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',marginBottom:6}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:12,color:i===0?'var(--accent)':'var(--text-2)',flexShrink:0}}>{fr.letra}</div>
                    <div style={{fontSize:11,color:'var(--text-2)',minWidth:80}}>{i===0?<span style={{color:'var(--ok)',fontWeight:500}}>En uso</span>:<span>Cerrado</span>}</div>
                    <div className="form-group" style={{flex:1,margin:0}}>
                      <input type="number" placeholder="Stock inicial (unidades)" value={fr.stock} onChange={e=>updateFrascoPL(i,e.target.value)}/>
                    </div>
                    {frascos.length>1 && <button className="btn btn-sm" onClick={()=>quitarFrascoPL(i)} style={{padding:'4px 8px',color:'var(--danger)'}}>✕</button>}
                  </div>
                ))}
                {sigNumPL && fLote && (
                  <div style={{marginTop:8,padding:'8px 12px',background:'var(--accent-lt)',borderRadius:'var(--radius-sm)',fontSize:11,color:'var(--accent)'}}>
                    <strong>Códigos que se generarán:</strong><br/>
                    {frascos.map(fr=>(
                      <div key={fr.letra} style={{fontFamily:'var(--font-mono)'}}>
                        {generarCodigoPL(sigNumPL, fMes, fAnio, fLote, fr.letra)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando?<><div className="spinner" style={{width:14,height:14,borderWidth:2}}/> Guardando...</>:`Guardar ${frascos.length} frasco${frascos.length>1?'s':''}`}
                </button>
                <button className="btn btn-sm" onClick={() => { setShowForm(false); setMsg('') }}>Cancelar</button>
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
              <thead><tr><th>Código</th><th>Producto</th><th>Cliente</th><th>Forma farm.</th><th>Stock (unid.)</th><th>Vencimiento</th><th>Observación</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filtrados.map(p => {
                  const vence = p.fechaVencimiento?.toDate?.() || (p.fechaVencimiento ? new Date(p.fechaVencimiento) : null)
                  const sem   = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const esPendiente = false  // estado inicial ahora es Cerrado
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.codigo}</td>
                      <td style={{ fontWeight:500 }}>{p.productoReferencia}</td>
                      <td>{p.cliente}</td>
                      <td><span className="badge badge-gray">{p.formaFarmaceutica || '—'}</span></td>
                      <td><strong>{p.stockUnidades ?? '—'}</strong></td>
                      <td>{vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td style={{fontSize:11,color:'var(--text-2)',maxWidth:130,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={p.observacion}>{p.observacion||'—'}</td>
                      <td>
                        <span className={({'En uso':'badge badge-ok','Cerrado':'badge badge-info','Sin stock':'badge badge-warn','Retirado por cliente':'badge badge-purple','Dado de baja':'badge badge-gray','Dada de baja':'badge badge-gray'}[p.estado])||'badge badge-gray'}>{p.estado}</span>
                      </td>
                      <td style={{display:'flex',gap:4,flexWrap:'nowrap',whiteSpace:'nowrap'}}>
                        {puedePonerEnUso && p.estado==='Cerrado' && (
                          <button className="btn btn-sm" title="Poner en uso" onClick={()=>handlePonerEnUso(p)}>
                            <PlayCircle size={13}/>
                          </button>
                        )}
                        {puedeOperar && p.estado==='En uso' && (
                          <button className="btn btn-sm" title="Registrar uso" onClick={() => { setUsoId(p.id); setShowForm(false); setForm({}) }}>
                            <Package size={13}/>
                          </button>
                        )}
                        {puedeAgregar && (
                          <button className="btn btn-sm" title="Reposición de stock" onClick={()=>{
                            setReposItem(p)
                            setReposMes(String(new Date().getMonth()+1).padStart(2,'0'))
                            setReposAnio(String(new Date().getFullYear()))
                            setReposFrascos([{letra:'A',stock:''}])
                            setReposLote(''); setReposVenc(''); setMsg('')
                          }}>📦</button>
                        )}
                        {puedeBaja && p.estado!=='Retirado por cliente' && p.estado!=='Dado de baja' && p.estado!=='Dada de baja' && (
                          <button className="btn btn-sm" title="Retirar por cliente" onClick={()=>setRetiroItem(p)}>
                            <PackageX size={13}/>
                          </button>
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