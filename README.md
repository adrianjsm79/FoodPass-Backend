# FoodPass — Backend

API REST del sistema SaaS de gestión de comedores institucionales. Construida en **Node.js + Express**, base de datos **PostgreSQL**, comunicación en tiempo real con **Socket.IO** y desplegada en **Render**.

---

## ¿Qué hace este backend?

FoodPass permite que instituciones como Tecsup y Senati gestionen su comedor de forma digital. Los usuarios compran su almuerzo desde una app (o en caja), reciben un ticket con QR, y lo presentan al momento de recoger su comida.

El backend centraliza todo ese flujo:

- Registro y autenticación de usuarios con JWT
- Catálogo de productos por institución
- Creación de pedidos (desde app o caja física)
- Generación automática de tickets con código único
- Canje de tickets en tiempo real
- Control de stock con auditoría
- Sistema de crédito (postpago) para docentes
- Reportes de ventas y consumo
- Notificaciones push vía Socket.IO al dashboard

---

## Stack técnico

| Pieza | Tecnología |
|---|---|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 5 |
| Base de datos | PostgreSQL (desplegado en Render) |
| Tiempo real | Socket.IO 4 |
| Autenticación | JWT (access token 15 min + refresh token 7 días) |
| Hash de contraseñas | bcryptjs (12 rounds) |
| Tareas programadas | node-cron |
| Despliegue | Render (Web Service) |

---

## Estructura del proyecto

```
foodpass-backend/
├── server.js                  # Punto de entrada: Express + Socket.IO + jobs
├── seed.sql                   # Datos iniciales (roles, instituciones, usuarios de prueba)
├── render.yaml                # Configuración de despliegue en Render
├── .env.example               # Variables de entorno requeridas
└── src/
    ├── config/
    │   ├── db.js              # Pool de conexiones PostgreSQL
    │   └── socket.js          # Inicialización de Socket.IO y nombres de eventos
    ├── middlewares/
    │   ├── auth.middleware.js  # verifyToken, requireRole, optionalToken
    │   ├── tenant.middleware.js# attachTenant: aísla datos por institución
    │   └── error.middleware.js # Manejador global de errores
    ├── routes/                # Define los endpoints y qué middlewares aplican
    ├── controllers/           # Capa delgada: recibe req → llama service → devuelve res
    ├── services/              # Toda la lógica de negocio y queries a la DB
    ├── jobs/
    │   └── expireTickets.job.js # Expira tickets vencidos cada hora (cron)
    └── utils/
        └── ticketCode.js      # Genera códigos tipo FP-A3K9-2BX7
```

> **Flujo de una request:** `Route → Middleware (auth + tenant) → Controller → Service → PostgreSQL`

---

## Variables de entorno

Crea un archivo `.env` en la raíz basándote en `.env.example`:

```env
DATABASE_URL=postgresql://usuario:contraseña@host:5432/foodpass
JWT_SECRET=un_secreto_largo_y_aleatorio
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://tu-dashboard.vercel.app,http://localhost:3001
```

En Render, `DATABASE_URL` se inyecta automáticamente al enlazar la base de datos al servicio.

---

## Instalación y arranque local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env con tus valores locales

# 3. Crear las tablas (ejecutar el script SQL del proyecto)
psql $DATABASE_URL -f schema.sql

# 4. Insertar datos iniciales
psql $DATABASE_URL -f seed.sql

# 5. Arrancar en modo desarrollo (recarga automática)
npm run dev
```

El servidor queda disponible en `http://localhost:3000`.
Verificar que esté corriendo: `GET /health`

---

## Autenticación

Todas las rutas protegidas requieren el header:

```
Authorization: Bearer <accessToken>
```

### Flujo completo

```
POST /api/auth/registro     → Crear cuenta
POST /api/auth/login        → Obtener accessToken + refreshToken
POST /api/auth/refresh      → Renovar accessToken (cada 15 min)
POST /api/auth/logout       → Revocar refreshToken
GET  /api/auth/me           → Perfil del usuario + sus instituciones
```

