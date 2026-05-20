// src/components/layout/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import {
  LayoutDashboard, FlaskConical, Cylinder, Droplets,
  Pill, Bell, ScanLine, LogOut
} from 'lucide-react'

const NAV = [
  { to: '/',           label: 'Inicio',    icon: LayoutDashboard, section: 'Principal' },
  { to: '/escanear',   label: 'Escanear',  icon: ScanLine },
  { to: '/estandares', label: 'Estándares',icon: FlaskConical,    section: 'Módulos' },
  { to: '/columnas',   label: 'Columnas',  icon: Cylinder },
  { to: '/reactivos',  label: 'Reactivos', icon: Droplets },
  { to: '/placebo',    label: 'Placebo',   icon: Pill },
  { to: '/alertas',    label: 'Alertas',   icon: Bell,            section: 'Sistema' },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U'

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>LabInsumos</h1>
          <p>FQ / VAL · LI-P-LQS-003</p>
        </div>

        <nav>
          {NAV.map(({ to, label, icon: Icon, section }) => (
            <div key={to}>
              {section && <div className="nav-section">{section}</div>}
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">
              {user?.photoURL
                ? <img src={user.photoURL} alt={initials} />
                : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.displayName || 'Analista'}
              </div>
              <div className="user-email" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.email}
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
          <span className="topbar-title" id="page-title">Gestión de insumos</span>
          <div className="topbar-actions">
            <NavLink to="/escanear" className="btn btn-primary btn-sm">
              <ScanLine size={14} /> Escanear QR
            </NavLink>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
