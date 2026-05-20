// src/lib/roles.js
export const ROLES = {
  ADMIN:      'admin',
  JEFE:       'jefe',
  ENCARGADO:  'encargado',
  LECTURA:    'lectura',
}

export const PERMISOS = {
  admin: {
    verTodo:          true,
    registrarUso:     true,
    agregarInsumo:    true,
    darDeBaja:        true,
    exportar:         true,
    verHistorial:     'todo',
    gestionarUsuarios: true,
    editarDatos:      true,
  },
  jefe: {
    verTodo:          true,
    registrarUso:     true,
    agregarInsumo:    true,
    darDeBaja:        true,
    exportar:         true,
    verHistorial:     'todo',
    gestionarUsuarios: false,
    editarDatos:      false,
  },
  encargado: {
    verTodo:          true,
    registrarUso:     true,
    agregarInsumo:    true,
    darDeBaja:        false,
    exportar:         false,
    verHistorial:     'propio',
    gestionarUsuarios: false,
    editarDatos:      false,
  },
  lectura: {
    verTodo:          true,
    registrarUso:     false,
    agregarInsumo:    false,
    darDeBaja:        false,
    exportar:         false,
    verHistorial:     false,
    gestionarUsuarios: false,
    editarDatos:      false,
  },
}

export function puedoHacer(rol, accion) {
  if (!rol || !PERMISOS[rol]) return false
  return PERMISOS[rol][accion] === true
}
