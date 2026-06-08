// src/lib/firebase.js
// ─────────────────────────────────────────────────────────────
// INSTRUCCIONES DE CONFIGURACIÓN:
//   1. Ir a https://console.firebase.google.com
//   2. Crear proyecto "labinsumos-fqval" (o el nombre que prefieran)
//   3. Agregar app web → copiar las credenciales aquí abajo
//   4. En Authentication → Sign-in method → habilitar "Google"
//   5. En Firestore → crear base de datos en modo producción
//   6. En Firestore → Rules → pegar las reglas del archivo
//      firestore.rules que se incluye en este proyecto
// ─────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app      = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const db       = getFirestore(app)
export const storage  = getStorage(app)
export const provider = new GoogleAuthProvider()
