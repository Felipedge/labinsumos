"""
Script de importación de datos a Firebase Firestore
Usa la API REST de Firestore (sin gRPC) para mayor compatibilidad.

Ejecutar con:
  python3 scripts/importar_datos.py           # importación real
  python3 scripts/importar_datos.py --dry-run  # solo imprime, no escribe

Requiere:
  pip install openpyxl google-auth requests
"""

import os
import sys
import json
import datetime
import time
import openpyxl
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

# ──────────────────────────────────────────────
# CONFIGURACIÓN
# ──────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_PATH   = os.path.join(BASE_DIR, "serviceAccountKey.json")

EXCEL_ESTANDARES = os.path.join(BASE_DIR, "scripts/data/Estandares_1.xlsx")
EXCEL_REACTIVOS  = os.path.join(BASE_DIR, "scripts/data/Reactivos_1.xlsx")
EXCEL_PLACEBOS   = os.path.join(BASE_DIR, "scripts/data/Placebos_y_Api_1.xlsx")

DRY_RUN = "--dry-run" in sys.argv

# ──────────────────────────────────────────────
# AUTENTICACIÓN Y CLIENTE REST
# ──────────────────────────────────────────────
PROJECT_ID   = None
_credentials = None
_session     = None

def init_firebase():
    global PROJECT_ID, _credentials, _session
    with open(KEY_PATH) as f:
        key = json.load(f)
    PROJECT_ID = key["project_id"]
    _credentials = service_account.Credentials.from_service_account_file(
        KEY_PATH,
        scopes=["https://www.googleapis.com/auth/datastore"]
    )
    _session = requests.Session()

def get_token():
    if not _credentials.valid:
        _credentials.refresh(Request())
    return _credentials.token

def fs_url(collection, doc_id):
    return (f"https://firestore.googleapis.com/v1/"
            f"projects/{PROJECT_ID}/databases/(default)/documents/"
            f"{collection}/{doc_id}")

def patch_doc(collection, doc_id, fields_payload):
    """PATCH (upsert) un documento en Firestore via REST. Reintenta hasta 3 veces."""
    url = fs_url(collection, doc_id)
    headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
    body = {"fields": fields_payload}
    for attempt in range(3):
        try:
            r = _session.patch(url, json=body, headers=headers, timeout=30)
            if r.status_code in (200, 201):
                return True
            print(f"    HTTP {r.status_code}: {r.text[:120]}")
            return False
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise

# ──────────────────────────────────────────────
# HELPERS DE SERIALIZACIÓN FIRESTORE
# ──────────────────────────────────────────────
def fstr(v):
    return {"stringValue": str(v) if v is not None else ""}

def fnull():
    return {"nullValue": None}

def fbool(v):
    return {"booleanValue": bool(v)}

def fnum(v):
    if v is None:
        return {"doubleValue": 0}
    try:
        return {"doubleValue": float(v)}
    except (TypeError, ValueError):
        return {"doubleValue": 0}

def fdate(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, datetime.datetime):
        return {"timestampValue": v.strftime("%Y-%m-%dT%H:%M:%SZ")}
    return {"nullValue": None}

NOW_TS = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

def fnow():
    return {"timestampValue": NOW_TS}

def fval(v):
    """Serializa cualquier valor Python al tipo Firestore correcto."""
    if v is None:
        return fnull()
    if isinstance(v, bool):
        return fbool(v)
    if isinstance(v, (int, float)):
        return fnum(v)
    if isinstance(v, datetime.datetime):
        return fdate(v)
    return fstr(v)

# ──────────────────────────────────────────────
# HELPERS DE DATOS
# ──────────────────────────────────────────────
def to_date(val):
    if val is None:
        return None
    if isinstance(val, datetime.datetime):
        return val.replace(hour=0, minute=0, second=0, microsecond=0)
    if isinstance(val, datetime.date):
        return datetime.datetime(val.year, val.month, val.day)
    return None

def clean(val):
    if val is None:
        return None
    s = str(val).strip()
    if s.upper() in ("N/A", "NA", "", "NONE"):
        return None
    return s

def bool_field(val):
    return str(val or "").strip().upper() in ("TRUE", "SI", "SÍ", "YES", "1")

def safe_id(codigo):
    """Convierte el codigo (con barras) a un ID de documento válido para Firestore."""
    return str(codigo).replace("/", "_").replace(" ", "-")

def map_estado_estandar(raw):
    m = {"EN USO": "En uso", "CERRADO": "Cerrado",
         "SIN STOCK": "Sin stock", "VENCIDO": "Sin stock"}
    return m.get(str(raw or "").strip().upper(), "Cerrado")

def map_estado_reactivo(raw):
    m = {"EN USO": "En uso", "SELLADO": "Cerrado", "TERMINADO": "Sin stock"}
    return m.get(str(raw or "").strip().upper(), "Cerrado")

