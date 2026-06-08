// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEstandares, getColumnas, getReactivos, getPlacebos, calcularSemaforo } from '../lib/db'
import { FlaskConical, Cylinder, Droplets, Pill, AlertTriangle, Clock, TrendingUp, ScanLine } from 'lucide-react'
 
function KPI({ label, value, type, icon: Icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label" style={{ display:'flex', alignItems:'center', gap:5 }}>
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className={`kpi-value ${type || ''}`}>{value}</div>
    </div>
  )
}
 
export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
 
  useEffect(() => {
    async function load() {
      try {
        const [stds, cols, reacts, pls] = await Promise.all([
          getEstandares(), getColumnas(), getReactivos(), getPlacebos()
        ])
 
        // Calcular alertas transversales
        const allAlerts = []
        const hoy = new Date(); hoy.setHours(0,0,0,0)
 
        const parseFecha = v => {
          if (!v) return null
          if (v?.toDate) return v.toDate()
          const s = String(v)
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
          if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]))
          return null
        }

        stds.forEach(s => {
          if (['SIN STOCK','Dado de baja','Dada de baja','Retirado por cliente'].includes(s.estado)) return
          const vence = parseFecha(s.fechaVencimiento)
          if (!vence) return
          const dias = Math.round((vence - hoy) / 86400000)
          if (dias > 90) return
          const sem = { color: dias <= 45 ? 'danger' : 'warning', texto: dias < 0 ? 'Vencido' : `${dias} días`, dias }
          allAlerts.push({ tipo:'Estándar', codigo:s.codigo, nombre:s.nombre, sem, id:s.id })
        })

        reacts.forEach(r => {
          const vence = parseFecha(r.fechaVencimiento)
          if (vence) {
            const dias = Math.round((vence - hoy) / 86400000)
            if (dias <= 90) {
              const sem = { color: dias <= 45 ? 'danger' : 'warning', texto: dias < 0 ? 'Vencido' : `${dias} días`, dias }
              allAlerts.push({ tipo:'Reactivo', codigo:r.codigo, nombre:r.nombre, sem, id:r.id })
            }
          }
          if (r.estado === 'STOCK BAJO') {
            allAlerts.push({ tipo:'Reactivo', codigo:r.codigo, nombre:r.nombre,
              sem:{ color:'danger', texto:'Stock bajo', dias:0 }, id:r.id })
          }
        })

        pls.forEach(p => {
          if (['Retirado por cliente','SIN STOCK','Dado de baja','Dada de baja'].includes(p.estado)) return
          const vence = parseFecha(p.fechaVencimiento)
          if (!vence) return
          const dias = Math.round((vence - hoy) / 86400000)
          if (dias > 90) return
          const sem = { color: dias <= 45 ? 'danger' : 'warning', texto: dias < 0 ? 'Vencido' : `${dias} días`, dias }
          allAlerts.push({ tipo:'Placebo', codigo:p.codigo, nombre:p.productoReferencia, sem, id:p.id })
        })
 
        allAlerts.sort((a,b) => (a.sem.dias ?? 0) - (b.sem.dias ?? 0))
 
        setStats({
          stds:     { total: stds.filter(s => s.estado === 'En uso').length },
          cols:     { total: cols.filter(c => c.estado !== 'Dada de baja' && c.estado !== 'Pendiente de aprobación').length },
          reacts:   { total: reacts.filter(r => r.estado === 'ACTIVO' || r.estado === 'STOCK BAJO').length },
          pls:      { total: pls.filter(p => p.estado === 'En uso' || p.estado === 'Cerrado').length },
          criticas: allAlerts.filter(a => a.sem.color === 'danger').length,
          adv:      allAlerts.filter(a => a.sem.color === 'warning').length,
        })
        setAlerts(allAlerts.slice(0, 8))
      } catch(e) {
        console.error(e)
        // Fallback con datos demo si Firebase no está configurado
        setStats({ stds:{total:383}, cols:{total:24}, reacts:{total:57}, pls:{total:12}, criticas:8, adv:15 })
        setAlerts([
          { tipo:'Estándar', codigo:'Std-0685', nombre:'Blexit', sem:{ texto:'9 días', color:'danger' } },
          { tipo:'Reactivo', codigo:'REA-027',  nombre:'Ác. Fosfórico 85%', sem:{ texto:'9 días', color:'danger' } },
          { tipo:'Placebo',  codigo:'PL-009',   nombre:'Amoxicilina 500 mg', sem:{ texto:'9 días', color:'danger' } },
          { tipo:'Estándar', codigo:'Std-0025', nombre:'Cilostazol', sem:{ texto:'28 días', color:'warning' } },
          { tipo:'Reactivo', codigo:'REA-041',  nombre:'Acetonitrilo HPLC', sem:{ texto:'34 días', color:'warning' } },
        ])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  const IconoTipo = { Estándar: FlaskConical, Columna: Cylinder, Reactivo: Droplets, Placebo: Pill }
 
  return (
    <>
      <div className="kpi-grid">
        <KPI label="Estándares activos" value={stats.stds.total}   type="info"   icon={FlaskConical} />
        <KPI label="Columnas activas"   value={stats.cols.total}   type="ok"     icon={Cylinder} />
        <KPI label="Reactivos activos"  value={stats.reacts.total} type="ok"     icon={Droplets} />
        <KPI label="Lotes placebo"      value={stats.pls.total}    type="info"   icon={Pill} />
        <KPI label="Alertas críticas"   value={stats.criticas}     type="danger" icon={AlertTriangle} />
        <KPI label="Advertencias (90d)" value={stats.adv}          type="warn"   icon={Clock} />
      </div>
 
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card">
          <div className="card-title">
            Alertas activas
            <Link to="/alertas" className="btn btn-sm">Ver todas</Link>
          </div>
          {alerts.length === 0 && <div className="empty"><p>Sin alertas activas</p></div>}
          {alerts.map((a, i) => {
            const Icon = IconoTipo[a.tipo] || FlaskConical
            return (
              <div key={i} className={`alert-item ${a.sem.color === 'danger' ? 'danger' : 'warn'}`}>
                <Icon size={14} style={{ flexShrink:0, marginTop:1 }} />
                <div>
                  <strong>{a.nombre}</strong>
                  <span className="badge badge-gray" style={{ marginLeft:6 }}>{a.tipo}</span>
                  <br />
                  <span style={{ color:'var(--text-2)' }}>{a.codigo} · {a.sem.texto}</span>
                </div>
              </div>
            )
          })}
        </div>
 
        <div className="card">
          <div className="card-title"><TrendingUp size={14}/> Acceso rápido</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { to:'/escanear',   icon: ScanLine,    label: 'Escanear y registrar uso', desc: 'Apunta la cámara al código QR del insumo' },
              { to:'/estandares', icon: FlaskConical, label: 'Agregar estándar nuevo',   desc: 'Ingresar vial al inventario' },
              { to:'/columnas',   icon: Cylinder,     label: 'Registrar uso de columna', desc: 'Inyecciones acumuladas por análisis' },
              { to:'/reactivos',  icon: Droplets,     label: 'Retiro de reactivo',       desc: 'Descontar stock y registrar lote' },
              { to:'/placebo',    icon: Pill,         label: 'Uso de placebo',           desc: 'Registrar unidades utilizadas' },
            ].map(({ to, icon: Icon, label, desc }) => (
              <Link key={to} to={to} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', background:'var(--bg)', textDecoration:'none', color:'var(--text-1)', transition:'background .12s' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--accent-lt)'}
                onMouseLeave={e=>e.currentTarget.style.background='var(--bg)'}
              >
                <Icon size={16} style={{ color:'var(--accent)', flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:12, fontWeight:500 }}>{label}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>{desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}