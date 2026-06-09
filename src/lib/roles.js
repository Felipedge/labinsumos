// src/lib/roles.js

export const ROLES = {
  ADMIN:          'admin',
  JEFE:           'jefe',
  COORDINADOR:    'coordinador',
  ANALISTA:       'analista',
  ADMINISTRATIVO: 'administrativo',
  LECTURA:        'lectura',
}

export const ETIQUETAS_ROL = {
  admin:          'Administrador',
  jefe:           'Jefe de laboratorio',
  coordinador:    'Coordinador Pre-analítico',
  analista:       'Analista',
  administrativo: 'Administrativo',
  lectura:        'Solo lectura',
}

export const COLORES_ROL = {
  admin:          '#A32D2D',
  jefe:           '#185FA5',
  coordinador:    '#3B6D11',
  analista:       '#3C3489',
  administrativo: '#854F0B',
  lectura:        '#6b6860',
}

export const PERMISOS = {
  admin: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     false,
    darDeBaja:         false,
    ponerEnUso:        false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      'todo',
    gestionarUsuarios: true,
    editarDatos:       false,
    verAuditoria:      true,
    gestionarClientes: true,
  },
  jefe: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         true,
    ponerEnUso:        true,
    aprobarInsumos:    true,
    exportar:          true,
    verHistorial:      'todo',
    gestionarUsuarios: false,
    editarDatos:       true,
    verAuditoria:      true,
    gestionarClientes: true,
  },
  coordinador: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         true,
    ponerEnUso:        true,
    aprobarInsumos:    true,
    exportar:          true,
    verHistorial:      'todo',
    gestionarUsuarios: false,
    editarDatos:       false,
    verAuditoria:      true,
    gestionarClientes: false,
  },
  analista: {
    verTodo:           true,
    registrarUso:      true,
    verDocumentacion:  true,
    agregarInsumo:     false,
    darDeBaja:         false,
    ponerEnUso:        false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      'todo',
    gestionarUsuarios: false,
    editarDatos:       false,
    verAuditoria:      false,
    gestionarClientes: false,
  },
  administrativo: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     true,
    darDeBaja:         false,
    ponerEnUso:        false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      'todo',
    gestionarUsuarios: false,
    editarDatos:       false,
    verAuditoria:      false,
    gestionarClientes: false,
  },
  lectura: {
    verTodo:           true,
    registrarUso:      false,
    verDocumentacion:  true,
    agregarInsumo:     false,
    darDeBaja:         false,
    ponerEnUso:        false,
    aprobarInsumos:    false,
    exportar:          false,
    verHistorial:      false,
    gestionarUsuarios: false,
    editarDatos:       false,
    verAuditoria:      false,
    gestionarClientes: false,
  },
}

export function puedoHacer(rol, accion) {
  if (!rol || !PERMISOS[rol]) return false
  return PERMISOS[rol][accion] === true
}

// Jerarquía para flujo de aprobaciones
export const JERARQUIA = {
  admin:          5,
  jefe:           4,
  coordinador:    3,
  analista:       2,
  administrativo: 1,
  lectura:        0,
}

export function puedeAprobarA(rolAprobador, rolIngresador) {
  return (JERARQUIA[rolAprobador] || 0) > (JERARQUIA[rolIngresador] || 0)
}