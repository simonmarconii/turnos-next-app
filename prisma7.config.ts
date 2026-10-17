import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Usa el mismo archivo de variables que Next.js
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // La CLI (migrate, db pull, studio) necesita la conexión directa / session
    // pooler de Supabase (puerto 5432). La app usa DATABASE_URL (src/lib/prisma.ts).
    url: process.env["DIRECT_URL"],
  },
});
