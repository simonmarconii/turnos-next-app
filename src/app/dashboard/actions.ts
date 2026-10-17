"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canCancel,
  canReschedule,
  effectiveStatus,
  isWithinChangeLimit,
} from "@/lib/appointments";
import {
  getAvailability,
  isSlotAvailable,
  lockSchedule,
  type Availability,
} from "@/lib/availability";

// Acciones del cliente sobre sus propios turnos (sección 7.6 de la doc). Todas verifican que el
// turno sea del usuario logueado y el límite de 24 hs: no alcanza con esconder los botones.

export type ActionResult = { ok: true } | { ok: false; message: string };

const LIMIT_MESSAGE =
  "Faltan menos de 24 hs para tu turno: para cambiarlo, escribinos por WhatsApp.";

async function findOwnAppointment(appointmentId: unknown) {
  if (typeof appointmentId !== "string") return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return prisma.appointment.findFirst({ where: { id: appointmentId, userId: user.id } });
}

export async function cancelAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const appointment = await findOwnAppointment(appointmentId);
  if (!appointment) return { ok: false, message: "No encontramos ese turno." };

  if (!canCancel(effectiveStatus(appointment))) {
    return { ok: false, message: "Este turno ya no se puede cancelar." };
  }
  if (!isWithinChangeLimit(appointment.date)) return { ok: false, message: LIMIT_MESSAGE };

  await prisma.$transaction([
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", reservedUntil: null },
    }),
    // Los cobros pendientes ya no se van a hacer. Los pagos aprobados de Mercado Pago quedan como
    // están: la app no hace reembolsos (sección 7.8).
    prisma.payment.updateMany({
      where: { appointmentId: appointment.id, status: { in: ["PENDING", "IN_PROCESS"] } },
      data: { status: "CANCELLED" },
    }),
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getRescheduleAvailabilityAction(
  appointmentId: string,
): Promise<Availability | null> {
  const appointment = await findOwnAppointment(appointmentId);
  if (
    !appointment ||
    !canReschedule(appointment.status) ||
    !isWithinChangeLimit(appointment.date)
  ) {
    return null;
  }

  // Se mantiene la duración con la que se reservó, aunque el servicio haya cambiado después
  const durationMinutes = (appointment.endDate.getTime() - appointment.date.getTime()) / 60_000;
  return getAvailability(prisma, durationMinutes, { excludeAppointmentId: appointment.id });
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  start: string,
): Promise<ActionResult> {
  const appointment = await findOwnAppointment(appointmentId);
  if (!appointment) return { ok: false, message: "No encontramos ese turno." };

  if (!canReschedule(appointment.status)) {
    return { ok: false, message: "Este turno ya no se puede reprogramar." };
  }
  if (!isWithinChangeLimit(appointment.date)) return { ok: false, message: LIMIT_MESSAGE };

  const newStart = new Date(typeof start === "string" ? start : NaN);
  if (Number.isNaN(newStart.getTime())) {
    return { ok: false, message: "El horario elegido no es válido." };
  }

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

  if (!updated) {
    return { ok: false, message: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
