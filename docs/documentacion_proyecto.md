# Documentación: Sistema de Turnos para Pedicuría

## 1. Descripción General
Sistema web para la gestión y reserva de turnos de un servicio de pedicuría. Permite a los clientes agendar citas con o sin registro previo, integrando pagos (Mercado Pago Checkout Pro / Efectivo en el local) y notificaciones automáticas. La administración tiene control total sobre los servicios, disponibilidad y gestión de citas.

**Stack Tecnológico:**
*   **Framework:** Next.js 16 (App Router) · React 19 · Tailwind v4
*   **Base de datos:** Supabase (PostgreSQL)
*   **ORM:** Prisma 7 (generator `prisma-client` + driver adapter `@prisma/adapter-pg`)
*   **Autenticación:** Clerk
*   **Emails:** Resend
*   **Pagos:** Mercado Pago Checkout Pro

---

## 2. Roles de Usuario

### 2.1. Cliente (User)
*   **Reserva de turnos:** Puede seleccionar servicios, horarios y métodos de pago.
*   **Gestión de cuenta (Opcional en la primera reserva):** 
    *   Puede reservar como "invitado" (Guest).
    *   El sistema le crea una cuenta automáticamente vinculada a su email.
    *   Para acceder posteriormente, utiliza el flujo de "Olvidé mi contraseña" en Clerk para establecer una clave y gestionar sus turnos futuros.
*   **Visualización y gestión:** Si inicia sesión, puede ver el historial y estado de sus turnos, y reprogramar o cancelar sus próximos turnos (ver 7.6).
*   **Pago pendiente:** Si abandonó el checkout de Mercado Pago, puede reintentar el pago mientras el turno siga reservado (ver sección 4).

### 2.2. Administrador (Admin)
*   **Gestión de Turnos:** Cancelar, reprogramar horarios y marcar turnos como "Completados".
*   **Gestión de Cobros:** Registrar como cobrados los pagos en el local y consultar el estado de los pagos online (incluidos reembolsos y contracargos).
*   **Gestión de Disponibilidad:** Restringir o bloquear franjas de días (por vacaciones, licencias o feriados).
*   **Gestión de Servicios:** Crear nuevos servicios prestados, editar descripciones y actualizar precios.

---

## 3. Flujos Principales

### 3.1. Flujo de Reserva de Turno
El proceso consta de los siguientes pasos secuenciales (Wizard):

1.  **Selección de Servicio:** El usuario elige qué servicio desea (Ej: Corte de uñas, Pedicuría completa, etc.).
2.  **Selección de Fecha y Hora:** Se despliega un calendario/grilla de horarios. **Lógica de negocio:** Solo se muestran horarios dentro del horario de atención (lunes a sábados de 8 a 17, ver 7.8) y disponibles: se filtran los turnos que ocupan el horario (ver 5.2), los turnos esperando pago cuya reserva no venció y las fechas bloqueadas por el Admin.
3.  **Identificación del Usuario (UI de dos columnas/recuadros):**
    *   *Opción A (No tengo cuenta):* Formulario para completar Email, Nombre, Apellido y Teléfono.
    *   *Opción B (Ya tengo cuenta):* Formulario simplificado que solo pide el Email.
4.  **Resumen y Pago:** 
    *   Muestra una tarjeta de resumen: Nombre del servicio, precio, día y hora.
    *   Debajo, dos botones de acción: `[ Pagar en el local ]` y `[ Pagar con Mercado Pago ]`.
    *   **Pagar en el local:** se crea el turno en `PENDING` y un `Payment` con método `IN_STORE` en estado `PENDING`. El admin lo marca como `PAID` cuando cobra.
    *   **Pagar con Mercado Pago:** se crea el turno en `PENDING_PAYMENT`, se genera la preferencia de Checkout Pro y se redirige al cliente a Mercado Pago (detalle en la sección 4).

### 3.2. Flujo de "Shadow Account" (Creación de cuenta en reserva)
1. El usuario completa la "Opción A" del paso 3.
2. El sistema verifica si el email ya existe. Si no existe, se crea un `User` en la base de datos.
3. Una vez confirmada la reserva (en segundo plano, con `after()`), si el `User` no tiene `clerkId` se busca una cuenta de Clerk con ese email o se crea una **sin contraseña**, con el email en estado `reserved` (no verificado, pero sirve para iniciar sesión y nadie más puede registrarlo), y se guarda su id en `User.clerkId`. Si Clerk falla, la reserva no se ve afectada.
4. Para ver sus turnos, el cliente va a "Iniciar sesión" con su email y Clerk le manda un código (requiere activar **Email verification code** como forma de inicio de sesión en Clerk). Si prefiere usar contraseña, puede definirla con "Olvidé mi contraseña".
5. El webhook de Clerk `user.created` vincula por email las cuentas creadas desde "Registrarse" (personas que se registran sin haber reservado antes, o si falló el paso 3).

