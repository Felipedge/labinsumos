// src/pages/Columnas.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getColumnas, crearColumna, registrarUsoColumna, retirarColumna } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search, X, PackageX } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
 
// Clientes se cargan desde Firestore (fallback si falla)
const CLIENTES_FALLBACK = [
  { nombre:'Ascend', sigla:'ASC' }, { nombre:'Galenicum', sigla:'GL' },
  { nombre:'Laboratorio Chile', sigla:'LCH' }, { nombre:'Novartis', sigla:'NOV' },
  { nombre:'Otro', sigla:'OTR' },
]
 
const FASES   = [
  'C18','C8','CN','Fenil','RP18','RP8','PH','CPS','Quiral','SCX','T3','RP',
  'SIL','Alquimide','NAP','ODS 3V','ODS 2','C1','L9','ODS 3','MOS','ODS','AMINO','Otro'
]
 
// Color por grupo de fase. Editable: agrega/ajusta entradas aquí.
// Cada fase mapea a una variante de badge (color + texto) definida en COLOR_VARIANTES.
const FASE_COLOR = {
  'C18':   'rojo',
  'C8':    'verde',
  'CN':    'morado',
  'Fenil': 'naranjo',
  'RP18':  'azul',
  // — asignados a criterio (relacionados con su familia donde aplica) —
  'RP8':       'cian',     // par de RP18
  'PH':        'rosa',
  'CPS':       'ambar',
  'Quiral':    'indigo',
  'SCX':       'teal',
  'T3':        'lima',
  'RP':        'cielo',    // familia RP
  'SIL':       'pizarra',
  'Alquimide': 'fucsia',
  'NAP':       'esmeralda',
  'ODS 3V':    'vino',     // familia ODS (tonos cálidos)
  'ODS 2':     'coral',
  'ODS 3':     'tomate',
  'ODS':       'ladrillo',
  'C1':        'oliva',
  'L9':        'bronce',
  'MOS':       'violeta',
  'AMINO':     'turquesa',
}
 
// Paleta de variantes (fondo translúcido + texto). No depende de clases CSS externas.
const COLOR_VARIANTES = {
  rojo:      { bg:'#fee2e2', fg:'#b91c1c' },
  verde:     { bg:'#dcfce7', fg:'#15803d' },
  morado:    { bg:'#f3e8ff', fg:'#7e22ce' },
  naranjo:   { bg:'#ffedd5', fg:'#c2410c' },
  azul:      { bg:'#dbeafe', fg:'#1d4ed8' },
  cian:      { bg:'#cffafe', fg:'#0e7490' },
  rosa:      { bg:'#fce7f3', fg:'#be185d' },
  ambar:     { bg:'#fef3c7', fg:'#b45309' },
  indigo:    { bg:'#e0e7ff', fg:'#4338ca' },
  teal:      { bg:'#ccfbf1', fg:'#0f766e' },
  lima:      { bg:'#ecfccb', fg:'#4d7c0f' },
  cielo:     { bg:'#e0f2fe', fg:'#0369a1' },
  pizarra:   { bg:'#e2e8f0', fg:'#334155' },
  fucsia:    { bg:'#fae8ff', fg:'#a21caf' },
  esmeralda: { bg:'#d1fae5', fg:'#047857' },
  vino:      { bg:'#fae3e3', fg:'#9f1239' },
  coral:     { bg:'#ffe4e0', fg:'#c2410c' },
  tomate:    { bg:'#ffe2d6', fg:'#9a3412' },
  ladrillo:  { bg:'#fde8e0', fg:'#92400e' },
  oliva:     { bg:'#f7f7d4', fg:'#65730a' },
  bronce:    { bg:'#f0e6d6', fg:'#854d0e' },
  violeta:   { bg:'#ede9fe', fg:'#6d28d9' },
  turquesa:  { bg:'#cffafe', fg:'#0891b2' },
  gris:      { bg:'#f1f5f9', fg:'#475569' },
}
 
const AREAS = ['Fisicoquímico', 'Validaciones']
 
function FaseBadge({ fase }) {
  const key = FASE_COLOR[fase] || 'gris'
  const v = COLOR_VARIANTES[key] || COLOR_VARIANTES.gris
  return (
    <span className="badge" style={{ background:v.bg, color:v.fg, fontWeight:600 }}>
      {fase || '—'}
    </span>
  )
}
 
