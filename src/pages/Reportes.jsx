// src/pages/Reportes.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { FileText, Download, Shield } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Semáforo de vencimiento ───────────────────────────────────
function getSemaforo(item) {
  if (item.esUSP) {
    const dias = item.proximaRevisionUSP
      ? Math.round((new Date(item.proximaRevisionUSP) - new Date()) / 86400000)
      : null
    if (dias === null) return { texto: 'USP — Sin fecha', color: 'azul', dias }
    if (dias < 0)      return { texto: `USP vencida hace ${Math.abs(dias)}d`, color: 'rojo', dias }
    if (dias <= 30)    return { texto: `USP revisar en ${dias}d`, color: 'rojo', dias }
    if (dias <= 60)    return { texto: `USP revisar en ${dias}d`, color: 'amarillo', dias }
    return { texto: `USP OK — ${dias}d`, color: 'verde', dias }
  }
  if (!item.fechaVencimiento) return { texto: 'Sin fecha', color: 'gris', dias: null }
  const vence = item.fechaVencimiento?.toDate?.() || new Date(item.fechaVencimiento)
  const dias  = Math.round((vence - new Date()) / 86400000)
  if (dias < 0)      return { texto: `Vencido hace ${Math.abs(dias)}d`, color: 'rojo', dias }
  if (dias <= 30)    return { texto: `Vence en ${dias}d`, color: 'rojo', dias }
  if (dias <= 60)    return { texto: `Vence en ${dias}d`, color: 'amarillo', dias }
  return { texto: `Vence en ${dias}d`, color: 'verde', dias }
}

function getColorRGB(color) {
  switch(color) {
    case 'rojo':     return [220, 53, 69]
    case 'amarillo': return [255, 193, 7]
    case 'verde':    return [40, 167, 69]
    case 'azul':     return [13, 110, 253]
    default:         return [108, 117, 125]
  }
}

function formatFechaVenc(item) {
  if (item.esUSP) return item.proximaRevisionUSP
    ? new Date(item.proximaRevisionUSP).toLocaleDateString('es-CL')
    : 'USP — Sin fecha rev.'
  if (!item.fechaVencimiento) return '—'
  const d = item.fechaVencimiento?.toDate?.() || new Date(item.fechaVencimiento)
  return d.toLocaleDateString('es-CL')
}

function formatPotencia(item) {
  if (item.tipoPotencia === 'cualitativo')  return 'Cualitativo'
  if (item.tipoPotencia === 'sin_potencia') return 'Sin potencia'
  if (item.tipoPotencia === 'base_seca')    return `${item.potencia}% B.S.`
  if (item.tipoPotencia === 'tal_cual')     return `${item.potencia}% T.C.`
  return item.potencia ? `${item.potencia}%` : '—'
}

function formatCondiciones(item) {
  const c = []
  if (item.karlFischer) c.push('Karl Fischer')
  if (item.secadoPrevio) c.push(`Secado ${item.tempSecado || ''}°C`)
  return c.join(', ') || '—'
}