---

## 4. Pagos con Mercado Pago (Checkout Pro)

### 4.1. Conceptos
*   **El estado del cobro vive en `Payment`, no en `Appointment`.** Un turno puede tener varios `Payment` (relación 1:N): por ejemplo, un intento de Mercado Pago que vence sin pagar y luego un cobro en el local.
*   **Un `Payment` de Mercado Pago = una preferencia de Checkout Pro.** El `id` del `Payment` se envía como `external_reference` de la preferencia; así el webhook ubica el registro sin depender de otros datos.
*   **El monto se congela al reservar:** `Payment.amount` copia el `Service.price` de ese momento, para que un cambio de precio posterior no afecte turnos ya reservados.
*   **Los montos son `Decimal`** (`@db.Decimal(10, 2)`): hay que convertirlos (ej. a `string` o `number`) antes de pasarlos a Client Components.

### 4.2. Creación del pago
Al hacer clic en `[ Pagar con Mercado Pago ]`, en el servidor y dentro de una transacción:

1.  Se verifica que el horario siga libre (otro cliente pudo haberlo tomado mientras completaba el wizard).
2.  Se crea el `Appointment` en estado `PENDING_PAYMENT`, con `endDate = date + duración del servicio` y `reservedUntil` = vencimiento de la reserva.
3.  Se crea el `Payment` con `method = MERCADO_PAGO`, `status = PENDING`, `amount` y `expiresAt` (igual a `reservedUntil`).
4.  Se crea la preferencia en Mercado Pago con:
    *   `external_reference` = `Payment.id`
    *   `expires = true` y `expiration_date_to` = `Payment.expiresAt`
    *   `back_urls` (success / failure / pending) hacia la app y `notification_url` hacia `/api/webhooks/mercadopago`
5.  Se guardan `mpPreferenceId` y `mpInitPoint` en el `Payment` y se redirige al cliente al `init_point`.

> La llamada a la API de Mercado Pago no debería quedar dentro de una transacción larga de la base: conviene crear turno + pago, llamar a MP y luego actualizar el `Payment` con los datos de la preferencia (si MP falla, el turno se cancela o expira).

### 4.3. Retención del horario
*   Mientras el turno está en `PENDING_PAYMENT` y `reservedUntil` es futuro, el horario se considera **ocupado**.
*   **El horario se retiene 10 minutos:** `reservedUntil` = momento de creación del turno + 10 minutos.
*   Si `reservedUntil` pasó sin pago aprobado, el horario se considera **libre** aunque el registro todavía no se haya actualizado. El turno pasa a `EXPIRED` y su `Payment` a `CANCELLED` (mecanismo a definir: proceso periódico o actualización "lazy" al consultar disponibilidad).
*   `reservedUntil` y `Payment.expiresAt` deben coincidir, para que Mercado Pago no acepte pagos de una preferencia cuyo horario ya se liberó.

### 4.4. Retorno del cliente (`back_urls`)
La redirección de vuelta desde Mercado Pago solo sirve para mostrarle al cliente un mensaje ("¡Listo!", "Tu pago está en proceso", "El pago fue rechazado, podés reintentar"). **No se usa para confirmar el turno**: los parámetros de la URL se pueden manipular y el cliente puede no volver nunca. La fuente de verdad es el webhook.

### 4.5. Webhook de Mercado Pago
Ruta: `POST /api/webhooks/mercadopago` (pública: debe estar en `isPublicRoute` de `src/proxy.ts`).

1.  **Validar la firma** (header `x-signature`) con el secreto de webhooks configurado en Mercado Pago.
2.  **Registrar el evento** en `WebhookEvent` (`provider = MERCADO_PAGO`, `externalId` = `id` de la notificación). Si ya existe por `@@unique([provider, externalId])`, es un reintento: se responde 200 sin reprocesar.
3.  **Responder 200 rápido.** Mercado Pago reintenta si no recibe respuesta a tiempo.
4.  **Consultar el pago real** con `GET /v1/payments/{data.id}`; nunca confiar en el cuerpo de la notificación.
5.  **Ubicar el `Payment`** por `external_reference` y actualizar `mpPaymentId`, `mpStatus`, `mpStatusDetail`, `mpPaymentTypeId`, `mpPaymentMethodId`, `mpMerchantOrderId`, `mpPayment` (respuesta completa) y el `status` simplificado según la tabla 4.6.
6.  **Actualizar el turno:** si el pago quedó `PAID`, el `Appointment` pasa a `CONFIRMED`, se limpia `reservedUntil` y se envía el email de turno confirmado.
7.  Marcar el `WebhookEvent` como `PROCESSED` / `IGNORED` (tipos que no interesan, ej. `merchant_order` si no se usa) / `FAILED` (con `error`, para reprocesarlo).

