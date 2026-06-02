// src/pages/Columnas.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getColumnas, crearColumna, registrarUsoColumna, calcularSemaforoColumna } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, FileText, Search } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'

// Clientes se cargan desde Firestore
const CLIENTES_FALLBACK = [
  { nombre:'Ascend', sigla:'ASC' }, { nombre:'Galenicum', sigla:'GL' },
  { nombre:'Laboratorio Chile', sigla:'LCH' }, { nombre:'Novartis', sigla:'NOV' },
  { nombre:'Otro', sigla:'OTR' },
]

const FASES   = ['C18','C8','C4','NH2','CN','Silica','RP-18','Phenyl','Otro']
const TAMANOS = ['1.8µm','3µm','3.5µm','5µm','10µm']

function ProgBar({ pct }) {
  const cls = pct >= 0.9 ? 'danger' : pct >= 0.75 ? 'warn' : 'ok'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div className="prog" style={{ flex:1 }}>
        <div className={`prog-fill ${cls}`} style={{ width:`${Math.min(100, Math.round(pct*100))}%` }} />
      </div>
      <span style={{ fontSize:11, color:'var(--text-2)', minWidth:32 }}>{Math.round(pct*100)}%</span>
    </div>
  )
}

// Obtener siguiente número correlativo para un cliente
async function getSiguienteCorrelativo(sigla) {
  try {
    const snap = await getDocs(
      query(collection(db, 'columnas'), where('siglaCliente', '==', sigla))
    )
    if (snap.empty) return 1
    // Buscar el mayor número usado
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

  const [clientesDB, setClientesDB] = useState(CLIENTES_FALLBACK)
  const [columnas, setColumnas]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [useForm, setUseForm]       = useState(null)
  const [form, setForm]             = useState({})
  const [msg, setMsg]               = useState('')
  const [docInsumo, setDocInsumo]   = useState(null)
  const [search, setSearch]         = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [ordenCampo, setOrdenCampo] = useState('codigo')
  const [ordenDir, setOrdenDir]     = useState('asc')
  const [codigoGenerado, setCodigoGenerado] = useState('')
  const [generandoCodigo, setGenerandoCodigo] = useState(false)

  const load = async () => {
    try { setColumnas(await getColumnas()) }
    catch { setColumnas(DEMO) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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
        limiteInyecciones: parseInt(form.limite) || 1500,
        fechaPrimerUso:    form.fechaPrimerUso || new Date().toISOString().split('T')[0],
        estado:            'Pendiente de aprobación',
        creadoPorRol:      rol,
      }, user.email)
      setShowForm(false); setForm({}); setCodigoGenerado(''); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const registrarUso = async () => {
    if (!useForm || !form.inyecciones) { setMsg('Ingresa el número de inyecciones'); return }
    try {
      await registrarUsoColumna({
        columnaId:   useForm.id,
        inyecciones: parseInt(form.inyecciones),
        nAnalisis:   form.nAnalisis || '',
        analista:    user.displayName || user.email,
        email:       user.email,
      })
      setUseForm(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }

  // Clientes únicos para filtro
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
      if (ordenCampo === 'codigo') {
        valA = a.codigo?.toLowerCase() || ''
        valB = b.codigo?.toLowerCase() || ''
      } else if (ordenCampo === 'cliente') {
        valA = a.cliente?.toLowerCase() || ''
        valB = b.cliente?.toLowerCase() || ''
      } else if (ordenCampo === 'vencimiento') {
        valA = a.fechaPrimerUso || ''
        valB = b.fechaPrimerUso || ''
      }
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
            onClick={() => { setShowForm(!showForm); setUseForm(null); setForm({}); setCodigoGenerado('') }}>
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
                {CLIENTES.map(c=><option key={c}>{c}</option>)}
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
                {codigoGenerado && (
                  <span style={{fontSize:11,color:'var(--ok)'}}>✓ Auto</span>
                )}
              </div>
            </div>
            <div className="form-group"><label>Producto / método</label>
              <input placeholder="ej: Cilosvitae 100 — Valoración" onChange={f('producto')} />
            </div>
            <div className="form-group"><label>Fase estacionaria *</label>
              <select onChange={f('fase')}><option value="">Seleccionar...</option>
                {FASES.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Largo (mm)</label>
              <input type="number" placeholder="ej: 150" onChange={f('largo')} />
            </div>
            <div className="form-group"><label>Diámetro (mm)</label>
              <input type="number" placeholder="ej: 4.6" step="0.1" onChange={f('diametro')} />
            </div>
            <div className="form-group"><label>Micra (µm)</label>
              <select onChange={f('micra')}>
                <option value="">Seleccionar...</option>
                {['1.8','3','3.5','5','10'].map(m=><option key={m} value={m}>{m} µm</option>)}
              </select>
            </div>
            <div className="form-group"><label>Fabricante</label>
              <input placeholder="ej: Waters, Agilent, Phenomenex" onChange={f('fabricante')} />
            </div>
            <div className="form-group"><label>Límite de inyecciones</label>
              <input type="number" defaultValue={1500} onChange={f('limite')} />
            </div>
            <div className="form-group"><label>Fecha primer uso</label>
              <input type="date" onChange={f('fechaPrimerUso')} />
            </div>
          </div>

          {/* Preview del código */}
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

      {useForm && puedeOperar && (
        <div className="card">
          <div className="card-title">Registrar uso — {useForm.codigo}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>N° inyecciones hoy *</label>
              <input type="number" placeholder="ej: 12" onChange={f('inyecciones')} />
            </div>
            <div className="form-group"><label>N° de análisis</label>
              <input placeholder="ej: 26324" onChange={f('nAnalisis')} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={registrarUso}>Confirmar</button>
            <button className="btn btn-sm" onClick={() => { setUseForm(null); setForm({}); setMsg('') }}>Cancelar</button>
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
            { campo:'codigo',      label:'Código' },
            { campo:'cliente',     label:'Cliente' },
            { campo:'vencimiento', label:'Fecha uso' },
          ].map(o => (
            <button key={o.campo} className="btn btn-sm"
              style={ordenCampo===o.campo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
              onClick={()=>toggleOrden(o.campo)}>
              {o.label} {ordenCampo===o.campo?(ordenDir==='asc'?'↑':'↓'):'↕'}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div style={{fontSize:12,color:'var(--text-2)',marginBottom:8}}>
        Mostrando {filtradas.length} de {columnas.length} columnas
        {filtroCliente && <span> · Cliente: <strong>{filtroCliente}</strong></span>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Fase</th><th>Largo</th><th>Diám.</th><th>Micra</th>
              <th>Cliente</th><th>Primer uso</th><th>Inyecciones</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(c => {
              const sem = calcularSemaforoColumna(c.inyeccionesAcumuladas || 0, c.limiteInyecciones || 1500)
              const badgeCls = sem.color === 'danger' ? 'badge-danger' : sem.color === 'warning' ? 'badge-warn' : 'badge-ok'
              const esPendiente = c.estado === 'Pendiente de aprobación'
              return (
                <tr key={c.id}>
                  <td className="mono" style={{fontWeight:600}}>{c.codigo}</td>
                  <td><span className="badge badge-purple">{c.fase}</span></td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.largo ? `${c.largo} mm` : c.dimensiones || '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.diametro ? `${c.diametro} mm` : '—'}</td>
                  <td style={{color:'var(--text-2)',fontSize:12}}>{c.micra ? `${c.micra} µm` : c.tamanoParticula || '—'}</td>
                  <td>{c.cliente}</td>
                  <td style={{ color:'var(--text-2)', fontSize:11 }}>{c.fechaPrimerUso || '—'}</td>
                  <td style={{ minWidth:120 }}>
                    <div style={{ fontSize:12, marginBottom:4 }}>
                      <strong>{c.inyeccionesAcumuladas || 0}</strong>
                      <span style={{ color:'var(--text-3)' }}> / {c.limiteInyecciones || 1500}</span>
                    </div>
                    <ProgBar pct={(c.inyeccionesAcumuladas || 0) / (c.limiteInyecciones || 1500)} />
                  </td>
                  <td>
                    {esPendiente
                      ? <span className="badge badge-warn">Pendiente</span>
                      : <span className={`badge ${badgeCls}`}>{c.estado}</span>
                    }
                  </td>
                  <td style={{display:'flex',gap:4}}>
                    {puedeOperar && !esPendiente && c.estado !== 'DADA DE BAJA' && c.estado !== 'RETIRADA' && (
                      <button className="btn btn-sm"
                        onClick={() => { setUseForm(c); setShowForm(false); setForm({}) }}>
                        Registrar uso
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
              <tr><td colSpan={10} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                No hay columnas que coincidan
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