// Obtener siguiente número correlativo para un cliente
async function getSiguienteCorrelativo(sigla) {
  try {
    const snap = await getDocs(
      query(collection(db, 'columnas'), where('siglaCliente', '==', sigla))
    )
    if (snap.empty) return 1
    let maxNum = 0
    snap.docs.forEach(d => {
      const cod = d.data().codigo || ''
      const match = cod.match(/-(\d+)$/)
      if (match) {
        const num = parseInt(match[1])
        if (num > maxNum) maxNum = num
      }
    })
    return maxNum + 1
  } catch { return 1 }
}
 
export default function Columnas() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')
  const puedeDarBaja = puedoHacer(rol, 'darDeBaja')
  // Solo el Analista registra uso de columna (regla específica de este módulo)
  const puedeRegistrarUso = rol === 'analista'
 
  const [clientesDB, setClientesDB] = useState(CLIENTES_FALLBACK)
  const [columnas, setColumnas]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [useForm, setUseForm]       = useState(null)   // columna en la que se registra uso
  const [retiroForm, setRetiroForm] = useState(null)   // columna que se está retirando
  const [form, setForm]             = useState({})
  // Líneas de análisis del registro de uso: [{ nAnalisis, inyecciones }]
  const [usoLineas, setUsoLineas]   = useState([{ nAnalisis:'', inyecciones:'' }])
  const [msg, setMsg]               = useState('')
  const [docInsumo, setDocInsumo]   = useState(null)
  const [search, setSearch]         = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [ordenCampo, setOrdenCampo] = useState('codigo')
  const [ordenDir, setOrdenDir]     = useState('asc')
  const [codigoGenerado, setCodigoGenerado] = useState('')
  const [generandoCodigo, setGenerandoCodigo] = useState(false)
 
  // mapa nombre -> sigla a partir de los clientes cargados
  const SIGLAS_CLIENTE = Object.fromEntries(clientesDB.map(c => [c.nombre, c.sigla]))
  const NOMBRES_CLIENTE = clientesDB.map(c => c.nombre)
 
  const loadClientes = async () => {
    try {
      const snap = await getDocs(collection(db, 'clientes'))
      if (!snap.empty) {
        setClientesDB(snap.docs.map(d => ({ nombre:d.data().nombre, sigla:d.data().sigla })))
      }
    } catch { /* mantiene fallback */ }
  }
 
  const load = async () => {
    try { setColumnas(await getColumnas()) }
    catch { setColumnas([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadClientes(); load() }, [])
 
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
 
  // Generar código automático al seleccionar cliente
  const onClienteChange = async (e) => {
    const cliente = e.target.value
    setForm(p => ({ ...p, cliente }))
    if (!cliente) { setCodigoGenerado(''); return }
    setGenerandoCodigo(true)
    const sigla = SIGLAS_CLIENTE[cliente] || 'OTR'
    const num   = await getSiguienteCorrelativo(sigla)
    const codigo = `${sigla}-${String(num).padStart(3, '0')}`
    setCodigoGenerado(codigo)
    setForm(p => ({ ...p, cliente, codigo, siglaCliente: sigla }))
    setGenerandoCodigo(false)
  }
 
  const guardarColumna = async () => {
    if (!form.codigo || !form.cliente || !form.fase) { setMsg('Completa los campos obligatorios'); return }
    try {
      await crearColumna({
        codigo:            form.codigo,
        siglaCliente:      SIGLAS_CLIENTE[form.cliente] || 'OTR',
        cliente:           form.cliente,
        producto:          form.producto || '',
        fase:              form.fase,
        largo:             parseFloat(form.largo) || 0,
        diametro:          parseFloat(form.diametro) || 0,
        micra:             parseFloat(form.micra) || 0,
        tamanoParticula:   form.micra ? `${form.micra}µm` : '',
        dimensiones:       form.largo && form.diametro ? `${form.largo} x ${form.diametro} mm` : '',
        fabricante:        form.fabricante || '',
        // — campos nuevos —
        platosTeoricosIniciales: parseInt(form.platosTeoricos) || null,
        area:              form.area || '',                 // Fisicoquímico | Validaciones (editable)
        loteSerie:         form.loteSerie || '',
        fechaRecepcion:    form.fechaRecepcion || '',
        fechaInicioUso:    form.fechaInicioUso || '',
        fechaRetiro:       '',                              // se completa al retirar
        // — uso acumulado (reemplaza el sistema de inyecciones/límite) —
        inyeccionesAcumuladas: 0,
        estado:            'Pendiente de aprobación',
        creadoPorRol:      rol,
      }, user.email)
      setShowForm(false); setForm({}); setCodigoGenerado(''); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  // ——— Registro de uso (solo Analista) ———
  const setLinea = (i, k, val) =>
    setUsoLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: val } : l))
  const addLinea = () => setUsoLineas(prev => [...prev, { nAnalisis:'', inyecciones:'' }])
  const removeLinea = (i) => setUsoLineas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
 
  const totalInyeccionesUso = usoLineas.reduce((s, l) => s + (parseInt(l.inyecciones) || 0), 0)
 
  const abrirUso = (c) => {
    setUseForm(c); setRetiroForm(null); setShowForm(false)
    setForm({}); setUsoLineas([{ nAnalisis:'', inyecciones:'' }]); setMsg('')
  }
 
  const registrarUso = async () => {
    const lineasValidas = usoLineas
      .map(l => ({ nAnalisis: (l.nAnalisis || '').trim(), inyecciones: parseInt(l.inyecciones) || 0 }))
      .filter(l => l.nAnalisis || l.inyecciones > 0)
    if (lineasValidas.length === 0) { setMsg('Agrega al menos un N° de análisis con sus inyecciones'); return }
    if (totalInyeccionesUso <= 0) { setMsg('El total de inyecciones debe ser mayor a 0'); return }
    try {
      await registrarUsoColumna({
        columnaId:    useForm.id,
        analisis:     lineasValidas,            // [{ nAnalisis, inyecciones }]
        totalInyecciones: totalInyeccionesUso,  // se suma a inyeccionesAcumuladas en lib/db
        analista:     user.displayName || user.email,
        email:        user.email,
      })
      setUseForm(null); setUsoLineas([{ nAnalisis:'', inyecciones:'' }]); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  // ——— Retiro de columna (cliente pide el insumo de vuelta -> dada de baja) ———
  const abrirRetiro = (c) => {
    setRetiroForm(c); setUseForm(null); setShowForm(false)
    setForm({ fechaRetiro: new Date().toISOString().split('T')[0] }); setMsg('')
  }
 
  const confirmarRetiro = async () => {
    if (!form.fechaRetiro) { setMsg('Indica la fecha de retiro'); return }
    try {
      await retirarColumna({
        columnaId:   retiroForm.id,
        fechaRetiro: form.fechaRetiro,
        motivo:      form.motivoRetiro || 'Cliente solicitó devolución del insumo',
        usuario:     user.displayName || user.email,
        email:       user.email,
      })
      setRetiroForm(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }
 
  const clientesUnicos = [...new Set(columnas.map(c => c.cliente).filter(Boolean))].sort()
 
  const filtradas = columnas
    .filter(c => {
      const q = search.toLowerCase()
      const matchQ = !q ||
        c.codigo?.toLowerCase().includes(q) ||
        c.cliente?.toLowerCase().includes(q) ||
        c.fase?.toLowerCase().includes(q)
      const matchC = !filtroCliente || c.cliente === filtroCliente
      return matchQ && matchC
    })
    .sort((a, b) => {
      let valA, valB
      if (ordenCampo === 'codigo')        { valA = a.codigo?.toLowerCase() || '';  valB = b.codigo?.toLowerCase() || '' }
      else if (ordenCampo === 'cliente')  { valA = a.cliente?.toLowerCase() || ''; valB = b.cliente?.toLowerCase() || '' }
      else if (ordenCampo === 'inicio')   { valA = a.fechaInicioUso || '';         valB = b.fechaInicioUso || '' }
      if (valA < valB) return ordenDir === 'asc' ? -1 : 1
      if (valA > valB) return ordenDir === 'asc' ? 1 : -1
      return 0
    })
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      {docInsumo && (
        <DocumentosPanel
          insumoId={docInsumo.id}
          modulo="columnas"
          nombreInsumo={`${docInsumo.codigo} — ${docInsumo.fase} ${docInsumo.tamanoParticula}`}
          onClose={()=>setDocInsumo(null)}
        />
      )}
 
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Columnas cromatográficas</h2>
        {puedeAgregar && (
          <button className="btn btn-primary btn-sm"
            onClick={() => { setShowForm(!showForm); setUseForm(null); setRetiroForm(null); setForm({}); setCodigoGenerado('') }}>
            <Plus size={14} /> Nueva columna
          </button>
        )}
      </div>
 
      {showForm && puedeAgregar && (
        <div className="card">
          <div className="card-title">Registrar nueva columna</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label>Cliente *</label>
              <select value={form.cliente || ''} onChange={onClienteChange}>
                <option value="">Seleccionar...</option>
                {NOMBRES_CLIENTE.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Código generado automáticamente</label>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input
                  value={form.codigo || ''}
                  onChange={f('codigo')}
                  placeholder={generandoCodigo ? 'Generando...' : 'Selecciona un cliente'}
                  style={{flex:1, fontFamily:'var(--font-mono)', fontWeight:600}}
                />
                {codigoGenerado && <span style={{fontSize:11,color:'var(--ok)'}}>✓ Auto</span>}
              </div>
            </div>
            <div className="form-group"><label>Producto / método</label>
              <input placeholder="ej: Cilosvitae 100 — Valoración" onChange={f('producto')} />
            </div>
            <div className="form-group"><label>Fase estacionaria *</label>
              <select value={form.fase || ''} onChange={f('fase')}><option value="">Seleccionar...</option>
                {FASES.map(x=><option key={x}>{x}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Área</label>
              <select value={form.area || ''} onChange={f('area')}>
                <option value="">Seleccionar...</option>
                {AREAS.map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Largo (mm)</label>
              <input type="number" placeholder="ej: 150" onChange={f('largo')} />
            </div>
            <div className="form-group"><label>Diámetro (mm)</label>
              <input type="number" placeholder="ej: 4.6" step="0.1" onChange={f('diametro')} />
            </div>
            <div className="form-group"><label>Micra (µm)</label>
              <select value={form.micra || ''} onChange={f('micra')}>
                <option value="">Seleccionar...</option>
                {['1.8','3','3.5','5','10'].map(m=><option key={m} value={m}>{m} µm</option>)}
              </select>
            </div>
            <div className="form-group"><label>Platos teóricos iniciales</label>
              <input type="number" placeholder="ej: 8500" onChange={f('platosTeoricos')} />
            </div>
            <div className="form-group"><label>Lote / Serie</label>
              <input placeholder="ej: 0234-A12" onChange={f('loteSerie')} />
            </div>
            <div className="form-group"><label>Fabricante</label>
              <input placeholder="ej: Waters, Agilent, Phenomenex" onChange={f('fabricante')} />
            </div>
            <div className="form-group"><label>Fecha de recepción</label>
              <input type="date" onChange={f('fechaRecepcion')} />
            </div>
            <div className="form-group"><label>Fecha de inicio de uso</label>
              <input type="date" onChange={f('fechaInicioUso')} />
            </div>
          </div>
 
          {form.codigo && form.cliente && (
            <div style={{background:'var(--accent-lt)',borderRadius:'var(--radius-sm)',padding:'8px 14px',marginBottom:14,fontSize:12,color:'var(--accent)'}}>
              <strong>Código generado:</strong>{' '}
              <span style={{fontFamily:'var(--font-mono)',fontSize:14,fontWeight:700}}>{form.codigo}</span>
              {' '}— {form.cliente}
            </div>
          )}
 
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={guardarColumna}>Guardar columna</button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setCodigoGenerado(''); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}
 
      {/* ——— Registro de uso (solo Analista) ——— */}
      {useForm && puedeRegistrarUso && (
        <div className="card">
          <div className="card-title">Registrar uso — {useForm.codigo}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div style={{fontSize:12,color:'var(--text-2)',marginBottom:10}}>
            Inyecciones acumuladas actuales: <strong>{useForm.inyeccionesAcumuladas || 0}</strong>
          </div>
 
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
            {usoLineas.map((l, i) => (
              <div key={i} style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                <div className="form-group" style={{flex:2,margin:0}}>
                  <label>N° de análisis {i===0 && '*'}</label>
                  <input placeholder="ej: 26324" value={l.nAnalisis}
                    onChange={e=>setLinea(i,'nAnalisis',e.target.value)} />
                </div>
                <div className="form-group" style={{flex:1,margin:0}}>
                  <label>Inyecciones</label>
                  <input type="number" placeholder="ej: 12" value={l.inyecciones}
                    onChange={e=>setLinea(i,'inyecciones',e.target.value)} />
                </div>
                <button className="btn btn-sm" title="Quitar línea"
                  style={{marginBottom:1}} onClick={()=>removeLinea(i)} disabled={usoLineas.length===1}>
                  <X size={13}/>
                </button>
              </div>
            ))}
          </div>
 
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <button className="btn btn-sm" onClick={addLinea}><Plus size={13}/> Agregar análisis</button>
            <div style={{fontSize:13}}>
              Total inyecciones de este registro: <strong>{totalInyeccionesUso}</strong>
              {' '}→ nuevo acumulado: <strong>{(useForm.inyeccionesAcumuladas || 0) + totalInyeccionesUso}</strong>
            </div>
          </div>
 
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={registrarUso}>Confirmar uso</button>
            <button className="btn btn-sm" onClick={() => { setUseForm(null); setUsoLineas([{ nAnalisis:'', inyecciones:'' }]); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}
 
      {/* ——— Retiro de columna ——— */}
      {retiroForm && puedeDarBaja && (
        <div className="card">
          <div className="card-title">Retirar columna — {retiroForm.codigo}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div style={{fontSize:12,color:'var(--text-2)',marginBottom:10}}>
            Al registrar el retiro, la columna pasa a estado <strong>DADA DE BAJA</strong> (el cliente solicitó la devolución del insumo).
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Fecha de retiro *</label>
              <input type="date" value={form.fechaRetiro || ''} onChange={f('fechaRetiro')} />
            </div>
            <div className="form-group" style={{gridColumn:'1 / -1'}}><label>Motivo / observación</label>
              <input placeholder="ej: Cliente solicitó devolución de la columna" onChange={f('motivoRetiro')} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={confirmarRetiro}>Confirmar retiro y dar de baja</button>
            <button className="btn btn-sm" onClick={() => { setRetiroForm(null); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}
 
      {/* Barra búsqueda, filtro cliente y ordenamiento */}
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
        <div className="search-bar">
          <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar por código, cliente o fase..." style={{flex:1}}/>
          <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientesUnicos.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'var(--text-2)',alignSelf:'center'}}>Ordenar por:</span>
          {[
            { campo:'codigo',  label:'Código' },
            { campo:'cliente', label:'Cliente' },
            { campo:'inicio',  label:'Inicio de uso' },
          ].map(o => (
            <button key={o.campo} className="btn btn-sm"
              style={ordenCampo===o.campo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
              onClick={()=>toggleOrden(o.campo)}>
              {o.label} {ordenCampo===o.campo?(ordenDir==='asc'?'↑':'↓'):'↕'}
            </button>
          ))}
        </div>
      </div>
 
      <div style={{fontSize:12,color:'var(--text-2)',marginBottom:8}}>
        Mostrando {filtradas.length} de {columnas.length} columnas
        {filtroCliente && <span> · Cliente: <strong>{filtroCliente}</strong></span>}
      </div>
 
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Fase</th><th>Área</th><th>Largo</th><th>Diám.</th><th>Micra</th>
              <th>Platos ini.</th><th>Lote/Serie</th><th>Cliente</th>
              <th>Recepción</th><th>Inicio uso</th><th>Uso (inyecc.)</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(c => {
              const esPendiente = c.estado === 'Pendiente de aprobación'
              const dadaBaja = c.estado === 'DADA DE BAJA' || c.estado === 'RETIRADA'
              return (
                <tr key={c.id} style={dadaBaja?{opacity:0.6}:{}}>
                  <td className="mono" style={{fontWeight:600}}>{c.codigo}</td>
                  <td><FaseBadge fase={c.fase} /></td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.area || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.largo ? `${c.largo} mm` : c.dimensiones || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.diametro ? `${c.diametro} mm` : '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.micra ? `${c.micra} µm` : c.tamanoParticula || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.platosTeoricosIniciales ?? '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.loteSerie || '—'}</td>
                  <td>{c.cliente}</td>
                  <td style={{ color:'var(--text-2)', fontSize:11 }}>{c.fechaRecepcion || '—'}</td>
                  <td style={{ color:'var(--text-2)', fontSize:11 }}>{c.fechaInicioUso || '—'}</td>
                  <td style={{ minWidth:90 }}>
                    <strong style={{fontSize:13}}>{c.inyeccionesAcumuladas || 0}</strong>
                    <span style={{color:'var(--text-3)',fontSize:11}}> inyecc.</span>
                  </td>
                  <td>
                    {esPendiente
                      ? <span className="badge badge-warn">Pendiente</span>
                      : dadaBaja
                        ? <span className="badge badge-danger">Dada de baja{c.fechaRetiro ? ` · ${c.fechaRetiro}` : ''}</span>
                        : <span className="badge badge-ok">{c.estado}</span>
                    }
                  </td>
                  <td style={{display:'flex',gap:4}}>
                    {puedeRegistrarUso && !esPendiente && !dadaBaja && (
                      <button className="btn btn-sm" onClick={() => abrirUso(c)}>
                        Registrar uso
                      </button>
                    )}
                    {puedeDarBaja && !esPendiente && !dadaBaja && (
                      <button className="btn btn-sm" title="Retirar / dar de baja" onClick={() => abrirRetiro(c)}>
                        <PackageX size={13}/>
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={()=>setDocInsumo(c)} title="Ver documentos">
                      <FileText size={13}/>
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={14} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                No hay columnas que coincidan
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}