// src/components/layout/AppShell.jsx
// src/components/layout/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { puedoHacer, ROLES } from '../../lib/roles'
import {
  LayoutDashboard, FlaskConical, Cylinder, Droplets,
  Pill, Bell, ScanLine, LogOut, Users
} from 'lucide-react'

const ETIQUETAS_ROL = {
  admin:     'Administrador',
  jefe:      'Jefe de laboratorio',
  encargado: 'Encargado de insumos',
  lectura:   'Solo lectura',
}

const COLORES_ROL = {
  admin:     '#A32D2D',
  jefe:      '#185FA5',
  encargado: '#3B6D11',
  lectura:   '#6b6860',
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const { rol } = useRole()
  const navigate = useNavigate()

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U'

  const handleLogout = async () => { await logout(); navigate('/login') }

  const puedeOperar = puedoHacer(rol, 'registrarUso')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo_qualy.png" alt="Qualyserv" style={{ width:'100%', maxWidth:160, marginBottom:6 }} />
          <p style={{ fontSize:10 }}>Laboratorio de Análisis Químico</p>
        </div>

        <nav>
          <div className="nav-section">Principal</div>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <LayoutDashboard size={16} /> Inicio
          </NavLink>

          {puedeOperar && (
            <NavLink to="/escanear" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <ScanLine size={16} /> Escanear
            </NavLink>
          )}

          <div className="nav-section">Módulos</div>
          <NavLink to="/estandares" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <FlaskConical size={16} /> Estándares
          </NavLink>
          <NavLink to="/columnas" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Cylinder size={16} /> Columnas
          </NavLink>
          <NavLink to="/reactivos" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Droplets size={16} /> Reactivos
          </NavLink>
          <NavLink to="/placebo" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Pill size={16} /> Placebo
          </NavLink>

          <div className="nav-section">Sistema</div>
          <NavLink to="/alertas" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Bell size={16} /> Alertas
          </NavLink>

          {puedoHacer(rol, 'gestionarUsuarios') && (
            <NavLink to="/usuarios" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Users size={16} /> Usuarios
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">
              {user?.photoURL
                ? <img src={user.photoURL} alt={initials} />
                : initials}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.displayName || 'Analista'}
              </div>
              <div style={{ fontSize:10, fontWeight:500, color: COLORES_ROL[rol] || 'var(--text-3)' }}>
                {ETIQUETAS_ROL[rol] || 'Cargando...'}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-sm" title="Cerrar sesión" style={{ padding:'5px', border:'none' }}>
              <LogOut size={14} />
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
                <ScanLine size={14} /> Escanear QR
              </NavLink>
            )}
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