// ── Generar PDF para un cliente ───────────────────────────────
function generarPDF(cliente, estandares) {
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const fecha = new Date().toLocaleDateString('es-CL')
  const hora  = new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
  const W     = doc.internal.pageSize.getWidth()

  // ── Header ──
  doc.setFillColor(28, 63, 110)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('QUALYSERV — Laboratorio de Análisis Químico', 12, 9)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Reporte de estado de estándares de referencia', 12, 16)
  doc.setFontSize(9)
  doc.text(`Generado: ${fecha} ${hora}`, W - 12, 9, { align: 'right' })
  doc.text(`Página 1`, W - 12, 16, { align: 'right' })

  // ── Título cliente ──
  doc.setTextColor(28, 63, 110)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`Cliente: ${cliente}`, 12, 32)

  // ── Resumen ──
  const total     = estandares.length
  const enUso     = estandares.filter(e => e.estado === 'En uso').length
  const cerrados  = estandares.filter(e => e.estado === 'Cerrado').length
  const criticos  = estandares.filter(e => getSemaforo(e).color === 'rojo').length
  const advertencia = estandares.filter(e => getSemaforo(e).color === 'amarillo').length

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)

  const resumen = [
    [`Total estándares: ${total}`, `En uso: ${enUso}`, `Cerrados: ${cerrados}`, `Críticos: ${criticos}`, `Advertencia: ${advertencia}`]
  ]

  autoTable(doc, {
    startY: 36,
    head: [],
    body: resumen,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      3: { textColor: [220, 53, 69], fontStyle: 'bold' },
      4: { textColor: [180, 120, 0], fontStyle: 'bold' },
    },
    margin: { left: 12, right: 12 },
  })

  // ── Tabla principal ──
  const rows = estandares.map(e => {
    const sem = getSemaforo(e)
    return [
      e.codigo || '—',
      e.nombre || '—',
      e.frasco || '—',
      e.lote || '—',
      formatPotencia(e),
      formatCondiciones(e),
      (e.stockRestante ?? '—') + (typeof e.stockRestante === 'number' ? ' mg' : ''),
      formatFechaVenc(e),
      sem.texto,
      e.estado || '—',
    ]
  })

  autoTable(doc, {
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : 48,
    head: [[
      'Código', 'Nombre', 'Fr.', 'Lote',
      'Potencia', 'Cond. especiales',
      'Stock', 'Venc./Revisión',
      'Estado vencimiento', 'Estado',
    ]],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [28, 63, 110],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', font: 'courier' },
      1: { cellWidth: 38 },
      2: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 24 },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 28 },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 22, halign: 'center' },
      8: { cellWidth: 30, halign: 'center' },
      9: { cellWidth: 20, halign: 'center' },
    },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const e = estandares[data.row.index]
        if (!e) return
        // Colorear columna de vencimiento
        if (data.column.index === 8) {
          const sem = getSemaforo(e)
          const rgb = getColorRGB(sem.color)
          data.cell.styles.textColor = rgb
          data.cell.styles.fontStyle = 'bold'
        }
        // Colorear columna estado
        if (data.column.index === 9) {
          if (e.estado === 'En uso')    data.cell.styles.textColor = [40, 167, 69]
          if (e.estado === 'Cerrado')   data.cell.styles.textColor = [13, 110, 253]
          if (e.estado === 'Vencido')   data.cell.styles.textColor = [220, 53, 69]
          if (e.estado === 'Sin stock') data.cell.styles.textColor = [180, 120, 0]
          data.cell.styles.fontStyle = 'bold'
        }
        // Filas alternadas
        if (data.row.index % 2 === 0) {
          data.cell.styles.fillColor = [248, 249, 250]
        }
      }
    },
    didDrawPage: (data) => {
      // Footer en cada página
      const pageCount = doc.internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(
        `QUALYSERV — Reporte de estándares — ${cliente} — ${fecha} | Pág. ${data.pageNumber} / ${pageCount}`,
        W / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' }
      )
    },
  })

  // ── Leyenda ──
  const finalY = doc.lastAutoTable.finalY + 8
  if (finalY < doc.internal.pageSize.getHeight() - 20) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Leyenda:', 12, finalY)
    doc.setFont('helvetica', 'normal')

    const leyenda = [
      { color: [220, 53, 69],  texto: 'Crítico: vence en 30 días o menos, o USP con revisión vencida' },
      { color: [180, 120, 0],  texto: 'Advertencia: vence entre 31 y 60 días' },
      { color: [40, 167, 69],  texto: 'Vigente: vence en más de 60 días' },
      { color: [13, 110, 253], texto: 'USP: estándar con verificación periódica en catálogo USP' },
    ]

    leyenda.forEach((l, i) => {
      const y = finalY + 4 + (i * 6)
      doc.setFillColor(...l.color)
      doc.rect(12, y - 3, 4, 4, 'F')
      doc.setTextColor(...l.color)
      doc.text(l.texto, 18, y, { maxWidth: 250 })
    })
  }

  // ── Firmas regulatorias ──
  firmasPDF(doc)

  // ── Pie de página legacy ──
  const firmaY = doc.internal.pageSize.getHeight() - 20
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.text('Documento generado automáticamente por LabInsumos — Qualyserv. Para uso interno.', W / 2, firmaY, { align: 'center' })

  return doc
}


