// src/pages/Estandares.jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc,
         serverTimestamp, query, orderBy, limit, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { calcularSemaforo, ponerEnUsoInsumo, retirarInsumo, registrarAudit } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole } from '../hooks/useRole.jsx'
import { puedoHacer } from '../lib/roles'
import { useClientes } from '../hooks/useClientes.jsx'
import { Plus, Search, FlaskConical, History, Package, ExternalLink, CheckCircle, XCircle, FileText, PlayCircle, PackageX, RefreshCw } from 'lucide-react'
import DocumentosPanel from '../components/shared/DocumentosPanel.jsx'
 
const CLIENTES  = ['Ascend','Galenicum','Grunenthal','Bamberg','Labomed','Laboratorio Chile','Novartis','Seven Pharma','Emcure','Prater','MSN','Otro']
const SECTORES  = ['Fisicoquímico', 'Validaciones']
const ESTADOS   = ['En uso','Cerrado','Vencido','Sin stock','Dado de baja','Retirado por cliente']
const ALMACENES = ['Desecador','Refrigerador','Freezer','Desecador-controlado','Refrigerador-controlado','Freezer-controlado','Desecador-oncológico','Refrigerador-oncológico']
const MESES     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_NUM = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
 
const TIPO_POTENCIA = [
  { value: 'tal_cual',     label: 'Tal cual' },
  { value: 'base_seca',    label: 'Base seca' },
  { value: 'sin_potencia', label: 'Sin potencia' },
  { value: 'cualitativo',  label: 'Estándar cualitativo' },
]

const TIPO_INSUMO = [
  { value: 'polvo',          label: 'Polvo' },
  { value: 'liquido',        label: 'Líquido' },
  { value: 'liquido_ampolla',label: 'Líquido-ampolla' },
]
 
function capitalizar(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}
 
function onChangeCapitalizar(setter) {
  return (e) => {
    const val = e.target.value
    if (!val) { setter(''); return }
    setter(val.charAt(0).toUpperCase() + val.slice(1))
  }
}
 
