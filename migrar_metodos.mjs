// migrar_metodos.mjs
// ─────────────────────────────────────────────────────────────
// Script de migración: carga los 193 métodos analíticos
// desde el JSON procesado del Excel a Firestore
//
// INSTRUCCIONES:
//   1. Copiar este archivo a la raíz del proyecto labinsumos
//   2. Copiar metodos_data.json a la raíz del proyecto
//   3. Asegurarse de tener el archivo .env con las credenciales
//   4. Ejecutar: node migrar_metodos.mjs
// ─────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc,
         getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { readFileSync } from 'fs'

// ── Credenciales Firebase (las mismas de src/lib/firebase.js) ─
const firebaseConfig = {
  apiKey:            "AIzaSyA9Ko7joxu0jQjr1v388-GZmrs5YnEK_pQ",
  authDomain:        "labinsumos-fqval.firebaseapp.com",
  projectId:         "labinsumos-fqval",
  storageBucket:     "labinsumos-fqval.firebasestorage.app",
  messagingSenderId: "549494651580",
  appId:             "1:549494651580:web:4b5e982a0f1a3138786eb9",
}

const app = initializeApp(firebaseConfig)
const db  = getFirestore(app)

// ── Leer datos del JSON ───────────────────────────────────────
const metodos = JSON.parse(readFileSync('./metodos_data.json', 'utf8'))
console.log(`📋 Métodos a migrar: ${metodos.length}`)

// ── Migrar ────────────────────────────────────────────────────
async function migrar() {
  let exito = 0, omitidos = 0, errores = 0

  for (const m of metodos) {
    try {
      // Verificar si ya existe para no duplicar
      const existe = await getDocs(
        query(collection(db, 'metodos'),
          where('producto', '==', m.producto),
          where('cliente',  '==', m.cliente))
      )

      if (!existe.empty) {
        console.log(`⚠️  Omitido (ya existe): ${m.producto} — ${m.cliente}`)
        omitidos++
        continue
      }

      await addDoc(collection(db, 'metodos'), {
        ...m,
        creadoPor:    'migracion_excel',
        creadoEn:     serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      })

      console.log(`✅ ${m.producto} — ${m.cliente}`)
      exito++

      // Pausa pequeña para no saturar Firestore
      await new Promise(r => setTimeout(r, 80))

    } catch(e) {
      console.error(`❌ Error en ${m.producto}: ${e.message}`)
      errores++
    }
  }

  console.log('\n─────────────────────────────────────')
  console.log(`✅ Migrados:  ${exito}`)
  console.log(`⚠️  Omitidos: ${omitidos}`)
  console.log(`❌ Errores:   ${errores}`)
  console.log('─────────────────────────────────────')
  process.exit(0)
}

migrar().catch(e => { console.error(e); process.exit(1) })
