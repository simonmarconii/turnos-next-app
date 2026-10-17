import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { bookingConfig } from "@/config/booking";
import {
  addDays,
  addMonths,
  dateKeyInZone,
  weekdayOf,
  zonedTime,
  type DateKey,
} from "@/lib/dates";

export type Availability = {
  minDate: DateKey;
  maxDate: DateKey;
  // Solo figuran los días con al menos un horario libre. Cada horario es el inicio en ISO (UTC).
  days: Record<DateKey, string[]>;
};

// Acepta el cliente global o el de una transacción
type Db = Prisma.TransactionClient;

// Primer y último día que se pueden reservar
export function bookingWindow(now: Date): { minDate: DateKey; maxDate: DateKey } {
  const minDate = dateKeyInZone(now);
  return { minDate, maxDate: addMonths(minDate, bookingConfig.maxMonthsAhead) };
}

// Estados que ocupan el horario (sección 6.2 de la doc). PENDING_PAYMENT se trata aparte.
export const OCCUPYING_STATUSES = ["PENDING", "CONFIRMED", "RESCHEDULED", "COMPLETED"] as const;

// Clave fija del advisory lock que serializa las reservas y reprogramaciones: atiende una sola
// persona, así que dos operaciones simultáneas nunca pueden validar el mismo horario como libre.
const SCHEDULE_LOCK_KEY = 4_815_162_342;

// Llamar al principio de la transacción que valida y ocupa un horario
export async function lockSchedule(tx: Db) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`);
}

type AvailabilityOptions = {
  range?: { from: DateKey; to: DateKey };
  // Al reprogramar, el turno que se mueve no debe bloquear su propio horario
  excludeAppointmentId?: string;
};

// Intervalos [inicio, fin) en ms que ya no se pueden reservar entre `from` y `to`:
// turnos que ocupan el horario y bloqueos del admin.
async function loadBusyIntervals(
  db: Db,
  from: Date,
  to: Date,
  now: Date,
  excludeAppointmentId?: string,
) {
  const [appointments, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        date: { lt: to },
        endDate: { gt: from },
        OR: [
          { status: { in: [...OCCUPYING_STATUSES] } },
          // Un turno esperando pago solo retiene el horario mientras no venza la reserva
          { status: "PENDING_PAYMENT", reservedUntil: { gt: now } },
        ],
      },
      select: { date: true, endDate: true },
    }),
    db.blockedSchedule.findMany({
      where: { startDate: { lt: to }, endDate: { gt: from } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  return [
    ...appointments.map((a) => [a.date.getTime(), a.endDate.getTime()] as const),
    ...blocks.map((b) => [b.startDate.getTime(), b.endDate.getTime()] as const),
  ];
}

// Horarios libres para un servicio de `durationMinutes` entre los días `from` y `to` (inclusive),
// recortados a la ventana de reserva.
export async function getAvailability(
  db: Db,
  durationMinutes: number,
  { range, excludeAppointmentId }: AvailabilityOptions = {},
): Promise<Availability> {
  const now = new Date();
  const { minDate, maxDate } = bookingWindow(now);
  const from = range && range.from > minDate ? range.from : minDate;
  const to = range && range.to < maxDate ? range.to : maxDate;

  const days: Availability["days"] = {};
  if (from > to) return { minDate, maxDate, days };

  const busy = await loadBusyIntervals(
    db,
    zonedTime(from, 0),
    zonedTime(addDays(to, 1), 0),
    now,
    excludeAppointmentId,
  );
  const duration = durationMinutes * 60_000;

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const hours = bookingConfig.openingHours[weekdayOf(day)];
    if (!hours) continue;

    const slots: string[] = [];
    for (
      let minutes = hours.open;
      minutes + durationMinutes <= hours.close;
      minutes += bookingConfig.slotIntervalMinutes
    ) {
      const start = zonedTime(day, minutes).getTime();
      const end = start + duration;
      if (start <= now.getTime()) continue;
      if (busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart)) continue;
      slots.push(new Date(start).toISOString());
    }
    if (slots.length > 0) days[day] = slots;
  }

  return { minDate, maxDate, days };
}

// Revalida un horario puntual (ej. al confirmar la reserva, dentro de la transacción)
export async function isSlotAvailable(
  db: Db,
  durationMinutes: number,
  start: Date,
  excludeAppointmentId?: string,
) {
  const day = dateKeyInZone(start);
  const { days } = await getAvailability(db, durationMinutes, {
    range: { from: day, to: day },
    excludeAppointmentId,
  });
  return days[day]?.includes(start.toISOString()) ?? false;
}
