import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma se conecta con el rol `postgres`, que ignora RLS: la autorización
// (por ejemplo filtrar por el userId de Clerk) se hace en el código del servidor.
function createPrismaClient() {
  const adapter = new PrismaPg({
    // Transaction pooler de Supabase (puerto 6543)
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({ adapter });
}

// Reutiliza una sola instancia en desarrollo para no abrir conexiones en cada hot reload
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
