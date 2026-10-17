# Documentación: Sistema de Turnos para Pedicuría

## 1. Descripción General
Sistema web para la gestión y reserva de turnos de un servicio de pedicuría. Permite a los clientes agendar citas con o sin registro previo, integrando pagos (Mercado Pago / Efectivo) y notificaciones automáticas. La administración tiene control total sobre los servicios, disponibilidad y gestión de citas.

**Stack Tecnológico:**
*   **Base de datos:** Supabase (PostgreSQL)
*   **ORM:** Prisma
*   **Autenticación:** Clerk
*   **Emails:** Resend
*   **Pagos:** Mercado Pago

---

## 2. Roles de Usuario

### 2.1. Cliente (User)
*   **Reserva de turnos:** Puede seleccionar servicios, horarios y métodos de pago.
*   **Gestión de cuenta (Opcional en la primera reserva):** 
    *   Puede reservar como "invitado" (Guest).
    *   El sistema le crea una cuenta automáticamente vinculada a su email.
    *   Para acceder posteriormente, utiliza el flujo de "Olvidé mi contraseña" en Clerk para establecer una clave y gestionar sus turnos futuros.
*   **Visualización:** Puede ver el historial y estado de sus turnos (si inicia sesión).

### 2.2. Administrador (Admin)
*   **Gestión de Turnos:** Cancelar, reprogramar horarios y marcar turnos como "Completados".
*   **Gestión de Disponibilidad:** Restringir o bloquear franjas de días (por vacaciones, licencias o feriados).
*   **Gestión de Servicios:** Crear nuevos servicios prestados, editar descripciones y actualizar precios.

---

## 3. Flujos Principales

### 3.1. Flujo de Reserva de Turno
El proceso consta de los siguientes pasos secuenciales (Wizard):

1.  **Selección de Servicio:** El usuario elige qué servicio desea (Ej: Corte de uñas, Pedicuría completa, etc.).
2.  **Selección de Fecha y Hora:** Se despliega un calendario/grilla de horarios. **Lógica de negocio:** Solo se muestran horarios disponibles (se filtran los turnos ya ocupados y las fechas bloqueadas por el Admin).
3.  **Identificación del Usuario (UI de dos columnas/recuadros):**
    *   *Opción A (No tengo cuenta):* Formulario para completar Email, Nombre, Apellido y Teléfono.
    *   *Opción B (Ya tengo cuenta):* Formulario simplificado que solo pide el Email.
4.  **Resumen y Pago:** 
    *   Muestra una tarjeta de resumen: Nombre del servicio, precio, día y hora.
    *   Debajo, dos botones de acción: `[ Pagar en el local ]` y `[ Pagar con Mercado Pago ]`.

### 3.2. Flujo de "Shadow Account" (Creación de cuenta en reserva)
1. El usuario completa la "Opción A" del paso 3.
2. El sistema verifica si el email ya existe. Si no existe, se crea un usuario en la base de datos y/o en Clerk con una contraseña autogenerada (Shadow Account).
3. Cuando el cliente desee loguearse en el futuro para ver sus turnos, irá a la pantalla de Login, hará clic en "Perdí mi contraseña", Clerk le enviará un código a su email y podrá establecer una clave nueva.

---

## 4. Sistema de Notificaciones (Resend)

Se enviarán correos transaccionales en los siguientes eventos:
*   **Turno Creado:** Correo al cliente con el resumen de su turno (Servicio, Fecha, Hora, Método de pago) y un mensaje de agradecimiento.
*   **Turno Reprogramado (Por Admin):** Correo informando la nueva fecha/hora y el motivo (opcional).
*   **Turno Cancelado (Por Admin):** Correo informando la cancelación del turno.

---

## 5. Modelo de Datos (Prisma Schema)

A continuación, el esquema de Prisma diseñado para soportar toda la lógica descrita, incluyendo la integración con Clerk y las restricciones de horarios.

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ------------------------------------------------------
// ENUMS
// ------------------------------------------------------

enum Role {
  USER
  ADMIN
}

enum AppointmentStatus {
  PENDING      // Creado, pendiente de asistencia
  CONFIRMED    // Confirmado (ej. si pagó por Mercado Pago)
  COMPLETED    // El admin marcó que el servicio se realizó
  CANCELLED    // Cancelado por el admin
  RESCHEDULED  // Reprogramado
}

enum PaymentMethod {
  IN_STORE       // Pago en el local
  MERCADO_PAGO   // Pago online
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
}

// ------------------------------------------------------
// MODELS
// ------------------------------------------------------

model User {
  id        String   @id @default(uuid())
  clerkId   String?  @unique // Opcional al principio si se maneja creación diferida, pero único por user de Clerk
  email     String   @unique
  firstName String
  lastName  String
  phone     String?
  role      Role     @default(USER)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  appointments Appointment[]
}

model Service {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Float
  duration    Int      // Duración en minutos (ej: 30, 60) útil para calcular disponibilidad
  isActive    Boolean  @default(true) // Para ocultar servicios sin borrarlos
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relaciones
  appointments Appointment[]
}

model Appointment {
  id            String            @id @default(uuid())
  date          DateTime          // Fecha y hora de inicio del turno
  status        AppointmentStatus @default(PENDING)
  
  paymentMethod PaymentMethod
  paymentStatus PaymentStatus     @default(PENDING)
  
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  // Relaciones
  userId        String
  user          User              @relation(fields: [userId], references: [id])
  
  serviceId     String
  service       Service           @relation(fields: [serviceId], references: [id])
}

model BlockedSchedule {
  id          String   @id @default(uuid())
  startDate   DateTime // Inicio de vacaciones/licencia
  endDate     DateTime // Fin de vacaciones/licencia
  reason      String?  // Ej: "Vacaciones de verano"
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Consideraciones sobre el Modelo:
1. **`clerkId` en `User`**: Al permitir reservas sin cuenta, primero guardas al usuario con su email en tu BD (sin `clerkId`). Luego, utilizando webhooks de Clerk (evento `user.created`), cuando el usuario finalmente "reclama" su cuenta o se registra, actualizas este registro vinculando el `clerkId` al email correspondiente.
2. **`BlockedSchedule`**: Te permite bloquear franjas enteras de tiempo (ej. del 10 al 15 de marzo) mediante un `startDate` y `endDate`. Tu lógica de frontend y backend al consultar disponibilidad deberá descartar cualquier horario que caiga dentro de estos rangos.
3. **`duration` en `Service`**: Es fundamental para que el sistema sepa cuántos "slots" u horarios debe bloquear en el calendario una vez que se reserva ese servicio en particular.