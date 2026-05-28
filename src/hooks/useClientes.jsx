// src/hooks/useClientes.jsx
// Hook para cargar la lista de clientes desde Firestore
// Se usa en Estándares, Columnas, Reactivos, Placebo y APIs

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'

// Fallback por si Firestore no tiene datos aún
const FALLBACK = [
  'Alembic', 'Andrómaco/Grünenthal', 'Ascend', 'Bamberg', 'Bayer',
  'BBraun', 'Biotec', 'BPH SA.', 'C Y D Pharma', 'Diversey',
  'Emcure', 'Ferre', 'Fresenius Kabi', 'Galenicum', 'ITF Labomed',
  'Laboratorio Chile', 'Laboratorio Fleming', 'LKM', 'MSN', 'Novartis',
  'Prater', 'Qualyserv', 'Richmond', 'Sanitas', 'Saval',
  'Seven Pharma', 'Siron Pharma', 'SIAA Vida Farma', 'Sandoz', 'Unifarma',
]

export function useClientes() {
  const [clientes, setClientes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [siglaMap, setSiglaMap]   = useState({})

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, 'clientes'), orderBy('nombre')))
        if (snap.empty) {
          setClientes(FALLBACK)
          setLoading(false)
          return
        }
        const data = snap.docs.map(d => d.data())
        setClientes(data.map(c => c.nombre))
        // Mapa nombre → sigla para codificación automática
        const map = {}
        data.forEach(c => { map[c.nombre] = c.sigla })
        setSiglaMap(map)
      } catch {
        setClientes(FALLBACK)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { clientes, siglaMap, loading }
}
