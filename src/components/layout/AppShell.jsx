// src/components/layout/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { puedoHacer } from '../../lib/roles'
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  LayoutDashboard, FlaskConical, Cylinder, Droplets,
  Pill, Bell, ScanLine, LogOut, Users, BookOpen,
  ClipboardCheck, Pencil, Check, X, BarChart2, ClipboardList, Building2
} from 'lucide-react'
 
const ETIQUETAS_ROL = {
  admin:     'Administrador',
  jefe:      'Jefe de laboratorio',
  encargado: 'Encargado de insumos',
  analista:  'Analista',
  lectura:   'Solo lectura',
}
 
const COLORES_ROL = {
  admin:     '#A32D2D',
  jefe:      '#185FA5',
  encargado: '#3B6D11',
  analista:  '#3C3489',
  lectura:   '#6b6860',
}
 
export default function AppShell() {
  const { user, logout } = useAuth()
  const { rol }          = useRole()
  const navigate         = useNavigate()
 
  const [pendientes, setPendientes]         = useState(0)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nuevoNombre, setNuevoNombre]       = useState('')
  const [nombreMostrado, setNombreMostrado] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [nombreBloqueado, setNombreBloqueado] = useState(false)
  const [docUsuarioId, setDocUsuarioId]     = useState(null)
 
  const puedeOperar  = puedoHacer(rol, 'registrarUso')
  const puedeAprobar = puedoHacer(rol, 'aprobarInsumos')
 
  // Cargar nombre del usuario desde Firestore
  useEffect(() => {
    if (!user) return
    async function cargarNombre() {
      try {
        const snap = await getDocs(
          query(collection(db, 'usuarios'), where('uid', '==', user.uid))
        )
        if (!snap.empty) {
          const data = snap.docs[0].data()
          setDocUsuarioId(snap.docs[0].id)
          setNombreMostrado(data.nombrePersonalizado || data.nombre || user.displayName || user.email)
          // Bloquear si ya editó el nombre antes
          setNombreBloqueado(!!data.nombrePersonalizado)
        } else {
          setNombreMostrado(user.displayName || user.email)
        }
      } catch {
        setNombreMostrado(user.displayName || user.email)
      }
    }
    cargarNombre()
  }, [user])
 
  // Contar aprobaciones pendientes
  useEffect(() => {
    if (!puedeAprobar) return
    async function contarPendientes() {
      try {
        let total = 0
        for (const col of ['estandares','columnas','reactivos','placebo']) {
          const snap = await getDocs(
            query(collection(db, col), where('estado', '==', 'Pendiente de aprobación'))
          )
          total += snap.size
        }
        setPendientes(total)
      } catch {}
    }
    contarPendientes()
    const interval = setInterval(contarPendientes, 60000)
    return () => clearInterval(interval)
  }, [puedeAprobar])
 
  const guardarNombre = async () => {
    if (!nuevoNombre.trim() || !docUsuarioId) return
    setGuardandoNombre(true)
    try {
      await updateDoc(doc(db, 'usuarios', docUsuarioId), {
        nombrePersonalizado: nuevoNombre.trim(),
        nombre:              nuevoNombre.trim(),
      })
      setNombreMostrado(nuevoNombre.trim())
      setNombreBloqueado(true) // Bloquear para siempre tras la primera edición
      setEditandoNombre(false)
      setNuevoNombre('')
    } catch(e) { console.error(e) }
    finally { setGuardandoNombre(false) }
  }
 
  const iniciarEdicion = () => {
    if (nombreBloqueado) return
    setNuevoNombre(nombreMostrado)
    setEditandoNombre(true)
  }
 
  const cancelarEdicion = () => {
    setEditandoNombre(false)
    setNuevoNombre('')
  }
 
  const initials = nombreMostrado
    ? nombreMostrado.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U'
 
  const handleLogout = async () => { await logout(); navigate('/login') }
 
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/IMG_3307.jpeg" alt="Qualyserv" style={{ width:'100%', maxWidth:160, marginBottom:6 }} />
          <p style={{ fontSize:10 }}>Laboratorio de Análisis Químico</p>
        </div>
 
        <nav>
          <div className="nav-section">Principal</div>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <LayoutDashboard size={16}/> Inicio
          </NavLink>
          {puedeOperar && (
            <NavLink to="/escanear" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <ScanLine size={16}/> Escanear
            </NavLink>
          )}
 
          <div className="nav-section">Módulos</div>
          <NavLink to="/estandares" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <FlaskConical size={16}/> Estándares
          </NavLink>
          <NavLink to="/columnas" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <Cylinder size={16}/> Columnas
          </NavLink>
          <NavLink to="/reactivos" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <Droplets size={16}/> Reactivos
          </NavLink>
          <NavLink to="/placebo" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <Pill size={16}/> Placebo
          </NavLink>
          <NavLink to="/apis" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <FlaskConical size={16}/> APIs
          </NavLink>
 
          <div className="nav-section">Sistema</div>
          <NavLink to="/alertas" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <Bell size={16}/> Alertas
          </NavLink>
          <NavLink to="/metodos" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <BookOpen size={16}/> Métodos
          </NavLink>
          {puedoHacer(rol, 'exportar') && (
            <NavLink to="/reportes" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <BarChart2 size={16}/> Reportes
            </NavLink>
          )}
          {(rol === 'admin' || rol === 'jefe') && (
            <NavLink to="/auditlog" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <ClipboardList size={16}/> Auditoría
            </NavLink>
          )}
          {puedeAprobar && (
            <NavLink to="/aprobaciones" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <ClipboardCheck size={16}/>
              <span style={{flex:1}}>Aprobaciones</span>
              {pendientes > 0 && (
                <span style={{
                  background:'var(--danger)', color:'#fff',
                  borderRadius:10, fontSize:10, fontWeight:600,
                  padding:'1px 6px', minWidth:18, textAlign:'center'
                }}>
                  {pendientes}
                </span>
              )}
            </NavLink>
          )}
          {(rol === 'admin' || rol === 'jefe') && (
            <NavLink to="/clientes" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <Building2 size={16}/> Clientes
            </NavLink>
          )}
          {puedoHacer(rol, 'gestionarUsuarios') && (
            <NavLink to="/usuarios" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <Users size={16}/> Usuarios
            </NavLink>
          )}
        </nav>
 
        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">
              {user?.photoURL
                ? <img src={user.photoURL} alt={initials}/>
                : initials}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              {editandoNombre ? (
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <input
                    value={nuevoNombre}
                    onChange={e=>setNuevoNombre(e.target.value)}
                    onKeyDown={e=>{
                      if(e.key==='Enter') guardarNombre()
                      if(e.key==='Escape') cancelarEdicion()
                    }}
                    style={{
                      flex:1, fontSize:11, padding:'2px 6px',
                      border:'1px solid var(--accent)', borderRadius:4,
                      background:'var(--surface)', color:'var(--text-1)', minWidth:0
                    }}
                    autoFocus
                  />
                  <button onClick={guardarNombre} disabled={guardandoNombre}
                    style={{padding:2,border:'none',background:'none',cursor:'pointer',color:'var(--ok)',flexShrink:0}}>
                    <Check size={13}/>
                  </button>
                  <button onClick={cancelarEdicion}
                    style={{padding:2,border:'none',background:'none',cursor:'pointer',color:'var(--danger)',flexShrink:0}}>
                    <X size={13}/>
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <div className="user-name" style={{
                    overflow:'hidden', textOverflow:'ellipsis',
                    whiteSpace:'nowrap', flex:1, fontSize:12
                  }}>
                    {nombreMostrado}
                  </div>
                  {/* Lápiz solo si el nombre NO está bloqueado */}
                  {!nombreBloqueado && (
                    <button onClick={iniciarEdicion} title="Editar nombre (solo una vez)"
                      style={{padding:2,border:'none',background:'none',cursor:'pointer',color:'var(--text-3)',flexShrink:0}}>
                      <Pencil size={11}/>
                    </button>
                  )}
                </div>
              )}
              <div style={{ fontSize:10, fontWeight:500, color: COLORES_ROL[rol] || 'var(--text-3)' }}>
                {ETIQUETAS_ROL[rol] || 'Cargando...'}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-sm" title="Cerrar sesión"
              style={{ padding:'5px', border:'none', flexShrink:0 }}>
              <LogOut size={14}/>
            </button>
          </div>
        </div>
      </aside>
 
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">Gestión de insumos</span>
          <div className="topbar-actions">
            {puedeOperar && (
              <NavLink to="/escanear" className="btn btn-primary btn-sm">
                <ScanLine size={14}/> Escanear QR
              </NavLink>
            )}
          </div>
        </header>
        <main className="page-content">
          <Outlet/>
        </main>
      </div>
    </div>
  )
}
