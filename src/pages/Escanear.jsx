// src/pages/Escanear.jsx
import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { getDoc, doc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { registrarPesada, registrarUsoColumna, registrarRetiroReactivo, registrarUsoPlacebo } from '../lib/db'
import { useAuth } from '../hooks/useAuth.jsx'
import { ScanLine, CheckCircle, AlertCircle, Search } from 'lucide-react'

const COLECCIONES = ['estandares', 'columnas', 'reactivos', 'placebo']

async function buscarInsumo(codigo) {
  for (const col of COLECCIONES) {
    // Buscar por campo "codigo"
    const q = query(collection(db, col), where('codigo', '==', codigo))
    const snap = await getDocs(q)
    if (!snap.empty) {
      const d = snap.docs[0]
      return { id: d.id, coleccion: col, ...d.data() }
    }
  }
  return null
}

export default function Escanear() {
  const { user } = useAuth()
  const [scanning, setScanning]   = useState(false)
  const [insumo, setInsumo]       = useState(null)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [manual, setManual]       = useState('')
  const [form, setForm]           = useState({})
  const qrRef = useRef(null)
  const scannerRef = useRef(null)

  const startScanner = async () => {
    setScanning(true)
    setError(''); setInsumo(null); setSuccess('')
    setTimeout(async () => {
      try {
        scannerRef.current = new Html5Qrcode('qr-reader')
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (text) => {
            await stopScanner()
            await resolverCodigo(text)
          },
          () => {}
        )
      } catch (e) {
        setError('No se pudo acceder a la cámara. Usa el ingreso manual.')
        setScanning(false)
      }
    }, 100)
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  useEffect(() => () => { stopScanner() }, [])

  const resolverCodigo = async (codigo) => {
    setLoading(true); setError('')
    try {
      const result = await buscarInsumo(codigo.trim())
      if (result) { setInsumo(result); setForm({}) }
      else setError(`Código "${codigo}" no encontrado en el sistema.`)
    } catch (e) {
      setError('Error al buscar el insumo. Intenta de nuevo.')
    } finally { setLoading(false) }
  }

  const handleManual = (e) => { e.preventDefault(); if (manual.trim()) resolverCodigo(manual.trim()) }

  const confirmarUso = async () => {
    if (!insumo) return
    setLoading(true)
    try {
      const base = {
        analista: user.displayName || user.email,
        email:    user.email,
        nAnalisis: form.nAnalisis || '',
        producto:  form.producto  || '',
      }
      if (insumo.coleccion === 'estandares') {
        if (!form.mg || isNaN(form.mg)) throw new Error('Ingresa la cantidad pesada')
        await registrarPesada({ estandarId: insumo.id, mgPesados: parseFloat(form.mg), ...base })
        setSuccess(`✓ ${parseFloat(form.mg)} mg descontados de ${insumo.nombre}`)
      } else if (insumo.coleccion === 'columnas') {
        if (!form.inyecciones || isNaN(form.inyecciones)) throw new Error('Ingresa el número de inyecciones')
        await registrarUsoColumna({ columnaId: insumo.id, inyecciones: parseInt(form.inyecciones), ...base })
        setSuccess(`✓ ${form.inyecciones} inyecciones registradas en ${insumo.codigo}`)
      } else if (insumo.coleccion === 'reactivos') {
        if (!form.cantidad || isNaN(form.cantidad)) throw new Error('Ingresa la cantidad retirada')
        await registrarRetiroReactivo({ reactivoId: insumo.id, cantidad: parseFloat(form.cantidad), unidad: form.unidad || insumo.unidad, ...base })
        setSuccess(`✓ ${form.cantidad} ${form.unidad || insumo.unidad || ''} retirados de ${insumo.nombre}`)
      } else if (insumo.coleccion === 'placebo') {
        if (!form.unidades || isNaN(form.unidades)) throw new Error('Ingresa las unidades utilizadas')
        await registrarUsoPlacebo({ placeboId: insumo.id, unidades: parseInt(form.unidades), ...base })
        setSuccess(`✓ ${form.unidades} unidades registradas de ${insumo.productoReferencia}`)
      }
      setInsumo(null); setForm({})
    } catch (e) {
      setError(e.message || 'Error al registrar')
    } finally { setLoading(false) }
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <>
      <div className="card">
        <div className="card-title"><ScanLine size={15} /> Escanear código QR del insumo</div>

        {!scanning && !insumo && !success && (
          <div className="scan-area" onClick={startScanner}>
            <ScanLine size={40} style={{ color:'var(--text-3)', marginBottom:10 }} />
            <p style={{ fontWeight:500 }}>Toca para activar la cámara</p>
            <p style={{ fontSize:12, color:'var(--text-3)', marginTop:4 }}>Apunta al código QR del vial o etiqueta del insumo</p>
          </div>
        )}

        {scanning && (
          <div>
            <div id="qr-reader" style={{ width:'100%', maxWidth:400, margin:'0 auto' }} />
            <div style={{ textAlign:'center', marginTop:12 }}>
              <button className="btn" onClick={stopScanner}>Cancelar</button>
            </div>
          </div>
        )}

        {!scanning && (
          <form onSubmit={handleManual} style={{ display:'flex', gap:8, marginTop:14 }}>
            <input
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="O ingresa el código manualmente (ej: Std-0025/MAR24/LRAD4238/A)"
              style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', fontSize:13, fontFamily:'var(--font-mono)' }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
              <Search size={14} /> Buscar
            </button>
          </form>
        )}

        {loading && <div style={{ textAlign:'center', marginTop:16 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>}
        {error   && <div className="alert-item danger" style={{ marginTop:12 }}><AlertCircle size={14} />{error}</div>}
      </div>

      {/* Resultado del escaneo */}
      {insumo && !success && (
        <div className="card">
          <div className="card-title">
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <CheckCircle size={15} style={{ color:'var(--ok)' }} /> Insumo identificado
            </span>
            <span className="badge badge-purple">{insumo.coleccion}</span>
          </div>

          <div className="form-grid" style={{ marginBottom:16 }}>
            <div className="form-group">
              <label>Código</label>
              <input readOnly value={insumo.codigo || ''} />
            </div>
            <div className="form-group">
              <label>Nombre</label>
              <input readOnly value={insumo.nombre || insumo.productoReferencia || insumo.fase || ''} />
            </div>
            <div className="form-group">
              <label>Cliente</label>
              <input readOnly value={insumo.cliente || '—'} />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <input readOnly value={insumo.estado || '—'} />
            </div>
            {insumo.coleccion === 'estandares' && (
              <div className="form-group">
                <label>Stock restante</label>
                <input readOnly value={`${insumo.stockRestante ?? '—'} mg`} />
              </div>
            )}
            {insumo.coleccion === 'columnas' && (
              <div className="form-group">
                <label>Inyecciones acumuladas</label>
                <input readOnly value={`${insumo.inyeccionesAcumuladas ?? 0} / ${insumo.limiteInyecciones ?? 1500}`} />
              </div>
            )}
          </div>

          <p style={{ fontWeight:600, fontSize:12, marginBottom:10 }}>Registrar uso:</p>
          <div className="form-grid">
            {insumo.coleccion === 'estandares' && (
              <div className="form-group">
                <label>Cantidad pesada (mg) *</label>
                <input type="number" step="0.01" placeholder="ej: 10.25" onChange={f('mg')} />
              </div>
            )}
            {insumo.coleccion === 'columnas' && (
              <div className="form-group">
                <label>N° inyecciones hoy *</label>
                <input type="number" placeholder="ej: 12" onChange={f('inyecciones')} />
              </div>
            )}
            {insumo.coleccion === 'reactivos' && (
              <>
                <div className="form-group">
                  <label>Cantidad retirada *</label>
                  <input type="number" step="0.01" placeholder="ej: 500" onChange={f('cantidad')} />
                </div>
                <div className="form-group">
                  <label>Unidad</label>
                  <select onChange={f('unidad')}>
                    <option value="mL">mL</option>
                    <option value="L">L</option>
                    <option value="g">g</option>
                    <option value="mg">mg</option>
                  </select>
                </div>
              </>
            )}
            {insumo.coleccion === 'placebo' && (
              <div className="form-group">
                <label>Unidades utilizadas *</label>
                <input type="number" placeholder="ej: 10" onChange={f('unidades')} />
              </div>
            )}
            <div className="form-group">
              <label>N° de análisis</label>
              <input placeholder="ej: 26324" onChange={f('nAnalisis')} />
            </div>
            <div className="form-group">
              <label>Producto / análisis</label>
              <input placeholder="ej: Cilosvitae 100 — Valoración" onChange={f('producto')} />
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn btn-primary" onClick={confirmarUso} disabled={loading}>
              {loading ? <div className="spinner" style={{ width:14, height:14, borderWidth:2 }} /> : <CheckCircle size={14} />}
              Confirmar registro
            </button>
            <button className="btn" onClick={() => { setInsumo(null); setManual('') }}>Cancelar</button>
          </div>
        </div>
      )}

      {success && (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <CheckCircle size={40} style={{ color:'var(--ok)', margin:'0 auto 12px' }} />
          <p style={{ fontSize:15, fontWeight:500 }}>{success}</p>
          <p style={{ fontSize:12, color:'var(--text-2)', marginTop:6 }}>Stock actualizado · Historial registrado · {user.displayName || user.email}</p>
          <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => { setSuccess(''); setManual('') }}>
            <ScanLine size={14} /> Escanear otro
          </button>
        </div>
      )}
    </>
  )
}
