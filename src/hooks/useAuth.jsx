// src/hooks/useAuth.jsx
import { useState, useEffect, createContext, useContext } from 'react'
import { onAuthStateChanged, signInWithPopup, signInWithRedirect,
         getRedirectResult, signOut } from 'firebase/auth'
import { auth, provider } from '../lib/firebase'

const AuthContext = createContext(null)

// Detectar iOS
function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Capturar resultado del redirect (solo iOS)
    getRedirectResult(auth).catch(() => {})

    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  const login = () => {
    if (esIOS()) {
      return signInWithRedirect(auth, provider)
    }
    return signInWithPopup(auth, provider)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)