import { Suspense } from "react";
import type { Metadata } from "next";
import type { AppointmentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  canCancel,
  canComplete,
  canRegisterPayment,
  canReschedule,
  effectiveStatus,
  paymentLabel,
} from "@/lib/appointments";
import {
  addDays,
  dateKeyInZone,
  formatDay,
  formatLongDate,
  formatTime,
  zonedTime,
  type DateKey,
} from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import {
  AppointmentsPanel,
  type AdminAppointmentRow,
  type StatusFilter,
} from "./appointments-panel";
import { BlocksPanel, type BlockRow } from "./blocks-panel";
import { ServicesPanel, type ServiceRow } from "./services-panel";

export const metadata: Metadata = { title: "Administración" };

const ACTIVE_STATUSES: AppointmentStatus[] = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "RESCHEDULED"];
const MAX_ROWS = 200;

// Estados de cada filtro. "Reservados" agrupa los turnos tomados: en el local, confirmados
// (pagados) y reprogramados.
const STATUS_FILTERS: Record<StatusFilter, AppointmentStatus[] | "all"> = {
  todos: "all",
  reservados: ["PENDING", "CONFIRMED", "RESCHEDULED"],
  cancelados: ["CANCELLED"],
};

// Filtros en la URL: ?estado=todos|reservados|cancelados &desde=YYYY-MM-DD &hasta=YYYY-MM-DD.
// Sin `estado` se muestran los próximos turnos activos.
type AppointmentFilters = {
  status: StatusFilter | null;
  from: DateKey | null;
  to: DateKey | null;
};

function parseFilters(params: Record<string, string | string[] | undefined>): AppointmentFilters {
  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;
  const dateParam = (value: string | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

  const estado = single(params.estado);

  return {
    status: estado && estado in STATUS_FILTERS ? (estado as StatusFilter) : null,
    from: dateParam(single(params.desde)),
    to: dateParam(single(params.hasta)),
  };
}

// Un PENDING_PAYMENT con la reserva vencida ya no está activo (se muestra como EXPIRED)
function statusCondition(status: AppointmentStatus, now: Date): Prisma.AppointmentWhereInput {
  if (status === "PENDING_PAYMENT") return { status, reservedUntil: { gt: now } };
  return { status };
}

function appointmentsWhere(filters: AppointmentFilters, now: Date): Prisma.AppointmentWhereInput {
  const conditions: Prisma.AppointmentWhereInput[] = [];
  if (filters.from) conditions.push({ date: { gte: zonedTime(filters.from, 0) } });
  if (filters.to) conditions.push({ date: { lt: zonedTime(addDays(filters.to, 1), 0) } });

  const statuses = filters.status ? STATUS_FILTERS[filters.status] : ACTIVE_STATUSES;
  if (statuses !== "all") {
    conditions.push({ OR: statuses.map((status) => statusCondition(status, now)) });
  }
  // Vista por defecto: desde hoy en adelante
  if (filters.status === null && !filters.from) {
    conditions.push({ date: { gte: zonedTime(dateKeyInZone(now), 0) } });
  }
  return { AND: conditions };
}

// "Del lunes 22 de diciembre al viernes 26 de diciembre" o "Lunes 22 de diciembre, de 13:00 a 15:00 hs"
function blockLabel(start: Date, end: Date): string {
  const startDay = dateKeyInZone(start);
  const endDay = dateKeyInZone(end);
  if (formatTime(start) === "00:00" && formatTime(end) === "00:00") {
    const lastDay = addDays(endDay, -1);
    return lastDay === startDay
      ? `${formatDay(startDay)} (todo el día)`
      : `Del ${formatDay(startDay).toLowerCase()} al ${formatDay(lastDay).toLowerCase()}`;
  }
  if (startDay === endDay) {
    return `${formatDay(startDay)}, de ${formatTime(start)} a ${formatTime(end)} hs`;
  }
  return `Desde el ${formatLongDate(start).toLowerCase()} ${formatTime(start)} hs hasta el ${formatLongDate(
    end,
  ).toLowerCase()} ${formatTime(end)} hs`;
}

async function AdminContent({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  const now = new Date();

  // Por defecto (y con rango de fechas) en orden cronológico; si no, lo más reciente primero
  const chronological = filters.status === null || filters.from !== null;

  const [appointments, services, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: appointmentsWhere(filters, now),
      include: {
        user: true,
        service: { select: { name: true } },
        payments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { date: chronological ? "asc" : "desc" },
      take: MAX_ROWS,
    }),
    prisma.service.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    prisma.blockedSchedule.findMany({
      where: { endDate: { gt: now } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const appointmentRows: AdminAppointmentRow[] = appointments.map((appointment) => {
    const status = effectiveStatus(appointment, now);
    const amount = (appointment.payments.find((p) => p.status === "PAID") ?? appointment.payments[0])
      ?.amount;
    return {
      id: appointment.id,
      dateLabel: formatLongDate(appointment.date),
      timeLabel: formatTime(appointment.date),
      clientName: `${appointment.user.firstName} ${appointment.user.lastName}`.trim() || "Sin nombre",
      clientEmail: appointment.user.email,
      clientPhone: appointment.user.phone,
      serviceName: appointment.service.name,
      status,
      paymentLabel: paymentLabel(appointment.payments),
      priceLabel: amount ? formatPrice(amount.toNumber()) : null,
      paidOnline: appointment.payments.some(
        (p) => p.method === "MERCADO_PAGO" && p.status === "PAID",
      ),
      canCancel: canCancel(status),
      canReschedule: canReschedule(status),
      canComplete: canComplete({ status, date: appointment.date }, now),
      canRegisterPayment: canRegisterPayment({ status, payments: appointment.payments }),
    };
  });

  const serviceRows: ServiceRow[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    duration: service.duration,
    price: service.price.toString(),
    priceLabel: formatPrice(service.price.toNumber()),
    isActive: service.isActive,
  }));

  const blockRows: BlockRow[] = blocks.map((block) => ({
    id: block.id,
    label: blockLabel(block.startDate, block.endDate),
    reason: block.reason,
    current: block.startDate <= now,
  }));

  return (
    <>
      <section id="turnos" className="flex scroll-mt-6 flex-col gap-5">
        <h2 className="font-display text-3xl font-semibold">Turnos</h2>
        <AppointmentsPanel
          rows={appointmentRows}
          filters={{
            status: filters.status,
            from: filters.from ?? "",
            to: filters.to ?? "",
          }}
          truncated={appointments.length === MAX_ROWS}
        />
      </section>

      <section id="servicios" className="flex scroll-mt-6 flex-col gap-5">
        <ServicesPanel services={serviceRows} />
      </section>

      <section id="bloqueos" className="flex scroll-mt-6 flex-col gap-5">
        <BlocksPanel blocks={blockRows} today={dateKeyInZone(now)} />
      </section>
    </>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-6 py-12">
      <h1 className="font-display text-4xl font-semibold">Panel de administración</h1>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