// ── Semáforo genérico (APIs y Placebos) ──────────────────────
function getSemaforoGen(item) {
  if (!item.fechaVencimiento) return { texto: 'Sin fecha', color: 'gris', dias: null }
  const v = item.fechaVencimiento
  const vence = v?.toDate?.() || (() => {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])) : new Date(v)
  })()
  const dias = Math.round((vence - new Date()) / 86400000)
  if (dias < 0)   return { texto: 'Vencido',  color: 'rojo',     dias }
  if (dias <= 45) return { texto: `${dias}d`,  color: 'rojo',     dias }
  if (dias <= 90) return { texto: `${dias}d`,  color: 'amarillo', dias }
  return              { texto: `${dias}d`,  color: 'verde',    dias }
}

function fmtFechaGen(v) {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  try { return new Date(v).toLocaleDateString('es-CL') } catch { return '—' }
}

function firmasPDF(doc) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const y0 = H - 38
  doc.setDrawColor(200,200,200); doc.line(12, y0, W-12, y0)
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(50,50,50)
  doc.text('FIRMAS', 12, y0+5)
  const cols = ['Elaborado por','Revisado por','Aprobado por']
  const cw = (W-24)/3
  cols.forEach((lbl,i) => {
    const x = 12 + i*cw
    doc.setDrawColor(100,100,100); doc.line(x+4, y0+20, x+cw-8, y0+20)
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text(lbl, x+cw/2-4, y0+24, {align:'center'})
    doc.text('Nombre:', x+4, y0+29); doc.text('Fecha:', x+4, y0+34)
  })
  doc.setFontSize(6.5); doc.setFont('helvetica','italic'); doc.setTextColor(180,180,180)
  doc.text('Documento generado automáticamente por LabInsumos — Qualyserv. Para uso interno.', W/2, H-3, {align:'center'})
}

function headerPDF(doc, subtitulo, cliente, fecha, hora) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(28,63,110); doc.rect(0,0,W,22,'F')
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold')
  doc.text('QUALYSERV — Laboratorio de Análisis Químico', 12, 9)
  doc.setFontSize(10); doc.setFont('helvetica','normal')
  doc.text(subtitulo, 12, 16)
  doc.setFontSize(9); doc.text(`Generado: ${fecha} ${hora}`, W-12, 9, {align:'right'})
  doc.setTextColor(28,63,110); doc.setFontSize(13); doc.setFont('helvetica','bold')
  doc.text(cliente, 12, 32)
}

function generarPDFAPIs(cliente, items) {
  const doc  = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'})
  const W    = doc.internal.pageSize.getWidth()
  const fecha = new Date().toLocaleDateString('es-CL')
  const hora  = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})
  headerPDF(doc, 'Reporte de estado de APIs — Principios Activos', `Laboratorio: ${cliente}`, fecha, hora)
  autoTable(doc, {
    startY:36, head:[], theme:'plain',
    body:[[`Total: ${items.length}`,`En uso: ${items.filter(i=>i.estado==='En uso').length}`,`Sin stock: ${items.filter(i=>i.estado==='Sin stock').length}`,`Críticos: ${items.filter(i=>getSemaforoGen(i).color==='rojo').length}`]],
    styles:{fontSize:9,cellPadding:2},
    columnStyles:{0:{fontStyle:'bold'},3:{textColor:[220,53,69],fontStyle:'bold'}},
    margin:{left:12,right:12},
  })
  const rows = items.map(i => {
    const sem = getSemaforoGen(i)
    return [i.codigo||'—',i.nombre||'—',i.frasco||'—',i.lote||'—',i.almacenamiento||'—',i.stockRestante!=null?`${i.stockRestante} mg`:'—',fmtFechaGen(i.fechaVencimiento),sem.texto,i.estado||'—']
  })
  autoTable(doc, {
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY+6 : 48,
    head:[['Código','Nombre','Fr.','Lote','Almacenamiento','Stock (mg)','Vencimiento','Estado venc.','Estado']],
    body:rows, theme:'grid',
    headStyles:{fillColor:[28,63,110],textColor:[255,255,255],fontSize:8,fontStyle:'bold',halign:'center'},
    styles:{fontSize:7.5,cellPadding:2,overflow:'linebreak'},
    columnStyles:{0:{cellWidth:40,fontStyle:'bold',font:'courier'},1:{cellWidth:45},2:{cellWidth:10,halign:'center'},3:{cellWidth:28},4:{cellWidth:30},5:{cellWidth:20,halign:'right'},6:{cellWidth:22,halign:'center'},7:{cellWidth:22,halign:'center'},8:{cellWidth:20,halign:'center'}},
    margin:{left:12,right:12,bottom:45},
    didParseCell:(data)=>{
      if(data.section==='body'){
        const it=items[data.row.index]; if(!it) return
        if(data.column.index===7){data.cell.styles.textColor=getColorRGB(getSemaforoGen(it).color);data.cell.styles.fontStyle='bold'}
        if(data.column.index===8){if(it.estado==='En uso')data.cell.styles.textColor=[40,167,69];if(it.estado==='Cerrado')data.cell.styles.textColor=[13,110,253];if(it.estado==='Sin stock')data.cell.styles.textColor=[180,120,0];data.cell.styles.fontStyle='bold'}
        if(data.row.index%2===0)data.cell.styles.fillColor=[248,249,250]
      }
    },
    didDrawPage:(data)=>{const pc=doc.internal.getNumberOfPages();doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text(`QUALYSERV — APIs — ${cliente} — ${fecha} | Pág. ${data.pageNumber}/${pc}`,W/2,doc.internal.pageSize.getHeight()-42,{align:'center'})},
  })
  firmasPDF(doc)
  return doc
}

