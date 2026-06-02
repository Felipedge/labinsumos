// src/lib/roles.js
 
export const ROLES = {
  ADMIN:      'admin',
  JEFE:       'jefe',
  ENCARGADO:  'encargado',
  ANALISTA:   'analista',
  RECEPCION:  'recepcion',
  LECTURA:    'lectura',
}
 
export const ETIQUETAS_ROL = {
  admin:     'Administrador',
  jefe:      'Jefe de laboratorio',
  encargado: 'Encargado de insumos',
  analista:  'Analista',
  recepcion: 'Recepción',
  lectura:   'Solo lectura',
}
 
export const COLORES_ROL = {
  admin:     '#A32D2D',
  jefe:      '#185FA5',
  encargado: '#3B6D11',
  analista:  '#3C3489',
  recepcion: '#854F0B',
  lectura:   '#6b6860',
}
 
export const PERMISOS = {
  admin: {
    verTodo:              true,
    registrarUso:         false,  // solo analista
    verDocumentacion:     true,
    agregarInsumo:        true,
    darDeBaja:            true,
    aprobarInsumos:       true,
    exportar:             true,
    verHistorial:         'todo',
    gestionarUsuarios:    true,
    editarDatos:          true,
    verAuditoria:         true,
    gestionarClientes:    true,
  },
  jefe: {
    verTodo:              true,
    registrarUso:         false,
    verDocumentacion:     true,
    agregarInsumo:        true,   // con aprobación de Admin
    darDeBaja:            true,   // con aprobación de Admin
    aprobarInsumos:       true,   // aprueba a Encargado y Recepción
    exportar:             true,
    verHistorial:         'todo',
    gestionarUsuarios:    false,
    editarDatos:          false,
    verAuditoria:         true,
    gestionarClientes:    true,
  },
  encargado: {
    verTodo:              true,
    registrarUso:         false,
    verDocumentacion:     true,
    agregarInsumo:        true,   // con aprobación de Jefe o Admin
    darDeBaja:            true,   // con aprobación de Jefe o Admin
    aprobarInsumos:       true,   // aprueba a Recepción
    exportar:             true,
    verHistorial:         'todo',
    gestionarUsuarios:    false,
    editarDatos:          false,
    verAuditoria:         true,
    gestionarClientes:    false,
  },
  analista: {
    verTodo:              true,
    registrarUso:         true,   // único rol que puede registrar pesadas/usos
    verDocumentacion:     true,
    agregarInsumo:        false,
    darDeBaja:            false,
    aprobarInsumos:       false,
    exportar:             false,
    verHistorial:         'propio',
    gestionarUsuarios:    false,
    editarDatos:          false,
    verAuditoria:         false,
    gestionarClientes:    false,
  },
  recepcion: {
    verTodo:              true,
    registrarUso:         false,
    verDocumentacion:     true,
    agregarInsumo:        true,   // puede ingresar insumos (quedan pendientes de aprobación)
    darDeBaja:            false,
    aprobarInsumos:       false,
    exportar:             false,
    verHistorial:         'propio',
    gestionarUsuarios:    false,
    editarDatos:          false,
    verAuditoria:         false,
    gestionarClientes:    false,
  },
  lectura: {
    verTodo:              true,
    registrarUso:         false,
    verDocumentacion:     true,
    agregarInsumo:        false,
    darDeBaja:            false,
    aprobarInsumos:       false,
    exportar:             false,
    verHistorial:         false,
    gestionarUsuarios:    false,
    editarDatos:          false,
    verAuditoria:         false,
    gestionarClientes:    false,
  },
}
 
export function puedoHacer(rol, accion) {
  if (!rol || !PERMISOS[rol]) return false
  return PERMISOS[rol][accion] === true
}
 
// Jerarquía para flujo de aprobaciones
export const JERARQUIA = {
  admin:     5,
  jefe:      4,
  encargado: 3,
  analista:  2,
  recepcion: 1,
  lectura:   0,
}
 
export function puedeAprobarA(rolAprobador, rolIngresador) {
  return (JERARQUIA[rolAprobador] || 0) > (JERARQUIA[rolIngresador] || 0)
}