def map_estado_placebo(stock_val, vigencia_val, obs_col13, obs_col17):
    baja_text = " ".join(filter(None, [str(obs_col13 or ""), str(obs_col17 or "")])).lower()
    vigencia  = str(vigencia_val or "").strip().upper()
    stock     = str(stock_val or "").strip().upper()
    if "de baja" in baja_text:
        return "Dado de baja"
    if vigencia == "VENCIDO":
        return "Sin stock"
    if stock in ("SI", "SÍ"):
        return "En uso"
    return "Sin stock"

def write_doc(collection, codigo, doc_dict):
    doc_id = safe_id(codigo)
    if DRY_RUN:
        print(f"  [{collection}/{doc_id}]")
        return True
    fields = {k: fval(v) for k, v in doc_dict.items()}
    return patch_doc(collection, doc_id, fields)

# ──────────────────────────────────────────────
# 1. ESTÁNDARES
# ──────────────────────────────────────────────
def importar_estandares():
    print("\n=== IMPORTANDO ESTÁNDARES ===")
    wb = openpyxl.load_workbook(EXCEL_ESTANDARES, data_only=True)
    ws = wb["Hoja1"]
    ok = err = skip = 0
    for r in range(2, ws.max_row + 1):
        codigo = clean(ws.cell(r, 1).value)
        if not codigo:
            skip += 1
            continue
        fabricante = clean(ws.cell(r, 24).value) or ""
        doc = {
            "codigo":             codigo,
            "idStd":              clean(ws.cell(r, 2).value),
            "fechaIngreso":       to_date(ws.cell(r, 3).value),
            "numeroCAS":          clean(ws.cell(r, 4).value),
            "cliente":            clean(ws.cell(r, 5).value),
            "nombre":             clean(ws.cell(r, 6).value),
            "lote":               clean(ws.cell(r, 7).value),
            "producto":           clean(ws.cell(r, 8).value),
            "potencia":           ws.cell(r, 9).value or 0,
            "fechaVencimiento":   to_date(ws.cell(r, 10).value),
            "vigencia":           clean(ws.cell(r, 11).value),
            "vigenciaPrimario":   clean(ws.cell(r, 12).value),
            "fechaRevision":      to_date(ws.cell(r, 13).value),
            "analisisPosibles":   ws.cell(r, 14).value or 0,
            "relieveCantMg":      ws.cell(r, 15).value or 0,
            "estado":             map_estado_estandar(ws.cell(r, 16).value),
            "observaciones":      clean(ws.cell(r, 17).value),
            "sector":             clean(ws.cell(r, 18).value),
            "numeroVial":         clean(ws.cell(r, 19).value),
            "almacenamiento":     clean(ws.cell(r, 20).value),
            "coa":                bool_field(ws.cell(r, 21).value),
            "fichaSeguridad":     bool_field(ws.cell(r, 22).value),
            "tieneRetest":        bool_field(ws.cell(r, 23).value),
            "fabricante":         fabricante,
            "esUSP":              fabricante.upper() == "USP",
            "cantidadRecibidaMg": ws.cell(r, 25).value or 0,
            "cantPorAnalisisMg":  ws.cell(r, 26).value or 0,
            "creadoEn":           to_date(ws.cell(r, 3).value) or datetime.datetime.utcnow(),
            "importado":          True,
        }
        try:
            if write_doc("estandares", codigo, doc):
                ok += 1
            else:
                err += 1
        except Exception as e:
            print(f"  ERROR fila {r} ({codigo}): {e}")
            err += 1
        if (ok + err) % 200 == 0 and (ok + err) > 0:
            print(f"  {ok + err} procesados ({ok} ok, {err} err)...")
    print(f"  ✓ {ok} estándares importados, {err} errores, {skip} vacíos omitidos")

