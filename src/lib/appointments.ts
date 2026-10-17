import type {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/client";
import { bookingConfig } from "@/config/booking";

// Reglas sobre lo que el cliente puede hacer con sus turnos (sección 7.6 de la doc).
// Se usan para mostrar los botones y, otra vez, en las Server Actions.

// Resultado de las Server Actions que modifican turnos, servicios o bloqueos
export type ActionResult = { ok: true } | { ok: false; message: string };

// Reprogramar no aplica a PENDING_PAYMENT: primero tiene que completar el pago
const CANCELLABLE: AppointmentStatus[] = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "RESCHEDULED"];
const RESCHEDULABLE: AppointmentStatus[] = ["PENDING", "CONFIRMED", "RESCHEDULED"];

// Turnos que todavía van a ocurrir (o esperan pago dentro de su reserva)
const ACTIVE: AppointmentStatus[] = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "RESCHEDULED"];

export function isActiveStatus(status: AppointmentStatus) {
  return ACTIVE.includes(status);
}

// Admin: solo se marca como realizado un turno que ya empezó
export function canComplete(appointment: { status: AppointmentStatus; date: Date }, now = new Date()) {
  return RESCHEDULABLE.includes(appointment.status) && appointment.date <= now;
}

// Admin: el cobro en el local se puede registrar mientras el turno no esté cancelado ni vencido
// y no tenga ya un pago aprobado (también después de marcarlo como realizado)
export function canRegisterPayment(appointment: {
  status: AppointmentStatus;
  payments: { status: string }[];
}) {
  return (
    [...RESCHEDULABLE, "COMPLETED"].includes(appointment.status) &&
    !appointment.payments.some((payment) => payment.status === "PAID")
  );
}

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

// Resumen del cobro para mostrar. `payments` ordenados del más nuevo al más viejo: el cobro
// relevante es el aprobado, si hay; si no, el último intento.
export function paymentLabel(payments: { method: PaymentMethod; status: PaymentStatus }[]) {
  const payment = payments.find((p) => p.status === "PAID") ?? payments[0];
  if (!payment) return "Sin pago registrado";
  if (payment.method === "IN_STORE") {
    return payment.status === "PAID" ? "Pagado en el local" : "Pago en el local";
  }
  return payment.status === "PAID" ? "Pagado con Mercado Pago" : "Mercado Pago (pendiente)";
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
