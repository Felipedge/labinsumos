# LabInsumos — Guía de despliegue completa
## Stack: React + Vite · Firebase · Vercel

---

## Requisitos previos (instalar una sola vez)

- **Node.js 18+**: https://nodejs.org → descargar versión LTS e instalar
- **Git**: https://git-scm.com/downloads → instalar con opciones por defecto
- **Cuenta Google** institucional del laboratorio
- **Cuenta Vercel**: registrarse en https://vercel.com con la misma cuenta Google

---

## PASO 1 — Configurar Firebase

### 1.1 Crear proyecto
1. Ir a https://console.firebase.google.com
2. Clic en **"Agregar proyecto"**
3. Nombre: `labinsumos-fqval`
4. Desactivar Google Analytics (no es necesario)
5. Clic en **"Crear proyecto"**

### 1.2 Agregar app web
1. En el panel del proyecto → clic en el ícono **`</>`** (Web)
2. Nombre de la app: `labinsumos`
3. **NO** marcar "Firebase Hosting" (usaremos Vercel)
4. Clic en **"Registrar app"**
5. **Copiar** el objeto `firebaseConfig` que aparece — lo necesitarás en el Paso 3

### 1.3 Activar Google Login
1. En el menú izquierdo → **Authentication**
2. Clic en **"Comenzar"**
3. Pestaña **"Sign-in method"**
4. Clic en **Google** → activar el interruptor
5. Completar "Nombre público del proyecto": `LabInsumos FQ/VAL`
6. Guardar

### 1.4 Crear base de datos Firestore
1. En el menú izquierdo → **Firestore Database**
2. Clic en **"Crear base de datos"**
3. Seleccionar **"Comenzar en modo producción"**
4. Elegir región: `us-central1` (o la más cercana disponible)
5. Clic en **"Listo"**

### 1.5 Configurar reglas de seguridad Firestore
1. En Firestore → pestaña **"Reglas"**
2. Reemplazar todo el contenido con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Solo usuarios autenticados pueden leer y escribir
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Clic en **"Publicar"**

> 💡 **Más adelante** puedes refinar las reglas para limitar por dominio de correo:
> `allow read, write: if request.auth.token.email.matches('.*@tudominio\\.cl');`

---

## PASO 2 — Preparar el proyecto localmente

### 2.1 Copiar los archivos
1. Crear una carpeta llamada `labinsumos` en el escritorio
2. Copiar todos los archivos de este zip dentro de esa carpeta
   - La estructura debe quedar así:
   ```
   labinsumos/
   ├── index.html
   ├── package.json
   ├── vite.config.js
   └── src/
       ├── main.jsx
       ├── index.css
       ├── lib/
       │   ├── firebase.js
       │   └── db.js
       ├── hooks/
       │   └── useAuth.js
       ├── pages/
       │   ├── LoginPage.jsx
       │   ├── Dashboard.jsx
       │   ├── Escanear.jsx
       │   ├── Estandares.jsx
       │   ├── Columnas.jsx
       │   ├── Reactivos.jsx
       │   ├── Placebo.jsx
       │   └── Alertas.jsx
       └── components/
           ├── layout/
           │   └── AppShell.jsx
           └── shared/
               └── Toast.jsx
   ```

### 2.2 Abrir terminal en la carpeta
- **Windows**: clic derecho en la carpeta → "Abrir en Terminal" (o PowerShell)
- **Mac**: clic derecho → "Nueva Terminal en carpeta"

### 2.3 Instalar dependencias
```bash
npm install
```
Esperar hasta que termine (puede tardar 1-2 minutos).

---

## PASO 3 — Conectar Firebase al proyecto

1. Abrir el archivo `src/lib/firebase.js` con cualquier editor de texto (Notepad, VS Code)
2. Reemplazar el bloque `firebaseConfig` con las credenciales copiadas en el Paso 1.2:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",          // ← pegar valor real
  authDomain:        "labinsumos-fqval.firebaseapp.com",
  projectId:         "labinsumos-fqval",
  storageBucket:     "labinsumos-fqval.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
}
```

3. Si tienen dominio institucional (ej: `@labfqval.cl`), cambiar también:
```js
provider.setCustomParameters({ hd: 'labfqval.cl' })
```
Si no tienen dominio propio, eliminar esa línea.

---

## PASO 4 — Probar localmente

```bash
npm run dev
```

Abrir en el navegador: **http://localhost:5173**

- Debe aparecer la pantalla de login
- Hacer clic en "Ingresar con cuenta Google"
- Seleccionar cuenta institucional
- Verificar que el dashboard carga correctamente

> Si todo funciona, continuar con el despliegue.

---

## PASO 5 — Publicar en Vercel

### 5.1 Subir a GitHub
```bash
git init
git add .
git commit -m "inicial"
```

Ir a https://github.com → Nuevo repositorio → nombre `labinsumos` → Crear (privado)

Copiar los comandos que GitHub muestra y ejecutarlos en terminal (algo como):
```bash
git remote add origin https://github.com/TU_USUARIO/labinsumos.git
git push -u origin main
```

### 5.2 Desplegar en Vercel
1. Ir a https://vercel.com → **"Add New Project"**
2. Importar el repositorio `labinsumos` de GitHub
3. Vercel detecta automáticamente que es un proyecto Vite
4. **No cambiar nada** en la configuración → clic en **"Deploy"**
5. Esperar ~2 minutos → Vercel entrega una URL pública como `labinsumos.vercel.app`

### 5.3 Agregar dominio autorizado en Firebase
1. Volver a Firebase → **Authentication → Settings → Authorized domains**
2. Clic en **"Add domain"**
3. Ingresar el dominio de Vercel: `labinsumos.vercel.app`
4. Guardar

> Sin este paso, Google Login no funcionará en producción.

---

## PASO 6 — Migrar datos desde los Excel existentes

### 6.1 Instalar Firebase Admin (solo una vez)
```bash
npm install -g firebase-tools
firebase login
```

### 6.2 Usar el script de migración
En la carpeta del proyecto crear `migrar.mjs` con este contenido y ejecutar:
```bash
node migrar.mjs
```

> El script de migración se puede generar automáticamente desde Claude pasándole los datos Excel.

---

## Mantenimiento

| Tarea | Cómo hacerlo |
|-------|-------------|
| Agregar nuevo analista | El usuario solo necesita ingresar con su cuenta Google institucional |
| Ver quién hizo qué | Firebase Console → Firestore → colección `usos` |
| Actualizar la app | Hacer cambios → `git add . && git commit -m "descripción" && git push` → Vercel despliega automáticamente |
| Ver logs de errores | Vercel Dashboard → proyecto → pestaña "Logs" |
| Hacer backup | Firebase Console → Firestore → "Exportar datos" |

---

## Soporte

Si algo no funciona, los errores más comunes son:

| Error | Solución |
|-------|----------|
| "Firebase: Error (auth/unauthorized-domain)" | Agregar el dominio en Firebase Auth → Authorized domains |
| "Firebase: Error (auth/popup-blocked)" | El navegador bloqueó el popup → permitir popups para el sitio |
| Pantalla en blanco al cargar | Revisar consola del navegador (F12) → probable error en firebaseConfig |
| "npm: command not found" | Node.js no está instalado correctamente → reinstalar desde nodejs.org |