# ──────────────────────────────────────────────
# 2. REACTIVOS
# ──────────────────────────────────────────────
def importar_reactivos():
    print("\n=== IMPORTANDO REACTIVOS ===")
    wb = openpyxl.load_workbook(EXCEL_REACTIVOS, data_only=True)
    ws = wb["Hoja1"]
    ok = err = skip = 0
    for r in range(6, ws.max_row + 1):
        codigo = clean(ws.cell(r, 7).value)
        if not codigo:
            skip += 1
            continue
        ncas_raw = ws.cell(r, 11).value
        ncas = None
        if ncas_raw and not isinstance(ncas_raw, datetime.datetime):
            ncas = clean(str(ncas_raw))
        doc = {
            "codigo":              codigo,
            "codigoGeneral":       clean(ws.cell(r, 3).value),
            "nombre":              clean(ws.cell(r, 4).value),
            "lote":                clean(str(ws.cell(r, 5).value)) if ws.cell(r, 5).value else None,
            "fechaVencimiento":    to_date(ws.cell(r, 6).value),
            "estado":              map_estado_reactivo(ws.cell(r, 9).value),
            "lugarAlmacenamiento": clean(ws.cell(r, 8).value),
            "numeroCAS":           ncas,
            "mesAnioRecepcion":    to_date(ws.cell(r, 12).value),
            "envaseNumero":        clean(ws.cell(r, 13).value),
            "fabricante":          clean(ws.cell(r, 14).value),
            "proveedor":           clean(ws.cell(r, 15).value),
            "envaseFecha":         clean(ws.cell(r, 16).value),
            "condicionRecepcion":  clean(ws.cell(r, 17).value),
            "temperaturaRecepcion": ws.cell(r, 18).value or 0,
            "tipoReactivo":        clean(ws.cell(r, 20).value),
            "tipoEnvase":          clean(ws.cell(r, 21).value),
            "presentacion":        clean(ws.cell(r, 22).value),
            "integridadEnvase":    clean(ws.cell(r, 23).value),
            "documentacionRespaldo": clean(ws.cell(r, 24).value),
            "adquiridoPara":       clean(ws.cell(r, 25).value),
            "recepcionadoPor":     clean(ws.cell(r, 26).value),
            "fechaIngreso":        to_date(ws.cell(r, 2).value),
            "creadoEn":            to_date(ws.cell(r, 2).value) or datetime.datetime.utcnow(),
            "importado":           True,
        }
        try:
            if write_doc("reactivos", codigo, doc):
                ok += 1
            else:
                err += 1
        except Exception as e:
            print(f"  ERROR fila {r} ({codigo}): {e}")
            err += 1
        if (ok + err) % 300 == 0 and (ok + err) > 0:
            print(f"  {ok + err} procesados ({ok} ok, {err} err)...")
    print(f"  ✓ {ok} reactivos importados, {err} errores, {skip} vacíos omitidos")

# ──────────────────────────────────────────────
# 3. PLACEBOS
# ──────────────────────────────────────────────
def importar_placebos():
    print("\n=== IMPORTANDO PLACEBOS ===")
    wb = openpyxl.load_workbook(EXCEL_PLACEBOS, data_only=True)
    ws = wb["Placebo"]
    ok = err = skip = 0
    for r in range(2, ws.max_row + 1):
        codigo_base = clean(ws.cell(r, 1).value)
        if not codigo_base:
            skip += 1
            continue
        codigo = clean(ws.cell(r, 14).value) or codigo_base
        fecha_venc_raw = ws.cell(r, 4).value
        fecha_venc = to_date(fecha_venc_raw) if isinstance(fecha_venc_raw, (datetime.datetime, datetime.date)) else None
        vigencia   = ws.cell(r, 5).value
        doc = {
            "codigo":              codigo,
            "codigoBase":          codigo_base,
            "productoReferencia":  clean(ws.cell(r, 6).value),
            "laboratorio":         clean(ws.cell(r, 7).value),
            "lote":                clean(str(ws.cell(r, 3).value)) if ws.cell(r, 3).value else None,
            "fechaIngreso":        to_date(ws.cell(r, 2).value),
            "fechaVencimiento":    fecha_venc,
            "vigencia":            clean(str(vigencia)) if vigencia else None,
            "ubicacion":           clean(ws.cell(r, 8).value),
            "tieneStock":          str(ws.cell(r, 9).value or "").strip().upper() in ("SI", "SÍ"),
            "numeroViales":        ws.cell(r, 10).value or 0,
            "cantidadRevalidacion": ws.cell(r, 11).value or 0,
            "uso":                 clean(ws.cell(r, 12).value),
            "observaciones":       clean(ws.cell(r, 13).value),
            "estado":              map_estado_placebo(ws.cell(r, 9).value, vigencia,
                                                      ws.cell(r, 13).value, ws.cell(r, 17).value),
            "creadoEn":            to_date(ws.cell(r, 2).value) or datetime.datetime.utcnow(),
            "importado":           True,
        }
        try:
            if write_doc("placebos", codigo, doc):
                ok += 1
            else:
                err += 1
        except Exception as e:
            print(f"  ERROR fila {r} ({codigo_base}): {e}")
            err += 1
        if (ok + err) % 100 == 0 and (ok + err) > 0:
            print(f"  {ok + err} procesados ({ok} ok, {err} err)...")
    print(f"  ✓ {ok} placebos importados, {err} errores, {skip} vacíos omitidos")

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    for p in [EXCEL_ESTANDARES, EXCEL_REACTIVOS, EXCEL_PLACEBOS]:
        if not os.path.exists(p):
            print(f"ERROR: falta {p}")
            sys.exit(1)

    if not DRY_RUN:
        if not os.path.exists(KEY_PATH):
            print(f"ERROR: falta {KEY_PATH}")
            sys.exit(1)
        init_firebase()
        print(f"Conectado a proyecto: {PROJECT_ID}")

    importar_estandares()
    importar_reactivos()
    importar_placebos()

    print("\n✅ Importación completada.")
