// src/components/layout/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { puedoHacer, ETIQUETAS_ROL, COLORES_ROL } from '../../lib/roles'
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  LayoutDashboard, FlaskConical, Cylinder, Droplets,
  Pill, Bell, ScanLine, LogOut, Users, BookOpen,
  ClipboardCheck, Pencil, Check, X, BarChart2, ClipboardList, Building2
} from 'lucide-react'
 
export default function AppShell() {
  const { user, logout } = useAuth()
  const { rol }          = useRole()
  const navigate         = useNavigate()
 
  const [pendientes, setPendientes]           = useState(0)
  const [alertasCount, setAlertasCount]       = useState(0)
  const [editandoNombre, setEditandoNombre]   = useState(false)
  const [nuevoNombre, setNuevoNombre]         = useState('')
  const [nombreMostrado, setNombreMostrado]   = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [nombreBloqueado, setNombreBloqueado] = useState(false)
  const [docUsuarioId, setDocUsuarioId]       = useState(null)
 
  const puedeOperar  = puedoHacer(rol, 'registrarUso')
  const puedeAprobar = puedoHacer(rol, 'aprobarInsumos')
  const puedeAuditoria = puedoHacer(rol, 'verAuditoria')
 
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
        for (const col of ['estandares','columnas','reactivos','placebo','apis']) {
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
 
  // Contar alertas activas — misma lógica que Alertas.jsx (45/90 días)
  useEffect(() => {
    async function contarAlertas() {
      try {
        const hoy = new Date(); hoy.setHours(0,0,0,0)
        const parseFecha = v => {
          if (!v) return null
          if (v?.toDate) return v.toDate()
          const s = String(v), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
          if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]))
          return null
        }
        const [stds, reacts, pls] = await Promise.all([
          getDocs(collection(db, 'estandares')),
          getDocs(collection(db, 'reactivos')),
          getDocs(collection(db, 'placebo')),
        ])
        let count = 0
        stds.docs.forEach(d => {
          const data = d.data()
          if (['SIN STOCK','Dado de baja','Dada de baja','Retirado por cliente'].includes(data.estado)) return
          const vence = parseFecha(data.fechaVencimiento)
          if (vence) { const dias = Math.round((vence - hoy) / 86400000); if (dias <= 90) count++ }
        })
        reacts.docs.forEach(d => {
          const data = d.data()
          const vence = parseFecha(data.fechaVencimiento)
          if (vence) { const dias = Math.round((vence - hoy) / 86400000); if (dias <= 45) count++ }
          if (data.estado === 'STOCK BAJO') count++
        })
        pls.docs.forEach(d => {
          const data = d.data()
          if (['Retirado por cliente','SIN STOCK','Dado de baja','Dada de baja'].includes(data.estado)) return
          const vence = parseFecha(data.fechaVencimiento)
          if (vence) { const dias = Math.round((vence - hoy) / 86400000); if (dias <= 45) count++ }
        })
        setAlertasCount(count)
      } catch {}
    }
    contarAlertas()
    const interval = setInterval(contarAlertas, 60000)
    return () => clearInterval(interval)
  }, [])

  const guardarNombre = async () => {
    if (!nuevoNombre.trim() || !docUsuarioId) return
    setGuardandoNombre(true)
    try {
      await updateDoc(doc(db, 'usuarios', docUsuarioId), {
        nombrePersonalizado: nuevoNombre.trim(),
        nombre:              nuevoNombre.trim(),
      })
      setNombreMostrado(nuevoNombre.trim())
      setNombreBloqueado(true)
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
          <div className="sidebar-header-logo">
            <img src="/Logo.png" alt="Qualyserv"/>
          </div>
          <p style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:8 }}>Laboratorio de Análisis Químico</p>
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
            <Bell size={16}/>
            <span style={{flex:1}}>Alertas</span>
            {alertasCount > 0 && (
              <span style={{
                background:'var(--danger)', color:'#fff',
                borderRadius:10, fontSize:10, fontWeight:600,
                padding:'1px 6px', minWidth:18, textAlign:'center'
              }}>
                {alertasCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/metodos" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
            <BookOpen size={16}/> Métodos
          </NavLink>
          {puedoHacer(rol, 'exportar') && (
            <NavLink to="/reportes" className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <BarChart2 size={16}/> Reportes
            </NavLink>
          )}
          {puedeAuditoria && (
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
          {puedoHacer(rol, 'gestionarClientes') && (
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
                      background:'rgba(255,255,255,0.15)', color:'#fff', minWidth:0
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
                  {!nombreBloqueado && (
                    <button onClick={iniciarEdicion} title="Editar nombre (solo una vez)"
                      style={{padding:2,border:'none',background:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)',flexShrink:0}}>
                      <Pencil size={11}/>
                    </button>
                  )}
                </div>
              )}
              <div style={{ fontSize:10, fontWeight:500, color: COLORES_ROL[rol] || 'rgba(255,255,255,0.5)' }}>
                {ETIQUETAS_ROL[rol] || 'Cargando...'}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-sm" title="Cerrar sesión"
              style={{ padding:'5px', border:'none', background:'none', color:'rgba(255,255,255,0.5)', flexShrink:0 }}>
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