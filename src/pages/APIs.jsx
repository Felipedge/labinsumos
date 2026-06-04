// src/pages/APIs.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calcularSemaforo, registrarPesadaAPI, ponerEnUsoInsumo, retirarInsumo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, Search, FileText, Package, History, PlayCircle, PackageX } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
import { useClientes } from '../hooks/useClientes.jsx'
 
const ALMACENAMIENTOS = ['Ambiente','Refrigerado','Refrigerado Oncológico','Ambiente Oncológico','Freezer','Freezer Oncológico']
const MESES_NUM = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const MESES     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

async function getSiguienteNumeroAPI(db) {
  try {
    const q = query(collection(db, 'apis'), orderBy('numeroAPI', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroAPI || 0) + 1
  } catch { return 1 }
}

function generarCodigoAPI(numero, mes, anio, lote, frasco) {
  const num = String(numero).padStart(3,'0')
  const mesStr = MESES_NUM[parseInt(mes)-1]
  const anioStr = String(anio).slice(-2)
  return `API-${num}/${mesStr}${anioStr}/${(lote||'SL').toUpperCase()}/${frasco}`
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
 
// Estado efectivo combina estado guardado + vencimiento calculado en vivo
function estadoEfectivo(item) {
  const estados_baja = ['Dado de baja', 'Dada de baja', 'Retirado por cliente', 'Sin stock']
  if (estados_baja.includes(item.estado)) return item.estado
  if (!item.fechaVencimiento) return item.estado
  const hoy  = new Date(); hoy.setHours(0,0,0,0)
  const f = String(item.fechaVencimiento)
  const [y,m,d] = f.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return item.estado
  const vence = new Date(y, m-1, d)
  if (vence < hoy) return 'Vencido'
  return item.estado
}

export default function APIs() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar    = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar     = puedoHacer(rol, 'registrarUso')
  const puedeBaja       = puedoHacer(rol, 'darDeBaja')
  const puedePonerEnUso = puedoHacer(rol, 'ponerEnUso')
 
  const [tab, setTab]             = useState('inventario')
  const [items, setItems]         = useState([])
  const [retiroItem, setRetiroItem]     = useState(null)
  const [retiroFecha, setRetiroFecha]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [pesadaId, setPesadaId]   = useState(null)
  const [form, setForm]           = useState({})
  const ahora = new Date()
  const mesActual  = String(ahora.getMonth()+1).padStart(2,'0')
  const anioActual = String(ahora.getFullYear())
  const [sigNumAPI, setSigNumAPI] = useState(null)
  const [frascos, setFrascos]     = useState([{ letra:'A', stock:'' }])
  const [fNombre, setFNombre]     = useState('')
  const [fLab, setFLab]           = useState('')
  const [fLote, setFLote]         = useState('')
  const [fMes, setFMes]           = useState(mesActual)
  const [fAnio, setFAnio]         = useState(anioActual)
  const [fVenc, setFVenc]         = useState('')
  const [fAlmacen, setFAlmacen]   = useState('Ambiente')
  const [fCantidad, setFCantidad] = useState('')
  const [fObs, setFObs]           = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [reposItem, setReposItem]     = useState(null)
  const [reposFrascos, setReposFrascos] = useState([{letra:'A',stock:''}])
  const [reposLote, setReposLote]     = useState('')
  const [reposMes, setReposMes]       = useState('')
  const [reposAnio, setReposAnio]     = useState('')
  const [reposVenc, setReposVenc]     = useState('')
  const [reposGuardando, setReposGuardando] = useState(false)
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [ordenCampo, setOrdenCampo] = useState('nombre')
  const [ordenDir, setOrdenDir]     = useState('asc')
  const [docInsumo, setDocInsumo]   = useState(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [verPapelera, setVerPapelera] = useState(false)
 
  // Historial
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
    } catch { setItems(DEMO) }
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
 
  const agregarFrascoAPI = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const sig = letras[frascos.length]
    if (sig) setFrascos(p => [...p, { letra:sig, stock:'' }])
  }
  const quitarFrascoAPI = (i) => { if (frascos.length > 1) setFrascos(p => p.filter((_,j)=>j!==i)) }
  const updateFrascoAPI = (i, val) => setFrascos(p => p.map((fr,j)=>j===i?{...fr,stock:val}:fr))

  const guardar = async () => {
    if (!fNombre || !fLab) { setMsg('Nombre y laboratorio son obligatorios'); return }
    if (!fLote)            { setMsg('El lote es obligatorio'); return }
    if (frascos.some(fr => !fr.stock || isNaN(parseFloat(fr.stock)))) {
      setMsg('Ingresa el stock inicial de cada frasco'); return
    }
    setGuardando(true)
    try {
      const numero = sigNumAPI || await getSiguienteNumeroAPI(db)
      for (const fr of frascos) {
        const codigo = generarCodigoAPI(numero, fMes, fAnio, fLote, fr.letra)
        await addDoc(collection(db, 'apis'), {
          codigo, numeroAPI: numero, frasco: fr.letra,
          nombre:           capitalizar(fNombre),
          laboratorio:      fLab,
          lote:             fLote.toUpperCase(),
          fechaVencimiento: fVenc || null,
          almacenamiento:   fAlmacen,
          cantidadRecibida: fCantidad || '',
          stockRestante:    parseFloat(fr.stock),
          stockInicial:     parseFloat(fr.stock),
          observacion:      capitalizar(fObs),
          estado:           'Cerrado',
          creadoPorRol:     rol,
          creadoPor:        user.email,
          creadoEn:         serverTimestamp(),
          actualizadoEn:    serverTimestamp(),
        })
      }
      setShowForm(false); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
    finally { setGuardando(false) }
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
 
  const guardarReposicionAPI = async () => {
    if (!reposLote) { setMsg('El lote es obligatorio'); return }
    if (reposFrascos.some(fr => !fr.stock || isNaN(parseFloat(fr.stock)))) {
      setMsg('Ingresa el stock de cada frasco'); return
    }
    setReposGuardando(true)
    try {
      const base = reposItem
      const mes  = reposMes  || String(new Date().getMonth()+1).padStart(2,'0')
      const anio = reposAnio || String(new Date().getFullYear())
      for (const fr of reposFrascos) {
        const codigo = generarCodigoAPI(base.numeroAPI, mes, anio, reposLote, fr.letra)
        await addDoc(collection(db, 'apis'), {
          codigo, numeroAPI: base.numeroAPI, frasco: fr.letra,
          nombre: base.nombre, laboratorio: base.laboratorio,
          lote: reposLote.toUpperCase(),
          fechaVencimiento: reposVenc || null,
          almacenamiento: base.almacenamiento || 'Ambiente',
          cantidadRecibida: base.cantidadRecibida || '',
          stockRestante: parseFloat(fr.stock),
          stockInicial: parseFloat(fr.stock),
          observacion: base.observacion || '',
          estado: 'Cerrado', creadoPorRol: rol,
          creadoPor: user.email, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
        })
      }
      setReposItem(null); setReposFrascos([{letra:'A',stock:''}])
      setReposLote(''); setReposVenc(''); setMsg(''); load()
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setReposGuardando(false) }
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
        estado: 'Cerrado', bajaPor: null, bajaRazon: null,
        bajaFecha: null, actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }
 
  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }
 
  const activos  = items.filter(i => !['Dado de baja','Dada de baja'].includes(i.estado))
  const papelera = items.filter(i => ['Dado de baja','Dada de baja'].includes(i.estado))
 
  const filtrados = (verPapelera ? papelera : activos)
    .filter(i => {
      const q = search.toLowerCase()
      const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.laboratorio?.toLowerCase().includes(q)
      const matchE = !filtroEst || estadoEfectivo(i) === filtroEst
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
      {reposItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:480}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Reposición — {reposItem.nombre}</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>
              Código base: <span style={{fontFamily:'var(--font-mono)',fontWeight:600}}>API-{String(reposItem.numeroAPI).padStart(3,'0')}</span>
            </p>
            {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
            <div className="form-grid">
              <div className="form-group"><label>N° Lote nuevo *</label>
                <input value={reposLote} onChange={e=>setReposLote(e.target.value.toUpperCase())} placeholder="ej: 1234567890"/>
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
                    <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock}
                      onChange={e=>setReposFrascos(p=>p.map((x,j)=>j===i?{...x,stock:e.target.value}:x))}/>
                  </div>
                  {reposFrascos.length>1 && <button className="btn btn-sm" style={{color:'var(--danger)'}} onClick={()=>setReposFrascos(p=>p.filter((_,j)=>j!==i))}>✕</button>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={guardarReposicionAPI} disabled={reposGuardando}>
                {reposGuardando?'Guardando...':'Confirmar reposición'}
              </button>
              <button className="btn btn-sm" onClick={()=>{setReposItem(null);setReposFrascos([{letra:'A',stock:''}]);setReposLote('');setReposVenc('');setMsg('')}}>Cancelar</button>
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
          {tab==='inventario' && (
            <>
              {puedeBaja && (
                <button className="btn btn-sm"
                  style={verPapelera?{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}:{}}
                  onClick={()=>{setVerPapelera(!verPapelera);setSearch('');setFiltroEst('')}}>
                  🗑 Papelera {papelera.length>0&&`(${papelera.length})`}
                </button>
              )}
              {puedeAgregar && !verPapelera && (
                <button className="btn btn-primary btn-sm" onClick={async()=>{
                  if (!showForm) {
                    const n = await getSiguienteNumeroAPI(db)
                    setSigNumAPI(n)
                    setFrascos([{letra:'A',stock:''}])
                    setFNombre(''); setFLab(''); setFLote('')
                    setFMes(String(new Date().getMonth()+1).padStart(2,'0'))
                    setFAnio(String(new Date().getFullYear()))
                    setFVenc(''); setFAlmacen('Ambiente')
                    setFCantidad(''); setFObs(''); setMsg('')
                  }
                  setShowForm(!showForm); setPesadaId(null)
                }}>
                  <Plus size={14}/> Nuevo API
                </button>
              )}
            </>
          )}
        </div>
      </div>
 
      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[
          { id:'inventario', label:'Inventario', count:activos.length },
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
          {showForm && puedeAgregar && !verPapelera && (
            <div className="card">
              <div className="card-title">
                Ingresar nuevo API
                {sigNumAPI && <span className="badge badge-purple">N°: API-{String(sigNumAPI).padStart(3,'0')}</span>}
              </div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}

              <div className="form-grid">
                <div className="form-group"><label>Nombre *</label>
                  <input value={fNombre} onChange={e=>setFNombre(capitalizar(e.target.value))} placeholder="ej: Metilfenidato HCl"/>
                </div>
                <div className="form-group"><label>Laboratorio *</label>
                  <select value={fLab} onChange={e=>setFLab(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {listaClientes.map(l=><option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>N° Lote *</label>
                  <input value={fLote} onChange={e=>setFLote(e.target.value.toUpperCase())} placeholder="ej: 1234567890"/>
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
                <div className="form-group"><label>Fecha vencimiento</label>
                  <input type="date" value={fVenc} onChange={e=>setFVenc(e.target.value)}/>
                </div>
                <div className="form-group"><label>Almacenamiento</label>
                  <select value={fAlmacen} onChange={e=>setFAlmacen(e.target.value)}>
                    {ALMACENAMIENTOS.map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Cantidad recibida</label>
                  <input placeholder="ej: 20 g" value={fCantidad} onChange={e=>setFCantidad(e.target.value)}/>
                </div>
              </div>

              <div className="form-group" style={{marginBottom:14}}>
                <label>Observaciones</label>
                <input value={fObs} onChange={e=>setFObs(capitalizar(e.target.value))} placeholder="Observaciones adicionales"/>
              </div>

              {/* Frascos — mismo estilo que Estándares */}
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS DEL ENVÍO</label>
                  <button className="btn btn-sm" onClick={agregarFrascoAPI}><Plus size={12}/> Agregar frasco</button>
                </div>
                {frascos.map((fr,i) => (
                  <div key={fr.letra} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',marginBottom:6}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:12,color:i===0?'var(--accent)':'var(--text-2)',flexShrink:0}}>{fr.letra}</div>
                    <div style={{fontSize:11,color:'var(--text-2)',minWidth:80}}>{i===0?<span style={{color:'var(--ok)',fontWeight:500}}>En uso</span>:<span>Cerrado</span>}</div>
                    <div className="form-group" style={{flex:1,margin:0}}>
                      <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock} onChange={e=>updateFrascoAPI(i,e.target.value)}/>
                    </div>
                    {frascos.length>1 && <button className="btn btn-sm" onClick={()=>quitarFrascoAPI(i)} style={{padding:'4px 8px',color:'var(--danger)'}}>✕</button>}
                  </div>
                ))}
                {sigNumAPI && fLote && (
                  <div style={{marginTop:8,padding:'8px 12px',background:'var(--accent-lt)',borderRadius:'var(--radius-sm)',fontSize:11,color:'var(--accent)'}}>
                    <strong>Códigos que se generarán:</strong><br/>
                    {frascos.map(fr=>(
                      <div key={fr.letra} style={{fontFamily:'var(--font-mono)'}}>
                        {generarCodigoAPI(sigNumAPI, fMes, fAnio, fLote, fr.letra)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando?<><div className="spinner" style={{width:14,height:14,borderWidth:2}}/> Guardando...</>:`Guardar ${frascos.length} frasco${frascos.length>1?'s':''}`}
                </button>
                <button className="btn btn-sm" onClick={()=>{setShowForm(false);setMsg('')}}>Cancelar</button>
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
                <div className="form-group"><label>N° análisis</label>
                  <input onChange={f('nAnalisis')}/>
                </div>
                <div className="form-group"><label>Producto / análisis</label>
                  <input onChange={f('producto')}/>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={registrarPesada}>Confirmar pesada</button>
                <button className="btn btn-sm" onClick={()=>{setPesadaId(null);setForm({});setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}
 
          {/* Barra búsqueda */}
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
            <div className="search-bar">
              <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por código, nombre o laboratorio..." style={{flex:1}}/>
              <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
                <option value="">Todos los laboratorios</option>
                {listaClientes.map(c=><option key={c}>{c}</option>)}
              </select>
              {!verPapelera && (
                <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
                  <option value="">Todos los estados</option>
                  <option value="En uso">En uso</option>
                  <option value="Cerrado">Cerrado</option>
                  <option value="Vencido">Vencido</option>
                  <option value="Sin stock">Sin stock</option>
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
              { label:'Total',      valor: activos.length, color:'var(--accent)' },
              { label:'En uso',     valor: activos.filter(i=>estadoEfectivo(i)==='En uso').length, color:'var(--ok)' },
              { label:'Vencidos',   valor: activos.filter(i=>estadoEfectivo(i)==='Vencido').length, color:'var(--danger)' },
              { label:'Sin stock',  valor: items.filter(i=>i.estado==='Sin stock').length, color:'var(--warn)' },
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
                  <th>Código</th><th>Nombre</th><th>Producto</th><th>Laboratorio</th>
                  <th>Lote</th><th>Stock (mg)</th><th>Vencimiento</th><th>Observación</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => {
                  const vence    = i.fechaVencimiento?.toDate?.() || (() => {
                    if (!i.fechaVencimiento) return null
                    const f = String(i.fechaVencimiento)
                    // Parsear AAAA-MM-DD sin problemas de timezone
                    const [y,m,d] = f.split('T')[0].split('-').map(Number)
                    if (!y || !m || !d) return null
                    return new Date(y, m-1, d)
                  })()
                  const sem      = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const estEfectivo = estadoEfectivo(i)
                  const estCls   = {
                    'En uso':'badge-ok','Cerrado':'badge-info',
                    'Sin stock':'badge-warn','Vencido':'badge-danger',
                    'Retirado por cliente':'badge-purple',
                    'Dado de baja':'badge-gray','Dada de baja':'badge-gray',
                  }[estEfectivo] || 'badge-gray'
                  const stockMostrado = i.stockRestante ?? i.cantidadRecibida ?? '—'
 
                  return (
                    <tr key={i.id}>
                      <td className="mono" style={{fontWeight:600}}>{i.codigo}</td>
                      <td style={{fontWeight:500}}>{i.nombre}</td>
                      <td style={{fontSize:12,color:'var(--text-2)',maxWidth:120,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={i.producto}>{i.producto||'—'}</td>
                      <td style={{color:'var(--text-2)'}}>{i.laboratorio}</td>
                      <td style={{color:'var(--text-2)',fontSize:11}}>{i.lote || '—'}</td>
                      <td><strong>{stockMostrado}</strong></td>
                      <td>{vence ? <span className={`badge ${badgeCls}`}>{vence.toLocaleDateString('es-CL')}</span> : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td style={{fontSize:11,color:'var(--text-2)',maxWidth:130,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={i.observacion}>{i.observacion||'—'}</td>
                      <td><span className={`badge ${estCls}`}>{estEfectivo}</span></td>
                      <td style={{display:'flex',gap:4}}>
                        {puedePonerEnUso && estEfectivo==='Cerrado' && (
                          <button className="btn btn-sm" title="Poner en uso" onClick={()=>handlePonerEnUso(i)}>
                            <PlayCircle size={13}/> En uso
                          </button>
                        )}
                        {puedeOperar && estEfectivo==='En uso' && (
                          <button className="btn btn-sm" onClick={()=>{setPesadaId(i.id);setShowForm(false);setForm({})}}>Pesada</button>
                        )}
                        <button className="btn btn-sm" onClick={()=>setDocInsumo(i)} title="Ver documentos">
                          <FileText size={13}/>
                        </button>
                        {puedeAgregar && !verPapelera && (
                          <button className="btn btn-sm" title="Reposición de stock" onClick={()=>{
                            setReposItem(i)
                            setReposMes(String(new Date().getMonth()+1).padStart(2,'0'))
                            setReposAnio(String(new Date().getFullYear()))
                            setReposFrascos([{letra:'A',stock:''}])
                            setReposLote(''); setReposVenc(''); setMsg('')
                          }}>📦</button>
                        )}
                        {puedeBaja && !verPapelera && !['Retirado por cliente','Dado de baja','Dada de baja'].includes(estEfectivo) && (
                          <button className="btn btn-sm" title="Retirar por cliente" onClick={()=>setRetiroItem(i)}>
                            <PackageX size={13}/>
                          </button>
                        )}
                        {puedeBaja && !verPapelera && (
                          <button className="btn btn-sm"
                            style={{color:'var(--danger)',borderColor:'var(--danger)'}}
                            onClick={()=>darDeBaja(i.id, i.codigo)} title="Dar de baja">🗑</button>
                        )}
                        {puedeBaja && verPapelera && (
                          <button className="btn btn-sm" onClick={()=>restaurar(i.id)}>Restaurar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                    {verPapelera ? 'La papelera está vacía' : 'No hay APIs que coincidan'}
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