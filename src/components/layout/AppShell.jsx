// src/components/layout/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { puedoHacer } from '../../lib/roles'
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  LayoutDashboard, FlaskConical, Cylinder, Droplets,
  Pill, Bell, ScanLine, LogOut, Users, BookOpen,
  ClipboardCheck, Pencil, Check, X
} from 'lucide-react'

const ETIQUETAS_ROL = {
  admin:     'Administrador',
  jefe:      'Jefe de laboratorio',
  encargado: 'Encargado de insumos',
  analista:  'Analista',
  lectura:   'Solo lectura',
}

const COLORES_ROL = {
  admin:     '#A32D2D',
  jefe:      '#185FA5',
  encargado: '#3B6D11',
  analista:  '#3C3489',
  lectura:   '#6b6860',
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const { rol }          = useRole()
  const navigate         = useNavigate()

  const [pendientes, setPendientes]
