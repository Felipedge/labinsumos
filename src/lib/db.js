// src/lib/db.js
// Todas las operaciones de base de datos centralizadas aquí
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
  onSnapshot, limit
} from 'firebase/firestore'
import { db } from './firebase'

// ─────────────────────────────────────────────────────────────
// ESTÁNDARES
// ─────────────────────────────────────────────────────────────
export const estandaresCol = () => collection(db, 'estandares')

export async function getEstandares(filtros = {}) {
  let q = collection(db, 'estandares')
  const constraints = [orderBy('nombre')]
  if (filtros.estado)   constraints.push(where('estado', '==', filtros.estado))
  if (filtros.cliente)  constraints.push(where('cliente', '==', filtros.cliente))
  if (filtros.sector)   constraints.push(where('sector', '==', filtros.sector))
  q = query(q, ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearEstandar(data, usuarioEmail) {
  return addDoc(collection(db, 'estandares'), {
    ...data,
    creadoPor:     usuarioEmail,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

export async function registrarPesada({ estandarId, mgPesados, nAnalisis, producto, analista, email }) {
  const ref  = doc(db, 'estandares', estandarId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Estándar no encontrado')
  const actual = snap.data()

  const nuevoStock  = Math.max(0, (actual.stockRestante || 0) - mgPesados)
  const nuevoEstado = nuevoStock === 0 ? 'Sin stock' : actual.estado

  // Actualizar stock del estándar
  await updateDoc(ref, {
    stockRestante: nuevoStock,
    estado:        nuevoEstado,
    ultimoUso:     serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  // Registrar en historial de usos
  await addDoc(collection(db, 'usos_estandares'), {
    estandarId,
    codigo:       actual.codigo,
    nombre:       actual.nombre,
    cliente:      actual.cliente,
    mgPesados,
    stockAntes:   actual.stockRestante,
    stockDespues: nuevoStock,
    nAnalisis:    nAnalisis || '',
    producto:     producto || '',
    analista,
    email,
    fecha:        serverTimestamp(),
  })

  return { nuevoStock, nuevoEstado }
}

// ─────────────────────────────────────────────────────────────
// COLUMNAS CROMATOGRÁFICAS
// ─────────────────────────────────────────────────────────────
export async function getColumnas(filtros = {}) {
  let constraints = [orderBy('cliente')]
  if (filtros.cliente) constraints.push(where('cliente', '==', filtros.cliente))
  if (filtros.estado)  constraints.push(where('estado',  '==', filtros.estado))
  const q = query(collection(db, 'columnas'), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearColumna(data, usuarioEmail) {
  return addDoc(collection(db, 'columnas'), {
    ...data,
    inyeccionesAcumuladas: 0,
    historialClientes: [{ cliente: data.cliente, proyecto: data.producto || '', desde: new Date().toISOString() }],
    creadoPor:     usuarioEmail,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

export async function registrarUsoColumna({ columnaId, inyecciones, nAnalisis, analista, email }) {
  const ref  = doc(db, 'columnas', columnaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Columna no encontrada')
  const actual = snap.data()

  const nuevasInyecciones = (actual.inyeccionesAcumuladas || 0) + inyecciones
  const limiteInyecciones = actual.limiteInyecciones || 1500
  const pct = nuevasInyecciones / limiteInyecciones
  const nuevoEstado = pct >= 1 ? 'DADA DE BAJA' : pct >= 0.9 ? 'CRÍTICA' : 'ACTIVA'

  // Actualizar columna
  await updateDoc(ref, {
    inyeccionesAcumuladas: nuevasInyecciones,
    ultimoUso:             serverTimestamp(),
    estado:                nuevoEstado,
    actualizadoEn:         serverTimestamp(),
  })

  // Registrar en historial
  await addDoc(collection(db, 'usos_columnas'), {
    columnaId,
    codigo:       actual.codigo,
    fase:         actual.fase,
    tamano:       actual.tamanoParticula,
    cliente:      actual.cliente,
    inyecciones,
    totalAcum:    nuevasInyecciones,
    nAnalisis:    nAnalisis || '',
    analista,
    email,
    fecha:        serverTimestamp(),
  })

  return { nuevasInyecciones, nuevoEstado }
}

// Reasignar columna a nuevo cliente/proyecto (sin perder historial)
export async function reasignarColumna(columnaId, { cliente, producto }) {
  const ref  = doc(db, 'columnas', columnaId)
  const snap = await getDoc(ref)
  const hist = snap.data().historialClientes || []
  hist.push({ cliente, proyecto: producto, desde: new Date().toISOString() })
  await updateDoc(ref, {
    cliente,
    producto,
    historialClientes: hist,
    actualizadoEn:     serverTimestamp(),
  })
}

// ─────────────────────────────────────────────────────────────
// REACTIVOS
// ─────────────────────────────────────────────────────────────
export async function getReactivos(filtros = {}) {
  let constraints = [orderBy('nombre')]
  if (filtros.categoria) constraints.push(where('categoria', '==', filtros.categoria))
  const q = query(collection(db, 'reactivos'), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearReactivo(data, usuarioEmail) {
  return addDoc(collection(db, 'reactivos'), {
    ...data,
    creadoPor:     usuarioEmail,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

export async function registrarRetiroReactivo({ reactivoId, cantidad, unidad, nAnalisis, analista, email }) {
  const ref  = doc(db, 'reactivos', reactivoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Reactivo no encontrado')
  const actual = snap.data()

  const nuevoStock  = Math.max(0, (actual.stockRestante || 0) - cantidad)
  const nuevoEstado = nuevoStock === 0           ? 'SIN STOCK'
    : nuevoStock <= (actual.stockMinimo || 0)    ? 'STOCK BAJO'
    : 'ACTIVO'

  // Actualizar reactivo
  await updateDoc(ref, {
    stockRestante: nuevoStock,
    estado:        nuevoEstado,
    ultimoUso:     serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  // Registrar en historial
  await addDoc(collection(db, 'usos_reactivos'), {
    reactivoId,
    codigo:       actual.codigo,
    nombre:       actual.nombre,
    cantidad,
    unidad:       unidad || actual.unidad,
    stockAntes:   actual.stockRestante,
    stockDespues: nuevoStock,
    nAnalisis:    nAnalisis || '',
    analista,
    email,
    fecha:        serverTimestamp(),
  })

  return { nuevoStock, nuevoEstado }
}

// ─────────────────────────────────────────────────────────────
// PLACEBO
// ─────────────────────────────────────────────────────────────
export async function getPlacebos(filtros = {}) {
  let constraints = [orderBy('cliente')]
  if (filtros.cliente) constraints.push(where('cliente', '==', filtros.cliente))
  const q = query(collection(db, 'placebo'), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearPlacebo(data, usuarioEmail) {
  return addDoc(collection(db, 'placebo'), {
    ...data,
    creadoPor:     usuarioEmail,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

export async function registrarUsoPlacebo({ placeboId, unidades, nAnalisis, analista, email }) {
  const ref  = doc(db, 'placebo', placeboId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Placebo no encontrado')
  const actual = snap.data()

  const nuevoStock  = Math.max(0, (actual.stockUnidades || 0) - unidades)
  const nuevoEstado = nuevoStock === 0 ? 'SIN STOCK' : actual.estado

  // Actualizar placebo
  await updateDoc(ref, {
    stockUnidades: nuevoStock,
    ultimoUso:     serverTimestamp(),
    estado:        nuevoEstado,
    actualizadoEn: serverTimestamp(),
  })

  // Registrar en historial
  await addDoc(collection(db, 'usos_placebo'), {
    placeboId,
    codigo:             actual.codigo,
    productoReferencia: actual.productoReferencia,
    cliente:            actual.cliente,
    unidades,
    stockAntes:         actual.stockUnidades,
    stockDespues:       nuevoStock,
    nAnalisis:          nAnalisis || '',
    analista,
    email,
    fecha:              serverTimestamp(),
  })

  return { nuevoStock, nuevoEstado }
}

// ─────────────────────────────────────────────────────────────
// ALERTAS (calculadas en cliente)
// ─────────────────────────────────────────────────────────────
export function calcularSemaforo(fechaVencimiento, diasCritico = 30, diasAdv = 60) {
  if (!fechaVencimiento) return { texto: 'Sin fecha', color: 'gray', dias: null }
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0)
  const vence = fechaVencimiento instanceof Date ? fechaVencimiento : new Date(fechaVencimiento)
  const dias  = Math.round((vence - hoy) / 86400000)
  if (dias < 0)            return { texto: 'Vencido',       color: 'danger',  dias }
  if (dias <= diasCritico) return { texto: `${dias} días`,  color: 'danger',  dias }
  if (dias <= diasAdv)     return { texto: `${dias} días`,  color: 'warning', dias }
  return                          { texto: `${dias} días`,  color: 'success', dias }
}

export function calcularSemaforoColumna(inyecciones, limite = 1500) {
  const pct = inyecciones / limite
  if (pct >= 1)    return { texto: 'Límite alcanzado', color: 'danger',  pct }
  if (pct >= 0.9)  return { texto: 'Crítica (>90%)',   color: 'danger',  pct }
  if (pct >= 0.75) return { texto: 'Advertencia',      color: 'warning', pct }
  return                  { texto: 'Vigente',           color: 'success', pct }
}

// ─────────────────────────────────────────────────────────────
// HISTORIAL DE USOS
// ─────────────────────────────────────────────────────────────
export async function getUsosPorInsumo(insumoId, coleccion = 'usos_estandares', limitN = 20) {
  const q = query(
    collection(db, coleccion),
    where('insumoId', '==', insumoId),
    orderBy('fecha', 'desc'),
    limit(limitN)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getUsosRecientes(coleccion = 'usos_estandares', limitN = 50) {
  const q = query(collection(db, coleccion), orderBy('fecha', 'desc'), limit(limitN))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Listener en tiempo real para el dashboard
export function suscribirAlertas(callback) {
  return onSnapshot(
    query(collection(db, 'estandares'), where('estado', 'in', ['En uso', 'Cerrado'])),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}
