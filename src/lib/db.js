// src/lib/db.js
// Todas las operaciones de base de datos centralizadas aquí
import {
  collection, doc, addDoc, updateDoc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
  onSnapshot, limit
} from 'firebase/firestore'
import { db } from './firebase'
import { getAuth } from 'firebase/auth'
 
// ─────────────────────────────────────────────────────────────
// AUDIT TRAIL — CFR 21 Parte 11 §11.10(e)
// ─────────────────────────────────────────────────────────────
async function registrarAudit({ coleccion, documentoId, accion, antes = null, despues = null, detalle = '' }) {
  try {
    const user = getAuth().currentUser
    await addDoc(collection(db, 'audit_log'), {
      coleccion, documentoId, accion, antes, despues, detalle,
      usuario:   user?.displayName || user?.email || 'sistema',
      email:     user?.email || 'sistema',
      uid:       user?.uid || '',
      timestamp: serverTimestamp(),
    })
  } catch(e) {
    console.error('[Audit] Error registrando:', e.message)
  }
}
 
// ─────────────────────────────────────────────────────────────
// ESTÁNDARES
// ─────────────────────────────────────────────────────────────
export const estandaresCol = () => collection(db, 'estandares')
 
export async function getEstandares(filtros = {}) {
  const constraints = [orderBy('nombre')]
  if (filtros.estado)  constraints.push(where('estado',  '==', filtros.estado))
  if (filtros.cliente) constraints.push(where('cliente', '==', filtros.cliente))
  if (filtros.sector)  constraints.push(where('sector',  '==', filtros.sector))
  const snap = await getDocs(query(collection(db, 'estandares'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
export async function crearEstandar(data, usuarioEmail) {
  const ref = await addDoc(collection(db, 'estandares'), {
    ...data,
    creadoPor:     usuarioEmail,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
  await registrarAudit({
    coleccion: 'estandares', documentoId: ref.id, accion: 'crear',
    despues:   { codigo: data.codigo, nombre: data.nombre, cliente: data.cliente, estado: data.estado },
    detalle:   `Estándar creado: ${data.codigo}`,
  })
  return ref
}
 
export async function registrarPesada({ estandarId, mgPesados, nAnalisis, producto, analista, email }) {
  const ref  = doc(db, 'estandares', estandarId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Estándar no encontrado')
  const actual = snap.data()
 
  const nuevoStock  = Math.max(0, (actual.stockRestante || 0) - mgPesados)
  const nuevoEstado = nuevoStock === 0 ? 'Sin stock' : actual.estado
 
  await updateDoc(ref, {
    stockRestante: nuevoStock, estado: nuevoEstado,
    ultimoUso: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
 
  await addDoc(collection(db, 'usos_estandares'), {
    estandarId, codigo: actual.codigo, nombre: actual.nombre, cliente: actual.cliente,
    mgPesados, stockAntes: actual.stockRestante, stockDespues: nuevoStock,
    nAnalisis: nAnalisis || '', producto: producto || '', analista, email,
    fecha: serverTimestamp(),
  })
 
  await registrarAudit({
    coleccion: 'estandares', documentoId: estandarId, accion: 'pesada',
    antes:   { stockRestante: actual.stockRestante, estado: actual.estado },
    despues: { stockRestante: nuevoStock, estado: nuevoEstado },
    detalle: `Pesada de ${mgPesados}mg registrada por ${analista}. N° análisis: ${nAnalisis || '—'}`,
  })
 
  return { nuevoStock, nuevoEstado }
}
 
// ─────────────────────────────────────────────────────────────
// COLUMNAS CROMATOGRÁFICAS
// ─────────────────────────────────────────────────────────────
export async function getColumnas(filtros = {}) {
  const constraints = [orderBy('cliente')]
  if (filtros.cliente) constraints.push(where('cliente', '==', filtros.cliente))
  if (filtros.estado)  constraints.push(where('estado',  '==', filtros.estado))
  const snap = await getDocs(query(collection(db, 'columnas'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
export async function crearColumna(data, usuarioEmail) {
  const ref = await addDoc(collection(db, 'columnas'), {
    ...data,
    inyeccionesAcumuladas: 0,
    historialClientes: [{ cliente: data.cliente, proyecto: data.producto || '', desde: new Date().toISOString() }],
    creadoPor: usuarioEmail, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
  await registrarAudit({
    coleccion: 'columnas', documentoId: ref.id, accion: 'crear',
    despues:   { codigo: data.codigo, cliente: data.cliente, fase: data.fase, estado: data.estado },
    detalle:   `Columna creada: ${data.codigo}`,
  })
  return ref
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
 
  await updateDoc(ref, {
    inyeccionesAcumuladas: nuevasInyecciones, ultimoUso: serverTimestamp(),
    estado: nuevoEstado, actualizadoEn: serverTimestamp(),
  })
 
  await addDoc(collection(db, 'usos_columnas'), {
    columnaId, codigo: actual.codigo, fase: actual.fase, tamano: actual.tamanoParticula,
    cliente: actual.cliente, inyecciones, totalAcum: nuevasInyecciones,
    nAnalisis: nAnalisis || '', analista, email, fecha: serverTimestamp(),
  })
 
  await registrarAudit({
    coleccion: 'columnas', documentoId: columnaId, accion: 'uso',
    antes:   { inyeccionesAcumuladas: actual.inyeccionesAcumuladas, estado: actual.estado },
    despues: { inyeccionesAcumuladas: nuevasInyecciones, estado: nuevoEstado },
    detalle: `${inyecciones} inyecciones registradas por ${analista}. Total: ${nuevasInyecciones}/${limiteInyecciones}`,
  })
 
  return { nuevasInyecciones, nuevoEstado }
}
 
export async function reasignarColumna(columnaId, { cliente, producto }) {
  const ref  = doc(db, 'columnas', columnaId)
  const snap = await getDoc(ref)
  const data = snap.data()
  const hist = data.historialClientes || []
  hist.push({ cliente, proyecto: producto, desde: new Date().toISOString() })
  await updateDoc(ref, { cliente, producto, historialClientes: hist, actualizadoEn: serverTimestamp() })
  await registrarAudit({
    coleccion: 'columnas', documentoId: columnaId, accion: 'reasignar',
    antes:   { cliente: data.cliente },
    despues: { cliente },
    detalle: `Columna reasignada de ${data.cliente} a ${cliente}`,
  })
}
 
// ─────────────────────────────────────────────────────────────
// REACTIVOS
// ─────────────────────────────────────────────────────────────
export async function getReactivos(filtros = {}) {
  const constraints = [orderBy('nombre')]
  if (filtros.categoria) constraints.push(where('categoria', '==', filtros.categoria))
  const snap = await getDocs(query(collection(db, 'reactivos'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
export async function crearReactivo(data, usuarioEmail) {
  const ref = await addDoc(collection(db, 'reactivos'), {
    ...data, creadoPor: usuarioEmail, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
  await registrarAudit({
    coleccion: 'reactivos', documentoId: ref.id, accion: 'crear',
    despues:   { codigo: data.codigo, nombre: data.nombre, estado: data.estado },
    detalle:   `Reactivo creado: ${data.codigo} — ${data.nombre}`,
  })
  return ref
}
 
export async function registrarRetiroReactivo({ reactivoId, cantidad, unidad, nAnalisis, analista, email }) {
  const ref  = doc(db, 'reactivos', reactivoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Reactivo no encontrado')
  const actual = snap.data()
 
  const nuevoStock  = Math.max(0, (actual.stockRestante || 0) - cantidad)
  const nuevoEstado = nuevoStock === 0 ? 'SIN STOCK' : nuevoStock <= (actual.stockMinimo || 0) ? 'STOCK BAJO' : 'ACTIVO'
 
  await updateDoc(ref, {
    stockRestante: nuevoStock, estado: nuevoEstado,
    ultimoUso: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
 
  await addDoc(collection(db, 'usos_reactivos'), {
    reactivoId, codigo: actual.codigo, nombre: actual.nombre,
    cantidad, unidad: unidad || actual.unidad,
    stockAntes: actual.stockRestante, stockDespues: nuevoStock,
    nAnalisis: nAnalisis || '', analista, email, fecha: serverTimestamp(),
  })
 
  await registrarAudit({
    coleccion: 'reactivos', documentoId: reactivoId, accion: 'retiro',
    antes:   { stockRestante: actual.stockRestante, estado: actual.estado },
    despues: { stockRestante: nuevoStock, estado: nuevoEstado },
    detalle: `Retiro de ${cantidad} ${unidad || actual.unidad} por ${analista}. N° análisis: ${nAnalisis || '—'}`,
  })
 
  return { nuevoStock, nuevoEstado }
}
 
// ─────────────────────────────────────────────────────────────
// PLACEBO
// ─────────────────────────────────────────────────────────────
export async function getPlacebos(filtros = {}) {
  const constraints = [orderBy('cliente')]
  if (filtros.cliente) constraints.push(where('cliente', '==', filtros.cliente))
  const snap = await getDocs(query(collection(db, 'placebo'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
export async function crearPlacebo(data, usuarioEmail) {
  const ref = await addDoc(collection(db, 'placebo'), {
    ...data, creadoPor: usuarioEmail, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
  await registrarAudit({
    coleccion: 'placebo', documentoId: ref.id, accion: 'crear',
    despues:   { codigo: data.codigo, productoReferencia: data.productoReferencia, cliente: data.cliente },
    detalle:   `Placebo creado: ${data.codigo} — ${data.productoReferencia}`,
  })
  return ref
}
 
export async function registrarUsoPlacebo({ placeboId, unidades, nAnalisis, analista, email }) {
  const ref  = doc(db, 'placebo', placeboId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Placebo no encontrado')
  const actual = snap.data()
 
  const nuevoStock  = Math.max(0, (actual.stockUnidades || 0) - unidades)
  const nuevoEstado = nuevoStock === 0 ? 'SIN STOCK' : actual.estado
 
  await updateDoc(ref, {
    stockUnidades: nuevoStock, ultimoUso: serverTimestamp(),
    estado: nuevoEstado, actualizadoEn: serverTimestamp(),
  })
 
  await addDoc(collection(db, 'usos_placebo'), {
    placeboId, codigo: actual.codigo, productoReferencia: actual.productoReferencia,
    cliente: actual.cliente, unidades, stockAntes: actual.stockUnidades, stockDespues: nuevoStock,
    nAnalisis: nAnalisis || '', analista, email, fecha: serverTimestamp(),
  })
 
  await registrarAudit({
    coleccion: 'placebo', documentoId: placeboId, accion: 'uso',
    antes:   { stockUnidades: actual.stockUnidades, estado: actual.estado },
    despues: { stockUnidades: nuevoStock, estado: nuevoEstado },
    detalle: `${unidades} unidades usadas por ${analista}. N° análisis: ${nAnalisis || '—'}`,
  })
 
  return { nuevoStock, nuevoEstado }
}
 
// ─────────────────────────────────────────────────────────────
// APIs — PRINCIPIOS ACTIVOS
// ─────────────────────────────────────────────────────────────
export async function getAPIs(filtros = {}) {
  const constraints = [orderBy('nombre')]
  if (filtros.laboratorio) constraints.push(where('laboratorio', '==', filtros.laboratorio))
  const snap = await getDocs(query(collection(db, 'apis'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
export async function registrarPesadaAPI({ apiId, mgPesados, nAnalisis, producto, analista, email }) {
  const ref  = doc(db, 'apis', apiId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('API no encontrado')
  const actual = snap.data()
 
  const stockActual = actual.stockRestante ?? actual.cantidadRecibida ?? 0
  const nuevoStock  = Math.max(0, parseFloat(stockActual) - mgPesados)
  const nuevoEstado = nuevoStock === 0 ? 'SIN STOCK' : actual.estado
 
  await updateDoc(ref, {
    stockRestante: nuevoStock, estado: nuevoEstado,
    ultimoUso: serverTimestamp(), actualizadoEn: serverTimestamp(),
  })
 
  await addDoc(collection(db, 'usos_apis'), {
    apiId, codigo: actual.codigo, nombre: actual.nombre, laboratorio: actual.laboratorio,
    mgPesados, stockAntes: stockActual, stockDespues: nuevoStock,
    nAnalisis: nAnalisis || '', producto: producto || '', analista, email,
    fecha: serverTimestamp(),
  })
 
  await registrarAudit({
    coleccion: 'apis', documentoId: apiId, accion: 'pesada',
    antes:   { stockRestante: stockActual, estado: actual.estado },
    despues: { stockRestante: nuevoStock, estado: nuevoEstado },
    detalle: `Pesada de ${mgPesados}mg de API registrada por ${analista}. N° análisis: ${nAnalisis || '—'}`,
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
  if (dias < 0)            return { texto: 'Vencido',      color: 'danger',  dias }
  if (dias <= diasCritico) return { texto: `${dias} días`, color: 'danger',  dias }
  if (dias <= diasAdv)     return { texto: `${dias} días`, color: 'warning', dias }
  return                          { texto: `${dias} días`, color: 'success', dias }
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
 
export async function getUsosRecientes(col = 'usos_estandares', limitN = 50) {
  const snap = await getDocs(
    query(collection(db, col), orderBy('fecha', 'desc'), limit(limitN))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
// ─────────────────────────────────────────────────────────────
// AUDIT LOG — consulta (solo Admin y Jefe)
// ─────────────────────────────────────────────────────────────
export async function getAuditLog({ coleccion, accion, limitN = 100 } = {}) {
  const constraints = [orderBy('timestamp', 'desc'), limit(limitN)]
  if (coleccion) constraints.push(where('coleccion', '==', coleccion))
  if (accion)    constraints.push(where('accion',    '==', accion))
  const snap = await getDocs(query(collection(db, 'audit_log'), ...constraints))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
 
// Listener en tiempo real para el dashboard
export function suscribirAlertas(callback) {
  return onSnapshot(
    query(collection(db, 'estandares'), where('estado', 'in', ['En uso', 'Cerrado'])),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}