**No pisar un pago aprobado:** dentro de una misma preferencia el cliente puede tener varios intentos (ej. tarjeta rechazada y después aprobada) y las notificaciones pueden llegar desordenadas. Una notificación tardía de un intento rechazado no debe sobrescribir un `Payment` ya `PAID`.

**Pago aprobado fuera de término (a definir):** si llega un pago aprobado para un turno que ya está `EXPIRED`, hay que verificar si el horario sigue libre. Si lo está, se confirma el turno; si no, se reembolsa el pago y se avisa al cliente.

### 4.6. Mapeo de estados de Mercado Pago
El estado exacto de MP queda en `Payment.mpStatus`; `Payment.status` es una versión simplificada para la lógica de la app.

| `mpStatus` (Mercado Pago)     | `Payment.status` | Efecto en el turno                              |
|-------------------------------|------------------|-------------------------------------------------|
| `pending`, `authorized`       | `PENDING`        | Sigue `PENDING_PAYMENT`                         |
| `in_process`, `in_mediation`  | `IN_PROCESS`     | Sigue `PENDING_PAYMENT`                         |
| `approved`                    | `PAID`           | Pasa a `CONFIRMED`                              |
| `rejected`                    | `REJECTED`       | Sigue `PENDING_PAYMENT` (puede reintentar)      |
| `cancelled` / preferencia vencida | `CANCELLED`  | Pasa a `EXPIRED` si venció `reservedUntil`      |
| `refunded`                    | `REFUNDED`       | Se completan `refundedAmount` y `refundedAt`    |
| `charged_back`                | `CHARGED_BACK`   | Contracargo: revisar manualmente                |

Para pagos en el local (`IN_STORE`) solo se usan `PENDING` (todavía no cobrado) y `PAID` (el admin registró el cobro, se completa `paidAt`).

### 4.7. Webhook de Clerk
Ruta: `POST /api/webhooks/clerk` (pública). Se valida con los headers de Svix y se registra en `WebhookEvent` con `provider = CLERK` y `externalId` = header `svix-id`, con la misma lógica de idempotencia. El evento `user.created` vincula el `clerkId` al `User` existente con el mismo email (ver 3.2).

---

## 5. Sistema de Notificaciones (Resend)

Se enviarán correos transaccionales en los siguientes eventos:
*   **Turno Creado / Confirmado:** Correo al cliente con el resumen de su turno (Servicio, Fecha, Hora, Método de pago) y un mensaje de agradecimiento. Para pagos en el local se envía al reservar; para Mercado Pago, cuando el webhook confirma el pago aprobado.
*   **Turno Reprogramado (por el admin o el cliente):** Correo informando la nueva fecha/hora y el motivo (opcional).
*   **Turno Cancelado (por el admin o el cliente):** Correo informando la cancelación del turno.

---

## 6. Modelo de Datos (Prisma Schema)

La fuente de verdad es `prisma/schema.prisma`; este es un resumen comentado.

> **Prisma 7:** el `datasource` no lleva `url` / `directUrl` (las conexiones se configuran en `prisma7.config.ts` para la CLI y en `src/lib/prisma.ts` para la app) y el generator es `prisma-client` con `output = "../src/generated/prisma"`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ------------------------------------------------------
// ENUMS
// ------------------------------------------------------

enum Role {
  USER
  ADMIN
}

enum AppointmentStatus {
  PENDING_PAYMENT // Esperando el pago en Mercado Pago; el horario queda reservado hasta `reservedUntil`
  PENDING // Creado, pendiente de asistencia (ej. paga en el local)
  CONFIRMED // Confirmado (ej. pagó por Mercado Pago)
  COMPLETED // El admin marcó que el servicio se realizó
  CANCELLED // Cancelado por el admin o el cliente
  RESCHEDULED // Reprogramado
  EXPIRED // No se pagó a tiempo; el horario se libera
}

enum PaymentMethod {
  IN_STORE // Pago en el local
  MERCADO_PAGO // Pago online (Checkout Pro)
}