### Respuesta de login

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "abc123...",
  "user": {
    "id": "uuid",
    "nombre_completo": "Admin Tecsup",
    "correo": "admin@tecsup.edu.pe"
  },
  "instituciones": [
    {
      "institucion_id": "a1000000-...",
      "institucion": "Tecsup",
      "slug": "tecsup",
      "rol": "ADMIN_INSTITUCION",
      "modalidad_pago": "PREPAGO"
    }
  ]
}
```

---

## Roles

| Rol | Descripción |
|---|---|
| `SUPERADMIN` | Administrador global de la plataforma |
| `ADMIN_INSTITUCION` | Gestiona su comedor: productos, usuarios, reportes |
| `CAJERO` | Opera el punto de venta, escanea y canjea tickets |
| `USUARIO` | Usuario final (estudiante/docente) que compra desde la app |

---

## Multi-tenancy

Cada institución es un tenant independiente. **Ningún dato se mezcla entre instituciones.**

Todas las rutas de recursos llevan el prefijo:
```
/api/instituciones/:institucionId/...
```

El middleware `attachTenant` verifica en cada request que el usuario autenticado tenga un rol activo en esa institución. Si no lo tiene, devuelve `403`.

---

## Endpoints principales

### Instituciones
```
GET    /api/instituciones
POST   /api/instituciones
GET    /api/instituciones/:id
PATCH  /api/instituciones/:id
GET    /api/instituciones/:id/configuracion
PATCH  /api/instituciones/:id/configuracion
GET    /api/instituciones/metodos-pago
```

### Usuarios de una institución
```
GET    /api/instituciones/:id/usuarios
POST   /api/instituciones/:id/usuarios          # Añadir usuario con rol
PATCH  /api/instituciones/:id/usuarios/:uid/rol
DELETE /api/instituciones/:id/usuarios/:uid     # Revocar acceso
```

### Catálogo
```
GET    /api/instituciones/:id/categorias
POST   /api/instituciones/:id/categorias
GET    /api/instituciones/:id/productos
POST   /api/instituciones/:id/productos         # Body: { categoria_id, nombre, precio, genera_ticket, stock_inicial }
PATCH  /api/instituciones/:id/productos/:pid
```

### Pedidos ⭐
```
POST   /api/instituciones/:id/pedidos           # Crear pedido (ver detalle abajo)
GET    /api/instituciones/:id/pedidos
GET    /api/instituciones/:id/pedidos/:pid
PATCH  /api/instituciones/:id/pedidos/:pid/cancelar
```

Body para crear un pedido:
```json
{
  "canal": "APP",
  "modalidad_pago": "PREPAGO",
  "items": [
    { "producto_id": "uuid", "cantidad": 1 }
  ]
}
```

Al crear un pedido el backend, dentro de una sola transacción:
1. Bloquea el stock con `FOR UPDATE` para evitar condiciones de carrera
2. Valida disponibilidad de cada producto
3. Si es postpago, valida que no exceda el límite de crédito
4. Crea el pedido e items
5. Descuenta el stock y registra el movimiento
6. Genera los tickets para productos con `genera_ticket = true`
7. Si es postpago, carga la deuda a la cuenta del usuario
8. Emite eventos Socket.IO a la room de la institución

### Tickets ⭐
```
GET    /api/instituciones/:id/tickets
GET    /api/instituciones/:id/tickets/buscar/:codigo
POST   /api/instituciones/:id/tickets/:codigo/canjear  # Endpoint de canje
GET    /api/instituciones/:id/tickets/:tid
```

Los tickets tienen tres estados posibles:

| Estado | Significado |
|---|---|
| `VIGENTE` | Listo para canjear |
| `CANJEADO` | Ya fue utilizado |
| `EXPIRADO` | Venció (job automático cada hora) |

### Pagos
```
POST   /api/instituciones/:id/pagos
GET    /api/instituciones/:id/pagos
```

### Postpago (crédito)
```
GET    /api/instituciones/:id/postpago/cuentas
POST   /api/instituciones/:id/postpago/cuentas
PATCH  /api/instituciones/:id/postpago/cuentas/:uid    # Cambiar límite de crédito
POST   /api/instituciones/:id/postpago/cuentas/:uid/abonar
GET    /api/instituciones/:id/postpago/transacciones
```

### Stock
```
GET    /api/instituciones/:id/stock
POST   /api/instituciones/:id/stock/ajuste             # Ajuste manual
GET    /api/instituciones/:id/stock/movimientos
```

### Reportes
```
GET    /api/instituciones/:id/reportes/resumen         # Dashboard: ventas hoy, tickets activos, stock bajo, deuda total
GET    /api/instituciones/:id/reportes/ventas?desde=&hasta=&agrupar_por=dia|semana|mes
GET    /api/instituciones/:id/reportes/consumo-usuario
GET    /api/instituciones/:id/reportes/deuda-postpago
```

### Notificaciones
```
GET    /api/notificaciones
PATCH  /api/notificaciones/:id/leer
PATCH  /api/notificaciones/leer-todas
```

---

## Tiempo real (Socket.IO)

Al conectarse, el cliente debe unirse a la room de su institución:

```javascript
// Cliente (Next.js / Flutter Web)
socket.emit('join:institucion', institucionId);
```

Eventos que emite el servidor:

| Evento | Cuándo se dispara | Payload |
|---|---|---|
| `nueva_venta` | Se crea un pedido | `{ pedido_id, monto_total, canal, tickets_count }` |
| `ticket_canjeado` | Se canjea un ticket | `{ ticket_id, codigo, nombre_producto, nombre_usuario }` |
| `ticket_expirado` | Job horario expira tickets | `{ cantidad_expirados, timestamp }` |
| `stock_actualizado` | Cambia el stock de un producto | `{ producto_id, nombre, stock_actual }` |
| `nueva_deuda` | Pedido postpago creado | `{ usuario_id, monto }` |
| `abono_registrado` | Se abona deuda postpago | `{ usuario_id, monto, nuevo_saldo }` |

---

## Usuarios de prueba (seed.sql)

Contraseña de todos: **`password123`**

| Correo | Rol | Institución | Modalidad |
|---|---|---|---|
| admin@tecsup.edu.pe | ADMIN_INSTITUCION | Tecsup | — |
| cajero@tecsup.edu.pe | CAJERO | Tecsup | — |
| ana@tecsup.edu.pe | USUARIO | Tecsup | Prepago |
| luis@tecsup.edu.pe | USUARIO | Tecsup | Postpago |
| admin@senati.edu.pe | ADMIN_INSTITUCION | Senati | — |
| cajero@senati.edu.pe | CAJERO | Senati | — |
| maria@senati.edu.pe | USUARIO | Senati | Prepago |
| jorge@senati.edu.pe | USUARIO | Senati | Postpago |

---

## Respuestas de error

Todos los errores siguen el mismo formato:

```json
{ "error": "Descripción del problema" }
```

| Código | Significado |
|---|---|
| `400` | Datos inválidos o regla de negocio violada |
| `401` | Token ausente, expirado o inválido |
| `403` | Sin permisos (rol insuficiente o sin acceso a la institución) |
| `404` | Recurso no encontrado |
| `409` | Conflicto: registro duplicado (correo, slug, etc.) |
| `500` | Error interno del servidor |

---

## Despliegue en Render

1. Subir el proyecto a GitHub
2. En Render → **New Web Service** → conectar el repositorio
3. Render detecta `render.yaml` automáticamente
4. Enlazar la base de datos PostgreSQL existente al servicio (Render inyecta `DATABASE_URL`)
5. Agregar `CORS_ORIGINS` en Environment con la URL del frontend
6. Ejecutar el seed en la base de datos:

```bash
psql $DATABASE_URL -f seed.sql
```

El endpoint `/health` confirma que el servicio está corriendo.
