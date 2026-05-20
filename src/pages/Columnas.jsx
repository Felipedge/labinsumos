// src/pages/Columnas.jsx
import { useState, useEffect } from 'react'
import { getColumnas, crearColumna, registrarUsoColumna, calcularSemaforoColumna } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { Plus } from 'lucide-react'

const CLIENTES  = ['Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Prater','Otro']
const FASES     = ['C18','C8','C4','NH2','CN','Silica','RP-18','Phenyl','Otro']
const TAMANOS   = ['1.8µm','3µm','3.5µm','5µm','10µm']

function ProgBar({ pct }) {
  const cls = pct >= 0.9 ? 'danger' : pct >= 0.75 ? 'warn' : 'ok'
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div className="prog" style={{ flex:1 }}>
          <div className={`prog-fill ${cls}`} style={{ width:`${Math.min(100, Math.round(pct*100))}%` }} />
        </div>
        <span style={{ fontSize:11, color:'var(--text-2)', minWidth:32 }}>{Math.round(pct*100)}%</span>
      </div>
    </div>
  )
}

export default function Columnas() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const puedeAgregar = puedoHacer(rol, 'agregarInsumo')
  const puedeOperar  = puedoHacer(rol, 'registrarUso')

  const [columnas, setColumnas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [useForm, setUseForm]   = useState(null)
  const [form, setForm]         = useState({})
  const [msg, setMsg]           = useState('')

  const load = async () => {
    try { setColumnas(await getColumnas()) }
    catch { setColumnas(DEMO) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardarColumna = async () => {
    if (!form.codigo || !form.cliente || !form.fase) { setMsg('Completa los campos obligatorios'); return }
    try {
      await crearColumna({
        codigo:            form.codigo,
        cliente:           form.cliente,
        producto:          form.producto || '',
        fase:              form.fase,
        tamanoParticula:   form.tamano || '5µm',
        dimensiones:       form.dimensiones || '',
        fabricante:        form.fabricante || '',
        limiteInyecciones: parseInt(form.limite) || 1500,
        fechaPrimerUso:    form.fechaPrimerUso || new Date().toISOString().split('T')[0],
        estado:            'ACTIVA',
      }, user.email)
      setShowForm(false); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  const registrarUso = async () => {
    if (!useForm || !form.inyecciones) { setMsg('Ingresa el número de inyecciones'); return }
    try {
      await registrarUsoColumna({
        columnaId:   useForm.id,
        inyecciones: parseInt(form.inyecciones),
        nAnalisis:   form.nAnalisis || '',
        analista:    user.displayName || user.email,
        email:       user.email,
      })
      setUseForm(null); setForm({}); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:600 }}>Columnas cromatográficas</h2>
        {puedeAgregar && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); setUseForm(null); setForm({}) }}>
            <Plus size={14} /> Nueva columna
          </button>
        )}
      </div>

      {showForm && puedeAgregar && (
        <div className="card">
          <div className="card-title">Registrar nueva columna</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>Código interno *</label><input placeholder="ej: COL-031" onChange={f('codigo')} /></div>
            <div className="form-group"><label>Cliente *</label>
              <select onChange={f('cliente')}><option value="">Seleccionar...</option>{CLIENTES.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div className="form-group"><label>Producto / método</label><input placeholder="ej: Cilosvitae 100 — Valoración" onChange={f('producto')} /></div>
            <div className="form-group"><label>Fase estacionaria *</label>
              <select onChange={f('fase')}><option value="">Seleccionar...</option>{FASES.map(f=><option key={f}>{f}</option>)}</select>
            </div>
            <div className="form-group"><label>Tamaño de partícula</label>
              <select onChange={f('tamano')}>{TAMANOS.map(t=><option key={t}>{t}</option>)}</select>
            </div>
            <div className="form-group"><label>Dimensiones (mm)</label><input placeholder="ej: 150 x 4.6" onChange={f('dimensiones')} /></div>
            <div className="form-group"><label>Fabricante</label><input placeholder="ej: Waters, Agilent, Phenomenex" onChange={f('fabricante')} /></div>
            <div className="form-group"><label>Límite de inyecciones</label><input type="number" defaultValue={1500} onChange={f('limite')} /></div>
            <div className="form-group"><label>Fecha primer uso</label><input type="date" onChange={f('fechaPrimerUso')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={guardarColumna}>Guardar columna</button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      {useForm && puedeOperar && (
        <div className="card">
          <div className="card-title">Registrar uso — {useForm.codigo}</div>
          {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
          <div className="form-grid">
            <div className="form-group"><label>N° inyecciones hoy *</label><input type="number" placeholder="ej: 12" onChange={f('inyecciones')} /></div>
            <div className="form-group"><label>N° de análisis</label><input placeholder="ej: 26324" onChange={f('nAnalisis')} /></div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={registrarUso}>Confirmar</button>
            <button className="btn btn-sm" onClick={() => { setUseForm(null); setForm({}); setMsg('') }}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Fase / tamaño</th><th>Cliente</th>
              <th>Primer uso</th><th>Último uso</th>
              <th>Inyecciones</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {columnas.map(c => {
              const sem = calcularSemaforoColumna(c.inyeccionesAcumuladas || 0, c.limiteInyecciones || 1500)
              const badgeCls = sem.color === 'danger' ? 'badge-danger' : sem.color === 'warning' ? 'badge-warn' : 'badge-ok'
              return (
                <tr key={c.id}>
                  <td className="mono">{c.codigo}</td>
                  <td><span className="badge badge-purple">{c.fase} · {c.tamanoParticula}</span></td>
                  <td>{c.cliente}</td>
                  <td style={{ color:'var(--text-2)' }}>{c.fechaPrimerUso || '—'}</td>
                  <td style={{ color:'var(--text-2)' }}>{c.ultimoUso ? new Date(c.ultimoUso?.seconds*1000).toLocaleDateString('es-CL') : '—'}</td>
                  <td style={{ minWidth:120 }}>
                    <div style={{ fontSize:12, marginBottom:4 }}>
                      <strong>{c.inyeccionesAcumuladas || 0}</strong>
                      <span style={{ color:'var(--text-3)' }}> / {c.limiteInyecciones || 1500}</span>
                    </div>
                    <ProgBar pct={(c.inyeccionesAcumuladas || 0) / (c.limiteInyecciones || 1500)} />
                  </td>
                  <td><span className={`badge ${badgeCls}`}>{c.estado}</span></td>
                  <td>
                    {puedeOperar && (
                      <button className="btn btn-sm" onClick={() => { setUseForm(c); setShowForm(false); setForm({}) }}>
                        Registrar uso
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const DEMO = [
  { id:'1', codigo:'COL-007', fase:'C18', tamanoParticula:'5µm', cliente:'Galenicum', fechaPrimerUso:'2025-01-12', inyeccionesAcumuladas:1240, limiteInyecciones:1500, estado:'CRÍTICA' },
  { id:'2', codigo:'COL-012', fase:'C8',  tamanoParticula:'3.5µm', cliente:'Ascend', fechaPrimerUso:'2024-08-03', inyeccionesAcumuladas:890, limiteInyecciones:1500, estado:'ACTIVA' },
  { id:'3', codigo:'COL-019', fase:'NH2', tamanoParticula:'5µm', cliente:'Laboratorio Chile', fechaPrimerUso:'2025-03-21', inyeccionesAcumuladas:340, limiteInyecciones:1500, estado:'ACTIVA' },
  { id:'4', codigo:'COL-023', fase:'C18', tamanoParticula:'1.8µm', cliente:'Novartis', fechaPrimerUso:'2025-11-07', inyeccionesAcumuladas:180, limiteInyecciones:1500, estado:'ACTIVA' },
]