// Estado simplificado del cobro. El estado exacto de Mercado Pago queda en `Payment.mpStatus`.
enum PaymentStatus {
  PENDING // MP: pending / authorized. Local: todavía no cobrado
  IN_PROCESS // MP: in_process / in_mediation
  PAID // MP: approved. Local: el admin registró el cobro
  REJECTED // MP: rejected
  CANCELLED // MP: cancelled, o preferencia vencida sin pago
  REFUNDED // MP: refunded
  CHARGED_BACK // MP: charged_back (contracargo)
}

enum WebhookProvider {
  MERCADO_PAGO
  CLERK
}

enum WebhookEventStatus {
  RECEIVED // Guardado, todavía sin procesar
  PROCESSED
  IGNORED // Tipo de evento que no nos interesa
  FAILED // Falló el procesamiento; ver `error`
}

// ------------------------------------------------------
// MODELS
// ------------------------------------------------------

model User {
  id        String  @id @default(uuid())
  clerkId   String? @unique // Null para shadow accounts hasta que el usuario reclama la cuenta en Clerk
  email     String  @unique
  firstName String
  lastName  String
  phone     String?
  role      Role    @default(USER)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  appointments Appointment[]
}

model Service {
  id          String  @id @default(uuid())
  name        String
  description String?
  price       Decimal @db.Decimal(10, 2)
  duration    Int // Duración en minutos (ej: 30, 60) útil para calcular disponibilidad
  isActive    Boolean @default(true) // Para ocultar servicios sin borrarlos

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  appointments Appointment[]
}

model Appointment {
  id      String            @id @default(uuid())
  date    DateTime // Fecha y hora de inicio del turno
  endDate DateTime // date + duración del servicio al reservar; simplifica la búsqueda de solapamientos
  status  AppointmentStatus @default(PENDING)

  // Solo para PENDING_PAYMENT: hasta cuándo se retiene el horario. Debe coincidir con el
  // vencimiento de la preferencia de Mercado Pago (`Payment.expiresAt`).
  reservedUntil DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id])

  serviceId String
  service   Service @relation(fields: [serviceId], references: [id])

  // Un turno puede tener varios intentos de cobro (ej. abandona Mercado Pago y termina pagando en el local)
  payments Payment[]

  @@index([date, endDate])
  @@index([status, reservedUntil])
  @@index([userId])
}

// Un intento de cobro de un turno. Para Mercado Pago corresponde a una preferencia de Checkout Pro;
// `id` se envía como `external_reference` para ubicar el registro desde el webhook.
model Payment {
  id       String        @id @default(uuid())
  method   PaymentMethod
  status   PaymentStatus @default(PENDING)
  amount   Decimal       @db.Decimal(10, 2) // Precio del servicio al momento de reservar
  currency String        @default("ARS")
  paidAt   DateTime?

  // --- Mercado Pago (null para pagos en el local) ---
  mpPreferenceId String?   @unique
  mpInitPoint    String? // URL de checkout a la que se redirige al cliente
  expiresAt      DateTime? // Vencimiento de la preferencia (`expiration_date_to`)

  // Se completan desde el webhook consultando GET /v1/payments/{id}. Si hay varios intentos
  // dentro de la misma preferencia (ej. rechazado y luego aprobado) queda el último relevante:
  // no pisar un pago aprobado con una notificación tardía de otro rechazado.
  mpPaymentId       String? @unique
  mpStatus          String? // approved, rejected, in_process, refunded, ...
  mpStatusDetail    String? // accredited, cc_rejected_insufficient_amount, ...
  mpPaymentTypeId   String? // credit_card, debit_card, account_money, ticket, ...
  mpPaymentMethodId String? // visa, master, ...
  mpMerchantOrderId String?
  mpPayment         Json? // Última respuesta completa de la API, para auditoría

  refundedAmount Decimal?  @db.Decimal(10, 2)
  refundedAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id])

  @@index([appointmentId])
  @@index([status])
}

// Registro de webhooks recibidos (Mercado Pago y Clerk). Sirve para idempotencia —los proveedores
// reintentan y pueden mandar el mismo evento más de una vez— y para auditar/reprocesar fallos.
model WebhookEvent {
  id         String             @id @default(uuid())
  provider   WebhookProvider
  externalId String // MP: `id` de la notificación. Clerk: header `svix-id`
  type       String // MP: `type` (payment, merchant_order). Clerk: user.created, ...
  action     String? // MP: `action` (payment.created, payment.updated)
  resourceId String? // MP: `data.id` (id del pago). Clerk: id del usuario
  payload    Json
  status     WebhookEventStatus @default(RECEIVED)
  error      String?

  receivedAt  DateTime  @default(now())
  processedAt DateTime?

  @@unique([provider, externalId])
  @@index([provider, resourceId])
}

