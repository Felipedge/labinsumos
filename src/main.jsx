
// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { RoleProvider } from './hooks/useRole.jsx'
import AppShell from './components/layout/AppShell.jsx'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import Estandares from './pages/Estandares'
import Columnas from './pages/Columnas'
import Reactivos from './pages/Reactivos'
import Placebo from './pages/Placebo'
import Alertas from './pages/Alertas'
import Escanear from './pages/Escanear'
import Usuarios from './pages/Usuarios'
import './index.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <RoleProvider>
                <AppShell />
              </RoleProvider>
            </ProtectedRoute>
          }>
            <Route index              element={<Dashboard />} />
            <Route path="estandares" element={<Estandares />} />
            <Route path="columnas"   element={<Columnas />} />
            <Route path="reactivos"  element={<Reactivos />} />
            <Route path="placebo"    element={<Placebo />} />
            <Route path="alertas"    element={<Alertas />} />
            <Route path="escanear"   element={<Escanear />} />
            <Route path="usuarios"   element={<Usuarios />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
