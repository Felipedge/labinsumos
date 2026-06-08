LabInsumos — Guía de despliegue completa
Stack: React + Vite · Firebase · Vercel
Requisitos previos (instalar una sola vez)
Node.js 18+: https://nodejs.org → descargar versión LTS e instalar
Git: https://git-scm.com/downloads → instalar con opciones por defecto
Cuenta Google institucional del laboratorio
Cuenta Vercel: registrarse en https://vercel.com con la misma cuenta Google
PASO 1 — Configurar Firebase
1.1 Crear proyecto
Ir a https://console.firebase.google.com
Clic en "Agregar proyecto"
Nombre: labinsumos-fqval
Desactivar Google Analytics (no es necesario)
Clic en "Crear proyecto"
1.2 Agregar app web
En el panel del proyecto → clic en el ícono </> (Web)
Nombre de la app: labinsumos
NO marcar "Firebase Hosting" (usaremos Vercel)
Clic en "Registrar app"
Copiar el objeto firebaseConfig que aparece — lo necesitarás en el Paso 3
1.3 Activar Google Login
En el menú izquierdo → Authentication
Clic en "Comenzar"
Pestaña "Sign-in method"
Clic en Google → activar el interruptor
Completar "Nombre público del proyecto": LabInsumos FQ/VAL
Guardar
1.4 Crear base de datos Firestore
En el menú izquierdo → Firestore Database
Clic en "Crear base de datos"
Seleccionar "Comenzar en modo producción"
Elegir región: us-central1 (o la más cercana disponible)
Clic en "Listo"
1.5 Configurar reglas de seguridad Firestore
En Firestore → pestaña "Reglas"
Reemplazar todo el contenido con:
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Solo usuarios autenticados pueden leer y escribir
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
Clic en "Publicar"
💡 Más adelante puedes refinar las reglas para limitar por dominio de correo: allow read, write: if request.auth.token.email.matches('.*@tudominio\\.cl');

PASO 2 — Preparar el proyecto localmente
2.1 Copiar los archivos
Crear una carpeta llamada labinsumos en el escritorio
Copiar todos los archivos de este zip dentro de esa carpeta
La estructura debe quedar así:
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
2.2 Abrir terminal en la carpeta
Windows: clic derecho en la carpeta → "Abrir en Terminal" (o PowerShell)
Mac: clic derecho → "Nueva Terminal en carpeta"
2.3 Instalar dependencias
npm install
Esperar hasta que termine (puede tardar 1-2 minutos).

PASO 3 — Conectar Firebase al proyecto
Abrir el archivo src/lib/firebase.js con cualquier editor de texto (Notepad, VS Code)
Reemplazar el bloque firebaseConfig con las credenciales copiadas en el Paso 1.2:
const firebaseConfig = {
  apiKey:            "AIzaSy...",          // ← pegar valor real
  authDomain:        "labinsumos-fqval.firebaseapp.com",
  projectId:         "labinsumos-fqval",
  storageBucket:     "labinsumos-fqval.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
}
Si tienen dominio institucional (ej: @labfqval.cl), cambiar también:
provider.setCustomParameters({ hd: 'labfqval.cl' })
Si no tienen dominio propio, eliminar esa línea.

PASO 4 — Probar localmente
npm run dev
Abrir en el navegador: http://localhost:5173

Debe aparecer la pantalla de login
Hacer clic en "Ingresar con cuenta Google"
Seleccionar cuenta institucional
Verificar que el dashboard carga correctamente
Si todo funciona, continuar con el despliegue.

PASO 5 — Publicar en Vercel
5.1 Subir a GitHub
git init
git add .
git commit -m "inicial"
Ir a https://github.com → Nuevo repositorio → nombre labinsumos → Crear (privado)

Copiar los comandos que GitHub muestra y ejecutarlos en terminal (algo como):

git remote add origin https://github.com/TU_USUARIO/labinsumos.git
git push -u origin main
5.2 Desplegar en Vercel
Ir a https://vercel.com → "Add New Project"
Importar el repositorio labinsumos de GitHub
Vercel detecta automáticamente que es un proyecto Vite
No cambiar nada en la configuración → clic en "Deploy"
Esperar ~2 minutos → Vercel entrega una URL pública como labinsumos.vercel.app
5.3 Agregar dominio autorizado en Firebase
Volver a Firebase → Authentication → Settings → Authorized domains
Clic en "Add domain"
Ingresar el dominio de Vercel: labinsumos.vercel.app
Guardar
Sin este paso, Google Login no funcionará en producción.

PASO 6 — Migrar datos desde los Excel existentes
6.1 Instalar Firebase Admin (solo una vez)
npm install -g firebase-tools
firebase login
6.2 Usar el script de migración
En la carpeta del proyecto crear migrar.mjs con este contenido y ejecutar:

node migrar.mjs
El script de migración se puede generar automáticamente desde Claude pasándole los datos Excel.

Mantenimiento
Tarea	Cómo hacerlo
Agregar nuevo analista	El usuario solo necesita ingresar con su cuenta Google institucional
Ver quién hizo qué	Firebase Console → Firestore → colección usos
Actualizar la app	Hacer cambios → git add . && git commit -m "descripción" && git push → Vercel despliega automáticamente
Ver logs de errores	Vercel Dashboard → proyecto → pestaña "Logs"
Hacer backup	Firebase Console → Firestore → "Exportar datos"
Soporte
Si algo no funciona, los errores más comunes son:

Error	Solución
"Firebase: Error (auth/unauthorized-domain)"	Agregar el dominio en Firebase Auth → Authorized domains
"Firebase: Error (auth/popup-blocked)"	El navegador bloqueó el popup → permitir popups para el sitio
Pantalla en blanco al cargar	Revisar consola del navegador (F12) → probable error en firebaseConfig
"npm: command not found"	Node.js no está instalado correctamente → reinstalar desde nodejs.org
