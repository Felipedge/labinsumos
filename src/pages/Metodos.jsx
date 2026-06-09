// src/pages/Metodos.jsx
import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus, Search, FlaskConical, AlertTriangle,
         CheckCircle, ChevronDown, ChevronUp, X, BookOpen } from 'lucide-react'

const CLIENTES = ['Laboratorio Chile','Seven Pharma','Novartis','MSN',
                  'Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Emcure','Prater','Otro']

const STD_VACIO   = { codigo:'', cantidad:'' }
const COL_VACIO   = ''
const PLAC_VACIO  = { codigo:'', cantidad:'' }

// ── Helpers ───────────────────────────────────────────────────
function BadgeEstado({ estado }) {
  const map = {
    'En uso':  { cls:'badge-ok',     label:'En uso' },
    'EN USO':  { cls:'badge-ok',     label:'En uso' },
    'CERRADO': { cls:'badge-info',   label:'CERRADO' },
    'VENCIDO': { cls:'badge-danger', label:'VENCIDO' },
    'Sin stock':{ cls:'badge-warn',  label:'Sin stock' },
    'SIN STOCK':{ cls:'badge-warn',  label:'Sin stock' },
  }
  const b = map[estado] || { cls:'badge-gray', label: estado }
  return <span className={`badge ${b.cls}`}>{b.label}</span>
}