async function getSiguienteNumero(db) {
  try {
    const q    = query(collection(db, 'estandares'), orderBy('numeroStd', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return 1
    return (snap.docs[0].data().numeroStd || 0) + 1
  } catch { return 1 }
}
 
function generarCodigo(numero, mes, anio, lote, frasco) {
  const num     = String(numero).padStart(4, '0')
  const mesStr  = MESES_NUM[parseInt(mes) - 1]
  const anioStr = String(anio).slice(-2)
  return `STD-${num}/${mesStr}${anioStr}/${lote}/${frasco}`
}
 
function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
}
 
function calcularProximaRevision(fechaBase, meses) {
  const d = new Date(fechaBase)
  d.setMonth(d.getMonth() + parseInt(meses))
  return d.toISOString().split('T')[0]
}
 
function diasHastaRevision(fechaRevision) {
  if (!fechaRevision) return null
  const hoy  = new Date(); hoy.setHours(0,0,0,0)
  const rev  = new Date(fechaRevision)
  return Math.round((rev - hoy) / 86400000)
}
 
function BadgePotencia({ tipoPotencia, potencia }) {
  if (tipoPotencia === 'cualitativo')  return <span className="badge badge-purple">Cualitativo</span>
  if (tipoPotencia === 'sin_potencia') return <span className="badge badge-gray">Sin potencia</span>
  if (tipoPotencia === 'base_seca')    return <span className="badge badge-info">{potencia}% Base seca</span>
  if (tipoPotencia === 'tal_cual')     return <span className="badge badge-ok">{potencia}% Tal cual</span>
  return potencia ? <span className="badge badge-gray">{potencia}%</span> : <span style={{color:'var(--text-3)'}}>—</span>
}
 
function BadgesCondiciones({ karlFischer, secadoPrevio, tempSecado, tiempoSecado, secadoDesecador }) {
  return (
    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
      {karlFischer && <span className="badge badge-warn" title="Requiere Karl Fischer">💧 Karl Fischer</span>}
      {secadoPrevio && (
        <span className="badge badge-warn" title={`Secado${tempSecado?` ${tempSecado}°C`:''}${tiempoSecado?` — ${tiempoSecado}`:''}`}>
          🌡️ Secado {tempSecado ? `${tempSecado}°C` : ''} {tiempoSecado || ''}
        </span>
      )}
      {secadoDesecador && <span className="badge badge-warn" title="Secado en desecador — Revisar etiqueta o metodología">🧪 Desecador</span>}
    </div>
  )
}
 
function BadgeRevisionUSP({ proximaRevision }) {
  const dias = diasHastaRevision(proximaRevision)
  if (dias === null) return <span className="badge badge-gray">USP — Sin fecha</span>
  if (dias < 0)      return <span className="badge badge-danger">🔴 USP — Revisión vencida hace {Math.abs(dias)}d</span>
  if (dias <= 30)    return <span className="badge badge-danger">🔴 USP — Revisar en {dias}d</span>
  if (dias <= 60)    return <span className="badge badge-warn">🟡 USP — Revisar en {dias}d</span>
  return <span className="badge badge-info">🔵 USP — Revisar en {dias}d</span>
}
 
export default function Estandares() {
  const { user } = useAuth()
  const { rol }  = useRole()
  const { clientes: listaClientes } = useClientes()
  const puedeAgregar    = puedoHacer(rol, 'agregarInsumo')
  const puedePesada     = puedoHacer(rol, 'registrarUso')
  const puedeBaja       = puedoHacer(rol, 'darDeBaja')
  const puedePonerEnUso = puedoHacer(rol, 'ponerEnUso') && rol !== 'analista'
 
  const [tab, setTab] = useState('inventario')
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [pesadaId, setPesadaId]   = useState(null)
  const [frascos, setFrascos]     = useState([{ letra: 'A', stock: '' }])
  const [retiroItem, setRetiroItem]     = useState(null)
  const [retiroFecha, setRetiroFecha]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [sigNum, setSigNum]       = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verPapelera, setVerPapelera] = useState(false)
  const [docInsumo, setDocInsumo]     = useState(null)
  const [ordenCampo, setOrdenCampo]   = useState('nombre')
  const [ordenDir, setOrdenDir]       = useState('asc')
 
  const [uspModalId, setUspModalId]           = useState(null)
  const [uspResultado, setUspResultado]       = useState('vigente')
  const [uspFechaVerif, setUspFechaVerif]     = useState('')
  const [uspProxRevision, setUspProxRevision] = useState('')
  const [uspFrecuencia, setUspFrecuencia]     = useState('')
  const [uspObs, setUspObs]                   = useState('')
  const [guardandoUSP, setGuardandoUSP]       = useState(false)
 
  const [fNombre, setFNombre]             = useState('')
  const [fCliente, setFCliente]           = useState('')
  const [fLote, setFLote]                 = useState('')
  const [fCas, setFCas]                   = useState('')
  const [fProducto, setFProducto]         = useState('')
  const [fFabricante, setFabricante]      = useState('')
  const [fObservacion, setFObservacion]   = useState('')
  const [fSector, setFSector]             = useState([])
  const [fAlmacen, setFAlmacen]           = useState('Desecador')
  const [fMes, setFMes]                   = useState('')
  const [fAnio, setFAnio]                 = useState('')
  const [fVencimiento, setFVencimiento]   = useState('')
  const [fXAnalisis, setFXAnalisis]       = useState('200')
  const [fTipoPotencia, setFTipoPotencia] = useState('tal_cual')
  const [fPotencia, setFPotencia]         = useState('')
  const [fTipoInsumo, setFTipoInsumo]     = useState('polvo')
  const [fKarlFischer, setFKarlFischer]   = useState(false)
  const [fSecadoPrevio, setFSecadoPrevio] = useState(false)
  const [fTempSecado, setFTempSecado]     = useState('')
  const [fTiempoSecado, setFTiempoSecado] = useState('')
  const [fSecadoDesecador, setFSecadoDesecador] = useState(false)

  const [editSectorId, setEditSectorId]     = useState(null)
  const [editSectorVal, setEditSectorVal]   = useState('')

  const [reposicionItem, setReposicionItem] = useState(null)
  const [rLote, setRLote]                   = useState('')
  const [rVencimiento, setRVencimiento]     = useState('')
  const [rFrascos, setRFrascos]             = useState([{ letra: 'A', stock: '' }])
  const [rMsg, setRMsg]                     = useState('')
  const [guardandoR, setGuardandoR]         = useState(false)
  const [fEsUSP, setFEsUSP]               = useState(false)
  const [fFrecuenciaUSP, setFFrecuenciaUSP] = useState('12')
  const [fProxRevisionUSP, setFProxRevisionUSP] = useState('')
  const [fMg, setFMg]                     = useState('')
  const [fNAnalisis, setFNAnalisis]       = useState('')
  const [fProducto2, setFProducto2]       = useState('')
 
  const [pesadas, setPesadas]             = useState([])
  const [loadingH, setLoadingH]           = useState(false)
  const [searchH, setSearchH]             = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroStd, setFiltroStd]         = useState('')
  const [fechaDesde, setFechaDesde]       = useState('')
  const [fechaHasta, setFechaHasta]       = useState('')
 
  const hoy     = new Date()
  const mesAct  = String(hoy.getMonth() + 1).padStart(2, '0')
  const anioAct = hoy.getFullYear()
 
  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'estandares'), orderBy('creadoEn', 'desc')))
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setItems(DEMO_E) }
    finally { setLoading(false) }
  }
 
  const loadHistorial = async () => {
    setLoadingH(true)
    try {
      const snap = await getDocs(query(collection(db, 'usos_estandares'), orderBy('fecha', 'desc'), limit(500)))
      setPesadas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setPesadas([]) }
    finally { setLoadingH(false) }
  }
 
  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'historial' && pesadas.length === 0) loadHistorial() }, [tab])
  useEffect(() => {
    if (fEsUSP && fFrecuenciaUSP) {
      setFProxRevisionUSP(calcularProximaRevision(new Date().toISOString().split('T')[0], fFrecuenciaUSP))
    }
  }, [fEsUSP, fFrecuenciaUSP])
 
  const abrirFormulario = async () => {
    if (!showForm) {
      const n = await getSiguienteNumero(db)
      setSigNum(n)
      setFMes(mesAct); setFAnio(String(anioAct))
      setFrascos([{ letra: 'A', stock: '' }])
      setFNombre(''); setFCliente(''); setFLote(''); setFCas('')
      setFProducto(''); setFabricante(''); setFObservacion('')
      setFSector([]); setFAlmacen('Desecador'); setFVencimiento('')
      setFXAnalisis('200'); setFTipoPotencia('tal_cual'); setFPotencia('')
      setFTipoInsumo('polvo')
      setFKarlFischer(false); setFSecadoPrevio(false)
      setFTempSecado(''); setFTiempoSecado(''); setFSecadoDesecador(false)
      setFEsUSP(false); setFFrecuenciaUSP('12'); setFProxRevisionUSP('')
      setMsg('')
    }
    setShowForm(!showForm)
    setPesadaId(null)
  }
 
  const agregarFrasco = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const sig = letras[frascos.length]
    if (sig) setFrascos(p => [...p, { letra: sig, stock: '' }])
  }
  const quitarFrasco = (i) => { if (frascos.length > 1) setFrascos(p => p.filter((_,idx)=>idx!==i)) }
  const updateFrasco = (i, valor) => setFrascos(p => p.map((fr,idx)=>idx===i?{...fr,stock:valor}:fr))
 
  const guardar = async () => {
    if (!fLote || !fNombre || !fCliente) { setMsg('Nombre, cliente y lote son obligatorios'); return }
    if (frascos.some(fr => !fr.stock || isNaN(fr.stock))) { setMsg('Ingresa el stock de cada frasco'); return }
    if ((fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca') && !fPotencia) {
      setMsg('Ingresa el valor de potencia'); return
    }
    if (fEsUSP && !fFrecuenciaUSP) { setMsg('Ingresa la frecuencia de revisión USP'); return }
    setGuardando(true)
    try {
      const numero = sigNum || await getSiguienteNumero(db)

      // ── FEFO: verificar si ya existe algún frasco del mismo STD-XXXX ──
      // Buscar todos los frascos existentes con el mismo numeroStd
      const snapExist = await getDocs(
        query(collection(db, 'estandares'), where('numeroStd', '==', numero))
      )
      const existentes = snapExist.docs.map(d => ({ id:d.id, ...d.data() }))
        .filter(h => !['Dado de baja','Dada de baja','Retirado por cliente'].includes(h.estado))

      const hayEnUsoExist = existentes.some(h => h.estado === 'En uso')

      // Combinar existentes + nuevos frascos para calcular FEFO
      const parseFecha = v => {
        if (!v) return new Date('9999-12-31')
        if (v?.toDate) return v.toDate()
        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]))
        return new Date(v)
      }

      // Todos los frascos nuevos con sus fechas
      const nuevosConFecha = frascos.map(fr => ({
        letra: fr.letra,
        stock: fr.stock,
        codigoCustom: fr.codigoCustom,
        fechaVenc: !fEsUSP && fVencimiento ? parseFecha(fVencimiento) : new Date('9999-12-31'),
      }))

      // Si no hay ninguno En uso (ni existentes ni nuevos serán los primeros),
      // el frasco a poner En uso es el de fecha más próxima entre todos
      let frascoAbrirLetra = null
      if (!hayEnUsoExist) {
        // Combinar existentes cerrados + nuevos para encontrar el de menor vencimiento
        const candidatos = [
          ...existentes.filter(h => h.estado === 'Cerrado').map(h => ({
            letra: h.frasco,
            fechaVenc: parseFecha(h.fechaVencimiento),
            esExistente: true,
          })),
          ...nuevosConFecha.map(fr => ({ letra: fr.letra, fechaVenc: fr.fechaVenc, esExistente: false })),
        ]
        candidatos.sort((a,b) => {
          if (a.fechaVenc - b.fechaVenc !== 0) return a.fechaVenc - b.fechaVenc
          return (a.letra||'').localeCompare(b.letra||'')
        })
        const primero = candidatos[0]
        // Solo abrir si es uno de los nuevos frascos (los existentes ya están en Firestore)
        if (primero && !primero.esExistente) frascoAbrirLetra = primero.letra
        // Si el primero es un existente, hay que actualizarlo a En uso
        if (primero && primero.esExistente) {
          const docExist = existentes.find(h => h.frasco === primero.letra && h.estado === 'Cerrado')
          if (docExist) {
            await updateDoc(doc(db, 'estandares', docExist.id), { estado: 'En uso', actualizadoEn: serverTimestamp() })
          }
        }
      }

      for (let i = 0; i < frascos.length; i++) {
        const frasco = frascos[i]
        const sugerido = generarCodigo(numero, fMes || mesAct, fAnio || anioAct, fLote, frasco.letra)
        const codigo = frasco.codigoCustom?.trim() || sugerido
        // Determinar estado: En uso solo para el frasco FEFO correcto
        const estadoFrasco = (!hayEnUsoExist && frasco.letra === frascoAbrirLetra) ? 'En uso' : 'Cerrado'
        await addDoc(collection(db, 'estandares'), {
          codigo, numeroStd: numero, frasco: frasco.letra,
          nombre: capitalizar(fNombre), cas: fCas.toUpperCase(), lote: fLote.toUpperCase(),
          cliente: fCliente, producto: capitalizar(fProducto),
          tipoPotencia: fTipoPotencia,
          potencia: (fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca') ? parseFloat(fPotencia) : null,
          tipoInsumo: fTipoInsumo,
          karlFischer: fKarlFischer, secadoPrevio: fSecadoPrevio,
          tempSecado: fSecadoPrevio ? capitalizar(fTempSecado) : '',
          tiempoSecado: fSecadoPrevio ? capitalizar(fTiempoSecado) : '',
          secadoDesecador: fSecadoDesecador,
          sector: fSector, almacenamiento: fAlmacen,
          fabricante: capitalizar(fFabricante), observacion: capitalizar(fObservacion),
          stockInicial: parseFloat(frasco.stock), stockRestante: parseFloat(frasco.stock),
          cantPorAnalisis: parseFloat(fXAnalisis) || 200,
          esUSP: fEsUSP,
          frecuenciaRevUSP: fEsUSP ? parseInt(fFrecuenciaUSP) : null,
          proximaRevisionUSP: fEsUSP ? fProxRevisionUSP : null,
          ultimaRevisionUSP: null,
          fechaVencimiento: !fEsUSP && fVencimiento ? new Date(fVencimiento) : null,
          estado: rol === 'administrativo' ? 'Pendiente de aprobación' : estadoFrasco, creadoPorRol: rol,
          mesIngreso: fMes || mesAct, anioIngreso: parseInt(fAnio || anioAct),
          creadoPor: user.email, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
        })
      }
      setShowForm(false); setFrascos([{ letra: 'A', stock: '' }]); setMsg(''); load()
    } catch(e) { setMsg('Error al guardar: ' + e.message) }
    finally { setGuardando(false) }
  }
 
  const pesada = async () => {
    if (!pesadaId || !fMg) { setMsg('Ingresa la cantidad pesada'); return }
    try {
      const { registrarPesada } = await import('../lib/db')
      await registrarPesada({
        estandarId: pesadaId, mgPesados: parseFloat(fMg),
        nAnalisis: fNAnalisis, producto: capitalizar(fProducto2),
        analista: user.displayName || user.email, email: user.email,
      })
      setPesadaId(null); setFMg(''); setFNAnalisis(''); setFProducto2(''); setMsg(''); load()
    } catch(e) { setMsg(e.message) }
  }
 
  const handlePonerEnUso = async (item, forzar = false) => {
    const parseFecha = v => {
      if (!v) return new Date('9999-12-31')
      if (v?.toDate) return v.toDate()
      // Parsear string ISO sin problemas de timezone
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]))
      return new Date(v)
    }
    const hermanos = items.filter(h =>
      h.numeroStd === item.numeroStd &&
      !['Dado de baja','Dada de baja','Retirado por cliente','Sin stock'].includes(h.estado)
    )
    const hayEnUso = hermanos.some(h => h.estado === 'En uso')
    if (hayEnUso) {
      alert('Ya hay un frasco En uso de este estándar. Debe agotarse antes de abrir otro.')
      return
    }
    const cerrados = hermanos.filter(h => h.estado === 'Cerrado')
    cerrados.sort((a, b) => {
      const dA = parseFecha(a.fechaVencimiento)
      const dB = parseFecha(b.fechaVencimiento)
      if (dA - dB !== 0) return dA - dB
      return (a.frasco || '').localeCompare(b.frasco || '')
    })
    const correcto = cerrados[0]
    const esCorrecto = correcto?.id === item.id
    if (!esCorrecto && !forzar) {
      const puedeForazar = rol === 'jefe' || rol === 'admin'
      if (!puedeForazar) {
        alert(`⚠️ Orden FEFO: El siguiente frasco a abrir es:\n${correcto?.codigo || ''}\n\nVence: ${correcto?.fechaVencimiento ? new Date(correcto.fechaVencimiento?.toDate?.() || correcto.fechaVencimiento).toLocaleDateString('es-CL') : 'Sin fecha'}`)
        return
      }
      const confirmar = window.confirm(
        `El frasco correcto a abrir es ${correcto?.codigo || ''}.\n¿Deseas abrir ${item.codigo} de todas formas?`
      )
      if (!confirmar) return
    }
    try {
      await ponerEnUsoInsumo({ coleccion:'estandares', insumoId:item.id,
        usuario: user.displayName || user.email, email: user.email })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const confirmarRetiro = async () => {
    if (!retiroFecha) { alert('Indica la fecha de retiro'); return }
    try {
      await retirarInsumo({ coleccion:'estandares', insumoId:retiroItem.id,
        fechaRetiro: retiroFecha,
        motivo: retiroMotivo || 'Cliente solicitó devolución del insumo',
        usuario: user.displayName || user.email, email: user.email })
      setRetiroItem(null); setRetiroFecha(''); setRetiroMotivo(''); load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const darDeBaja = async (id, codigo) => {
    const razon = window.prompt(`Razón para dar de baja ${codigo}:`)
    if (!razon) return
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'Dado de baja', bajaPor: user.email, bajaRazon: capitalizar(razon),
        bajaFecha: serverTimestamp(), actualizadoEn: serverTimestamp(),
      })
      await registrarAudit({
        coleccion: 'estandares', documentoId: id, accion: 'dar_de_baja',
        despues: { estado: 'Dado de baja' },
        detalle: `Dado de baja por ${user.email}. Razón: ${razon}`,
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }
 
  const restaurar = async (id) => {
    try {
      await updateDoc(doc(db, 'estandares', id), {
        estado: 'Cerrado', bajaPor: null, bajaRazon: null, bajaFecha: null,
        actualizadoEn: serverTimestamp(),
      })
      await registrarAudit({
        coleccion: 'estandares', documentoId: id, accion: 'restaurar',
        despues: { estado: 'Cerrado' },
        detalle: `Restaurado por ${user.email}`,
      })
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }
 
  const guardarSector = async (id) => {
    if (!editSectorVal.length) return
    try {
      await updateDoc(doc(db, 'estandares', id), { sector: editSectorVal, actualizadoEn: serverTimestamp() })
      setEditSectorId(null)
      load()
    } catch(e) { alert('Error: ' + e.message) }
  }

  const abrirReposicion = (item) => {
    setReposicionItem(item)
    setRLote(''); setRVencimiento(''); setRMsg('')
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const hermanos = items.filter(h => h.numeroStd === item.numeroStd && h.estado !== 'Dado de baja')
    const usadas = new Set(hermanos.map(h => h.frasco))
    const sig = letras.split('').find(l => !usadas.has(l)) || 'A'
    setRFrascos([{ letra: sig, stock: '' }])
  }

  const guardarReposicion = async () => {
    if (!rLote || rFrascos.some(fr => !fr.stock)) { setRMsg('Lote y stock son obligatorios'); return }
    setGuardandoR(true)
    try {
      for (const fr of rFrascos) {
        const codigo = generarCodigo(reposicionItem.numeroStd, reposicionItem.mesIngreso || mesAct, reposicionItem.anioIngreso || anioAct, rLote, fr.letra)
        await addDoc(collection(db, 'estandares'), {
          ...reposicionItem,
          id: undefined,
          codigo, frasco: fr.letra, lote: rLote.toUpperCase(),
          fechaVencimiento: rVencimiento ? new Date(rVencimiento) : null,
          stockInicial: parseFloat(fr.stock), stockRestante: parseFloat(fr.stock),
          estado: 'Cerrado',
          creadoPor: user.email, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
          bajaPor: null, bajaRazon: null, bajaFecha: null,
        })
      }
      setReposicionItem(null); load()
    } catch(e) { setRMsg('Error: ' + e.message) }
    finally { setGuardandoR(false) }
  }

  const abrirVerificacionUSP = (item) => {
    setUspModalId(item.id)
    setUspResultado('vigente')
    setUspFechaVerif(new Date().toISOString().split('T')[0])
    setUspFrecuencia(String(item.frecuenciaRevUSP || 12))
    setUspProxRevision(calcularProximaRevision(new Date().toISOString().split('T')[0], 1))
    setUspObs('')
  }
 
  const guardarVerificacionUSP = async () => {
    if (!uspModalId) return
    setGuardandoUSP(true)
    const item = items.find(i => i.id === uspModalId)
    if (!item) return
    try {
      if (uspResultado === 'vigente') {
        await updateDoc(doc(db, 'estandares', uspModalId), {
          proximaRevisionUSP: uspProxRevision, ultimaRevisionUSP: uspFechaVerif,
          frecuenciaRevUSP: parseInt(uspFrecuencia),
          observacion: uspObs ? capitalizar(uspObs) : item.observacion,
          actualizadoEn: serverTimestamp(),
        })
        await addDoc(collection(db, 'usos_estandares'), {
          estandarId: uspModalId, codigo: item.codigo, nombre: item.nombre, cliente: item.cliente,
          tipo: 'verificacion_usp', resultado: 'Vigente', fechaVerif: uspFechaVerif,
          proxRevision: uspProxRevision, observacion: uspObs,
          analista: user.displayName || user.email, email: user.email, fecha: serverTimestamp(),
        })
        await registrarAudit({
          coleccion: 'estandares', documentoId: uspModalId, accion: 'verificacion_usp',
          despues: { resultado: 'Vigente', proximaRevisionUSP: uspProxRevision, fechaVerif: uspFechaVerif },
          detalle: `Verificación USP Vigente por ${user.displayName || user.email}. Próxima revisión: ${uspProxRevision}`,
        })
      } else {
        const mismosLotes = items.filter(i => i.lote === item.lote && i.nombre === item.nombre && i.estado !== 'Dado de baja')
        const batch = writeBatch(db)
        for (const vial of mismosLotes) {
          batch.update(doc(db, 'estandares', vial.id), {
            estado: 'Dado de baja', bajaPor: user.email,
            bajaRazon: `Estándar USP no vigente — verificación ${uspFechaVerif}. ${uspObs}`,
            bajaFecha: serverTimestamp(), actualizadoEn: serverTimestamp(),
          })
        }
        await batch.commit()
        await addDoc(collection(db, 'usos_estandares'), {
          estandarId: uspModalId, codigo: item.codigo, nombre: item.nombre, cliente: item.cliente,
          tipo: 'verificacion_usp', resultado: 'No vigente — baja automática',
          vialsDadosDeBaja: mismosLotes.length, fechaVerif: uspFechaVerif, observacion: uspObs,
          analista: user.displayName || user.email, email: user.email, fecha: serverTimestamp(),
        })
        await registrarAudit({
          coleccion: 'estandares', documentoId: uspModalId, accion: 'verificacion_usp',
          despues: { resultado: 'No vigente', estado: 'Dado de baja', vialsDadosDeBaja: mismosLotes.length, fechaVerif: uspFechaVerif },
          detalle: `Verificación USP No vigente por ${user.displayName || user.email}. ${mismosLotes.length} vial(es) dado(s) de baja automáticamente.`,
        })
      }
      setUspModalId(null); load()
    } catch(e) { alert('Error: ' + e.message) }
    finally { setGuardandoUSP(false) }
  }
 
  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCampo(campo); setOrdenDir('asc') }
  }
 
  const activos  = items.filter(i => i.estado !== 'Dado de baja')
  const papelera = items.filter(i => i.estado === 'Dado de baja')
 
  const filtrados = (verPapelera ? papelera : activos)
    .filter(i => {
      const q = search.toLowerCase()
      const matchQ = !q || i.codigo?.toLowerCase().includes(q) || i.nombre?.toLowerCase().includes(q) || i.cliente?.toLowerCase().includes(q)
      const matchE = !filtroEst || i.estado === filtroEst
      const matchC = !filtroCliente || i.cliente === filtroCliente
      return matchQ && matchE && matchC
    })
    .sort((a, b) => {
      let valA, valB
      if (ordenCampo === 'nombre') {
        valA = a.nombre?.toLowerCase() || ''
        valB = b.nombre?.toLowerCase() || ''
      } else if (ordenCampo === 'codigo') {
        valA = a.codigo?.toLowerCase() || ''
        valB = b.codigo?.toLowerCase() || ''
      } else if (ordenCampo === 'vencimiento') {
        const getTs = (i) => {
          if (i.esUSP && i.proximaRevisionUSP) return new Date(i.proximaRevisionUSP).getTime()
          if (i.fechaVencimiento?.toDate) return i.fechaVencimiento.toDate().getTime()
          if (i.fechaVencimiento) return new Date(i.fechaVencimiento).getTime()
          return 9999999999999
        }
        valA = getTs(a); valB = getTs(b)
        return ordenDir === 'asc' ? valA - valB : valB - valA
      }
      if (valA < valB) return ordenDir === 'asc' ? -1 : 1
      if (valA > valB) return ordenDir === 'asc' ? 1 : -1
      return 0
    })
 
  const usuariosUnicos = [...new Set(pesadas.map(p => p.analista || p.email).filter(Boolean))]
  const stdsUnicos     = [...new Set(pesadas.map(p => p.codigo).filter(Boolean))]
 
  const pesadasFiltradas = pesadas.filter(p => {
    const q = searchH.toLowerCase()
    const matchQ = !q || p.codigo?.toLowerCase().includes(q) || p.nombre?.toLowerCase().includes(q) || p.nAnalisis?.toLowerCase().includes(q)
    const matchU = !filtroUsuario || (p.analista || p.email) === filtroUsuario
    const matchS = !filtroStd || p.codigo === filtroStd
    const fecha  = p.fecha?.toDate ? p.fecha.toDate() : null
    const matchD = !fechaDesde || (fecha && fecha >= new Date(fechaDesde))
    const matchH = !fechaHasta || (fecha && fecha <= new Date(fechaHasta + 'T23:59:59'))
    return matchQ && matchU && matchS && matchD && matchH
  })
 
  const totalMg = pesadasFiltradas.reduce((acc, p) => acc + (parseFloat(p.mgPesados) || 0), 0)
  const needsPotencia = fTipoPotencia === 'tal_cual' || fTipoPotencia === 'base_seca'
 
  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
 
  return (
    <>
      {reposicionItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:480}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Reposición de stock</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{reposicionItem.nombre} · {reposicionItem.cliente} · STD-{String(reposicionItem.numeroStd).padStart(4,'0')}</p>
            {rMsg && <div className="alert-item danger" style={{marginBottom:10}}>{rMsg}</div>}
            <div className="form-grid">
              <div className="form-group"><label>N° Lote nuevo *</label><input value={rLote} onChange={e=>setRLote(e.target.value.toUpperCase())} placeholder="ej: LRAD9999"/></div>
              <div className="form-group"><label>Fecha vencimiento</label><input type="date" value={rVencimiento} onChange={e=>setRVencimiento(e.target.value)}/></div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS</label>
                <button className="btn btn-sm" onClick={()=>{ const letras='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const sig=letras[rFrascos.length]; if(sig) setRFrascos(p=>[...p,{letra:sig,stock:''}]) }}><Plus size={12}/> Agregar</button>
              </div>
              {rFrascos.map((fr,i)=>(
                <div key={fr.letra} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',marginBottom:6}}>
                  <div style={{width:24,height:24,borderRadius:'50%',background:'var(--accent-lt)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:11,color:'var(--accent)',flexShrink:0}}>{fr.letra}</div>
                  <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock} style={{flex:1}} onChange={e=>setRFrascos(p=>p.map((f,j)=>j===i?{...f,stock:e.target.value}:f))}/>
                  {rFrascos.length>1 && <button className="btn btn-sm" style={{color:'var(--danger)'}} onClick={()=>setRFrascos(p=>p.filter((_,j)=>j!==i))}>✕</button>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={guardarReposicion} disabled={guardandoR}>
                {guardandoR?<div className="spinner" style={{width:14,height:14,borderWidth:2}}/>:<RefreshCw size={14}/>} Guardar reposición
              </button>
              <button className="btn btn-sm" onClick={()=>setReposicionItem(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {retiroItem && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:440}}>
            <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Retirar por cliente</p>
            <p style={{fontSize:12,color:'var(--text-2)',marginBottom:16}}>{retiroItem.codigo} — {retiroItem.nombre}</p>
            <div className="form-group" style={{marginBottom:10}}>
              <label>Fecha de retiro *</label>
              <input type="date" value={retiroFecha} onChange={e=>setRetiroFecha(e.target.value)}/>
            </div>
            <div className="form-group" style={{marginBottom:16}}>
              <label>Motivo / observación</label>
              <input value={retiroMotivo} onChange={e=>setRetiroMotivo(e.target.value)}
                placeholder="ej: Cliente solicitó devolución del insumo"/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={confirmarRetiro}>Confirmar retiro</button>
              <button className="btn btn-sm" onClick={()=>{setRetiroItem(null);setRetiroFecha('');setRetiroMotivo('')}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {docInsumo && (
        <DocumentosPanel insumoId={docInsumo.id} modulo="estandares"
          nombreInsumo={`${docInsumo.nombre} · ${docInsumo.codigo}`}
          onClose={()=>setDocInsumo(null)} />
      )}
 
      {uspModalId && (() => {
        const item = items.find(i => i.id === uspModalId)
        if (!item) return null
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <div>
                  <p style={{fontSize:15,fontWeight:600}}>Verificación USP</p>
                  <p style={{fontSize:12,color:'var(--text-2)'}}>{item.nombre} · {item.codigo}</p>
                </div>
                <button className="btn btn-sm" onClick={()=>setUspModalId(null)}>✕</button>
              </div>
              <a href={`https://www.usp.org/reference-standards/reference-standards-catalog?query=${encodeURIComponent(item.nombre)}`}
                target="_blank" rel="noopener noreferrer" className="btn btn-sm"
                style={{width:'100%',justifyContent:'center',marginBottom:16,textDecoration:'none'}}>
                <ExternalLink size={14}/> Verificar en catálogo USP ↗
              </a>
              <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:8}}>RESULTADO DE LA VERIFICACIÓN</p>
              <div style={{display:'flex',gap:10,marginBottom:16}}>
                <label style={{flex:1,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:'var(--radius-sm)',border:`2px solid ${uspResultado==='vigente'?'var(--ok)':'var(--border-md)'}`,background:uspResultado==='vigente'?'var(--ok-lt)':'var(--surface)',cursor:'pointer',fontSize:13}}>
                  <input type="radio" name="uspRes" value="vigente" checked={uspResultado==='vigente'} onChange={e=>setUspResultado(e.target.value)} style={{display:'none'}}/>
                  <CheckCircle size={16} style={{color:uspResultado==='vigente'?'var(--ok)':'var(--text-3)'}}/> Vigente — continúa en uso
                </label>
                <label style={{flex:1,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:'var(--radius-sm)',border:`2px solid ${uspResultado==='no_vigente'?'var(--danger)':'var(--border-md)'}`,background:uspResultado==='no_vigente'?'var(--danger-lt)':'var(--surface)',cursor:'pointer',fontSize:13}}>
                  <input type="radio" name="uspRes" value="no_vigente" checked={uspResultado==='no_vigente'} onChange={e=>setUspResultado(e.target.value)} style={{display:'none'}}/>
                  <XCircle size={16} style={{color:uspResultado==='no_vigente'?'var(--danger)':'var(--text-3)'}}/> No vigente — dar de baja
                </label>
              </div>
              {uspResultado === 'no_vigente' && (
                <div style={{background:'var(--danger-lt)',border:'1px solid var(--danger)',borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:16,fontSize:12,color:'var(--danger)'}}>
                  ⚠️ Se darán de baja automáticamente <strong>todos los frascos del lote {item.lote}</strong> del estándar {item.nombre}.
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label>Fecha de verificación *</label>
                  <input type="date" value={uspFechaVerif} onChange={e=>setUspFechaVerif(e.target.value)} />
                </div>
                {uspResultado === 'vigente' && (
                  <>
                    <div className="form-group">
                      <label>Frecuencia de revisión (meses)</label>
                      <input type="number" min="1" max="24" value={uspFrecuencia}
                        onChange={e=>{ setUspFrecuencia(e.target.value); if (e.target.value) setUspProxRevision(calcularProximaRevision(uspFechaVerif || new Date().toISOString().split('T')[0], e.target.value)) }} />
                    </div>
                    <div className="form-group" style={{gridColumn:'1/-1'}}>
                      <label>Próxima revisión</label>
                      <input type="date" value={uspProxRevision} onChange={e=>setUspProxRevision(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label>Observaciones</label>
                  <input value={uspObs} onChange={onChangeCapitalizar(setUspObs)} placeholder="Observaciones de la verificación" />
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button className={`btn btn-sm ${uspResultado==='no_vigente'?'btn-danger':'btn-primary'}`}
                  onClick={guardarVerificacionUSP} disabled={guardandoUSP}>
                  {guardandoUSP ? <div className="spinner" style={{width:14,height:14,borderWidth:2}}/> : null}
                  {uspResultado==='vigente' ? 'Confirmar — sigue vigente' : 'Confirmar — dar de baja lote completo'}
                </button>
                <button className="btn btn-sm" onClick={()=>setUspModalId(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )
      })()}
 
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600}}>Estándares</h2>
        <div style={{display:'flex',gap:8}}>
          {tab==='inventario' && puedeBaja && (
            <button className="btn btn-sm"
              style={verPapelera?{background:'var(--danger-lt)',color:'var(--danger)',borderColor:'var(--danger)'}:{}}
              onClick={()=>{setVerPapelera(!verPapelera);setSearch('');setFiltroEst('');setFiltroCliente('')}}>
              🗑 Papelera {papelera.length>0&&`(${papelera.length})`}
            </button>
          )}
          {tab==='inventario' && !verPapelera && puedeAgregar && (
            <button className="btn btn-primary btn-sm" onClick={abrirFormulario}>
              <Plus size={14}/> Nuevo estándar
            </button>
          )}
          {tab==='historial' && <button className="btn btn-sm" onClick={loadHistorial}>↻ Actualizar</button>}
        </div>
      </div>
 
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[
          { id:'inventario', label:'Inventario', count:activos.length },
          { id:'historial',  label:'Historial de pesadas', count:pesadas.length },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 16px',
            fontSize:13,cursor:'pointer',border:'none',background:'none',
            color:tab===t.id?'var(--accent)':'var(--text-2)',
            borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
            fontWeight:tab===t.id?500:400,marginBottom:-1,
          }}>
            {t.id==='inventario'?<Package size={14}/>:<History size={14}/>}
            {t.label}
            {t.count>0&&<span style={{fontSize:11,padding:'1px 6px',borderRadius:10,background:'var(--bg)',color:'var(--text-2)'}}>{t.count}</span>}
          </button>
        ))}
      </div>
 
      {tab==='inventario' && (
        <>
          {showForm && puedeAgregar && !verPapelera && (
            <div className="card">
              <div className="card-title">
                Ingresar nuevo estándar
                {sigNum && <span className="badge badge-purple">N°: STD-{String(sigNum).padStart(4,'0')}</span>}
              </div>
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Nombre *</label><input value={fNombre} onChange={onChangeCapitalizar(setFNombre)} placeholder="ej: Cilostazol"/></div>
                <div className="form-group"><label>Cliente *</label>
                  <select value={fCliente} onChange={e=>setFCliente(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {listaClientes.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>N° Lote *</label><input value={fLote} onChange={e=>setFLote(e.target.value.toUpperCase())} placeholder="ej: LRAD4238"/></div>
                <div className="form-group"><label>N° CAS</label><input value={fCas} onChange={e=>setFCas(e.target.value)} placeholder="ej: 73963-72-1"/></div>
                <div className="form-group"><label>Mes ingreso</label>
                  <select value={fMes} onChange={e=>setFMes(e.target.value)}>
                    {Array.from({length:12},(_,i)=>(<option key={i+1} value={String(i+1).padStart(2,'0')}>{MESES[i]}</option>))}
                  </select>
                </div>
                <div className="form-group"><label>Año ingreso</label>
                  <select value={fAnio} onChange={e=>setFAnio(e.target.value)}>
                    {[2023,2024,2025,2026,2027].map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Producto</label><input value={fProducto} onChange={onChangeCapitalizar(setFProducto)} placeholder="ej: Cilosvitae 100"/></div>
                <div className="form-group"><label>Sector</label>
                  <div style={{display:'flex',gap:8}}>
                    {SECTORES.map(s=>(
                      <label key={s} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,padding:'5px 11px',borderRadius:'var(--radius-sm)',border:`1px solid ${fSector.includes(s)?'var(--accent)':'var(--border-md)'}`,background:fSector.includes(s)?'var(--accent-lt)':'var(--surface)',color:fSector.includes(s)?'var(--accent)':'var(--text-1)'}}>
                        <input type="checkbox" style={{display:'none'}} checked={fSector.includes(s)}
                          onChange={()=>setFSector(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])}/>
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group"><label>Almacenamiento</label>
                  <select value={fAlmacen} onChange={e=>setFAlmacen(e.target.value)}>{ALMACENES.map(a=><option key={a}>{a}</option>)}</select>
                </div>
                <div className="form-group"><label>Fabricante</label><input value={fFabricante} onChange={onChangeCapitalizar(setFabricante)} placeholder="ej: Sigma-aldrich"/></div>
                <div className="form-group"><label>Cant. por análisis (mg)</label><input type="number" step="0.01" value={fXAnalisis} onChange={e=>setFXAnalisis(e.target.value)}/></div>
              </div>
 
              <div style={{background:'var(--accent-lt)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14,border:'1px solid var(--border)'}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,fontWeight:500}}>
                  <input type="checkbox" checked={fEsUSP} onChange={e=>setFEsUSP(e.target.checked)}/>
                  🔵 Estándar USP — sin fecha de vencimiento, requiere verificación periódica
                </label>
                {fEsUSP && (
                  <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div className="form-group">
                      <label>Frecuencia de revisión (meses) *</label>
                      <input type="number" min="1" max="24" value={fFrecuenciaUSP}
                        onChange={e=>{ setFFrecuenciaUSP(e.target.value); if (e.target.value) setFProxRevisionUSP(calcularProximaRevision(new Date().toISOString().split('T')[0], e.target.value)) }}
                        placeholder="ej: 12"/>
                    </div>
                    <div className="form-group">
                      <label>Próxima revisión (calculada)</label>
                      <input type="date" value={fProxRevisionUSP} onChange={e=>setFProxRevisionUSP(e.target.value)}/>
                    </div>
                    <div className="form-group" style={{gridColumn:'1/-1'}}>
                      <p style={{fontSize:11,color:'var(--accent)',fontStyle:'italic'}}>El sistema alertará cuando se acerque la fecha de revisión y permitirá registrar la verificación en el catálogo USP.</p>
                    </div>
                  </div>
                )}
              </div>
 
              {!fEsUSP && (
                <div className="form-group" style={{marginBottom:14,maxWidth:200}}>
                  <label>Fecha vencimiento</label>
                  <input type="date" value={fVencimiento} onChange={e=>setFVencimiento(e.target.value)}/>
                </div>
              )}
 
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14}}>
                <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>POTENCIA</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                  {TIPO_POTENCIA.map(t => (
                    <label key={t.value} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,padding:'6px 12px',borderRadius:'var(--radius-sm)',border:`1px solid ${fTipoPotencia===t.value?'var(--accent)':'var(--border-md)'}`,background:fTipoPotencia===t.value?'var(--accent-lt)':'var(--surface)',color:fTipoPotencia===t.value?'var(--accent)':'var(--text-1)'}}>
                      <input type="radio" name="tipoPotencia" value={t.value} checked={fTipoPotencia===t.value} onChange={e=>setFTipoPotencia(e.target.value)} style={{display:'none'}}/>
                      {t.label}
                    </label>
                  ))}
                </div>
                {needsPotencia && (
                  <div className="form-group" style={{maxWidth:200}}>
                    <label>Valor de potencia (%) *</label>
                    <input type="number" step="0.001" min="0" max="100" value={fPotencia} onChange={e=>setFPotencia(e.target.value)} placeholder="ej: 99.5"/>
                  </div>
                )}
              </div>
 
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14}}>
                <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>TIPO DE INSUMO</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {TIPO_INSUMO.map(t=>(
                    <label key={t.value} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,padding:'6px 12px',borderRadius:'var(--radius-sm)',border:`1px solid ${fTipoInsumo===t.value?'var(--accent)':'var(--border-md)'}`,background:fTipoInsumo===t.value?'var(--accent-lt)':'var(--surface)',color:fTipoInsumo===t.value?'var(--accent)':'var(--text-1)'}}>
                      <input type="radio" name="tipoInsumo" value={t.value} checked={fTipoInsumo===t.value} onChange={e=>setFTipoInsumo(e.target.value)} style={{display:'none'}}/>
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{background:'var(--warn-lt)',borderRadius:'var(--radius-md)',padding:'12px 14px',marginBottom:14}}>
                <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>CONDICIONES ESPECIALES PREVIAS</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:10}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={fKarlFischer} onChange={e=>setFKarlFischer(e.target.checked)}/> 💧 Karl Fischer
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={fSecadoPrevio} onChange={e=>setFSecadoPrevio(e.target.checked)}/> 🌡️ Secado previo
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={fSecadoDesecador} onChange={e=>setFSecadoDesecador(e.target.checked)}/> 🧪 Secado en desecador
                  </label>
                </div>
                {fSecadoPrevio && (
                  <div style={{display:'flex',gap:10}}>
                    <div className="form-group" style={{flex:1}}>
                      <label>Temperatura (°C)</label>
                      <input value={fTempSecado} onChange={e=>setFTempSecado(e.target.value)} placeholder="ej: 105"/>
                    </div>
                    <div className="form-group" style={{flex:1}}>
                      <label>Tiempo / condición</label>
                      <input value={fTiempoSecado} onChange={onChangeCapitalizar(setFTiempoSecado)} placeholder="ej: 2 horas"/>
                    </div>
                  </div>
                )}
                {fSecadoDesecador && (
                  <div style={{background:'var(--warn-lt)',border:'1px solid var(--warn)',borderRadius:'var(--radius-sm)',padding:'8px 12px',fontSize:12,color:'var(--warn)',marginTop:8}}>
                    ⚠️ Revisar etiqueta o metodología antes de usar.
                  </div>
                )}
              </div>
 
              <div className="form-group" style={{marginBottom:14}}>
                <label>Observaciones</label>
                <input value={fObservacion} onChange={onChangeCapitalizar(setFObservacion)} placeholder="Observaciones adicionales"/>
              </div>
 
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:600,color:'var(--text-2)'}}>FRASCOS DEL ENVÍO</label>
                  <button className="btn btn-sm" onClick={agregarFrasco}><Plus size={12}/> Agregar frasco</button>
                </div>
                {frascos.map((fr,i) => {
                  const sugerido = sigNum && fLote ? generarCodigo(sigNum, fMes||mesAct, fAnio||anioAct, fLote, fr.letra) : ''
                  return (
                    <div key={fr.letra} style={{background:'var(--bg)',padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',marginBottom:6}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:sugerido?6:0}}>
                        <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:12,color:i===0?'var(--accent)':'var(--text-2)',flexShrink:0}}>{fr.letra}</div>
                        <div style={{fontSize:11,color:'var(--text-2)',minWidth:80}}>{i===0?<span style={{color:'var(--ok)',fontWeight:500}}>En uso</span>:<span>Cerrado</span>}</div>
                        <div className="form-group" style={{flex:1,margin:0}}>
                          <input type="number" step="0.01" placeholder="Stock inicial (mg)" value={fr.stock} onChange={e=>updateFrasco(i,e.target.value)}/>
                        </div>
                        {frascos.length>1 && <button className="btn btn-sm" onClick={()=>quitarFrasco(i)} style={{padding:'4px 8px',color:'var(--danger)'}}>✕</button>}
                      </div>
                      {sugerido && (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <input
                            value={fr.codigoCustom ?? sugerido}
                            onChange={e=>setFrascos(p=>p.map((f,j)=>j===i?{...f,codigoCustom:e.target.value}:f))}
                            style={{flex:1,fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,padding:'3px 7px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',background:'var(--surface)'}}
                          />
                          {fr.codigoCustom !== undefined && fr.codigoCustom !== sugerido && (
                            <button type="button" title="Restaurar código auto-generado"
                              onClick={()=>setFrascos(p=>p.map((f,j)=>j===i?{...f,codigoCustom:undefined}:f))}
                              style={{padding:'2px 7px',fontSize:13,border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',background:'var(--bg)',cursor:'pointer',flexShrink:0}}>↺</button>
                          )}
                          {(fr.codigoCustom === undefined || fr.codigoCustom === sugerido) && (
                            <span style={{fontSize:10,color:'var(--ok)',whiteSpace:'nowrap'}}>✓ Auto</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
 
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando?<div className="spinner" style={{width:14,height:14,borderWidth:2}}/>:<FlaskConical size={14}/>}
                  {guardando?'Guardando...':`Guardar ${frascos.length} frasco${frascos.length>1?'s':''}`}
                </button>
                <button className="btn btn-sm" onClick={()=>{setShowForm(false);setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}
 
          {pesadaId && puedePesada && (
            <div className="card">
              <div className="card-title">Registrar pesada — {items.find(i=>i.id===pesadaId)?.nombre} · Frasco {items.find(i=>i.id===pesadaId)?.frasco}</div>
              {(() => {
                const std = items.find(i=>i.id===pesadaId)
                return std && (std.karlFischer || std.secadoPrevio || std.secadoDesecador) ? (
                  <div style={{background:'var(--warn-lt)',borderRadius:'var(--radius-sm)',padding:'8px 12px',marginBottom:12,fontSize:12}}>
                    <strong style={{color:'var(--warn)'}}>⚠️ Condiciones especiales requeridas:</strong>
                    <BadgesCondiciones karlFischer={std.karlFischer} secadoPrevio={std.secadoPrevio} tempSecado={std.tempSecado} tiempoSecado={std.tiempoSecado} secadoDesecador={std.secadoDesecador}/>
                    {std.secadoDesecador && <div style={{marginTop:4,color:'var(--warn)',fontWeight:500}}>Revisar etiqueta o metodología antes de pesar.</div>}
                  </div>
                ) : null
              })()}
              {msg && <div className="alert-item danger" style={{marginBottom:10}}>{msg}</div>}
              <div className="form-grid">
                <div className="form-group"><label>Cantidad pesada (mg) *</label><input type="number" step="0.01" placeholder="ej: 10.25" value={fMg} onChange={e=>setFMg(e.target.value)}/></div>
                <div className="form-group"><label>N° análisis</label><input value={fNAnalisis} onChange={e=>setFNAnalisis(e.target.value)}/></div>
                <div className="form-group"><label>Producto / análisis</label><input value={fProducto2} onChange={onChangeCapitalizar(setFProducto2)}/></div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={pesada}>Confirmar pesada</button>
                <button className="btn btn-sm" onClick={()=>{setPesadaId(null);setMsg('')}}>Cancelar</button>
              </div>
            </div>
          )}
 
          {/* Barra búsqueda y ordenamiento */}
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
            <div className="search-bar">
              <Search size={16} style={{color:'var(--text-3)',flexShrink:0}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por código, nombre o cliente..." style={{flex:1}}/>
              {!verPapelera && (
                <select value={filtroEst} onChange={e=>setFiltroEst(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {ESTADOS.filter(e=>e!=='Dado de baja').map(e=><option key={e}>{e}</option>)}
                </select>
              )}
              <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
                <option value="">Todos los clientes</option>
                {listaClientes.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--text-2)',alignSelf:'center'}}>Ordenar por:</span>
              {[
                { campo:'nombre',      label:'Nombre' },
                { campo:'codigo',      label:'Código' },
                { campo:'vencimiento', label:'Vencimiento' },
              ].map(o => (
                <button key={o.campo} className="btn btn-sm"
                  style={ordenCampo===o.campo?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
                  onClick={()=>toggleOrden(o.campo)}>
                  {o.label} {ordenCampo===o.campo?(ordenDir==='asc'?'↑':'↓'):'↕'}
                </button>
              ))}
            </div>
          </div>
 
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Nombre / Producto</th><th>Frasco</th><th>Cliente</th>
                  <th>Sector</th><th>Potencia</th><th>Condiciones</th><th>Stock (mg)</th>
                  <th>Vencimiento / Revisión</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => {
                  const vence    = i.fechaVencimiento?.toDate?.() || (i.fechaVencimiento ? new Date(i.fechaVencimiento) : null)
                  const sem      = calcularSemaforo(vence)
                  const badgeCls = sem.color==='danger'?'badge-danger':sem.color==='warning'?'badge-warn':sem.color==='success'?'badge-ok':'badge-gray'
                  const estCls   = {'En uso':'badge-ok','Cerrado':'badge-info','Vencido':'badge-danger','Sin stock':'badge-warn','Dado de baja':'badge-gray','Dada de baja':'badge-gray','Retirado por cliente':'badge-purple'}[i.estado]||'badge-gray'
                  const diasUSP  = i.esUSP ? diasHastaRevision(i.proximaRevisionUSP) : null
                  const uspAlerta = i.esUSP && diasUSP !== null && diasUSP <= 60
                  return (
                    <tr key={i.id}>
                      <td className="mono" style={{fontSize:10}}>{i.codigo}</td>
                      <td style={{fontWeight:500}}>
                        <div>{i.nombre}{i.esUSP && <span className="badge badge-info" style={{marginLeft:4,fontSize:10}}>USP</span>}</div>
                        {i.producto && <div style={{fontSize:10,color:'var(--text-3)'}}>{i.producto}</div>}
                        {i.observacion && <div style={{fontSize:10,color:'var(--text-3)',fontStyle:'italic'}}>{i.observacion}</div>}
                      </td>
                      <td>
                        <span style={{width:24,height:24,borderRadius:'50%',background:i.estado==='En uso'?'var(--accent-lt)':'var(--bg)',border:'1px solid var(--border-md)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:i.estado==='En uso'?'var(--accent)':'var(--text-2)'}}>
                          {i.frasco||'—'}
                        </span>
                      </td>
                      <td style={{color:'var(--text-2)'}}>{i.cliente}</td>
                      <td>
                        {editSectorId === i.id ? (
                          <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                            {SECTORES.map(s=>(
                              <label key={s} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:11,padding:'2px 8px',borderRadius:'var(--radius-sm)',border:`1px solid ${editSectorVal.includes(s)?'var(--accent)':'var(--border-md)'}`,background:editSectorVal.includes(s)?'var(--accent-lt)':'var(--surface)'}}>
                                <input type="checkbox" style={{display:'none'}} checked={editSectorVal.includes(s)}
                                  onChange={()=>setEditSectorVal(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])}/>
                                {s}
                              </label>
                            ))}
                            <button className="btn btn-sm" style={{padding:'2px 5px',color:'var(--ok)'}} onClick={()=>guardarSector(i.id)}>✓</button>
                            <button className="btn btn-sm" style={{padding:'2px 5px'}} onClick={()=>setEditSectorId(null)}>✕</button>
                          </div>
                        ) : (
                          <span style={{cursor:'pointer',fontSize:11,color:'var(--text-2)',borderBottom:'1px dashed var(--border-md)'}}
                            onClick={()=>{setEditSectorId(i.id);setEditSectorVal(Array.isArray(i.sector)?i.sector:(i.sector?[i.sector]:[]))}}>
                            {Array.isArray(i.sector) ? i.sector.join(' / ') : (i.sector || '—')}
                          </span>
                        )}
                      </td>
                      <td><BadgePotencia tipoPotencia={i.tipoPotencia} potencia={i.potencia}/></td>
                      <td>
                        {(i.karlFischer||i.secadoPrevio||i.secadoDesecador)
                          ?<BadgesCondiciones karlFischer={i.karlFischer} secadoPrevio={i.secadoPrevio} tempSecado={i.tempSecado} tiempoSecado={i.tiempoSecado} secadoDesecador={i.secadoDesecador}/>
                          :<span style={{color:'var(--text-3)',fontSize:11}}>—</span>}
                      </td>
                      <td><strong>{i.stockRestante??'—'}</strong></td>
                      <td>
                        {i.esUSP
                          ? <BadgeRevisionUSP proximaRevision={i.proximaRevisionUSP}/>
                          : vence ? <span className={`badge ${badgeCls}`}>{sem.texto}</span> : <span style={{color:'var(--text-3)'}}>—</span>
                        }
                      </td>
                      <td><span className={`badge ${estCls}`}>{i.estado}</span></td>
                      <td>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <span style={{visibility: puedePonerEnUso && i.estado==='Cerrado' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Poner en uso" onClick={()=>handlePonerEnUso(i)}><PlayCircle size={13}/></button>
                          </span>
                          <span style={{visibility: puedePesada && i.estado==='En uso' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Registrar pesada" onClick={()=>{setPesadaId(i.id);setShowForm(false)}}><FlaskConical size={13}/></button>
                          </span>
                          <span style={{visibility: i.esUSP && (i.estado==='En uso'||i.estado==='Cerrado') && puedePesada ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Verificar USP"
                              style={uspAlerta?{background:'var(--accent-lt)',color:'var(--accent)',borderColor:'var(--accent)'}:{}}
                              onClick={()=>abrirVerificacionUSP(i)}>
                              <CheckCircle size={13}/>
                            </button>
                          </span>
                          <span style={{visibility: puedeAgregar && !verPapelera ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Reposición de stock" onClick={()=>abrirReposicion(i)}><RefreshCw size={13}/></button>
                          </span>
                          <button className="btn btn-sm" onClick={()=>setDocInsumo(i)} title="Ver documentos"><FileText size={13}/></button>
                          <span style={{visibility: puedeBaja && !verPapelera && i.estado!=='Retirado por cliente' ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" title="Retirar por cliente" onClick={()=>setRetiroItem(i)}><PackageX size={13}/></button>
                          </span>
                          <span style={{visibility: puedeBaja && !verPapelera ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" style={{color:'var(--danger)',borderColor:'var(--danger)'}} onClick={()=>darDeBaja(i.id,i.codigo)} title="Dar de baja"><PackageX size={13} style={{transform:'rotate(180deg)'}}/></button>
                          </span>
                          <span style={{visibility: puedeBaja && verPapelera ? 'visible':'hidden'}}>
                            <button className="btn btn-sm" onClick={()=>restaurar(i.id)} title="Restaurar"><RefreshCw size={13}/></button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length===0 && (
                  <tr><td colSpan={11} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>
                    {verPapelera?'La papelera está vacía':'No hay estándares que coincidan'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
 
      {tab==='historial' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            <div className="kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value info">{pesadasFiltradas.length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total mg pesados</div><div className="kpi-value">{totalMg.toFixed(2)} mg</div></div>
            <div className="kpi-card"><div className="kpi-label">Analistas</div><div className="kpi-value">{usuariosUnicos.length}</div></div>
          </div>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Filtros</div>
            <div className="form-grid">
              <div className="form-group"><label>Buscar</label><input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Código, nombre o N° análisis..."/></div>
              <div className="form-group"><label>Analista</label>
                <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                  <option value="">Todos</option>{usuariosUnicos.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Estándar</label>
                <select value={filtroStd} onChange={e=>setFiltroStd(e.target.value)}>
                  <option value="">Todos</option>{stdsUnicos.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Desde</label><input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/></div>
              <div className="form-group"><label>Hasta</label><input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/></div>
              <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                <button className="btn btn-sm" onClick={()=>{setSearchH('');setFiltroUsuario('');setFiltroStd('');setFechaDesde('');setFechaHasta('')}}>Limpiar</button>
              </div>
            </div>
          </div>
          {loadingH ? (
            <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha y hora</th><th>Tipo</th><th>Analista</th><th>Código</th><th>Nombre</th>
                    <th>Mg / Resultado</th><th>Stock antes</th><th>Stock después</th><th>N° análisis</th>
                  </tr>
                </thead>
                <tbody>
                  {pesadasFiltradas.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>{formatFecha(p.fecha)}</td>
                      <td>{p.tipo==='verificacion_usp'?<span className="badge badge-info">🔵 USP</span>:<span className="badge badge-gray">Pesada</span>}</td>
                      <td><div style={{fontSize:12,fontWeight:500}}>{p.analista||'—'}</div><div style={{fontSize:10,color:'var(--text-3)'}}>{p.email}</div></td>
                      <td className="mono" style={{fontSize:10}}>{p.codigo||p.insumoCode||'—'}</td>
                      <td style={{fontWeight:500}}>{p.nombre||p.insumoNombre||'—'}</td>
                      <td>
                        {p.tipo==='verificacion_usp'
                          ?<span style={{fontSize:12,color:p.resultado?.includes('No')?'var(--danger)':'var(--ok)',fontWeight:500}}>{p.resultado}</span>
                          :<strong style={{color:'var(--accent)'}}>{p.mgPesados} mg</strong>}
                      </td>
                      <td style={{color:'var(--text-2)'}}>{p.stockAntes?.toFixed(2)??'—'} {p.stockAntes?'mg':''}</td>
                      <td style={{color:'var(--text-2)'}}>{p.stockDespues?.toFixed(2)??'—'} {p.stockDespues?'mg':''}</td>
                      <td style={{color:'var(--text-2)'}}>{p.nAnalisis||p.fechaVerif||'—'}</td>
                    </tr>
                  ))}
                  {pesadasFiltradas.length===0 && (
                    <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-3)'}}>No hay registros que coincidan</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}