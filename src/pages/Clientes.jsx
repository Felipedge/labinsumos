// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc,
         doc, serverTimestamp, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useRole } from '../hooks/useRole.jsx'
import { Plus, Pencil, Trash2, Check, X, Shield } from 'lucide-react'

export default function Clientes() {
  const { rol } = useRole()
  const puedeGestionar = rol === 'admin' || rol === 'jefe'

  const [clientes, setClientes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nombre, setNombre]       = useState('')
  const [sigla, setSigla]         = useState('')
  const [msg, setMsg]             = useState('')
  const [guardando, setGuardando] = useState(false)

  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'clientes'), orderBy('nombre')))
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (puedeGestionar) load() }, [puedeGestionar])

  const resetForm = () => {
    setNombre(''); setSigla(''); setShowForm(false)
    setEditandoId(null); setMsg('')
  }

  const guardar = async () => {
    if (!nombre.trim()) { setMsg('El nombre es obligatorio'); return }
    if (!sigla.trim())  { setMsg('La sigla es obligatoria'); return }
    if (sigla.length > 5) { setMsg('La sigla debe tener máximo 5 caracteres'); return }

    // Verificar duplicados
    const siglaUpper = sigla.toUpperCase().trim()
    const nombreUpper = nombre.toUpperCase().trim()
    const duplicadoSigla  = clientes.find(c => c.sigla === siglaUpper && c.id !== editandoId)
    const duplicadoNombre = clientes.find(c => c.nombre.toUpperCase() === nombreUpper && c.id !== editandoId)
    if (duplicadoSigla)  { setMsg(`La sigla "${siglaUpper}" ya está en uso por ${duplicadoSigla.nombre}`); return }
    if (duplicadoNombre) { setMsg(`El cliente "${nombre}" ya existe`); return }

    setGuardando(true)
    try {
      if (editandoId) {
        await updateDoc(doc(db, 'clientes', editandoId), {
          nombre:       nombre.trim(),
          sigla:        siglaUpper,
          actualizadoEn: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'clientes'), {
          nombre:    nombre.trim(),
          sigla:     siglaUpper,
          creadoEn:  serverTimestamp(),
          actualizadoEn: serverTimestamp(),
        })
      }
      resetForm(); load()
    } catch(e) { setMsg('Error: ' + e.message) }
    finally { setGuardando(false) }
  }

  const editar = (cliente) => {
    setEditandoId(cliente.id)
    setNombre(cliente.nombre)
    setSigla(cliente.sigla)
    setShowForm(true)
    setMsg('')
  }

  const eliminar = async (cliente) => {
    if (!window.confirm(`¿Eliminar el cliente "${cliente.nombre}"?\n\nEsto no afecta los insumos ya registrados.`)) return
    try {
      await deleteDoc(doc(db, 'clientes', cliente.id))
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  if (!puedeGestionar) {
    return (
      <div className="empty">
        <Shield size={40}/>
        <p>Solo Administrador y Jefe pueden gestionar clientes</p>
      </div>
    )
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>
          Clientes
          <span style={{fontSize:12,fontWeight:400,color:'var(--text-2)',marginLeft:8}}>
            {clientes.length} registrados
          </span>
        </h2>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={()=>{setShowForm(true);setEditandoId(null);setNombre('');setSigla('')}}>
            <Plus size={14}/> Nuevo cliente
          </button>
        )}
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title">{editandoId ? 'Editar cliente' : 'Agregar cliente'}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10,fontSize:12}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label>Nombre del cliente *</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="ej: Laboratorio Chile"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Sigla * (máx. 5 caracteres)</label>
              <input
                value={sigla}
                onChange={e => setSigla(e.target.value.toUpperCase())}
                placeholder="ej: LCH"
                maxLength={5}
                style={{textTransform:'uppercase', fontFamily:'var(--font-mono)', fontWeight:600, letterSpacing:2}}
              />
              <p style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
                Se usa para generar códigos de columnas automáticamente (ej: LCH-001)
              </p>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
              {guardando ? <div className="spinner" style={{width:14,height:14,borderWidth:2}}/> : <Check size={14}/>}
              {editandoId ? 'Guardar cambios' : 'Agregar cliente'}
            </button>
            <button className="btn btn-sm" onClick={resetForm}>
              <X size={14}/> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sigla</th>
              <th>Nombre del cliente</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id}>
                <td>
                  <span style={{
                    fontFamily:'var(--font-mono)', fontWeight:700, fontSize:14,
                    background:'var(--accent-lt)', color:'var(--accent)',
                    padding:'2px 8px', borderRadius:'var(--radius-sm)'
                  }}>
                    {c.sigla}
                  </span>
                </td>
                <td style={{fontWeight:500}}>{c.nombre}</td>
                <td>
                  
                </td>
                <td style={{display:'flex',gap:4}}>
                  <button className="btn btn-sm" onClick={()=>editar(c)} title="Editar">
                    <Pencil size={13}/>
                  </button>
                  <button className="btn btn-sm"
                    style={{color:'var(--danger)'}}
                    onClick={()=>eliminar(c)} title="Eliminar">
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr><td colSpan={4} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                No hay clientes registrados. Agrega el primero.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
