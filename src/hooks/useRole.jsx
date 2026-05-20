// src/hooks/useRole.jsx
import { useState, useEffect, createContext, useContext } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth.jsx'
import { ROLES } from '../lib/roles'

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const { user } = useAuth()
  const [rol, setRol]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setRol(null); setLoading(false); return }

    async function cargarRol() {
      try {
        const ref  = doc(db, 'usuarios', user.uid)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          setRol(snap.data().rol)
        } else {
          // Verificar si es el primer usuario → asignar admin
          const { getDocs, collection } = await import('firebase/firestore')
          const todos = await getDocs(collection(db, 'usuarios'))

          const nuevoRol = todos.empty ? ROLES.ADMIN : ROLES.LECTURA

          await setDoc(ref, {
            uid:       user.uid,
            email:     user.email,
            nombre:    user.displayName || user.email,
            foto:      user.photoURL || '',
            rol:       nuevoRol,
            creadoEn:  new Date().toISOString(),
          })
          setRol(nuevoRol)
        }
      } catch (err) {
        console.error('Error cargando rol:', err)
        setRol(ROLES.LECTURA)
      } finally {
        setLoading(false)
      }
    }

    cargarRol()
  }, [user])

  return (
    <RoleContext.Provider value={{ rol, loading }}>
      {children}
    </RoleContext.Provider>
  )
}

export const useRole = () => useContext(RoleContext)
