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

// src/lib/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            "AIzaSyA9Ko7joxu0jQjr1v388-GZmrs5YnEK_pQ",
  authDomain:        "labinsumos-fqval.firebaseapp.com",
  projectId:         "labinsumos-fqval",
  storageBucket:     "labinsumos-fqval.firebasestorage.app",
  messagingSenderId: "549494651580",
  appId:             "1:549494651580:web:4b5e982a0f1a3138786eb9",
}

const app      = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const db       = getFirestore(app)
export const storage  = getStorage(app)
export const provider = new GoogleAuthProvider()

// Forzar selección de cuenta institucional en cada login
//provider.setCustomParameters({ hd: 'tudominio.cl' }) // ← cambiar al dominio del lab
