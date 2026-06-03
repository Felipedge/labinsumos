// src/pages/Usuarios.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useRole } from '../hooks/useRole.jsx'
import { ROLES, ETIQUETAS_ROL, COLORES_ROL, puedoHacer } from '../lib/roles'
import { Users, Shield } from 'lucide-react'
 
const COLORES_BADGE = {
  admin:          'badge-danger',
  jefe:           'badge-info',
  coordinador:    'badge-ok',
  analista:       'badge-purple',
  administrativo: 'badge-warn',
  lectura:        'badge-gray',
}
 
const DESCRIPCIONES = {
  admin:          'Gestión de usuarios, clientes y auditoría del sistema',
  jefe:           'Autoridad máxima sobre insumos: aprueba, da de baja, exporta, gestiona clientes',
  coordinador:    'Agrega y aprueba insumos, da de baja, exporta reportes, ve auditoría',
  analista:       'Registra pesadas y usos — único rol con esta capacidad',
  administrativo: 'Ingresa insumos nuevos (quedan pendientes de aprobación)',
  lectura:        'Solo visualiza, sin acciones',
}
 
export default function Usuarios() {
  const { rol } = useRole()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading]   = useState(true)
  const [msg, setMsg]           = useState('')
 
  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'usuarios'))
      setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }
 
  useEffect(() => { load() }, [])
 
  const cambiarRol = async (uid, nuevoRol) => {
    try {
      await updateDoc(doc(db, 'usuarios', uid), { rol: nuevoRol })
      setMsg('Rol actualizado correctamente')
      setTimeout(() => setMsg(''), 3000)
      load()
    } catch(e) { setMsg('Error al actualizar rol') }
  }
 
  if (!puedoHacer(rol, 'gestionarUsuarios')) {
    return (
      <div className="empty">
        <Shield size={40} />
        <p>No tienes permisos para ver esta sección</p>
      </div>
    )
  }
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>Gestión de usuarios</h2>
        <span className="badge badge-info">{usuarios.length} usuarios registrados</span>
      </div>
 
      {/* Leyenda de roles */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-title">Roles disponibles</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>
          {Object.entries(ETIQUETAS_ROL).map(([k,v]) => (
            <div key={k} style={{padding:'8px 12px',background:'var(--bg)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
              <div style={{marginBottom:4}}><span className={`badge ${COLORES_BADGE[k]}`}>{v}</span></div>
              <div style={{fontSize:11,color:'var(--text-2)'}}>{DESCRIPCIONES[k]}</div>
            </div>
          ))}
        </div>
      </div>
 
      {msg && (
        <div className="alert-item" style={{background:'var(--ok-lt)',border:'1px solid var(--ok)',marginBottom:12}}>
          {msg}
        </div>
      )}
 
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol actual</th>
              <th>Desde</th>
              <th>Cambiar rol</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {u.foto
                      ? <img src={u.foto} alt="" style={{width:28,height:28,borderRadius:'50%'}}/>
                      : <div style={{width:28,height:28,borderRadius:'50%',background:'var(--accent-lt)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>
                          {u.nombre?.[0]?.toUpperCase()||'U'}
                        </div>
                    }
                    <span style={{fontWeight:500}}>{u.nombre}</span>
                  </div>
                </td>
                <td style={{color:'var(--text-2)',fontSize:12}}>{u.email}</td>
                <td><span className={`badge ${COLORES_BADGE[u.rol]||'badge-gray'}`}>{ETIQUETAS_ROL[u.rol]||u.rol}</span></td>
                <td style={{color:'var(--text-3)',fontSize:11}}>
                  {u.creadoEn ? new Date(u.creadoEn).toLocaleDateString('es-CL') : '—'}
                </td>
                <td>
                  <select
                    value={u.rol}
                    onChange={e => cambiarRol(u.id, e.target.value)}
                    style={{fontSize:12,padding:'4px 8px'}}
                  >
                    {Object.entries(ETIQUETAS_ROL).map(([v,label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}