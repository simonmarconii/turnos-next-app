"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  type ActionResult,
  canCancel,
  canReschedule,
  effectiveStatus,
  isWithinChangeLimit,
} from "@/lib/appointments";
import {
  bookedDurationMinutes,
  cancelAppointment,
  parseStart,
  rescheduleAppointment,
} from "@/lib/appointment-mutations";
import { getAvailability, type Availability } from "@/lib/availability";

// Acciones del cliente sobre sus propios turnos (sección 7.6 de la doc). Todas verifican que el
// turno sea del usuario logueado y el límite de 24 hs: no alcanza con esconder los botones.

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

  await cancelAppointment(appointment.id);
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

  return getAvailability(prisma, bookedDurationMinutes(appointment), {
    excludeAppointmentId: appointment.id,
  });
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

  const newStart = parseStart(start);
  if (!newStart) return { ok: false, message: "El horario elegido no es válido." };

  if (!(await rescheduleAppointment(appointment, newStart))) {
    return { ok: false, message: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