function generarPDFPlacebos(cliente, items) {
  const doc  = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'})
  const W    = doc.internal.pageSize.getWidth()
  const fecha = new Date().toLocaleDateString('es-CL')
  const hora  = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})
  headerPDF(doc, 'Reporte de estado de Placebos', `Cliente: ${cliente}`, fecha, hora)
  autoTable(doc, {
    startY:36, head:[], theme:'plain',
    body:[[`Total: ${items.length}`,`En uso: ${items.filter(i=>i.estado==='En uso').length}`,`Sin stock: ${items.filter(i=>i.estado==='Sin stock').length}`,`Críticos: ${items.filter(i=>getSemaforoGen(i).color==='rojo').length}`]],
    styles:{fontSize:9,cellPadding:2},
    columnStyles:{0:{fontStyle:'bold'},3:{textColor:[220,53,69],fontStyle:'bold'}},
    margin:{left:12,right:12},
  })
  const rows = items.map(i => {
    const sem = getSemaforoGen(i)
    return [i.codigo||'—',i.productoReferencia||'—',i.frasco||'—',i.lote||'—',i.formaFarmaceutica||'—',i.dosis||'—',i.almacenamiento||'—',fmtFechaGen(i.fechaVencimiento),sem.texto,i.estado||'—']
  })
  autoTable(doc, {
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY+6 : 48,
    head:[['Código','Producto','Fr.','Lote','Forma farm.','Dosis','Almacenamiento','Vencimiento','Estado venc.','Estado']],
    body:rows, theme:'grid',
    headStyles:{fillColor:[28,63,110],textColor:[255,255,255],fontSize:8,fontStyle:'bold',halign:'center'},
    styles:{fontSize:7.5,cellPadding:2,overflow:'linebreak'},
    columnStyles:{0:{cellWidth:36,fontStyle:'bold',font:'courier'},1:{cellWidth:36},2:{cellWidth:10,halign:'center'},3:{cellWidth:22},4:{cellWidth:20},5:{cellWidth:14,halign:'center'},6:{cellWidth:24},7:{cellWidth:20,halign:'center'},8:{cellWidth:18,halign:'center'},9:{cellWidth:16,halign:'center'}},
    margin:{left:12,right:12,bottom:45},
    didParseCell:(data)=>{
      if(data.section==='body'){
        const it=items[data.row.index]; if(!it) return
        if(data.column.index===8){data.cell.styles.textColor=getColorRGB(getSemaforoGen(it).color);data.cell.styles.fontStyle='bold'}
        if(data.column.index===9){if(it.estado==='En uso')data.cell.styles.textColor=[40,167,69];if(it.estado==='Cerrado')data.cell.styles.textColor=[13,110,253];if(it.estado==='Sin stock')data.cell.styles.textColor=[180,120,0];data.cell.styles.fontStyle='bold'}
        if(data.row.index%2===0)data.cell.styles.fillColor=[248,249,250]
      }
    },
    didDrawPage:(data)=>{const pc=doc.internal.getNumberOfPages();doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text(`QUALYSERV — Placebos — ${cliente} — ${fecha} | Pág. ${data.pageNumber}/${pc}`,W/2,doc.internal.pageSize.getHeight()-42,{align:'center'})},
  })
  firmasPDF(doc)
  return doc
}

