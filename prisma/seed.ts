// Datos iniciales: servicios de ejemplo y el usuario administrador.
// Se corre con `npm run db:seed` (o automáticamente tras `prisma migrate reset`).
// Es idempotente: se puede correr varias veces sin duplicar datos.
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

// Precios de ejemplo: se ajustan después desde el panel de administración.
const services = [
  {
    name: "Corte de uñas",
    description: "Corte y limado correcto para prevenir uñas encarnadas y molestias.",
    duration: 30,
    price: "12000",
  },
  {
    name: "Pedicuría completa",
    description: "Corte de uñas, limpieza de durezas e hidratación.",
    duration: 60,
    price: "20000",
  },
  {
    name: "Tratamiento de onicomicosis",
    description: "Tratamiento de hongos en las uñas.",
    duration: 45,
    price: "18000",
  },
  {
    name: "Tratamiento de onicocriptosis",
    description: "Tratamiento de la uña encarnada.",
    duration: 45,
    price: "18000",
  },
  {
    name: "Tratamiento de hiperqueratosis",
    description: "Eliminación de callosidades y durezas.",
    duration: 45,
    price: "16000",
  },
];

async function main() {
  for (const service of services) {
    // `name` no es único en el esquema, así que se busca antes de crear
    const existing = await prisma.service.findFirst({ where: { name: service.name } });
    if (!existing) {
      await prisma.service.create({ data: service });
      console.log(`Servicio creado: ${service.name}`);
    }
  }

  // El admin se crea por email; al iniciar sesión con Clerk se le vincula el clerkId
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL no está definido en .env.local: no se creó el administrador.");
    return;
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, firstName: "", lastName: "", role: "ADMIN" },
  });
  console.log(`Administrador: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