function AlertaStock({ ok, mensaje }) {
  if (ok) return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:'var(--ok)'}}>
      <CheckCircle size={12}/> Stock OK
    </span>
  )
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:'var(--danger)'}}>
      <AlertTriangle size={12}/> {mensaje}
    </span>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function Metodos() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo') || puedoHacer(rol, 'darDeBaja')

  const [metodos, setMetodos]       = useState([])
  const [inventario, setInventario] = useState([])  // todos los estándares
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [editando, setEditando]     = useState(null)
  const [search, setSearch]         = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [msg, setMsg]               = useState('')
  const [guardando, setGuardando]   = useState(false)

  // Form state
  const [fRegistroISP, setFRegistroISP] = useState('')
  const [fProducto, setFProducto]       = useState('')
  const [fCliente, setFCliente]         = useState('')
  const [fEstandares, setFEstandares]   = useState([{ ...STD_VACIO }])
  const [fPlacebos, setFPlacebos]       = useState([{ ...PLAC_VACIO }])
  const [fColumnas, setFColumnas]       = useState([''])
  const [fFiltros, setFFiltros]         = useState('')
  const [fBach, setFBach]               = useState('')
  const [fEpt, setFEpt]                 = useState('')
  const [fMa, setFMa]                   = useState('')
  const [fResponsable, setFResponsable] = useState('')
  const [fObs, setFObs]                 = useState('')

  // ── Cargar datos ────────────────────────────────────────────
  const load = async () => {
    try {
      const [snapM, snapE] = await Promise.all([
        getDocs(query(collection(db, 'metodos'), orderBy('producto'))),
        getDocs(collection(db, 'estandares')),
      ])
      setMetodos(snapM.docs.map(d => ({ id: d.id, ...d.data() })))
      setInventario(snapE.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {
      console.error(e)
      setMetodos(DEMO_METODOS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Verificar stock de un estándar en inventario ───────────
  const verificarEstandar = (codigoBase, cantidadReq) => {
    // Buscar por código base (ej: Std-0225 puede tener frascos A, B, C)
    const viales = inventario.filter(e =>
      e.codigo?.toLowerCase().startsWith(codigoBase.toLowerCase()) ||
      e.codigo?.toLowerCase().includes(codigoBase.toLowerCase())
    )
    if (!viales.length) return { ok: false, mensaje: 'No encontrado en inventario', frasco: null }

    // Frasco EN USO
    const enUso = viales.find(v => v.estado === 'En uso' || v.estado === 'EN USO')
    if (!enUso) {
      const vencido = viales.every(v => v.estado === 'VENCIDO')
      return { ok: false, mensaje: vencido ? 'Vencido' : 'Sin frasco activo', frasco: null }
    }

    // Verificar si alcanza la cantidad requerida
    const mgReq = parseFloat(cantidadReq?.replace(/[^0-9.]/g, '')) || 0
    if (mgReq > 0 && enUso.stockRestante < mgReq) {
      return {
        ok: false,
        mensaje: `Stock insuficiente: ${enUso.stockRestante?.toFixed(1)} mg / necesita ${mgReq} mg`,
        frasco: enUso
      }
    }
    return { ok: true, mensaje: '', frasco: enUso }
  }

  // ── Filtrado ────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = search.toLowerCase()
    return metodos.filter(m => {
      const matchQ = !q ||
        m.producto?.toLowerCase().includes(q) ||
        m.registroISP?.toLowerCase().includes(q) ||
        m.cliente?.toLowerCase().includes(q)
      const matchC = !filtroCliente || m.cliente?.toLowerCase().includes(filtroCliente.toLowerCase())
      return matchQ && matchC
    })
  }, [metodos, search, filtroCliente])

  // ── Clientes únicos ─────────────────────────────────────────
  const clientesUnicos = [...new Set(metodos.map(m => m.cliente?.trim()).filter(Boolean))].sort()

  // ── Resetear formulario ─────────────────────────────────────
  const resetForm = () => {
    setFRegistroISP(''); setFProducto(''); setFCliente('')
    setFEstandares([{ ...STD_VACIO }]); setFPlacebos([{ ...PLAC_VACIO }])
    setFColumnas(['']); setFFiltros(''); setFBach(''); setFEpt('')
    setFMa(''); setFResponsable(''); setFObs(''); setMsg(''); setEditando(null)
  }

  const abrirNuevo = () => { resetForm(); setShowForm(true); setSelected(null) }

  const abrirEditar = (m) => {
    setFRegistroISP(m.registroISP || '')
    setFProducto(m.producto || '')
    setFCliente(m.cliente || '')
    setFEstandares(m.estandares?.length ? m.estandares : [{ ...STD_VACIO }])
    setFPlacebos(m.placebos?.length ? m.placebos : [{ ...PLAC_VACIO }])
    setFColumnas(m.columnas?.length ? m.columnas : [''])
    setFFiltros(m.filtros || ''); setFBach(m.bachVigente || '')
    setFEpt(m.eptVigente || ''); setFMa(m.maVigente || '')
    setFResponsable(m.responsable || ''); setFObs(m.observacion || '')
    setEditando(m.id); setShowForm(true); setSelected(null)
  }

  // ── Guardar método ──────────────────────────────────────────
  const guardar = async () => {
    if (!fProducto || !fCliente) { setMsg('Producto y cliente son obligatorios'); return }
    setGuardando(true)
    try {
      const data = {
        registroISP:  fRegistroISP,
        producto:     fProducto,
        cliente:      fCliente,
        estandares:   fEstandares.filter(e => e.codigo),
        placebos:     fPlacebos.filter(p => p.codigo),
        columnas:     fColumnas.filter(c => c),
        filtros:      fFiltros,
        bachVigente:  fBach,
        eptVigente:   fEpt,
        maVigente:    fMa,
        responsable:  fResponsable,
        observacion:  fObs,
        actualizadoEn: serverTimestamp(),
      }
      if (editando) {
        await updateDoc(doc(db, 'metodos', editando), data)
      } else {
        await addDoc(collection(db, 'metodos'), { ...data, creadoPor: user.email, creadoEn: serverTimestamp() })
      }
      setShowForm(false); resetForm(); load()
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setGuardando(false) }
  }

  // ── Helpers de formulario ───────────────────────────────────
  const updStd = (i, k, v) => setFEstandares(p => p.map((e, idx) => idx===i?{...e,[k]:v}:e))
  const addStd = () => { if (fEstandares.length < 7) setFEstandares(p => [...p, {...STD_VACIO}]) }
  const delStd = (i) => setFEstandares(p => p.filter((_,idx)=>idx!==i))

  const updPl = (i, k, v) => setFPlacebos(p => p.map((e, idx) => idx===i?{...e,[k]:v}:e))
  const addPl = () => setFPlacebos(p => [...p, {...PLAC_VACIO}])
  const delPl = (i) => setFPlacebos(p => p.filter((_,idx)=>idx!==i))

  const updCol = (i, v) => setFColumnas(p => p.map((e,idx)=>idx===i?v:e))
  const addCol = () => { if (fColumnas.length < 3) setFColumnas(p => [...p, '']) }
  const delCol = (i) => setFColumnas(p => p.filter((_,idx)=>idx!==i))

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>
          Métodos analíticos
          <span style={{fontSize:12,fontWeight:400,color:'var(--text-2)',marginLeft:8}}>
            {filtrados.length} productos
          </span>
        </h2>
        {puedeAgregar && !showForm && (
          <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>
            <Plus size={14}/> Nuevo método
          </button>
        )}
        {showForm && (
          <button className="btn btn-sm" onClick={() => { setShowForm(false); resetForm() }}>
            Cancelar
          </button>
        )}
      </div>

      {/* ── FORMULARIO ── */}
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title">
            {editando ? 'Editar método' : 'Nuevo método analítico'}
          </div>
          {msg && <div className="alert-item danger" style={{marginBottom:12}}>{msg}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label>Registro ISP</label>
              <input value={fRegistroISP} onChange={e=>setFRegistroISP(e.target.value)} placeholder="ej: 21104" />
            </div>
            <div className="form-group">
              <label>Cliente *</label>
              <select value={fCliente} onChange={e=>setFCliente(e.target.value)}>
                <option value="">Seleccionar...</option>
                {CLIENTES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{gridColumn:'1/-1'}}>
              <label>Nombre del producto *</label>
              <input value={fProducto} onChange={e=>setFProducto(e.target.value)} placeholder="ej: ADROXEF CAPS. 500 mg" />
            </div>
          </div>

          {/* Estándares */}
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>ESTÁNDARES (máx. 7)</label>
              {fEstandares.length < 7 && <button className="btn btn-sm" onClick={addStd}><Plus size={12}/> Agregar</button>}
            </div>
            {fEstandares.map((e, i) => (
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:'var(--accent-lt)',color:'var(--accent)',fontSize:10,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i+1}</div>
                <input value={e.codigo} onChange={ev=>updStd(i,'codigo',ev.target.value)} placeholder="Código STD (ej: Std-0225)" style={{flex:2,padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:12}} />
                <input value={e.cantidad} onChange={ev=>updStd(i,'cantidad',ev.target.value)} placeholder="Cantidad (ej: 200mg)" style={{flex:1,padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:12}} />
                {fEstandares.length > 1 && <button className="btn btn-sm" onClick={()=>delStd(i)} style={{padding:'4px 8px',color:'var(--danger)'}}><X size={12}/></button>}
              </div>
            ))}
          </div>

          {/* Placebo */}
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>PLACEBO</label>
              {fPlacebos.length < 2 && <button className="btn btn-sm" onClick={addPl}><Plus size={12}/> Agregar</button>}
            </div>
            {fPlacebos.map((p, i) => (
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                <input value={p.codigo} onChange={ev=>updPl(i,'codigo',ev.target.value)} placeholder="Código placebo (ej: PL-018)" style={{flex:2,padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:12}} />
                <input value={p.cantidad} onChange={ev=>updPl(i,'cantidad',ev.target.value)} placeholder="Cantidad" style={{flex:1,padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:12}} />
                {fPlacebos.length > 1 && <button className="btn btn-sm" onClick={()=>delPl(i)} style={{padding:'4px 8px',color:'var(--danger)'}}><X size={12}/></button>}
              </div>
            ))}
          </div>

          {/* Columnas */}
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>COLUMNAS (máx. 3)</label>
              {fColumnas.length < 3 && <button className="btn btn-sm" onClick={addCol}><Plus size={12}/> Agregar</button>}
            </div>
            {fColumnas.map((c, i) => (
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                <input value={c} onChange={ev=>updCol(i,ev.target.value)} placeholder={`Código columna ${i+1} (ej: LCH-34)`} style={{flex:1,padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',fontSize:12}} />
                {fColumnas.length > 1 && <button className="btn btn-sm" onClick={()=>delCol(i)} style={{padding:'4px 8px',color:'var(--danger)'}}><X size={12}/></button>}
              </div>
            ))}
          </div>

          {/* Filtros y documentación */}
          <div className="form-grid">
            <div className="form-group">
              <label>Filtros</label>
              <input value={fFiltros} onChange={e=>setFFiltros(e.target.value)} placeholder="ej: Membrana 0.45µm" />
            </div>
            <div className="form-group">
              <label>Responsable</label>
              <input value={fResponsable} onChange={e=>setFResponsable(e.target.value)} placeholder="Nombre del responsable" />
            </div>
            <div className="form-group">
              <label>BACH vigente</label>
              <input value={fBach} onChange={e=>setFBach(e.target.value)} placeholder="N° BACH" />
            </div>
            <div className="form-group">
              <label>EPT vigente</label>
              <input value={fEpt} onChange={e=>setFEpt(e.target.value)} placeholder="N° EPT" />
            </div>
            <div className="form-group">
              <label>MA vigente</label>
              <input value={fMa} onChange={e=>setFMa(e.target.value)} placeholder="N° MA" />
            </div>
            <div className="form-group" style={{gridColumn:'1/-1'}}>
              <label>Observaciones</label>
              <input value={fObs} onChange={e=>setFObs(e.target.value)} placeholder="Observaciones adicionales" />
            </div>
          </div>

          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
              {guardando ? <div className="spinner" style={{width:14,height:14,borderWidth:2}}/> : <BookOpen size={14}/>}
              {guardando ? 'Guardando...' : (editando ? 'Actualizar método' : 'Guardar método')}
            </button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); resetForm() }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── FICHA MÉTODO SELECCIONADO ── */}
      {selected && !showForm && (
        <div className="card" style={{marginBottom:16,border:'1px solid var(--accent)',borderRadius:'var(--radius-lg)'}}>
          <div className="card-title">
            <div>
              <span style={{fontSize:15,fontWeight:600}}>{selected.producto}</span>
              <span style={{fontSize:12,color:'var(--text-2)',marginLeft:8}}>{selected.cliente}</span>
              {selected.registroISP && <span className="badge badge-gray" style={{marginLeft:8}}>ISP {selected.registroISP}</span>}
            </div>
            <div style={{display:'flex',gap:6}}>
              {puedeAgregar && (
                <button className="btn btn-sm" onClick={() => abrirEditar(selected)}>Editar</button>
              )}
              <button className="btn btn-sm" onClick={() => setSelected(null)}><X size={14}/></button>
            </div>
          </div>

          {/* Estándares con verificación de stock */}
          {selected.estandares?.length > 0 && (
            <div style={{marginBottom:14}}>
              <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:8}}>
                ESTÁNDARES REQUERIDOS
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {selected.estandares.map((e, i) => {
                  const verif = verificarEstandar(e.codigo, e.cantidad)
                  return (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:verif.ok?'var(--ok-lt)':'var(--danger-lt)',borderRadius:'var(--radius-sm)',border:`1px solid ${verif.ok?'#c0dd97':'#f5b9b4'}`}}>
                      <FlaskConical size={14} style={{color:verif.ok?'var(--ok)':'var(--danger)',flexShrink:0}} />
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:500}}>{e.codigo}</span>
                          <span className="badge badge-purple">{e.cantidad}</span>
                          {verif.frasco && (
                            <span style={{fontSize:11,color:'var(--text-2)'}}>
                              → Frasco <strong>{verif.frasco.frasco}</strong> · {verif.frasco.stockRestante?.toFixed(2)} mg disponibles
                            </span>
                          )}
                        </div>
                        {verif.frasco && (
                          <div style={{marginTop:3}}>
                            <BadgeEstado estado={verif.frasco.estado} />
                            <span style={{fontSize:10,color:'var(--text-3)',marginLeft:6}}>{verif.frasco.codigo}</span>
                          </div>
                        )}
                      </div>
                      <AlertaStock ok={verif.ok} mensaje={verif.mensaje} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Placebo */}
          {selected.placebos?.length > 0 && (
            <div style={{marginBottom:14}}>
              <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:8}}>PLACEBO</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {selected.placebos.map((p,i) => (
                  <div key={i} style={{padding:'6px 12px',background:'var(--purple-lt)',borderRadius:'var(--radius-sm)',fontSize:12}}>
                    <span style={{fontFamily:'var(--font-mono)',fontWeight:500}}>{p.codigo}</span>
                    {p.cantidad && <span style={{color:'var(--text-2)',marginLeft:6}}>{p.cantidad}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Columnas */}
          {selected.columnas?.length > 0 && (
            <div style={{marginBottom:14}}>
              <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:8}}>COLUMNAS</p>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {selected.columnas.map((c,i) => (
                  <span key={i} className="badge badge-info">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Documentación y filtros */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:8}}>
            {selected.filtros && <div style={{padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:11}}><span style={{color:'var(--text-3)'}}>Filtros: </span>{selected.filtros}</div>}
            {selected.bachVigente && <div style={{padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:11}}><span style={{color:'var(--text-3)'}}>BACH: </span>{selected.bachVigente}</div>}
            {selected.eptVigente && <div style={{padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:11}}><span style={{color:'var(--text-3)'}}>EPT: </span>{selected.eptVigente}</div>}
            {selected.maVigente && <div style={{padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:11}}><span style={{color:'var(--text-3)'}}>MA: </span>{selected.maVigente}</div>}
            {selected.responsable && <div style={{padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:11}}><span style={{color:'var(--text-3)'}}>Responsable: </span>{selected.responsable}</div>}
          </div>
          {selected.observacion && (
            <div style={{padding:'8px 12px',background:'var(--warn-lt)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--warn)'}}>
              <strong>Obs: </strong>{selected.observacion}
            </div>
          )}
        </div>
      )}

      {/* ── LISTA DE MÉTODOS ── */}
      {!showForm && (
        <>
          <div className="search-bar">
            <Search size={16} style={{color:'var(--text-3)',flexShrink:0}} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por producto, cliente o registro ISP..." style={{flex:1}} />
            <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientesUnicos.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filtrados.map(m => {
              const isSelected = selected?.id === m.id
              // Contar estándares con problemas
              const alertas = m.estandares?.filter(e => {
                const v = verificarEstandar(e.codigo, e.cantidad)
                return !v.ok
              }).length || 0

              return (
                <div key={m.id}
                  onClick={() => setSelected(isSelected ? null : m)}
                  style={{
                    background: isSelected ? 'var(--accent-lt)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    transition: 'all .12s',
                  }}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontWeight:500,fontSize:13}}>{m.producto}</span>
                        {m.registroISP && <span className="badge badge-gray">ISP {m.registroISP}</span>}
                        {alertas > 0 && (
                          <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,color:'var(--danger)',fontWeight:500}}>
                            <AlertTriangle size={11}/> {alertas} insumo{alertas>1?'s':''} con problema
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-2)',marginTop:2,display:'flex',gap:10,flexWrap:'wrap'}}>
                        <span>{m.cliente}</span>
                        {m.estandares?.length > 0 && <span>{m.estandares.length} estándar{m.estandares.length>1?'es':''}</span>}
                        {m.columnas?.length > 0 && <span>{m.columnas.length} columna{m.columnas.length>1?'s':''}</span>}
                        {m.bachVigente && <span>BACH: {m.bachVigente}</span>}
                      </div>
                    </div>
                    {isSelected ? <ChevronUp size={16} style={{color:'var(--accent)',flexShrink:0}}/> : <ChevronDown size={16} style={{color:'var(--text-3)',flexShrink:0}}/>}
                  </div>
                </div>
              )
            })}
            {filtrados.length === 0 && (
              <div className="empty" style={{padding:40}}>
                <BookOpen size={32}/>
                <p>No hay métodos que coincidan con la búsqueda</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

const DEMO_METODOS = [
  {
    id:'1', registroISP:'21104', producto:'ADROXEF CAPS. 500 mg', cliente:'Laboratorio Chile',
    estandares:[{codigo:'Std-0225',cantidad:'20mg'},{codigo:'Std-0222',cantidad:'10mg'},{codigo:'Std-0223',cantidad:'10mg'}],
    placebos:[], columnas:['LCH-34'], filtros:'', bachVigente:'', eptVigente:'', maVigente:'', responsable:'', observacion:''
  },
  {
    id:'2', registroISP:'22472', producto:'Pregabalina Capsula 75mg', cliente:'Seven Pharma',
    estandares:[{codigo:'Std-0506',cantidad:'3000mg'},{codigo:'SI-0177',cantidad:'1390mg'}],
    placebos:[], columnas:[], filtros:'', bachVigente:'', eptVigente:'', maVigente:'', responsable:'', observacion:''
  },
]