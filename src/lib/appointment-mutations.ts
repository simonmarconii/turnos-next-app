import "server-only";

import type { Appointment } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isSlotAvailable, lockSchedule } from "@/lib/availability";

// Cambios de turnos compartidos por las acciones del cliente y del admin. Los permisos
// (dueño, rol, límite de 24 hs) se validan antes, en cada Server Action.

export async function cancelAppointment(appointmentId: string) {
  await prisma.$transaction([
    prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED", reservedUntil: null },
    }),
    // Los cobros pendientes ya no se van a hacer. Los pagos aprobados de Mercado Pago quedan como
    // están: la app no hace reembolsos (sección 7.8).
    prisma.payment.updateMany({
      where: { appointmentId, status: { in: ["PENDING", "IN_PROCESS"] } },
      data: { status: "CANCELLED" },
    }),
  ]);
}

// Mueve el turno a `newStart` manteniendo la duración con la que se reservó. Devuelve false si
// el horario ya no está libre.
export async function rescheduleAppointment(appointment: Appointment, newStart: Date) {
  const duration = appointment.endDate.getTime() - appointment.date.getTime();

  const updated = await prisma.$transaction(async (tx) => {
    await lockSchedule(tx);
    if (!(await isSlotAvailable(tx, duration / 60_000, newStart, appointment.id))) return null;

    return tx.appointment.update({
      where: { id: appointment.id },
      data: {
        date: newStart,
        endDate: new Date(newStart.getTime() + duration),
        status: "RESCHEDULED",
      },
    });
  });

  return updated !== null;
}

// Duración con la que se reservó, en minutos (puede diferir de la actual del servicio)
export function bookedDurationMinutes(appointment: Appointment) {
  return (appointment.endDate.getTime() - appointment.date.getTime()) / 60_000;
}

export function parseStart(start: unknown): Date | null {
  const date = new Date(typeof start === "string" ? start : NaN);
  return Number.isNaN(date.getTime()) ? null : date;
}