model BlockedSchedule {
  id        String   @id @default(uuid())
  startDate DateTime // Inicio de vacaciones/licencia
  endDate   DateTime // Fin de vacaciones/licencia
  reason    String? // Ej: "Vacaciones de verano"

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([startDate, endDate])
}
```

### 6.1. Consideraciones sobre el Modelo
1. **`clerkId` en `User`**: Al permitir reservas sin cuenta, primero se guarda al usuario con su email (sin `clerkId`). Luego, con el webhook de Clerk `user.created`, cuando el usuario "reclama" su cuenta o se registra, se vincula el `clerkId` al registro con ese email.
2. **`BlockedSchedule`**: Permite bloquear franjas enteras de tiempo (ej. del 10 al 15 de marzo) mediante `startDate` y `endDate`. La consulta de disponibilidad debe descartar cualquier horario que caiga dentro de estos rangos.
3. **`duration` en `Service` y `endDate` en `Appointment`**: `endDate` se calcula al reservar (`date + duration`) y queda fijo aunque luego cambie la duración del servicio. Con `date` y `endDate` la búsqueda de solapamientos es directa: un turno nuevo `[inicio, fin)` choca con otro si `inicio < otro.endDate` y `fin > otro.date`.
4. **Precios como `Decimal`**: `Service.price`, `Payment.amount` y `Payment.refundedAmount` usan `Decimal(10, 2)` para evitar errores de redondeo de `Float`.
5. **Pagos separados del turno**: `paymentMethod` y `paymentStatus` ya no están en `Appointment`; se consultan a través de `Appointment.payments` (ver sección 4).
6. **`WebhookEvent`**: Garantiza idempotencia (`@@unique([provider, externalId])`) y deja un registro para auditar y reprocesar eventos que fallaron.

### 6.2. Estados del turno y disponibilidad
| Estado            | ¿Ocupa el horario?                    | Cómo se llega                                           |
|-------------------|---------------------------------------|---------------------------------------------------------|
| `PENDING_PAYMENT` | Sí, mientras `reservedUntil` > ahora  | Reserva con Mercado Pago                                |
| `PENDING`         | Sí                                    | Reserva con pago en el local                            |
| `CONFIRMED`       | Sí                                    | Webhook de MP con pago aprobado                         |
| `RESCHEDULED`     | Sí (en su nueva fecha)                | El admin o el cliente reprograma el turno               |
| `COMPLETED`       | Sí (ya pasó)                          | El admin marca el servicio como realizado               |
| `CANCELLED`       | No                                    | El admin o el cliente cancela el turno                  |
| `EXPIRED`         | No                                    | Venció `reservedUntil` sin pago aprobado                |

---

## 7. Pantallas

Descripción en palabras de cómo se ve cada pantalla. Es la guía para implementar la UI; los textos entre comillas son propuestas de copy.

### 7.1. Estilos generales

La identidad visual tiene que transmitir **higiene** (limpio, claro, ordenado), **calidez** (tonos tierra suaves, nada frío ni clínico) y **elegancia** (tipografías redondeadas y prolijas, mucho aire y pocos elementos por pantalla).

**Paleta de colores** (se definen como variables en `globals.css` y se usan como clases de Tailwind):

| Rol                  | Nombre             | Color     | Uso                                                        |
|----------------------|--------------------|-----------|------------------------------------------------------------|
| Fondo                | Crema cálido       | `#F4EBDF` | Fondo general de la página                                 |
| Superficie           | Blanco             | `#FFFFFF` | Tarjetas, formularios, modales                             |
| Fondo alternativo    | Salvia claro       | `#E2ECE6` | Secciones alternadas del home, chips seleccionados         |
| Primario             | Verde eucalipto    | `#4F6F63` | Botones principales, links, paso activo del wizard         |
| Primario hover       | Eucalipto oscuro   | `#3F5A50` | Hover/active de botones principales                        |
| Acento               | Champagne          | `#B8976A` | Detalles finos: líneas decorativas, íconos, separadores    |
| Texto principal      | Carbón cálido      | `#2F2A26` | Títulos y cuerpo                                           |
| Texto secundario     | Topo               | `#6B625B` | Descripciones, ayudas, metadatos                           |
| Bordes               | Arena              | `#E0D3C2` | Bordes de tarjetas, inputs y divisores                     |
| Error / peligro      | Terracota          | `#B5543C` | Botón "Cancelar turno", mensajes de error                  |

