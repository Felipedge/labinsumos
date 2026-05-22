// src/lib/roles.js
export const ROLES = {
  ADMIN:      'admin',
  JEFE:       'jefe',
  ENCARGADO:  'encargado',
  ANALISTA:   'analista',
  LECTURA:    'lectura',
}

export const PERMISOS = {
  admin: {
    verTodo:           true,
    registrarUso:      true,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         true,
    aprobarInsumos:    true,
    exportar:          true,
    verHistorial:      'todo',
    gestionarUsuarios: true,
    editarDatos:       true,
  },
  jefe: {
    verTodo:           true,
    registrarUso:      true,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         true,
    aprobarInsumos:    true,
    exportar:          true,
    verHistorial:      'todo',
    gestionarUsuarios: false,
    editarDatos:       false,
  },
  encargado: {
    verTodo:           true,
    registrarUso:      true,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         false,
    aprobarInsumos:    false,
    exportar:          true,
    verHistorial:      'propio',
    gestionarUsuarios: false,
    editarDatos:       false,
  },
  analista: {
    verTodo:           true,
    registrarUso:      true,
    verDocumentacion:  true,
    agregarInsumo:     false,
    darDeBaja:         false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      'propio',
    gestionarUsuarios: false,
    editarDatos:       false,
  },
  lectura: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     false,
    darDeBaja:         false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      false,
    gestionarUsuarios: false,
    editarDatos:       false,
  },
}

export function puedoHacer(rol, accion) {
  if (!rol || !PERMISOS[rol]) return false
  return PERMISOS[rol][accion] === true
}

export const JERARQUIA = {
  admin:     4,
  jefe:      3,
  encargado: 2,
  analista:  1,
  lectura:   0,
}

export function puedeAprobarA(rolAprobador, rolIngresador) {
  return (JERARQUIA[rolAprobador] || 0) > (JERARQUIA[rolIngresador] || 0)
}
