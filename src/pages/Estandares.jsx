// src/pages/Estandares.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calcularSemaforo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, Search, FlaskConical, History, Package } from 'lucide-react'

const CLIENTES  = ['Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Prater','MSN','Otro']
const SECTORES  = ['Fq','Val','Fq/val','Mb','T-r']
const ESTADOS   = ['En uso','Cerrado','Vencido','Sin stock','Dado de baja']
const ALMACENES = ['Desecador','Refrigerador','Freezer','Desecador-oncológico','Refrigerador-oncológico','Refrigerador-controlado']
const MESES     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_NUM = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

const TIPO_POTENCIA = [
  { value: 'tal_cual',    label: 'Tal cual' },
  { value: 'base_seca',   label: 'Base seca' },
  { value: 'sin_potencia', label: 'Sin potencia' },
  { value: 'cualitativo', label: 'Estándar cualitativo' },
]

// ── Capitalización automática ─────────────────────────────────
// Primera letra mayúscula, resto minúscula por palabra no aplica
// Solo primera letra del texto mayúscula, resto minúscula
function capitalizar(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// Para inputs: capitalizar al escribir
function onChangeCapitalizar(setter) {
  return (e) => {
    const val = e.target.value
    if (!val) { setter(''); return }
    setter(val.charAt(0).toUpperCase() + val.slice(1))
  }
}

async function getSiguienteNumero(db) {
  try {
    const q    = query(collection(db, 'estandares'), orderBy('numeroStd', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroStd || 0) + 1
  } catch { return 1 }
}

function generarCodigo(numero, mes, anio, lote, frasco) {
  const num     = String(numero).padStart(4, '0')
  const mesStr  = MESES_NUM[parseInt(mes) - 1]
  const anioStr = String(anio).slice(-2)
  return `STD-${num}/${mesStr}${anioStr}/${lote}/${frasco}`
}

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}

// ── Componente badge de potencia ──────────────────────────────
function BadgePotencia({ tipoPotencia, potencia }) {
  if (tipoPotencia === 'cualitativo') return <span className="badge badge-purple">Cualitativo</span>
  if (tipoPotencia === 'sin_potencia') return <span className="badge badge-gray">Sin potencia</span>
  if (tipoPotencia === 'base_seca')    return <span className="badge badge-info">{potencia}% Base seca</span>
  if (tipoPotencia === 'tal_cual')     return <span className="badge badge-ok">{potencia}% Tal cual</span>
  return potencia ? <span className="badge badge-gray">{potencia}%</span> : <span style={{color:'var(--text-3)'}}>—</span>
}

// ── Componente condiciones especiales ─────────────────────────
function BadgesCondiciones({ karlFischer, secadoPrevio, tempSecado, tiempoSecado }) {
  return (
    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
      {karlFischer && (
        <span className="badge badge-warn" title="Requiere determinación de agua por Karl Fischer">
          💧 Karl Fischer
        </span>
      )}
      {secadoPrevio && (
        <span className="badge badge-warn" title={`Secado previo${tempSecado?` a ${tempSecado}°C`:''}${tiempoSecado?` por ${tiempoSecado}`:''}`}>
          🌡️ Secado {tempSecado ? `${tempSecado}°C` : ''} {tiempoSecado || ''}
        </span>
      )}
    </div>
  )
}

export default function Estandares() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedePesada  = puedoHacer(rol, 'registrarUso')
  const puedeBaja    = puedoHacer(rol, 'darDeBaja')

  const [tab, setTab] = useState('inventario')

  // Inventario
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [pesadaId, setPesadaId]   = useState(null)
  const [frascos, setFrascos]     = useState([{ letra: 'A', stock: '' }])
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [sigNum, setSigNum]       = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verPapelera, setVerPapelera] = useState(false)

  // Campos del formulario con capitalización
  const [fNombre, setFNombre]         = useState('')
  const [fCliente, setFCliente]       = useState('')
  const [fLote, setFLote]             = useState('')
  const [fCas, setFCas]               = useState('')
  const [fProducto, setFProducto]     = useState('')
  const [fFabricante, setFabricante]  = useState('')
  const [fObservacion, setFObservacion] = useState('')
  const [fSector, setFSector]         = useState('Fq')
  const [fAlmacen, setFAlmacen]       = useState('Desecador')
  const [fMes, setFMes]               = useState('')
  const [fAnio, setFAnio]             = useState('')
  const [fVencimiento, setFVencimiento] = useState('')
  const [fXAnalisis, setFXAnalisis]   = useState('200')
  // Potencia
  const [fTipoPotencia, setFTipoPotencia] = useState('tal_cual')
  const [fPotencia, setFPotencia]     = useState('')
  // Condiciones especiales
  const [fKarlFischer, setFKarlFischer] = useState(false)
  const [fSecadoPrevio, setFSecadoPrevio] = useState(false)
  const [fTempSecado, setFTempSecado]   = useState('')
  const [fTiempoSecado, setFTiempoSecado] = useState('')
  // Pesada
  const [fMg, setFMg]               = useState('')
  const [fNAnalisis, setFNAnalisis]  = useState('')
  const [fProducto2, setFProducto2]  = useState('')

  // Historial
  const [pesadas, setPesadas]             = useState([])
  const [loadingH, setLoadingH]           = useState(false)
  const [searchH, setSearchH]             = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroStd, setFiltroStd]         = useState('')
  const [fechaDesde, setFechaDesde]       = useState('')
  const [fechaHasta, setFechaHasta]       = useState('')

  const hoy     = new Date()
  const mesAct  = String(hoy.getMonth() + 1).padStart(2, '0')
  const anioAct = hoy.getFullYear()

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'estandares'), orderBy('creadoEn', 'desc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setItems(DEMO_E) }
    finally { setLoading(false) }
  }

  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(query(collection(db, 'usos_estandares'), orderBy('fecha', 'desc'), limit(500)))
      setPesadas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setPesadas([]) }
    finally { setLoadingH(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'historial' && pesadas.length === 0) loadHistorial() }, [tab])

  const abrirFormulario = async () => {
    if (!showForm) {
      const n = await getSiguienteNumero(db)
      setSigNum(n)
      setFMes(mesAct); setFAnio(String(anioAct))
      setFrascos([{ letra: 'A', stock: '' }])
      // Resetear todos los campos
      setFNombre(''); setFCliente(''); setFLote(''); setFCas('')
      setFProducto(''); setFabricante(''); setFObservacion('')
      setFSector('Fq'); setFAlmacen('Desecador'); setFVencimiento('')
      setFXAnalisis('200'); setFTipoPotencia('tal_cual'); setFPotencia('')
      setFKarlFischer(false); setFSecadoPrevio(false)
      setFTempSecado(''); setFTiempoSecado(''); setMsg('')
    }
    setShowForm(!showForm)
    setPesadaId(null)
  }

  const agregarFrasco = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const sig = letras[frascos.length]
    if (sig) setFrascos(p => [...p, { letra: sig, stock: '' }])
  }
  const quitarFrasco = (i) => { if (frascos.length > 1) setFrascos(p => p.filter((_,idx)=>idx!==i)) }
  const updateFrasco = (i, valor) => setFrascos(p => p.map((fr,idx)=>idx===i?{...fr,stock:valor}:fr))

  const guardar = async () => {
    if (!fLote || !fNombre || !fCliente) { setMsg('Nombre, cliente y lote son obligatorios'); return }
    if (frascos.some(fr => !fr.stock || isNaN(fr.stock))) { setMsg('Ingresa el stock de cada frasco'); return }
    if ((fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca') && !fPotencia) {
      setMsg('Ingresa el valor de potencia o selecciona "Sin potencia" / "Cualitativo"'); return
    }
    setGuardando(true)
    try {
      const numero = sigNum || await getSiguienteNumero(db)
      for (let i = 0; i < frascos.length; i++) {
        const frasco = frascos[i]
        const codigo = generarCodigo(numero, fMes || mesAct, fAnio || anioAct, fLote, frasco.letra)
        await addDoc(collection(db, 'estandares'), {
          codigo,
          numeroStd:        numero,
          frasco:           frasco.letra,
          nombre:           capitalizar(fNombre),
          cas:              fCas.toUpperCase(),
          lote:             fLote.toUpperCase(),
          cliente:          fCliente,
          producto:         capitalizar(fProducto),
          // Potencia
          tipoPotencia:     fTipoPotencia,
          potencia:         (fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca') ? parseFloat(fPotencia) : null,
          // Condiciones especiales
          karlFischer:      fKarlFischer,
          secadoPrevio:     fSecadoPrevio,
          tempSecado:       fSecadoPrevio ? capitalizar(fTempSecado) : '',
          tiempoSecado:     fSecadoPrevio ? capitalizar(fTiempoSecado) : '',
          // Resto
          sector:           fSector,
          almacenamiento:   fAlmacen,
          fabricante:       capitalizar(fFabricante),
          observacion:      capitalizar(fObservacion),
          stockInicial:     parseFloat(frasco.stock),
          stockRestante:    parseFloat(frasco.stock),
          cantPorAnalisis:  parseFloat(fXAnalisis) || 200,
          fechaVencimiento: fVencimiento ? new Date(fVencimiento) : null,
          estado:           i === 0 ? 'En uso' : 'Cerrado',
          mesIngreso:       fMes || mesAct,
          anioIngreso:      parseInt(fAnio || anioAct),
          creadoPor:        user.email,
          creadoEn:         serverTimestamp(),
          actualizadoEn:    serverTimestamp(),
        })
      }
      setShowForm(false); setFrascos([{ letra: 'A', stock: '' }]); setMsg(''); load()
    } catch(e) { setMsg('Error al guardar: ' + e.message) }
    finally { setGuardando(false) }
  }

  const pesada = async () => {
    if (!pesadaId || !fMg) { setMsg('Ingresa la cantidad pesada'); return }
    try {
      const { registrarPesada } = await import('../lib/db')
      await registrarPesada({
        estandarId: pesadaId,
        mgPesados:  parseFloat(fMg),
        nAnalisis:  fNAnalisis,
        producto:   capitalizar(fProducto2),
        analista:   user.displayName || user.email,
        email:      user.email,
      })
      setPesadaId(null); setFMg(''); setFNAnalisis(''); setFProducto2(''); setMsg(''); load()
      if (tab === 'historial') loadHistorial()
    } catch(e) { setMsg(e.message) }
  }

  const darDeBaja = async (id, codigo) => {
    const razon = window.prompt(`Razón para dar de baja ${codigo}:`)
    if (!razon) return
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'Dado de baja', bajaPor: user.email, bajaRazon: capitalizar(razon),
        bajaFecha: serverTimestamp(), actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const restaurar = async (id) => {
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'Cerrado', bajaPor: null, bajaRazon: null, bajaFecha: null, actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const activos  = items.filter(i => i.estado !== 'Dado de baja')
  const papelera = items.filter(i => i.estado === 'Dado de baja')

  const filtrados = (verPapelera ? papelera : activos).filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.cliente?.toLowerCase().includes(q)
    const matchE = !filtroEst || i.estado === filtroEst
    return matchQ && matchE
  })

  const usuariosUnicos = [...new Set(pesadas.map(p => p.analista || p.email).filter(Boolean))]
  const stdsUnicos     = [...new Set(pesadas.map(p => p.codigo).filter(Boolean))]

  const pesadasFiltradas = pesadas.filter(p => {
    const q = searchH.toLowerCase()
    const matchQ = !q || p.codigo?.toLowerCase().includes(q) || p.nombre?.toLowerCase().includes(q) || p.nAnalisis?.toLowerCase().includes(q)
    const matchU = !filtroUsuario || (p.analista || p.email) === filtroUsuario
    const matchS = !filtroStd || p.codigo === filtroStd
    const fecha  = p.fecha?.toDate ? p.fecha.toDate() : null
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchQ && matchU && matchS && matchD && matchH
  })

  const totalMg = pesadasFiltradas.reduce((acc, p) => acc + (parseFloat(p.mgPesados) || 0), 0)

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  const needsPotencia = fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca'

  return (
    <>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>Estándares</h2>
        <div style={{display:'flex',gap:8}}>
          {tab==='inventario' && puedeBaja && (
            <button className="btn btn-sm"
              style={verPapelera?{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}:{}}
              onClick={()=>{setVerPapelera(!verPapelera);setSearch('');setFiltroEst('')}}>
              🗑 Papelera {papelera.length>0&&`(${papelera.length})`}
            </button>
          )}
          {tab==='inventario' && !verPapelera && puedeAgregar && (
            <button className="btn btn-primary btn-sm" onClick={abrirFormulario}>
              <Plus size={14}/> Nuevo estándar
            </button>
          )}
          {tab==='historial' && (
            <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {[
          { id:'inventario', icon:<Package size={14}/>, label:'Inventario', count:activos.length },
          { id:'historial',  icon:<History size={14}/>, label:'Historial de pesadas', count:pesadas.length },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,
            padding:'8px 16px',fontSize:13,cursor:'pointer',
            border:'none',background:'none',
            color:tab===t.id?'var(--accent)':'var(--text-2)',
            borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
            fontWeight:tab===t.id?500:400,marginBottom:-1,
          }}>
            {t.icon} {t.label}
            {t.count>0&&<span style={{fontSize:11,padding:'1px 6px',borderRadius:10,background:'var(--bg)',color:'var(--text-2)'}}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB INVENTARIO ── */}
      {tab==='inventario' && (
        <>
          {/* Formulario nuevo estándar */}
          {showForm && puedeAgregar && !verPapelera && (
            <div className="card">
              <div className="card-title">
                Ingresar nuevo estándar
                {sigNum && <span className="badge badge-purple">Próximo N°: STD-{String(sigNum).padStart(4,'0')}</span>}
              </div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label>Nombre del estándar *</label>
                  <input value={fNombre} onChange={onChangeCapitalizar(setFNombre)} placeholder="ej: Cilostazol" />
                </div>
                <div className="form-group">
                  <label>Cliente *</label>
                  <select value={fCliente} onChange={e=>setFCliente(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {CLIENTES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>N° Lote *</label>
                  <input value={fLote} onChange={e=>setFLote(e.target.value.toUpperCase())} placeholder="ej: LRAD4238" />
                </div>
                <div className="form-group">
                  <label>N° CAS</label>
                  <input value={fCas} onChange={e=>setFCas(e.target.value)} placeholder="ej: 73963-72-1" />
                </div>
                <div className="form-group">
                  <label>Mes de ingreso</label>
                  <select value={fMes} onChange={e=>setFMes(e.target.value)} defaultValue={mesAct}>
                    {Array.from({length:12},(_,i)=>(
                      <option key={i+1} value={String(i+1).padStart(2,'0')}>{MESES[i]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Año de ingreso</label>
                  <select value={fAnio} onChange={e=>setFAnio(e.target.value)} defaultValue={anioAct}>
                    {[2023,2024,2025,2026,2027].map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Producto</label>
                  <input value={fProducto} onChange={onChangeCapitalizar(setFProducto)} placeholder="ej: Cilosvitae 100" />
                </div>
                <div className="form-group">
                  <label>Sector</label>
                  <select value={fSector} onChange={e=>setFSector(e.target.value)}>
                    {SECTORES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Almacenamiento</label>
                  <select value={fAlmacen} onChange={e=>setFAlmacen(e.target.value)}>
                    {ALMACENES.map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fabricante</label>
                  <input value={fFabricante} onChange={onChangeCapitalizar(setFabricante)} placeholder="ej: Sigma-aldrich" />
                </div>
                <div className="form-group">
                  <label>Cant. por análisis (mg)</label>
                  <input type="number" step="0.01" value={fXAnalisis} onChange={e=>setFXAnalisis(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Fecha vencimiento</label>
                  <input type="date" value={fVencimiento} onChange={e=>setFVencimiento(e.target.value)} />
                </div>
              </div>

              {/* ── SECCIÓN POTENCIA ── */}
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14}}>
                <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>POTENCIA</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                  {TIPO_POTENCIA.map(t => (
                    <label key={t.value} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,padding:'6px 12px',borderRadius:'var(--radius-sm)',border:`1px solid ${fTipoPotencia===t.value?'var(--accent)':'var(--border-md)'}`,background:fTipoPotencia===t.value?'var(--accent-lt)':'var(--surface)',color:fTipoPotencia===t.value?'var(--accent)':'var(--text-1)'}}>
                      <input type="radio" name="tipoPotencia" value={t.value} checked={fTipoPotencia===t.value} onChange={e=>setFTipoPotencia(e.target.value)} style={{display:'none'}} />
                      {t.label}
                    </label>
                  ))}
                </div>
                {needsPotencia && (
                  <div className="form-group" style={{maxWidth:200}}>
                    <label>Valor de potencia (%)*</label>
                    <input type="number" step="0.001" min="0" max="100" value={fPotencia} onChange={e=>setFPotencia(e.target.value)} placeholder="ej: 99.5" />
                  </div>
                )}
                {fTipoPotencia==='cualitativo' && (
                  <p style={{fontSize:12,color:'var(--text-2)',fontStyle:'italic'}}>Este estándar no tiene valor de potencia numérico asignado.</p>
                )}
                {fTipoPotencia==='sin_potencia' && (
                  <p style={{fontSize:12,color:'var(--text-2)',fontStyle:'italic'}}>Sin potencia registrada.</p>
                )}
              </div>

              {/* ── CONDICIONES ESPECIALES ── */}
              <div style={{background:'var(--warn-lt)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14,border:'1px solid var(--border)'}}>
                <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>CONDICIONES ESPECIALES PREVIAS</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:10}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={fKarlFischer} onChange={e=>setFKarlFischer(e.target.checked)} />
                    <span>💧 Karl Fischer (determinación de agua)</span>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={fSecadoPrevio} onChange={e=>setFSecadoPrevio(e.target.checked)} />
                    <span>🌡️ Secado previo</span>
                  </label>
                </div>
                {fSecadoPrevio && (
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <div className="form-group" style={{flex:1,minWidth:140}}>
                      <label>Temperatura (°C)</label>
                      <input value={fTempSecado} onChange={e=>setFTempSecado(e.target.value)} placeholder="ej: 105" />
                    </div>
                    <div className="form-group" style={{flex:1,minWidth:140}}>
                      <label>Tiempo / condición</label>
                      <input value={fTiempoSecado} onChange={onChangeCapitalizar(setFTiempoSecado)} placeholder="ej: 2 horas, Hasta peso constante" />
                    </div>
                  </div>
                )}
                {!fKarlFischer && !fSecadoPrevio && (
                  <p style={{fontSize:12,color:'var(--text-3)',fontStyle:'italic'}}>Sin condiciones especiales previas.</p>
                )}
              </div>

              {/* Observaciones */}
              <div className="form-group" style={{marginBottom:14}}>
                <label>Observaciones</label>
                <input value={fObservacion} onChange={onChangeCapitalizar(setFObservacion)} placeholder="Observaciones adicionales" />
              </div>

              {/* ── FRASCOS ── */}
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS DEL ENVÍO</label>
                  <button className="btn btn-sm" onClick={agregarFrasco} type="button"><Plus size={12}/> Agregar frasco</button>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {frascos.map((fr,i) => (
                    <div key={fr.letra} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:12,color:i===0?'var(--accent)':'var(--text-2)',flexShrink:0}}>{fr.letra}</div>
                      <div style={{fontSize:11,color:'var(--text-2)',minWidth:80}}>
                        {i===0?<span style={{color:'var(--ok)',fontWeight:500}}>En uso</span>:<span>Cerrado</span>}
                      </div>
                      <div className="form-group" style={{flex:1,margin:0}}>
                        <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock} onChange={e=>updateFrasco(i,e.target.value)} />
                      </div>
                      {frascos.length>1 && <button className="btn btn-sm" onClick={()=>quitarFrasco(i)} style={{padding:'4px 8px',color:'var(--danger)'}}>✕</button>}
                    </div>
                  ))}
                </div>
                {sigNum && fLote && (
                  <div style={{marginTop:8,padding:'8px 12px',background:'var(--accent-lt)',borderRadius:'var(--radius-sm)',fontSize:11,color:'var(--accent)'}}>
                    <strong>Códigos que se generarán:</strong><br/>
                    {frascos.map(fr=>(
                      <div key={fr.letra} style={{fontFamily:'var(--font-mono)'}}>
                        {generarCodigo(sigNum, fMes||mesAct, fAnio||anioAct, fLote, fr.letra)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando?<div className="spinner" style={{width:14,height:14,borderWidth:2}}/>:<FlaskConical size={14}/>}
                  {guardando?'Guardando...':`Guardar ${frascos.length} frasco${frascos.length>1?'s':''}`}
                </button>
                <button className="btn btn-sm" onClick={()=>{setShowForm(false);setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Formulario pesada */}
          {pesadaId && puedePesada && (
            <div className="card">
              <div className="card-title">
                Registrar pesada — {items.find(i=>i.id===pesadaId)?.nombre} · Frasco {items.find(i=>i.id===pesadaId)?.frasco}
              </div>
              {/* Mostrar condiciones especiales si aplica */}
              {(() => {
                const std = items.find(i=>i.id===pesadaId)
                return std && (std.karlFischer || std.secadoPrevio) ? (
                  <div style={{background:'var(--warn-lt)',border:'1px solid var(--warn-lt)',borderRadius:'var(--radius-sm)',padding:'8px 12px',marginBottom:12,fontSize:12}}>
                    <strong style={{color:'var(--warn)'}}>⚠️ Condiciones especiales requeridas antes de pesar:</strong>
                    <BadgesCondiciones karlFischer={std.karlFischer} secadoPrevio={std.secadoPrevio} tempSecado={std.tempSecado} tiempoSecado={std.tiempoSecado} />
                  </div>
                ) : null
              })()}
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Cantidad pesada (mg) *</label><input type="number" step="0.01" placeholder="ej: 10.25" value={fMg} onChange={e=>setFMg(e.target.value)} /></div>
                <div className="form-group"><label>N° análisis</label><input value={fNAnalisis} onChange={e=>setFNAnalisis(e.target.value)} /></div>
                <div className="form-group"><label>Producto / análisis</label><input value={fProducto2} onChange={onChangeCapitalizar(setFProducto2)} /></div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={pesada}>Confirmar pesada</button>
                <button className="btn btn-sm" onClick={()=>{setPesadaId(null);setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Barra búsqueda */}
          <div className="search-bar">
            <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, nombre o cliente..." style={{flex:1}}/>
            {!verPapelera && (
              <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
                <option value="">Todos los estados</option>
                {ESTADOS.filter(e=>e!=='Dado de baja').map(e=><option key={e}>{e}</option>)}
              </select>
            )}
          </div>

          {/* Tabla inventario */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Nombre</th><th>Frasco</th><th>Cliente</th>
                  <th>Potencia</th><th>Condiciones</th><th>Stock (mg)</th>
                  <th>Vencimiento</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => {
                  const vence    = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
                  const sem      = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const estCls   = {
                    'En uso':      'badge-ok',
                    'Cerrado':     'badge-info',
                    'Vencido':     'badge-danger',
                    'Sin stock':   'badge-warn',
                    'Dado de baja':'badge-gray',
                  }[i.estado] || 'badge-gray'
                  return (
                    <tr key={i.id}>
                      <td className="mono" style={{fontSize:10}}>{i.codigo}</td>
                      <td style={{fontWeight:500}}>{i.nombre}</td>
                      <td>
                        <span style={{width:24,height:24,borderRadius:'50%',background:i.estado==='En uso'?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:i.estado==='En uso'?'var(--accent)':'var(--text-2)'}}>
                          {i.frasco||'—'}
                        </span>
                      </td>
                      <td style={{color:'var(--text-2)'}}>{i.cliente}</td>
                      <td><BadgePotencia tipoPotencia={i.tipoPotencia} potencia={i.potencia} /></td>
                      <td>
                        {(i.karlFischer || i.secadoPrevio)
                          ? <BadgesCondiciones karlFischer={i.karlFischer} secadoPrevio={i.secadoPrevio} tempSecado={i.tempSecado} tiempoSecado={i.tiempoSecado} />
                          : <span style={{color:'var(--text-3)',fontSize:11}}>—</span>
                        }
                      </td>
                      <td><strong>{i.stockRestante??'—'}</strong></td>
                      <td>{vence?<span className={`badge ${badgeCls}`}>{sem.texto}</span>:<span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                      <td style={{display:'flex',gap:4}}>
                        {puedePesada && i.estado==='En uso' && (
                          <button className="btn btn-sm" onClick={()=>{setPesadaId(i.id);setShowForm(false)}}>Pesada</button>
                        )}
                        {puedeBaja && !verPapelera && (
                          <button className="btn btn-sm" style={{color:'var(--danger)',borderColor:'var(--danger)'}} onClick={()=>darDeBaja(i.id,i.codigo)} title="Dar de baja">🗑</button>
                        )}
                        {puedeBaja && verPapelera && (
                          <button className="btn btn-sm" onClick={()=>restaurar(i.id)}>Restaurar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length===0 && (
                  <tr><td colSpan={10} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                    {verPapelera?'La papelera está vacía':'No hay estándares que coincidan'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB HISTORIAL ── */}
      {tab==='historial' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div className="kpi-card"><div className="kpi-label">Total pesadas</div><div className="kpi-value info">{pesadasFiltradas.length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total mg pesados</div><div className="kpi-value">{totalMg.toFixed(2)} mg</div></div>
            <div className="kpi-card"><div className="kpi-label">Analistas</div><div className="kpi-value">{usuariosUnicos.length}</div></div>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group"><label>Buscar</label><input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, nombre o N° análisis..."/></div>
              <div className="form-group"><label>Analista</label>
                <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                  <option value="">Todos los analistas</option>
                  {usuariosUnicos.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Estándar</label>
                <select value={filtroStd} onChange={e=>setFiltroStd(e.target.value)}>
                  <option value="">Todos los estándares</option>
                  {stdsUnicos.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Desde</label><input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/></div>
              <div className="form-group"><label>Hasta</label><input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/></div>
              <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                <button className="btn btn-sm" onClick={()=>{setSearchH('');setFiltroUsuario('');setFiltroStd('');setFechaDesde('');setFechaHasta('')}}>Limpiar</button>
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
                    <th>Mg pesados</th><th>Stock antes</th><th>Stock después</th><th>N° análisis</th><th>Producto</th>
                  </tr>
                </thead>
                <tbody>
                  {pesadasFiltradas.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>{formatFecha(p.fecha)}</td>
                      <td><div style={{fontSize:12,fontWeight:500}}>{p.analista||'—'}</div><div style={{fontSize:10,color:'var(--text-3)'}}>{p.email}</div></td>
                      <td className="mono" style={{fontSize:10}}>{p.codigo||p.insumoCode||'—'}</td>
                      <td style={{fontWeight:500}}>{p.nombre||p.insumoNombre||'—'}</td>
                      <td><strong style={{color:'var(--accent)'}}>{p.mgPesados} mg</strong></td>
                      <td style={{color:'var(--text-2)'}}>{p.stockAntes?.toFixed(2)??'—'} mg</td>
                      <td style={{color:'var(--text-2)'}}>{p.stockDespues?.toFixed(2)??'—'} mg</td>
                      <td style={{color:'var(--text-2)'}}>{p.nAnalisis||'—'}</td>
                      <td style={{color:'var(--text-2)',fontSize:11}}>{p.producto||'—'}</td>
                    </tr>
                  ))}
                  {pesadasFiltradas.length===0 && (
                    <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay pesadas que coincidan</td></tr>
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

const DEMO_E = [
  { id:'1', codigo:'STD-0025/MAR24/LRAD4238/A', nombre:'Cilostazol', frasco:'A', cliente:'Galenicum', tipoPotencia:'tal_cual', potencia:99.5, karlFischer:false, secadoPrevio:true, tempSecado:'105', tiempoSecado:'2 horas', stockRestante:440.69, fechaVencimiento:'2026-11-30', estado:'En uso' },
  { id:'2', codigo:'STD-0025/MAR24/LRAD4238/B', nombre:'Cilostazol', frasco:'B', cliente:'Galenicum', tipoPotencia:'tal_cual', potencia:99.5, karlFischer:false, secadoPrevio:true, tempSecado:'105', tiempoSecado:'2 horas', stockRestante:500.00, fechaVencimiento:'2026-11-30', estado:'Cerrado' },
  { id:'3', codigo:'STD-0040/NOV23/R11500/A', nombre:'Irbesartan', frasco:'A', cliente:'Galenicum', tipoPotencia:'base_seca', potencia:98.2, karlFischer:true, secadoPrevio:false, stockRestante:184.71, fechaVencimiento:'2025-11-12', estado:'En uso' },
  { id:'4', codigo:'STD-0053/MAY24/LRAD4836/A', nombre:'Alcohol bencílico', frasco:'A', cliente:'Ascend', tipoPotencia:'cualitativo', potencia:null, karlFischer:false, secadoPrevio:false, stockRestante:976.99, fechaVencimiento:'2027-09-30', estado:'En uso' },
]