El verde transmite limpieza y calma sin el frío del celeste "de hospital"; el crema y el arena le dan calidez; el champagne aporta el toque elegante y se usa poco. La primera versión es **solo en modo claro** (la identidad depende del fondo crema); el modo oscuro queda para más adelante.

**Tipografía** (con `next/font/google`, reemplazando Geist):
*   **Títulos:** *Quicksand* (geométrica y redondeada, peso semibold). Para `h1`/`h2` y el nombre del local.
*   **Cuerpo, botones y formularios:** *Nunito* (terminaciones redondeadas, cálida y muy legible), 16px base, interlineado amplio (1.6).

**Bordes, sombras y formas:**
*   Tarjetas e inputs con esquinas redondeadas (`rounded-2xl` en tarjetas, `rounded-xl` en inputs), borde de 1px color arena y sombra muy suave (`shadow-sm`). Nada de sombras fuertes.
*   Botones con forma de píldora (`rounded-full`). Botón principal: fondo eucalipto, texto blanco. Botón secundario: fondo blanco, borde eucalipto, texto eucalipto. Botón de peligro: texto terracota con borde terracota.
*   Foco visible en inputs y botones (anillo eucalipto) para accesibilidad.

**Espaciado y layout:**
*   Diseño **mobile-first**: la mayoría de los clientes va a reservar desde el celular.
*   Contenido centrado con ancho máximo (`max-w-5xl` en el home y el panel admin, `max-w-2xl` en el wizard y "Mis turnos"), con márgenes laterales de 24px en mobile.
*   Mucho aire vertical entre secciones (`py-16` a `py-24` en el home) y separación cómoda dentro de tarjetas (`p-6`).
*   Textos y títulos de secciones públicas centrados; listados y formularios alineados a la izquierda.

**Etiquetas de estado de turno** (chips redondeados con fondo suave y texto oscuro del mismo tono; se reutilizan en "Mis turnos" y en el panel admin):

| Estado            | Etiqueta           | Tono      |
|-------------------|--------------------|-----------|
| `PENDING_PAYMENT` | "Esperando pago"   | Ámbar     |
| `PENDING`         | "Reservado"        | Salvia    |
| `CONFIRMED`       | "Confirmado"       | Verde     |
| `RESCHEDULED`     | "Reprogramado"     | Azul suave|
| `COMPLETED`       | "Realizado"        | Gris      |
| `CANCELLED`       | "Cancelado"        | Terracota |
| `EXPIRED`         | "Vencido"          | Gris claro|

### 7.2. Estructura común: header y footer

Todas las pantallas comparten el mismo layout (`src/app/layout.tsx`): header arriba, contenido en el medio y footer abajo, con el footer siempre pegado al final aunque la página tenga poco contenido.

**Header:**
*   Fondo blanco con borde inferior arena, altura de 64px.
*   A la izquierda, el nombre del local, **"Pedicuría Virginia"**, en Quicksand (link al home).
*   A la derecha, `AuthNav` (`src/components/auth-nav.tsx`), con los estilos nuevos:
    *   Sin sesión: "Iniciar sesión" (botón de texto) y "Registrarse" (botón secundario).
    *   Con sesión: link "Mis turnos" y el avatar de Clerk (`UserButton`).
    *   Si el usuario es ADMIN, además un link "Administración" hacia `/admin`.

**Footer:**
*   Fondo arena (`#E9DCCB`), texto topo chico, centrado.
*   Una línea decorativa fina color champagne arriba.
*   Texto: "© {año} Pedicuría Virginia. Todos los derechos reservados."

### 7.3. Home (`/`)
Pública: la ve cualquier usuario, con o sin sesión. Tiene tres bloques apilados.

**1. Bienvenida (hero):**
*   Ocupa casi toda la primera pantalla, con fondo crema y contenido centrado.
*   Título grande en Quicksand: "Tus pies, en manos profesionales".
*   Una o dos líneas debajo: "Atención podológica con higiene, cuidado y calidez. Reservá tu turno online en minutos."
*   Botón principal grande (altura ~56px, texto 18px): **"Reservá tu turno"**, que lleva a `/reservar`.

**2. "¿Qué hacemos?":**
*   Fondo salvia claro para separarlo del hero. Título centrado con una línea champagne debajo.
*   Grilla de 4 tarjetas blancas (1 columna en mobile, 2 en tablet, 4 en desktop), cada una con un ícono de línea fina, el nombre y una descripción breve:
    *   **Corte de uñas:** corte y limado correcto para prevenir uñas encarnadas y molestias.
    *   **Onicomicosis:** tratamiento de hongos en las uñas.
    *   **Onicocriptosis:** tratamiento de la uña encarnada.
    *   **Hiperqueratosis:** eliminación de callosidades y durezas.