// ── Componente principal ──────────────────────────────────────
export default function Reportes() {
  const { rol } = useRole()
  const puedeExportar = puedoHacer(rol, 'exportar')

  const [estandares, setEstandares] = useState([])
  const [apis, setApis]             = useState([])
  const [placebos, setPlacebos]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [generando, setGenerando]   = useState(null)
  const [tabActiva, setTabActiva]   = useState('estandares')

  useEffect(() => {
    async function load() {
      try {
        const [snapStd,snapAPI,snapPL] = await Promise.all([
          getDocs(query(collection(db,'estandares'),orderBy('cliente'))),
          getDocs(query(collection(db,'apis'),orderBy('laboratorio'))),
          getDocs(query(collection(db,'placebo'),orderBy('cliente'))),
        ])
        setEstandares(snapStd.docs.map(d=>({id:d.id,...d.data()})))
        setApis(snapAPI.docs.map(d=>({id:d.id,...d.data()})))
        setPlacebos(snapPL.docs.map(d=>({id:d.id,...d.data()})))
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  if (!puedeExportar) {
    return (
      <div className="empty">
        <Shield size={40}/>
        <p>Solo Administrador, Jefe y Encargado pueden generar reportes</p>
      </div>
    )
  }

  // Clientes únicos con conteo
  const clientesUnicos = [...new Set(
    estandares
      .filter(e => e.estado !== 'Dado de baja')
      .map(e => e.cliente)
      .filter(Boolean)
  )].sort()

  const descargarPDF = async (cliente) => {
    setGenerando(cliente)
    try {
      const estandaresCliente = estandares
        .filter(e => e.cliente === cliente && e.estado !== 'Dado de baja')
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

      const pdf = generarPDF(cliente, estandaresCliente)
      const nombreArchivo = `Estandares_${cliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(nombreArchivo)
    } catch(e) {
      alert('Error al generar el PDF: ' + e.message)
    } finally {
      setGenerando(null)
    }
  }

  const descargarPDFAPIs = async (cliente) => {
    setGenerando('api-'+cliente)
    try {
      const items = apis.filter(i=>i.laboratorio===cliente&&!['Dado de baja','Dada de baja'].includes(i.estado)).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
      generarPDFAPIs(cliente,items).save(`APIs_${cliente.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch(e){alert('Error: '+e.message)} finally{setGenerando(null)}
  }
  const descargarTodosAPIs = async () => {
    setGenerando('apis-todos')
    try {
      const cls=[...new Set(apis.filter(i=>!['Dado de baja','Dada de baja'].includes(i.estado)).map(i=>i.laboratorio).filter(Boolean))].sort()
      for(const c of cls){const items=apis.filter(i=>i.laboratorio===c&&!['Dado de baja','Dada de baja'].includes(i.estado)).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));if(!items.length)continue;generarPDFAPIs(c,items).save(`APIs_${c.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);await new Promise(r=>setTimeout(r,500))}
    } catch(e){alert('Error: '+e.message)} finally{setGenerando(null)}
  }
  const descargarPDFPlacebos = async (cliente) => {
    setGenerando('pl-'+cliente)
    try {
      const items = placebos.filter(i=>i.cliente===cliente&&!['Dado de baja','Dada de baja','Retirado por cliente'].includes(i.estado)).sort((a,b)=>(a.productoReferencia||'').localeCompare(b.productoReferencia||''))
      generarPDFPlacebos(cliente,items).save(`Placebos_${cliente.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch(e){alert('Error: '+e.message)} finally{setGenerando(null)}
  }
  const descargarTodosPlacebos = async () => {
    setGenerando('pl-todos')
    try {
      const cls=[...new Set(placebos.filter(i=>!['Dado de baja','Dada de baja','Retirado por cliente'].includes(i.estado)).map(i=>i.cliente).filter(Boolean))].sort()
      for(const c of cls){const items=placebos.filter(i=>i.cliente===c&&!['Dado de baja','Dada de baja','Retirado por cliente'].includes(i.estado)).sort((a,b)=>(a.productoReferencia||'').localeCompare(b.productoReferencia||''));if(!items.length)continue;generarPDFPlacebos(c,items).save(`Placebos_${c.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);await new Promise(r=>setTimeout(r,500))}
    } catch(e){alert('Error: '+e.message)} finally{setGenerando(null)}
  }
  const descargarTodos = async () => {
    setGenerando('todos')
    try {
      for (const cliente of clientesUnicos) {
        const estandaresCliente = estandares
          .filter(e => e.cliente === cliente && e.estado !== 'Dado de baja')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
        if (estandaresCliente.length === 0) continue
        const pdf = generarPDF(cliente, estandaresCliente)
        const nombreArchivo = `Estandares_${cliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
        pdf.save(nombreArchivo)
        await new Promise(r => setTimeout(r, 500))
      }
    } catch(e) {
      alert('Error: ' + e.message)
    } finally {
      setGenerando(null)
    }
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>Reportes PDF</h2>
        {tabActiva==='estandares' && <button className="btn btn-primary btn-sm" onClick={descargarTodos} disabled={!!generando}><Download size={14}/> Todos los clientes</button>}
        {tabActiva==='apis'       && <button className="btn btn-primary btn-sm" onClick={descargarTodosAPIs} disabled={!!generando}><Download size={14}/> Todos los laboratorios</button>}
        {tabActiva==='placebos'   && <button className="btn btn-primary btn-sm" onClick={descargarTodosPlacebos} disabled={!!generando}><Download size={14}/> Todos los clientes</button>}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[{id:'estandares',label:'Estándares'},{id:'apis',label:'APIs'},{id:'placebos',label:'Placebos'}].map(t=>(
          <button key={t.id} onClick={()=>setTabActiva(t.id)} style={{padding:'8px 16px',fontSize:13,cursor:'pointer',border:'none',background:'none',color:tabActiva===t.id?'var(--accent)':'var(--text-2)',borderBottom:tabActiva===t.id?'2px solid var(--accent)':'2px solid transparent',fontWeight:tabActiva===t.id?500:400,marginBottom:-1}}>{t.label}</button>
        ))}
      </div>
      {tabActiva==='estandares' && (<>

      {/* Estadísticas globales */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {[
          { label:'Total estándares', valor: estandares.filter(e=>e.estado!=='Dado de baja').length, color:'var(--accent)' },
          { label:'En uso',           valor: estandares.filter(e=>e.estado==='En uso').length,        color:'var(--ok)' },
          { label:'Críticos',         valor: estandares.filter(e=>getSemaforo(e).color==='rojo').length, color:'var(--danger)' },
          { label:'Clientes',         valor: clientesUnicos.length,                                    color:'var(--text-2)' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{color:k.color}}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Lista de clientes */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {clientesUnicos.map(cliente => {
          const ests      = estandares.filter(e => e.cliente === cliente && e.estado !== 'Dado de baja')
          const criticos  = ests.filter(e => getSemaforo(e).color === 'rojo').length
          const advertencia = ests.filter(e => getSemaforo(e).color === 'amarillo').length
          const enUso     = ests.filter(e => e.estado === 'En uso').length

          return (
            <div key={cliente} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 16px', background:'var(--surface)',
              border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
              gap:12, flexWrap:'wrap',
            }}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontWeight:600,fontSize:14}}>{cliente}</span>
                  <span className="badge badge-gray">{ests.length} estándares</span>
                  <span className="badge badge-ok">{enUso} en uso</span>
                  {criticos > 0 && <span className="badge badge-danger">⚠️ {criticos} crítico{criticos>1?'s':''}</span>}
                  {advertencia > 0 && <span className="badge badge-warn">🟡 {advertencia} advertencia{advertencia>1?'s':''}</span>}
                </div>
                {/* Mini semáforo visual */}
                <div style={{display:'flex',gap:3,marginTop:4}}>
                  {ests.slice(0,20).map(e => {
                    const sem = getSemaforo(e)
                    const rgb = getColorRGB(sem.color)
                    return (
                      <div key={e.id} title={`${e.nombre} — ${sem.texto}`} style={{
                        width:8, height:8, borderRadius:'50%',
                        background:`rgb(${rgb.join(',')})`,
                        flexShrink:0,
                      }}/>
                    )
                  })}
                  {ests.length > 20 && (
                    <span style={{fontSize:10,color:'var(--text-3)'}}>+{ests.length-20}</span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-sm"
                style={{flexShrink:0}}
                onClick={() => descargarPDF(cliente)}
                disabled={!!generando}
              >
                {generando === cliente
                  ? <div className="spinner" style={{width:12,height:12,borderWidth:2}}/>
                  : <Download size={13}/>
                }
                PDF
              </button>
            </div>
          )
        })}

        {clientesUnicos.length === 0 && (
          <div className="empty" style={{padding:40}}>
            <FileText size={32}/>
            <p>No hay estándares en el inventario</p>
          </div>
        )}
      </div>
      </>)}

      {/* ── TAB APIs ── */}
      {tabActiva==='apis' && (() => {
        const cls=[...new Set(apis.filter(i=>!['Dado de baja','Dada de baja'].includes(i.estado)).map(i=>i.laboratorio).filter(Boolean))].sort()
        return (<div style={{display:'flex',flexDirection:'column',gap:8}}>
          {cls.map(cliente=>{
            const items=apis.filter(i=>i.laboratorio===cliente&&!['Dado de baja','Dada de baja'].includes(i.estado))
            const criticos=items.filter(i=>getSemaforoGen(i).color==='rojo').length
            return (<div key={cliente} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontWeight:600,fontSize:14}}>{cliente}</span>
                  <span className="badge badge-gray">{items.length} APIs</span>
                  <span className="badge badge-ok">{items.filter(i=>i.estado==='En uso').length} en uso</span>
                  {criticos>0&&<span className="badge badge-danger">⚠️ {criticos} crítico{criticos>1?'s':''}</span>}
                </div>
              </div>
              <button className="btn btn-sm" onClick={()=>descargarPDFAPIs(cliente)} disabled={!!generando}>
                {generando==='api-'+cliente?<div className="spinner" style={{width:12,height:12,borderWidth:2}}/>:<Download size={13}/>} PDF
              </button>
            </div>)
          })}
          {cls.length===0&&<div className="empty" style={{padding:40}}><FileText size={32}/><p>No hay APIs en el inventario</p></div>}
        </div>)
      })()}

      {/* ── TAB PLACEBOS ── */}
      {tabActiva==='placebos' && (() => {
        const cls=[...new Set(placebos.filter(i=>!['Dado de baja','Dada de baja','Retirado por cliente'].includes(i.estado)).map(i=>i.cliente).filter(Boolean))].sort()
        return (<div style={{display:'flex',flexDirection:'column',gap:8}}>
          {cls.map(cliente=>{
            const items=placebos.filter(i=>i.cliente===cliente&&!['Dado de baja','Dada de baja','Retirado por cliente'].includes(i.estado))
            const criticos=items.filter(i=>getSemaforoGen(i).color==='rojo').length
            return (<div key={cliente} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontWeight:600,fontSize:14}}>{cliente}</span>
                  <span className="badge badge-gray">{items.length} placebos</span>
                  <span className="badge badge-ok">{items.filter(i=>i.estado==='En uso').length} en uso</span>
                  {criticos>0&&<span className="badge badge-danger">⚠️ {criticos} crítico{criticos>1?'s':''}</span>}
                </div>
              </div>
              <button className="btn btn-sm" onClick={()=>descargarPDFPlacebos(cliente)} disabled={!!generando}>
                {generando==='pl-'+cliente?<div className="spinner" style={{width:12,height:12,borderWidth:2}}/>:<Download size={13}/>} PDF
              </button>
            </div>)
          })}
          {cls.length===0&&<div className="empty" style={{padding:40}}><FileText size={32}/><p>No hay placebos en el inventario</p></div>}
        </div>)
      })()}
    </>
  )
}