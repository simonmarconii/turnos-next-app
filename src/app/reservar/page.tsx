import { Suspense } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { BookingWizard, type ServiceOption } from "./booking-wizard";

export const metadata: Metadata = { title: "Reservá tu turno" };

async function BookingLoader() {
  const [services, user] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    getCurrentUser(),
  ]);

  // Decimal no se puede pasar a un Client Component: se manda el precio ya formateado
  const options: ServiceOption[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    duration: service.duration,
    priceLabel: formatPrice(service.price.toNumber()),
  }));

  return <BookingWizard services={options} sessionEmail={user?.email ?? null} />;
}

export default function ReservarPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-center font-display text-4xl font-semibold">Reservá tu turno</h1>
      <Suspense fallback={<p className="text-center text-muted">Cargando servicios…</p>}>
        <BookingLoader />
      </Suspense>
    </main>
  );
}