*   Es contenido fijo e informativo, independiente de los servicios con precio que el admin carga en la base (esos se ven en el paso 1 del wizard).

**3. Contacto:**
*   Fondo crema, título "Contactanos" centrado.
*   Dos tarjetas o botones grandes uno al lado del otro (apilados en mobile):
    *   **Instagram:** ícono y usuario (`@...`), abre el perfil en otra pestaña.
    *   **WhatsApp:** ícono y número, abre `https://wa.me/<número>` con un mensaje precargado ("¡Hola! Quería hacer una consulta").
*   El usuario de Instagram y el número de WhatsApp quedan en un archivo de configuración para cambiarlos en un solo lugar. Arrancan con valores de ejemplo que completa el dueño del proyecto.

### 7.4. Reserva de turno (`/reservar`)
Pública (hay que agregarla a `isPublicRoute`). Implementa el flujo de la sección 3.1 como un wizard en una sola página, centrado y angosto (`max-w-2xl`).

*   **Indicador de pasos** arriba: "1 Servicio · 2 Fecha y hora · 3 Tus datos · 4 Confirmación". El paso actual en eucalipto, los completados con un tilde, los futuros en topo. Botón "← Volver" para ir al paso anterior sin perder lo elegido.

**Paso 1 – Servicio:** lista de tarjetas con los servicios activos (nombre, descripción, duración y precio). Al tocar una, queda marcada con borde eucalipto y fondo salvia claro, y se avanza al paso 2.

**Paso 2 – Fecha y hora:**
*   Calendario mensual. Se puede reservar **hasta un mes adelante** (ej. el 17/10 se puede reservar hasta el 17/11 inclusive). Los días pasados, posteriores a ese límite, bloqueados o sin horarios libres aparecen grisados y no se pueden elegir. El límite también se valida en el servidor.
*   Al elegir un día, debajo aparece una grilla de "chips" con los horarios libres (ej. 09:00, 09:30, 10:00…). El elegido se pinta de eucalipto.
*   Si el día no tiene horarios, un mensaje amable: "No quedan horarios para este día. Probá con otra fecha."

**Paso 3 – Tus datos:**
*   Dos botones grandes lado a lado (también en mobile), con ícono, título y una ayuda corta. Al tocar uno queda marcado y debajo aparece su formulario:
    *   **"Es mi primera vez"** (Opción A): Email, Nombre, Apellido y Teléfono.
    *   **"Ya reservé antes"** (Opción B): solo Email.
*   Si el usuario ya inició sesión, este paso se saltea y en el resumen aparece "Reservando como {email}".

**Paso 4 – Confirmación:**
*   Tarjeta de resumen: servicio, precio, día (ej. "Jueves 12 de marzo") y hora.
*   Debajo, dos botones de igual ancho: **"Pagar con Mercado Pago"** (principal) y **"Pagar en el local"** (secundario).
*   Texto chico bajo el botón de Mercado Pago: "Te reservamos el horario por 10 minutos mientras completás el pago. Si no se completa, el horario se libera."

**Pantalla de turno reservado:** al terminar (pago en el local, o vuelta de Mercado Pago con pago aprobado), ícono de tilde, título "¡Tu turno está reservado!", el mismo resumen, "Te enviamos los detalles a {email}" y dos botones: "Ver mis turnos" y "Volver al inicio". Para Mercado Pago hay variantes para pago pendiente ("Tu pago se está procesando") y rechazado ("El pago no se pudo completar", con botón para reintentar).

### 7.5. Panel de administración (`/admin`)
Solo para usuarios con rol ADMIN (si no, se redirige al home). Una sola página con tres secciones apiladas, cada una con su título.

**1. Turnos:**
*   **Filtros** arriba: tres chips de estado, de a uno por vez: "Todos", "Reservados" (en el local, confirmados y reprogramados) y "Cancelados", y un rango de fechas opcional. Por defecto (sin chip elegido) se muestran los próximos turnos activos, ordenados por fecha.
*   **Listado:** tabla en desktop y tarjetas en mobile. Cada turno muestra fecha y hora, cliente (nombre, teléfono y email), servicio, etiqueta de estado y pago (método y si está cobrado).
*   **Acciones por turno:**
    *   **Reprogramar:** abre un modal con el mismo selector de fecha y hora del paso 2 del wizard (solo horarios libres para la duración de ese servicio) y un campo opcional de motivo. Al confirmar, el turno pasa a `RESCHEDULED`.
    *   **Cancelar:** pide confirmación ("¿Cancelar el turno de Ana Pérez del jueves 12/03 a las 10:00?") y lo pasa a `CANCELLED`.
    *   Además (según 2.2): **Marcar realizado** (solo para turnos que ya empezaron) y **Registrar cobro** (marca como pagado el cobro en el local; si el turno no tiene uno, por ejemplo porque intentó pagar con Mercado Pago, lo crea).
    *   Las acciones no aparecen en turnos cancelados, vencidos o realizados, salvo **Registrar cobro**, que sigue disponible en un turno realizado que todavía no se cobró.
    *   El campo de motivo al reprogramar se agrega junto con los emails (sección 5), que es donde se usa.

