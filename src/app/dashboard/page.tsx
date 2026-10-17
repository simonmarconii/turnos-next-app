import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import type { Payment } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canCancel,
  canReschedule,
  effectiveStatus,
  isWithinChangeLimit,
} from "@/lib/appointments";
import { formatLongDate, formatTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { buttonPrimary, card } from "@/components/ui";
import { AppointmentCard, type AppointmentView } from "./appointment-card";

export const metadata: Metadata = { title: "Mis turnos" };

const ACTIVE_STATUSES = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "RESCHEDULED"];

function paymentLabel(payments: Payment[]): string {
  // El cobro relevante es el aprobado, si hay; si no, el último intento
  const payment = payments.find((p) => p.status === "PAID") ?? payments[0];
  if (!payment) return "Sin pago registrado";
  if (payment.method === "IN_STORE") {
    return payment.status === "PAID" ? "Pagado en el local" : "Pago en el local";
  }
  return payment.status === "PAID" ? "Pagado con Mercado Pago" : "Mercado Pago (pendiente)";
}

async function MyAppointments() {
  // El proxy ya exige sesión; puede no haber `User` si Clerk todavía no verificó el email
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className={`${card} text-center text-muted`}>
        No pudimos encontrar tu cuenta. Si reservaste como invitado, iniciá sesión con el mismo
        email que usaste para reservar.
      </p>
    );
  }

  const appointments = await prisma.appointment.findMany({
    where: { userId: user.id },
    include: {
      service: { select: { name: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { date: "asc" },
  });

  const now = new Date();
  const views = appointments.map((appointment): AppointmentView & { upcoming: boolean } => {
    const status = effectiveStatus(appointment, now);
    const payment = appointment.payments.find((p) => p.status === "PAID") ?? appointment.payments[0];
    const checkout = appointment.payments.find(
      (p) => p.method === "MERCADO_PAGO" && p.status === "PENDING" && p.mpInitPoint,
    );
    return {
      id: appointment.id,
      serviceName: appointment.service.name,
      dateLabel: formatLongDate(appointment.date),
      timeLabel: formatTime(appointment.date),
      status,
      paymentLabel: paymentLabel(appointment.payments),
      priceLabel: payment ? formatPrice(payment.amount.toNumber()) : null,
      paidOnline: appointment.payments.some(
        (p) => p.method === "MERCADO_PAGO" && p.status === "PAID",
      ),
      canCancel: canCancel(status),
      canReschedule: canReschedule(status),
      withinLimit: isWithinChangeLimit(appointment.date, now),
      payUrl: status === "PENDING_PAYMENT" ? (checkout?.mpInitPoint ?? null) : null,
      upcoming: ACTIVE_STATUSES.includes(status) && appointment.date > now,
    };
  });

  const upcoming = views.filter((view) => view.upcoming);
  const history = views.filter((view) => !view.upcoming).reverse();

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-4xl font-semibold">
          {user.firstName ? `Hola, ${user.firstName}` : "Hola"}
        </h1>
        <Link href="/reservar" className={buttonPrimary}>
          <CalendarPlus className="size-5" aria-hidden="true" />
          Reservar nuevo turno
        </Link>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-semibold">Próximos turnos</h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {upcoming.map((view) => (
              <li key={view.id}>
                <AppointmentCard appointment={view} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={`${card} flex flex-col items-center gap-2 text-center`}>
            <p className="font-semibold">
              {history.length > 0 ? "No tenés turnos próximos." : "Todavía no tenés turnos."}
            </p>
            <p className="text-muted">Cuando reserves uno, lo vas a ver acá.</p>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-semibold">Historial</h2>
          <ul className={`${card} flex flex-col p-0`}>
            {history.map((view) => (
              <li
                key={view.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{view.serviceName}</span>
                  <span className="text-sm text-muted">
                    {view.dateLabel} · {view.timeLabel} hs
                  </span>
                </div>
                <StatusBadge status={view.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-12">
      <Suspense fallback={<p className="text-center text-muted">Cargando tus turnos…</p>}>
        <MyAppointments />
      </Suspense>
    </main>
  );
}
