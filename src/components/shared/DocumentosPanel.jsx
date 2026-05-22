// src/components/shared/DocumentosPanel.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, deleteDoc,
         doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { puedoHacer } from '../../lib/roles'
import { FileText, Link, Trash2, ExternalLink, X, Plus } from 'lucide-react'

const TIPOS_DOC = [
  'COA — Certificado de Análisis',
  'Ficha de Seguridad',
  'Certificado USP',
  'Ficha Técnica',
  'Certificado de Pureza',
  'Certificado de Fabricación',
  'Especificaciones',
  'Otro',
]

export default function DocumentosPanel({ insumoId, modulo, nombreInsumo, onClose }) {
  const { user }  = useAuth()
  const { rol }   = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo') || puedoHacer(rol, 'registrarUso')
  const puedeBorrar  = puedoHacer(rol, 'darDeBaja')

  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre]     = useState('')
  const [tipo, setTipo]         = useState('')
  const [linkDrive, setLinkDrive] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]           = useState('')

  const load = async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'documentos'),
          where('insumoId', '==', insumoId),
          where('modulo',   '==', modulo),
          orderBy('creadoEn', 'desc')
        )
      )
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [insumoId])

  const resetForm = () => {
    setNombre(''); setTipo(''); setLinkDrive(''); setMsg(''); setShowForm(false)
  }

  // Normalizar link de Drive para asegurar que sea viewable
  const normalizarLinkDrive = (url) => {
    if (!url) return url
    // Convertir /view, /edit o cualquier sufijo a /view
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (match) return `https://drive.google.com/file/d/${match[1]}/view`
    // Si es link de carpeta u otro formato, devolver tal cual
    return url
  }

  const guardar = async () => {
    if (!nombre.trim())    { setMsg('El nombre del documento es obligatorio'); return }
    if (!linkDrive.trim()) { setMsg('Ingresa el link de Google Drive'); return }
    if (!linkDrive.includes('drive.google.com') && !linkDrive.startsWith('http')) {
      setMsg('El link no parece válido. Debe ser una URL de Google Drive')
      return
    }

    setGuardando(true)
    try {
      await addDoc(collection(db, 'documentos'), {
        insumoId,
        modulo,
        nombre:       nombre.trim(),
        tipo:         tipo || 'Otro',
        fuente:       'drive',
        url:          normalizarLinkDrive(linkDrive.trim()),
        creadoPor:    user.email,
        creadoNombre: user.displayName || user.email,
        creadoEn:     serverTimestamp(),
      })
      resetForm()
      load()
    } catch(e) {
      setMsg('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (docItem) => {
    if (!window.confirm(`¿Eliminar "${docItem.nombre}"?`)) return
    try {
      await deleteDoc(doc(db, 'documentos', docItem.id))
      load()
    } catch(e) { alert('Error al eliminar: ' + e.message) }
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16
    }}>
      <div style={{
        background:'var(--surface)', borderRadius:'var(--radius-lg)',
        width:'100%', maxWidth:520, maxHeight:'85vh',
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}>
        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <p style={{fontSize:15,fontWeight:600}}>Documentos adjuntos</p>
            <p style={{fontSize:11,color:'var(--text-2)'}}>{nombreInsumo} · {docs.length} documento{docs.length!==1?'s':''}</p>
          </div>
          <button className="btn btn-sm" onClick={onClose}><X size={14}/></button>
        </div>

        {/* Contenido */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>

          {/* Formulario */}
          {showForm && puedeAgregar && (
            <div style={{background:'var(--bg)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14,border:'1px solid var(--border)'}}>
              <p style={{fontSize:12,fontWeight:600,marginBottom:10}}>Agregar documento desde Google Drive</p>
              {msg && <div className="alert-item danger" style={{marginBottom:10,fontSize:12}}>{msg}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label>Nombre del documento *</label>
                  <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="ej: COA Lote LRAD4238"/>
                </div>
                <div className="form-group">
                  <label>Tipo de documento</label>
                  <select value={tipo} onChange={e=>setTipo(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {TIPOS_DOC.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label>Link de Google Drive *</label>
                  <input
                    value={linkDrive}
                    onChange={e=>setLinkDrive(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                  />
                  <p style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
                    En Drive: clic derecho en el archivo → <strong>Compartir</strong> → <strong>Cualquier persona con el link</strong> → Copiar link
                  </p>
                </div>
              </div>

              <div style={{display:'flex',gap:8,marginTop:4}}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando ? <div className="spinner" style={{width:14,height:14,borderWidth:2}}/> : <Plus size={14}/>}
                  {guardando ? 'Guardando...' : 'Guardar documento'}
                </button>
                <button className="btn btn-sm" onClick={resetForm}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista de documentos */}
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:30}}><div className="spinner"/></div>
          ) : docs.length === 0 && !showForm ? (
            <div className="empty" style={{padding:30}}>
              <FileText size={32}/>
              <p>No hay documentos adjuntos</p>
              <p style={{fontSize:11,marginTop:4}}>Los documentos se almacenan en Google Drive</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {docs.map(d => (
                <div key={d.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
                  <div style={{width:32,height:32,borderRadius:'var(--radius-sm)',background:'#E8F0FE',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Link size={16} style={{color:'#1967D2'}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.nombre}</p>
                    <p style={{fontSize:11,color:'var(--text-2)'}}>
                      {d.tipo && d.tipo !== 'Otro' && <span style={{marginRight:8}}>{d.tipo}</span>}
                      <span style={{color:'var(--text-3)'}}>Google Drive · {d.creadoNombre}</span>
                    </p>
                  </div>
                  <div style={{display:'flex',gap:4,flexShrink:0}}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm" title="Abrir en Google Drive">
                      <ExternalLink size={13}/>
                    </a>
                    {puedeBorrar && (
                      <button className="btn btn-sm" style={{color:'var(--danger)'}}
                        onClick={()=>eliminar(d)} title="Eliminar">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {puedeAgregar && !showForm && (
          <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)'}}>
            <button className="btn btn-primary btn-sm"
              style={{width:'100%',justifyContent:'center'}}
              onClick={()=>setShowForm(true)}>
              <Plus size={14}/> Agregar documento desde Drive
            </button>
          </div>
        )}
      </div>
    </div>
  )
}