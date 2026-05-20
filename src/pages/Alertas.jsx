// src/pages/Alertas.jsx
import { useState, useEffect } from 'react'
import { getEstandares, getColumnas, getReactivos, getPlacebos, calcularSemaforo, calcularSemaforoColumna } from '../lib/db'
import { FlaskConical, Cylinder, Droplets, Pill, AlertTriangle, Clock } from 'lucide-react'

const ICONOS = { Estándar: FlaskConical, Columna: Cylinder, Reactivo: Droplets, Placebo: Pill }

export default function Alertas() {
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState('todas')

  useEffect(() => {
    async function load() {
      try {
        const [stds, cols, reacts, pls] = await Promise.all([
          getEstandares(), getColumnas(), getReactivos(), getPlacebos()
        ])
        const all = []

        stds.forEach(s => {
          if (s.estado === 'SIN STOCK') return
          const vence = s.fechaVencimiento?.toDate?.() || (s.fechaVencimiento ? new Date(s.fechaVencimiento) : null)
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success') {
            all.push({ tipo:'Estándar', codigo:s.codigo, nombre:s.nombre, cliente:s.cliente, sem,
              detalle:`Stock: ${s.stockRestante ?? '—'} mg`, accion: sem.color==='danger'?'Solicitar reposición urgente':'Planificar reposición o re-test' })
          }
        })
        cols.forEach(c => {
          const sem = calcularSemaforoColumna(c.inyeccionesAcumuladas||0, c.limiteInyecciones||1500)
          if (sem.color !== 'success') {
            all.push({ tipo:'Columna', codigo:c.codigo, nombre:`${c.fase} ${c.tamanoParticula}`, cliente:c.cliente, sem,
              detalle:`${c.inyeccionesAcumuladas||0} / ${c.limiteInyecciones||1500} inyecciones`,
              accion: sem.color==='danger'?'Planificar reemplazo inmediato':'Preparar columna de reemplazo' })
          }
        })
        reacts.forEach(r => {
          const vence = r.fechaVencimiento?.toDate?.() || (r.fechaVencimiento ? new Date(r.fechaVencimiento) : null)
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success' || r.estado === 'STOCK BAJO') {
            all.push({ tipo:'Reactivo', codigo:r.codigo, nombre:r.nombre, cliente:'—', sem,
              detalle:`Stock: ${r.stockRestante ?? '—'} ${r.unidad||''}`, accion:'Reponer stock o verificar alternativo' })
          }
        })
        pls.forEach(p => {
          const vence = p.fechaVencimiento?.toDate?.() || (p.fechaVencimiento ? new Date(p.fechaVencimiento) : null)
          const sem = calcularSemaforo(vence)
          if (sem.color !== 'success') {
            all.push({ tipo:'Placebo', codigo:p.codigo, nombre:p.productoReferencia, cliente:p.cliente, sem,
              detalle:`Stock: ${p.stockUnidades ?? '—'} unidades`, accion:'Solicitar nuevo lote al cliente' })
          }
        })

        all.sort((a,b) => (a.sem.dias ?? 9999) - (b.sem.dias ?? 9999))
        setAlertas(all)
      } catch {
        setAlertas(DEMO_A)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const filtradas = filtro === 'todas' ? alertas
    : filtro === 'criticas' ? alertas.filter(a => a.sem.color === 'danger')
    : filtro === 'advertencia' ? alertas.filter(a => a.sem.color === 'warning')
    : alertas.filter(a => a.tipo === filtro)

  const criticas    = alertas.filter(a => a.sem.color === 'danger').length
  const advertencia = alertas.filter(a => a.sem.color === 'warning').length

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(3,minmax(0,1fr))', marginBottom:16 }}>
        <div className="kpi-card"><div className="kpi-label"><AlertTriangle size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Críticas</div><div className="kpi-value danger">{criticas}</div></div>
        <div className="kpi-card"><div className="kpi-label"><Clock size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Advertencia</div><div className="kpi-value warn">{advertencia}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total activas</div><div className="kpi-value">{alertas.length}</div></div>
      </div>

      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {[
          { k:'todas',       l:'Todas' },
          { k:'criticas',    l:'Críticas' },
          { k:'advertencia', l:'Advertencia' },
          { k:'Estándar',    l:'Estándares' },
          { k:'Columna',     l:'Columnas' },
          { k:'Reactivo',    l:'Reactivos' },
          { k:'Placebo',     l:'Placebo' },
        ].map(({ k, l }) => (
          <button key={k} className="btn btn-sm"
            style={filtro===k?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
            onClick={() => setFiltro(k)}>{l}</button>
        ))}
      </div>

      {filtradas.length === 0 && <div className="empty"><AlertTriangle size={32}/><p>Sin alertas en esta categoría</p></div>}

      {filtradas.map((a, i) => {
        const Icon = ICONOS[a.tipo] || FlaskConical
        const cls  = a.sem.color === 'danger' ? 'danger' : 'warn'
        return (
          <div key={i} className={`alert-item ${cls}`} style={{ alignItems:'flex-start' }}>
            <Icon size={15} style={{ flexShrink:0, marginTop:2 }} />
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <strong>{a.nombre}</strong>
                <span className="badge badge-gray">{a.tipo}</span>
                <span className="mono" style={{ color:'var(--text-3)', fontSize:11 }}>{a.codigo}</span>
                {a.cliente !== '—' && <span style={{ color:'var(--text-3)', fontSize:11 }}>· {a.cliente}</span>}
              </div>
              <div style={{ marginTop:3, fontSize:12, color:'var(--text-2)' }}>
                {a.detalle} · <strong>{a.sem.texto}</strong>
              </div>
              <div style={{ marginTop:2, fontSize:11, color:'var(--text-3)' }}>
                Acción: {a.accion}
              </div>
            </div>
            <span className={`badge badge-${cls === 'danger' ? 'danger' : 'warn'}`} style={{ flexShrink:0 }}>
              {a.sem.color === 'danger' ? 'Crítico' : 'Advertencia'}
            </span>
          </div>
        )
      })}
    </>
  )
}

const DEMO_A = [
  { tipo:'Estándar', codigo:'Std-0685', nombre:'Blexit', cliente:'Lab. Chile', sem:{ texto:'9 días', color:'danger', dias:9 }, detalle:'Stock: 92.4 mg', accion:'Solicitar reposición urgente' },
  { tipo:'Reactivo', codigo:'REA-027', nombre:'Ác. Fosfórico 85%', cliente:'—', sem:{ texto:'9 días', color:'danger', dias:9 }, detalle:'Stock: 0.4 L', accion:'Reponer stock urgente' },
  { tipo:'Placebo', codigo:'PL-009', nombre:'Amoxicilina 500 mg', cliente:'Seven Pharma', sem:{ texto:'9 días', color:'danger', dias:9 }, detalle:'Stock: 6 unidades', accion:'Solicitar nuevo lote al cliente' },
  { tipo:'Columna', codigo:'COL-007', nombre:'C18 5µm', cliente:'Galenicum', sem:{ texto:'83% del límite', color:'danger', dias:null }, detalle:'1.240 / 1.500 inyecciones', accion:'Planificar reemplazo inmediato' },
  { tipo:'Estándar', codigo:'Std-0025', nombre:'Cilostazol', cliente:'Galenicum', sem:{ texto:'28 días', color:'warning', dias:28 }, detalle:'Stock: 440.69 mg', accion:'Planificar reposición o re-test' },
  { tipo:'Reactivo', codigo:'REA-041', nombre:'Acetonitrilo HPLC', cliente:'—', sem:{ texto:'34 días', color:'warning', dias:34 }, detalle:'Stock: 2.1 L', accion:'Reponer stock esta semana' },
  { tipo:'Placebo', codigo:'PL-018', nombre:'Cilosvitae 100 mg', cliente:'Galenicum', sem:{ texto:'52 días', color:'warning', dias:52 }, detalle:'Stock: 80 unidades', accion:'Solicitar nuevo lote al cliente' },
]
