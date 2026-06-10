# CorteAlum — Sistema de Gestión de Ventanería en Aluminio

CorteAlum es un sistema web para talleres de fabricación de ventanas de aluminio.
Permite gestionar proyectos y clientes, calcular técnicamente cada ventana,
optimizar el plan de corte de las barras, administrar el banco de residuos,
generar cotizaciones y producir reportes en PDF listos para taller y para el cliente.

---

## Características principales

- **Cálculo técnico de ventanas:** a partir del sistema, perfil, diseño (ej. XX, OX, OXXO)
  y las medidas del vano, calcula cada pieza de perfil con su fórmula, longitud y ángulo.
- **Optimización del plan de corte:** acomoda las piezas en barras de 6000 mm
  (algoritmo tipo First-Fit / Best-Fit), informando aprovechamiento y desperdicio,
  con kerf de sierra y reutilización de sobrantes.
- **Banco de residuos:** guarda los sobrantes reutilizables y su historial
  (de qué proyecto salieron, en cuál se reutilizaron y por quién).
- **Cotizaciones:** calcula materiales por ventana y los costos a nivel proyecto
  (mano de obra, instalación, transportes, utilidad e IVA) con metodología configurable.
- **Reportes PDF:** reporte por ventana, reporte consolidado del proyecto y cotización,
  todos renderizados con Puppeteer (Chromium) respetando el tamaño de hoja del CSS.
- **Gestión de usuarios con roles** y acceso protegido con JWT.
- **Importación masiva** de datos por archivo Excel (.xlsx).

---

## Tecnologías

**Backend** — Node.js + Express
- PostgreSQL (`pg`)
- Autenticación: `jsonwebtoken` + `bcryptjs`
- Generación de PDF: `puppeteer`
- Importación de Excel: `xlsx`, carga de archivos con `multer`
- Seguridad: `helmet`, `cors`, `express-rate-limit`, `dotenv`

**Frontend** — React (Create React App)
- Ruteo: `react-router-dom`
- Peticiones HTTP: `axios`
- Iconos: `lucide-react`
- Notificaciones: `react-hot-toast`

---

## Estructura del proyecto

```
cortealum/
├── backend/
│   └── src/
│       ├── index.js          # arranque del servidor
│       ├── config/           # conexión a base de datos y configuración
│       ├── routes/           # definición de rutas de la API
│       ├── controllers/      # lógica de cada endpoint
│       ├── services/         # cálculo, optimización y generación de PDF
│       │   ├── pdfTemplate.js          # plantilla HTML de la cotización
│       │   ├── pdfRenderer.js          # render HTML → PDF con Puppeteer
│       │   ├── projectQuotationBuilder.js
│       │   └── logoEmblema.js          # logo embebido (base64) para los PDF
│       ├── repositories/     # acceso a datos (consultas SQL)
│       ├── middleware/       # autenticación, validaciones
│       ├── assets/
│       └── utils/
├── frontend/
│   ├── public/               # index.html, logo y banners
│   └── src/
│       ├── pages/            # pantallas (ver lista abajo)
│       ├── components/       # componentes reutilizables (incl. SimulacionModal)
│       ├── context/          # AuthContext
│       ├── assets/           # logoEmblema.js para reportes del frontend
│       └── api/              # cliente HTTP
└── *.sql                     # parches y scripts de base de datos
```

### Pantallas (frontend/src/pages)
- **Login / Registro** — acceso al sistema.
- **Dashboard** — resumen general.
- **Proyectos / NuevoProyecto / ProyectoDetalle** — gestión de proyectos y sus ventanas.
- **Cotizaciones** — generación y consulta de cotizaciones.
- **Materiales / Catálogos** — perfiles, accesorios, vidrios y precios.
- **BancoResiduos** — sobrantes reutilizables e historial.
- **ReportesTecnicos** — reportes del proyecto.
- **Usuarios** — administración de usuarios (incluye importación por Excel).
- **Perfil** — datos de la cuenta.

---

## Requisitos

- Node.js 18 o superior
- PostgreSQL 13 o superior
- Para los PDF: Chromium (lo instala Puppeteer automáticamente)

---

## Instalación y ejecución

1. **Base de datos:** crear la base en PostgreSQL y aplicar los scripts `*.sql`
   incluidos en la raíz, en orden de versión.

2. **Backend:**
   ```bash
   cd backend
   npm install
   # crear un archivo .env (ver variables más abajo)
   npm run dev      # desarrollo (nodemon)
   # o
   npm start        # producción
   ```

3. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm start        # desarrollo
   npm run build    # build de producción
   ```

### Variables de entorno (backend/.env)
```
PORT=4000
DATABASE_URL=postgres://usuario:clave@localhost:5432/cortealum
JWT_SECRET=una_clave_secreta_larga
```
(Ajustar nombres según la configuración real en `backend/src/config`.)

---

## Roles de usuario

- **Administrador** — control total: usuarios, catálogos, proyectos y cotizaciones.
- **Operario / Cotizador** — crea proyectos, calcula ventanas y genera cotizaciones.
- **Soporte técnico** — apoyo y mantenimiento.
- **Propietario** — visión general del negocio.

---

## Reportes en PDF

El sistema genera tres reportes, todos en una hoja por contenido y con el logo CORTEALUM:

1. **Reporte por ventana** (A4 horizontal): vista técnica, lista de corte,
   vidrios, accesorios y plan de barras. Se ajusta automáticamente para entrar
   siempre en una sola hoja, sin importar cuántas piezas tenga la ventana.
2. **Reporte consolidado** (A4 horizontal, una ventana por hoja): piezas de perfil,
   accesorios y vidrios de cada ventana del proyecto.
3. **Cotización** (A4 horizontal): una hoja por ventana con el detalle de materiales,
   más una hoja final de resumen económico del proyecto.

---

## Convenciones técnicas

- La base de datos **siempre guarda las dimensiones en centímetros**; los campos
  de unidad (`ancho_unidad` / `alto_unidad`) son solo para mostrar (cm o mm).
- Barra estándar: **6000 mm**; corte (kerf) considerado al optimizar; un sobrante
  se considera reutilizable cuando supera el umbral configurado.
- Mano de obra, instalación, transportes, utilidad e IVA son costos **a nivel de
  proyecto**, nunca por ventana.
- Las vistas de PostgreSQL que usan `SELECT *` deben recrearse (DROP + CREATE)
  cuando cambian las columnas de origen.

---

> Proyecto desarrollado en el marco de formación SENA — Análisis y Desarrollo de Software.
