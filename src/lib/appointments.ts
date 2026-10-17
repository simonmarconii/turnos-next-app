import type { AppointmentStatus } from "@/generated/prisma/client";
import { bookingConfig } from "@/config/booking";

// Reglas sobre lo que el cliente puede hacer con sus turnos (sección 7.6 de la doc).
// Se usan para mostrar los botones y, otra vez, en las Server Actions.

// Reprogramar no aplica a PENDING_PAYMENT: primero tiene que completar el pago
const CANCELLABLE: AppointmentStatus[] = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "RESCHEDULED"];
const RESCHEDULABLE: AppointmentStatus[] = ["PENDING", "CONFIRMED", "RESCHEDULED"];

export function canCancel(status: AppointmentStatus) {
  return CANCELLABLE.includes(status);
}

export function canReschedule(status: AppointmentStatus) {
  return RESCHEDULABLE.includes(status);
}

// El cliente puede reprogramar o cancelar hasta 24 hs antes del turno
export function isWithinChangeLimit(date: Date, now = new Date()) {
  return date.getTime() - now.getTime() >= bookingConfig.clientChangeLimitHours * 3_600_000;
}

// Un turno esperando pago cuya reserva venció ya está vencido aunque el registro todavía no se
// haya actualizado (sección 4.3)
export function effectiveStatus(
  appointment: { status: AppointmentStatus; reservedUntil: Date | null },
  now = new Date(),
): AppointmentStatus {
  if (
    appointment.status === "PENDING_PAYMENT" &&
    (!appointment.reservedUntil || appointment.reservedUntil <= now)
  ) {
    return "EXPIRED";
  }
  return appointment.status;
}
