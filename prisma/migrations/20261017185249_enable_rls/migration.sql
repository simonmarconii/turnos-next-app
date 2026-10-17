-- Supabase expone el esquema `public` por su API REST con la publishable key. Sin RLS cualquiera
-- podría leer o escribir estas tablas. Con RLS activado y sin políticas, la API no devuelve nada;
-- Prisma se conecta como `postgres` y saltea RLS, así que la app no se ve afectada.
-- Si más adelante se usan los clientes de `src/lib/supabase`, hay que agregar políticas explícitas.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedSchedule" ENABLE ROW LEVEL SECURITY;

-- La tabla de historial de Prisma no existe en la shadow database de `migrate dev`
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
