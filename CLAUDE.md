# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Sistema de reserva de turnos para un servicio de pedicuría. La especificación funcional (roles, wizard de reserva, "shadow accounts", emails, modelo de datos propuesto) está en `docs/documentacion_proyecto.md`: leerla antes de implementar features.

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