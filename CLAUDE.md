# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Sistema de reserva de turnos para un servicio de pedicuría. La especificación funcional (roles, wizard de reserva, "shadow accounts", emails, modelo de datos propuesto) está en `docs/documentacion_proyecto.md`: leerla antes de implementar features.

Estado actual: solo está armado el esqueleto (auth con Clerk, landing, `/dashboard` vacío, cliente de Prisma). `prisma/schema.prisma` es la fuente de verdad del modelo de datos; la doc tiene una copia comentada que hay que actualizar si cambia el esquema. Resend y Mercado Pago aún no están instalados.

Modelo de pagos (Mercado Pago Checkout Pro): el estado del cobro vive en `Payment` (1:N con `Appointment`), no en el turno. Cada `Payment` de MP es una preferencia y su `id` se usa como `external_reference`. Un turno pagado online arranca en `PENDING_PAYMENT` y retiene el horario hasta `reservedUntil`. `WebhookEvent` guarda los webhooks de MP y Clerk para que el procesamiento sea idempotente. Los montos son `Decimal`: convertirlos antes de pasarlos a Client Components.

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Clerk · Prisma 7 sobre Supabase Postgres. Alias `@/*` → `src/*`. Textos de UI y comentarios en español rioplatense ("Reservá", "Elegí").

## Comandos

```bash
npm run dev          # servidor de desarrollo
npm run build        # build de producción (también hace el type-check)
npm run lint         # ESLint (flat config, ignora src/generated)
npm run db:generate  # genera el cliente de Prisma en src/generated/prisma (corre también en postinstall)
npm run db:migrate   # prisma migrate dev — crea y aplica migraciones en prisma/migrations
npm run db:deploy    # prisma migrate deploy
npm run db:seed      # servicios de ejemplo + admin (ADMIN_EMAIL en .env.local); idempotente
npm run db:studio    # Prisma Studio
```

No hay framework de tests configurado.

## Arquitectura

### Prisma 7 (no usar convenciones de Prisma 6)
- La config de la CLI está en `prisma7.config.ts` (nombre no estándar, pero Prisma lo detecta). Carga `.env.local` con dotenv y usa `DIRECT_URL` (puerto 5432) para migrate/studio.
- `schema.prisma` usa el generator `prisma-client` con `output = "../src/generated/prisma"` y el `datasource` **no lleva `url`/`directUrl`**. Al portar el esquema de la doc, no agregar `url = env(...)` ni `provider = "prisma-client-js"`.
- La app usa el driver adapter `@prisma/adapter-pg` con `DATABASE_URL` (transaction pooler, puerto 6543). Importar siempre el singleton `prisma` de `@/lib/prisma` (es `server-only`); los tipos/enums vienen de `@/generated/prisma/client`.
- `src/generated/` está en `.gitignore`: tras cambiar el esquema hay que regenerar.

### Auth y autorización
- Clerk maneja la sesión. `src/proxy.ts` es el middleware (Next 16 renombró `middleware.ts` → `proxy.ts`): todo es privado salvo `/`, `/sign-in`, `/sign-up`. Las rutas nuevas públicas (ej. el wizard de reserva para invitados, webhooks de Clerk/Mercado Pago) deben agregarse a `isPublicRoute`.
- Prisma se conecta como rol `postgres` y **saltea RLS**: la autorización (filtrar por el usuario de Clerk, chequear rol ADMIN) se hace en el código del servidor.
- `src/lib/supabase/{server,client}.ts` crean clientes de Supabase que mandan el token de Clerk para que apliquen las políticas RLS (`auth.jwt()->>'sub'`). Requieren `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (no están en `.env.example`) y la integración Clerk↔Supabase (en `supabase/config.toml` `[auth.third_party.clerk]` está deshabilitada).
- `User.clerkId` es opcional. Al reservar como invitado se crea el `User` en la base y, después de responder (`after()` en `src/app/reservar/actions.ts`), una cuenta de Clerk sin contraseña con el email `reserved`, guardando su id en `clerkId`. `getCurrentUser()` (`src/lib/auth.ts`) busca por `clerkId` y, si no hay, vincula por email verificado.

### Rendering (Cache Components)
`next.config.ts` activa `cacheComponents` y `partialPrefetching`. Todo lo que lea datos del request (`currentUser()`, `auth()`, componentes de Clerk como `<AuthNav>`, etc.) debe ir dentro de un `<Suspense>`, como se ve en `layout.tsx`, `dashboard/page.tsx` y las páginas de sign-in/up.
