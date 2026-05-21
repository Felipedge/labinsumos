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

const CLIENTES = ['Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Prater','MSN','Otro']
const SECTORES = ['FQ','VAL','FQ/VAL','MB','T-R']
const ESTADOS  = ['EN USO','CERRADO','VENCIDO','SIN STOCK','DADO DE BAJA']
const ALMACENES= ['Desecador','Refrigerador','Freezer','Desecador-Oncológico','Refrigerador-Oncológico','Refrigerador-Controlado']
const MESES    = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

async function getSiguienteNumero(db) {
  try {
    const q = query(collection(db, 'estandares'), orderBy('numeroStd', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroStd || 0) + 1
  } catch { return 1 }
}

function generarCodigo(numero, mes, anio, lote, frasco) {
  const num     = String(numero).padStart(4, '0')
  const mesStr  = MESES[parseInt(mes) - 1]
  const anioStr = String(anio).slice(-2)
  return `STD-${num}/${mesStr}${anioStr}/${lote}/${frasco}`
}

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}

export default function Estandares() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedePesada  = puedoHacer(rol, 'registrarUso')
  const puedeBaja    = puedoHacer(rol, 'darDeBaja')

  // Tabs
  const [tab, setTab] = useState('inventario') // 'inventario' | 'historial'

  // Inventario
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [pesadaId, setPesadaId]   = useState(null)
  const [form, setForm]           = useState({})
  const [frascos, setFrascos]     = useState([{ letra: 'A', stock: '' }])
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [sigNum, setSigNum]       = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verPapelera, setVerPapelera] = useState(false)

  // Historial
  const [pesadas, setPesadas]         = useState([])
  const [loadingH, setLoadingH]       = useState(false)
  const [searchH, setSearchH]         = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroStd, setFiltroStd]     = useState('')
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')

  const hoy     = new Date()
  const mesAct  = String(hoy.getMonth() + 1).padStart(2, '0')
  const anioAct = hoy.getFullYear()

  // ── Cargar inventario ──────────────────────────────────────
  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'estandares'), orderBy('creadoEn', 'desc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setItems(DEMO_E) }
    finally { setLoading(false) }
  }

  // ── Cargar historial de pesadas ───────────────────────────
  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'usos_estandares'), orderBy('fecha', 'desc'), limit(500))
      )
      setPesadas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setPesadas([]) }
    finally { setLoadingH(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab === 'historial' && pesadas.length === 0) loadHistorial()
  }, [tab])

  // ── Formulario ────────────────────────────────────────────
  const abrirFormulario = async () => {
    if (!showForm) {
      const n = await getSiguienteNumero(db)
      setSigNum(n)
      setForm({ mes: mesAct, anio: anioAct })
      setFrascos([{ letra: 'A', stock: '' }])
    }
    setShowForm(!showForm)
    setPesadaId(null)
    setMsg('')
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const agregarFrasco = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const sig = letras[frascos.length]
    if (sig) setFrascos(p => [...p, { letra: sig, stock: '' }])
  }

  const quitarFrasco = (i) => {
    if (frascos.length === 1) return
    setFrascos(p => p.filter((_, idx) => idx !== i))
  }

  const updateFrasco = (i, valor) => {
    setFrascos(p => p.map((fr, idx) => idx === i ? { ...fr, stock: valor } : fr))
  }

  const guardar = async () => {
    if (!form.lote || !form.nombre || !form.cliente) { setMsg('Nombre, cliente y lote son obligatorios'); return }
    if (frascos.some(fr => !fr.stock || isNaN(fr.stock))) { setMsg('Ingresa el stock de cada frasco'); return }
    setGuardando(true)
    try {
      const numero = sigNum || await getSiguienteNumero(db)
      for (let i = 0; i < frascos.length; i++) {
        const frasco = frascos[i]
        const codigo = generarCodigo(numero, form.mes || mesAct, form.anio || anioAct, form.lote, frasco.letra)
        await addDoc(collection(db, 'estandares'), {
          codigo,
          numeroStd:        numero,
          frasco:           frasco.letra,
          nombre:           form.nombre,
          cas:              form.cas || '',
          lote:             form.lote,
          cliente:          form.cliente,
          producto:         form.producto || '',
          potencia:         parseFloat(form.potencia) || null,
          sector:           form.sector || 'FQ',
          almacenamiento:   form.almacen || 'Desecador',
          fabricante:       form.fabricante || '',
          stockInicial:     parseFloat(frasco.stock),
          stockRestante:    parseFloat(frasco.stock),
          cantPorAnalisis:  parseFloat(form.xAnalisis) || 200,
          fechaVencimiento: form.vencimiento ? new Date(form.vencimiento) : null,
          estado:           i === 0 ? 'EN USO' : 'CERRADO',
          mesIngreso:       form.mes || mesAct,
          anioIngreso:      form.anio || anioAct,
          creadoPor:        user.email,
          creadoEn:         serverTimestamp(),
          actualizadoEn:    serverTimestamp(),
        })
      }
      setShowForm(false); setForm({}); setFrascos([{ letra: 'A', stock: '' }]); setMsg(''); load()
    } catch(e) { setMsg('Error al guardar: ' + e.message) }
    finally { setGuardando(false) }
  }

  const pesada = async () => {
    if (!pesadaId || !form.mg) { setMsg('Ingresa la cantidad pesada'); return }
    try {
      const { registrarPesada } = await import('../lib/db')
      await registrarPesada({
        estandarId: pesadaId,
        mgPesados:  parseFloat(form.mg),
        nAnalisis:  form.nAnalisis || '',
        producto:   form.producto2 || '',
        analista:   user.displayName || user.email,
        email:      user.email,
      })
      setPesadaId(null); setForm({}); setMsg(''); load()
      if (tab === 'historial') loadHistorial()
    } catch(e) { setMsg(e.message) }
  }

  const darDeBaja = async (id, codigo) => {
    const razon = window.prompt(`Razón para dar de baja ${codigo}:`)
    if (!razon) return
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'DADO DE BAJA', bajaPor: user.email,
        bajaRazon: razon, bajaFecha: serverTimestamp(), actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const restaurar = async (id) => {
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'CERRADO', bajaPor: null, bajaRazon: null, bajaFecha: null, actualizadoEn: serverTimestamp(),
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  // ── Filtros inventario ────────────────────────────────────
  const activos  = items.filter(i => i.estado !== 'DADO DE BAJA')
  const papelera = items.filter(i => i.estado === 'DADO DE BAJA')
  const filtrados = (verPapelera ? papelera : activos).filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.cliente?.toLowerCase().includes(q)
    const matchE = !filtroEst || i.estado === filtroEst
    return matchQ && matchE
  })

  // ── Filtros historial ─────────────────────────────────────
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

  return (
    <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Estándares</h2>
        <div style={{ display:'flex', gap:8 }}>
          {tab === 'inventario' && puedeBaja && (
            <button className="btn btn-sm"
              style={verPapelera?{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}:{}}
              onClick={() => { setVerPapelera(!verPapelera); setSearch(''); setFiltroEst('') }}>
              🗑 Papelera {papelera.length > 0 && `(${papelera.length})`}
            </button>
          )}
          {tab === 'inventario' && !verPapelera && puedeAgregar && (
            <button className="btn btn-primary btn-sm" onClick={abrirFormulario}>
              <Plus size={14} /> Nuevo estándar
            </button>
          )}
          {tab === 'historial' && (
            <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        <button
          onClick={() => setTab('inventario')}
          style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 16px', fontSize:13, cursor:'pointer',
            border:'none', background:'none',
            color: tab==='inventario' ? 'var(--accent)' : 'var(--text-2)',
            borderBottom: tab==='inventario' ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab==='inventario' ? 500 : 400,
            marginBottom: -1,
          }}>
          <Package size={14}/> Inventario
          <span style={{fontSize:11,padding:'1px 6px',borderRadius:10,background:'var(--bg)',color:'var(--text-2)'}}>
            {activos.length}
          </span>
        </button>
        <button
          onClick={() => setTab('historial')}
          style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 16px', fontSize:13, cursor:'pointer',
            border:'none', background:'none',
            color: tab==='historial' ? 'var(--accent)' : 'var(--text-2)',
            borderBottom: tab==='historial' ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab==='historial' ? 500 : 400,
            marginBottom: -1,
          }}>
          <History size={14}/> Historial de pesadas
          {pesadas.length > 0 && (
            <span style={{fontSize:11,padding:'1px 6px',borderRadius:10,background:'var(--bg)',color:'var(--text-2)'}}>
              {pesadas.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB INVENTARIO ── */}
      {tab === 'inventario' && (
        <>
          {showForm && puedeAgregar && !verPapelera && (
            <div className="card">
              <div className="card-title">
                Ingresar nuevo estándar
                {sigNum && <span className="badge badge-purple">Próximo N°: STD-{String(sigNum).padStart(4,'0')}</span>}
              </div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Nombre del estándar *</label><input placeholder="ej: Cilostazol" onChange={f('nombre')} /></div>
                <div className="form-group"><label>Cliente *</label>
                  <select onChange={f('cliente')}><option value="">Seleccionar...</option>{CLIENTES.map(c=><option key={c}>{c}</option>)}</select>
                </div>
                <div className="form-group"><label>N° Lote *</label><input placeholder="ej: LRAD4238" onChange={f('lote')} /></div>
                <div className="form-group"><label>N° CAS</label><input placeholder="ej: 73963-72-1" onChange={f('cas')} /></div>
                <div className="form-group"><label>Mes de ingreso</label>
                  <select onChange={f('mes')} defaultValue={mesAct}>
                    {Array.from({length:12},(_,i)=>(
                      <option key={i+1} value={String(i+1).padStart(2,'0')}>{MESES[i]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label>Año de ingreso</label>
                  <select onChange={f('anio')} defaultValue={anioAct}>
                    {[2023,2024,2025,2026,2027].map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Producto</label><input placeholder="ej: Cilosvitae 100" onChange={f('producto')} /></div>
                <div className="form-group"><label>Potencia (%)</label><input type="number" step="0.001" placeholder="ej: 99.9" onChange={f('potencia')} /></div>
                <div className="form-group"><label>Sector</label>
                  <select onChange={f('sector')}>{SECTORES.map(s=><option key={s}>{s}</option>)}</select>
                </div>
                <div className="form-group"><label>Almacenamiento</label>
                  <select onChange={f('almacen')}>{ALMACENES.map(a=><option key={a}>{a}</option>)}</select>
                </div>
                <div className="form-group"><label>Fabricante</label><input onChange={f('fabricante')} /></div>
                <div className="form-group"><label>Cant. por análisis (mg)</label><input type="number" step="0.01" defaultValue={200} onChange={f('xAnalisis')} /></div>
                <div className="form-group" style={{gridColumn:'1/-1'}}><label>Fecha vencimiento</label><input type="date" onChange={f('vencimiento')} style={{maxWidth:200}} /></div>
              </div>

              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS DEL ENVÍO</label>
                  <button className="btn btn-sm" onClick={agregarFrasco} type="button"><Plus size={12}/> Agregar frasco</button>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {frascos.map((fr, i) => (
                    <div key={fr.letra} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:12,color:i===0?'var(--accent)':'var(--text-2)',flexShrink:0}}>
                        {fr.letra}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-2)',minWidth:80}}>
                        {i === 0 ? <span style={{color:'var(--ok)',fontWeight:500}}>EN USO</span> : <span>CERRADO</span>}
                      </div>
                      <div className="form-group" style={{flex:1,margin:0}}>
                        <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock} onChange={e => updateFrasco(i, e.target.value)} />
                      </div>
                      {frascos.length > 1 && (
                        <button className="btn btn-sm" onClick={() => quitarFrasco(i)} style={{padding:'4px 8px',color:'var(--danger)'}}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {sigNum && form.lote && (
                  <div style={{marginTop:8,padding:'8px 12px',background:'var(--accent-lt)',borderRadius:'var(--radius-sm)',fontSize:11,color:'var(--accent)'}}>
                    <strong>Códigos que se generarán:</strong><br/>
                    {frascos.map(fr => (
                      <div key={fr.letra} style={{fontFamily:'var(--font-mono)'}}>
                        {generarCodigo(sigNum, form.mes||mesAct, form.anio||anioAct, form.lote, fr.letra)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando ? <div className="spinner" style={{width:14,height:14,borderWidth:2}}/> : <FlaskConical size={14}/>}
                  {guardando ? 'Guardando...' : `Guardar ${frascos.length} frasco${frascos.length>1?'s':''}`}
                </button>
                <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setMsg('') }}>Cancelar</button>
              </div>
            </div>
          )}

          {pesadaId && puedePesada && (
            <div className="card">
              <div className="card-title">Registrar pesada — {items.find(i=>i.id===pesadaId)?.nombre} · Frasco {items.find(i=>i.id===pesadaId)?.frasco}</div>
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
            {!verPapelera && (
              <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
                <option value="">Todos los estados</option>
                {ESTADOS.filter(e => e !== 'DADO DE BAJA').map(e=><option key={e}>{e}</option>)}
              </select>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Código</th><th>Nombre</th><th>Frasco</th><th>Cliente</th><th>Stock (mg)</th><th>Vencimiento</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {filtrados.map(i => {
                  const vence = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
                  const sem   = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const estCls = {'EN USO':'badge-ok','CERRADO':'badge-info','VENCIDO':'badge-danger','SIN STOCK':'badge-warn','DADO DE BAJA':'badge-gray'}[i.estado]||'badge-gray'
                  return (
                    <tr key={i.id}>
                      <td className="mono" style={{ fontSize:10 }}>{i.codigo}</td>
                      <td style={{ fontWeight:500 }}>{i.nombre}</td>
                      <td>
                        <span style={{width:24,height:24,borderRadius:'50%',background:i.estado==='EN USO'?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:i.estado==='EN USO'?'var(--accent)':'var(--text-2)'}}>
                          {i.frasco||'—'}
                        </span>
                      </td>
                      <td style={{ color:'var(--text-2)' }}>{i.cliente}</td>
                      <td><strong>{i.stockRestante??'—'}</strong></td>
                      <td>{vence?<span className={`badge ${badgeCls}`}>{sem.texto}</span>:<span style={{color:'var(--text-3)'}}>—</span>}</td>
                      <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                      <td style={{display:'flex',gap:4}}>
                        {puedePesada && i.estado==='EN USO' && (
                          <button className="btn btn-sm" onClick={()=>{setPesadaId(i.id);setShowForm(false);setForm({})}}>Pesada</button>
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
                  <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                    {verPapelera?'La papelera está vacía':'No hay estándares que coincidan'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB HISTORIAL ── */}
      {tab === 'historial' && (
        <>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div className="kpi-card">
              <div className="kpi-label">Total pesadas</div>
              <div className="kpi-value info">{pesadasFiltradas.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total mg pesados</div>
              <div className="kpi-value">{totalMg.toFixed(2)} mg</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Analistas</div>
              <div className="kpi-value">{usuariosUnicos.length}</div>
            </div>
          </div>

          {/* Filtros historial */}
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Buscar</label>
                <input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, nombre o N° análisis..." />
              </div>
              <div className="form-group">
                <label>Analista</label>
                <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                  <option value="">Todos los analistas</option>
                  {usuariosUnicos.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Estándar</label>
                <select value={filtroStd} onChange={e=>setFiltroStd(e.target.value)}>
                  <option value="">Todos los estándares</option>
                  {stdsUnicos.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Desde</label>
                <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Hasta</label>
                <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)} />
              </div>
              <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                <button className="btn btn-sm" onClick={()=>{setSearchH('');setFiltroUsuario('');setFiltroStd('');setFechaDesde('');setFechaHasta('')}}>
                  Limpiar filtros
                </button>
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
                    <th>Código estándar</th>
                    <th>Nombre</th>
                    <th>Mg pesados</th>
                    <th>Stock antes</th>
                    <th>Stock después</th>
                    <th>N° análisis</th>
                    <th>Producto</th>
                  </tr>
                </thead>
                <tbody>
                  {pesadasFiltradas.map(p => (
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>{formatFecha(p.fecha)}</td>
                      <td>
                        <div style={{fontSize:12,fontWeight:500}}>{p.analista || '—'}</div>
                        <div style={{fontSize:10,color:'var(--text-3)'}}>{p.email}</div>
                      </td>
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
                    <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                      No hay pesadas que coincidan con los filtros
                    </td></tr>
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
  { id:'1', codigo:'STD-0025/MAR24/LRAD4238/A', nombre:'Cilostazol', frasco:'A', cliente:'Galenicum', stockRestante:440.69, fechaVencimiento:'2026-11-30', estado:'EN USO' },
  { id:'2', codigo:'STD-0025/MAR24/LRAD4238/B', nombre:'Cilostazol', frasco:'B', cliente:'Galenicum', stockRestante:500.00, fechaVencimiento:'2026-11-30', estado:'CERRADO' },
  { id:'3', codigo:'STD-0040/NOV23/R11500/A', nombre:'Irbesartan', frasco:'A', cliente:'Galenicum', stockRestante:184.71, fechaVencimiento:'2025-11-12', estado:'EN USO' },
  { id:'4', codigo:'STD-0053/MAY24/LRAD4836/A', nombre:'Alcohol Bencílico', frasco:'A', cliente:'Ascend', stockRestante:976.99, fechaVencimiento:'2027-09-30', estado:'EN USO' },
]