**2. Servicios:**
*   Listado de todos los servicios (activos e inactivos) con nombre, duración, precio y un indicador "Activo" / "Dado de baja".
*   Botón "Nuevo servicio" que abre un formulario (nombre, descripción, duración en minutos, precio).
*   Por servicio: **Editar** (mismo formulario) y **Dar de baja** / **Dar de alta**. Dar de baja no borra el servicio (`isActive = false`): deja de aparecer en el wizard pero los turnos existentes se mantienen.

**3. Bloqueo de fechas:**
*   Formulario: fecha desde y hasta, horas opcionales (sin horas se bloquean los días completos) y motivo (ej. "Vacaciones", "Licencia", "Feriado"). Las fechas y horas se interpretan en la hora del local.
*   Si en ese rango ya hay turnos activos, después de guardar se muestra una advertencia con la lista, para que el admin decida si los reprograma o cancela.
*   Debajo, listado de franjas vigentes y futuras (desde–hasta y motivo), cada una con un botón **Eliminar** con confirmación. Al eliminarla, esos horarios vuelven a estar disponibles en el wizard.

### 7.6. Mis turnos (`/dashboard`)
Requiere sesión. Contenido centrado (`max-w-2xl`).

*   Saludo en Quicksand ("Hola, {nombre}") y botón "Reservar nuevo turno".
*   **Próximos turnos:** tarjetas con servicio, día y hora, etiqueta de estado y forma de pago. Cada una con:
    *   **Reprogramar:** el mismo modal de fecha y hora que usa el admin (con el mismo límite de un mes adelante).
    *   **Cancelar:** con confirmación.
    *   **Límite de 24 horas:** el cliente solo puede reprogramar o cancelar hasta 24 hs antes del turno. Pasado ese plazo los botones aparecen deshabilitados con el texto "Faltan menos de 24 hs para tu turno: escribinos por WhatsApp" y un link al WhatsApp del local. El límite también se valida en el servidor. El admin no tiene este límite.
    *   **Turnos pagados con Mercado Pago:** se pueden cancelar igual, pero la app **no devuelve el dinero**; la devolución se arregla por fuera con el local. La confirmación de cancelación lo aclara: "La cancelación no genera un reembolso automático. Para coordinarlo, escribinos por WhatsApp."
    *   Si el turno está "Esperando pago" (dentro de los 10 minutos de reserva), un botón **"Completar pago"** que vuelve al checkout de Mercado Pago.
*   **Historial:** turnos pasados, cancelados y vencidos, en una lista más compacta y sin acciones.
*   Si no tiene turnos: mensaje amable y botón para reservar.

### 7.7. Iniciar sesión y registrarse (`/sign-in`, `/sign-up`)
Sin cambios: usan los componentes de Clerk centrados en la página y toman el header y el footer comunes.

### 7.8. Reglas de negocio definidas
1. **Nombre del local:** Pedicuría Virginia. El usuario de Instagram y el número de WhatsApp los completa el dueño del proyecto en el archivo de configuración.
2. **Reprogramar o cancelar (cliente):** hasta 24 hs antes del turno. Después, solo por WhatsApp.
3. **Reembolsos:** la app no devuelve dinero al cancelar. Se arregla por fuera con el dueño del local.
4. **Anticipación máxima:** hasta un mes desde el día actual.
5. **Retención del horario al pagar con Mercado Pago:** 10 minutos. Si no se paga en ese tiempo, el horario se libera para otros clientes.
6. **Horario de atención:** lunes a sábados de 8:00 a 17:00, en hora de Argentina (`America/Argentina/Buenos_Aires`). Domingos cerrado. Queda en el archivo de configuración.
7. **Una sola profesional:** se atiende un turno a la vez, así que dos turnos activos nunca pueden solaparse.
8. **Armado de horarios:** los turnos empiezan cada 30 minutos (8:00, 8:30, 9:00…) y tienen que terminar a las 17:00 como máximo. Por ejemplo, un servicio de 60 minutos puede empezar a las 16:00 pero no a las 16:30.
