"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import {
  type ActionResult,
  canCancel,
  canComplete,
  canRegisterPayment,
  canReschedule,
  effectiveStatus,
  isActiveStatus,
} from "@/lib/appointments";
import {
  bookedDurationMinutes,
  cancelAppointment,
  parseStart,
  rescheduleAppointment,
} from "@/lib/appointment-mutations";
import { getAvailability, type Availability } from "@/lib/availability";
import { addDays, formatLongDate, formatTime, zonedTime } from "@/lib/dates";

// Acciones del panel de administración (sección 7.5 de la doc). Cada una vuelve a verificar el
// rol: una Server Action se puede llamar directamente, sin pasar por la página.

const FORBIDDEN: ActionResult = { ok: false, message: "No tenés permisos para hacer esto." };
const NOT_FOUND: ActionResult = { ok: false, message: "No encontramos ese turno." };

function done(): ActionResult {
  revalidatePath("/admin");
  return { ok: true };
}

async function findAppointment(appointmentId: unknown) {
  if (typeof appointmentId !== "string") return null;
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { payments: { orderBy: { createdAt: "desc" } }, service: true },
  });
}

// ------------------------------------------------------
// Turnos
// ------------------------------------------------------

export async function adminCancelAppointmentAction(appointmentId: string): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  const appointment = await findAppointment(appointmentId);
  if (!appointment) return NOT_FOUND;
  if (!canCancel(effectiveStatus(appointment))) {
    return { ok: false, message: "Este turno ya no se puede cancelar." };
  }

  await cancelAppointment(appointment.id);
  return done();
}

export async function adminGetRescheduleAvailabilityAction(
  appointmentId: string,
): Promise<Availability | null> {
  if (!(await getAdminUser())) return null;
  const appointment = await findAppointment(appointmentId);
  if (!appointment || !canReschedule(appointment.status)) return null;

  return getAvailability(prisma, bookedDurationMinutes(appointment), {
    excludeAppointmentId: appointment.id,
  });
}

export async function adminRescheduleAppointmentAction(
  appointmentId: string,
  start: string,
): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  const appointment = await findAppointment(appointmentId);
  if (!appointment) return NOT_FOUND;
  if (!canReschedule(appointment.status)) {
    return { ok: false, message: "Este turno ya no se puede reprogramar." };
  }

  const newStart = parseStart(start);
  if (!newStart) return { ok: false, message: "El horario elegido no es válido." };

  if (!(await rescheduleAppointment(appointment, newStart))) {
    return { ok: false, message: "Ese horario se acaba de ocupar. Elegí otro." };
  }
  return done();
}

export async function completeAppointmentAction(appointmentId: string): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  const appointment = await findAppointment(appointmentId);
  if (!appointment) return NOT_FOUND;
  if (!canComplete(appointment)) {
    return { ok: false, message: "Solo se pueden marcar como realizados turnos que ya empezaron." };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "COMPLETED" },
  });
  return done();
}

// Registra el cobro en el local: marca como pagado el Payment IN_STORE pendiente o, si el turno
// no tiene uno (ej. intentó pagar con Mercado Pago y terminó pagando en el local), lo crea.
export async function registerPaymentAction(appointmentId: string): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  const appointment = await findAppointment(appointmentId);
  if (!appointment) return NOT_FOUND;
  if (!canRegisterPayment(appointment)) {
    return { ok: false, message: "Este turno ya está cobrado o no se puede cobrar." };
  }

  const now = new Date();
  const pending = appointment.payments.find(
    (payment) => payment.method === "IN_STORE" && payment.status === "PENDING",
  );
  if (pending) {
    await prisma.payment.update({
      where: { id: pending.id },
      data: { status: "PAID", paidAt: now },
    });
  } else {
    const lastAmount = appointment.payments[0]?.amount;
    await prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        method: "IN_STORE",
        status: "PAID",
        paidAt: now,
        amount: lastAmount ?? appointment.service.price,
      },
    });
  }
  return done();
}

// ------------------------------------------------------
// Servicios
// ------------------------------------------------------

export type ServiceInput = {
  name: string;
  description: string;
  duration: string;
  price: string;
};

function parseService(input: ServiceInput) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  const duration = Number(input?.duration);
  const price = Number(input?.price);

  if (!name || name.length > 80) return { error: "Ingresá un nombre (hasta 80 caracteres)." };
  if (description.length > 300) return { error: "La descripción puede tener hasta 300 caracteres." };
  if (!Number.isInteger(duration) || duration < 5 || duration > 9 * 60) {
    return { error: "La duración tiene que ser un número entero de minutos (entre 5 y 540)." };
  }
  if (!Number.isFinite(price) || price < 0 || price >= 100_000_000) {
    return { error: "Ingresá un precio válido." };
  }

  return {
    data: {
      name,
      description: description || null,
      duration,
      price: price.toFixed(2),
    },
  };
}

export async function saveServiceAction(
  serviceId: string | null,
  input: ServiceInput,
): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  const parsed = parseService(input);
  if (parsed.error !== undefined) return { ok: false, message: parsed.error };

  if (serviceId === null) {
    await prisma.service.create({ data: parsed.data });
  } else {
    if (typeof serviceId !== "string") return { ok: false, message: "Servicio inválido." };
    // El cambio de duración o precio no afecta a los turnos ya reservados (endDate y
    // Payment.amount quedaron fijos al reservar)
    await prisma.service.update({ where: { id: serviceId }, data: parsed.data });
  }
  return done();
}

export async function setServiceActiveAction(
  serviceId: string,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  if (typeof serviceId !== "string" || typeof isActive !== "boolean") {
    return { ok: false, message: "Servicio inválido." };
  }

  await prisma.service.update({ where: { id: serviceId }, data: { isActive } });
  return done();
}

// ------------------------------------------------------
// Bloqueos de fechas
// ------------------------------------------------------

export type BlockInput = {
  fromDate: string; // YYYY-MM-DD
  fromTime: string; // HH:mm o vacío (desde el comienzo del día)
  toDate: string;
  toTime: string; // HH:mm o vacío (hasta el final del día)
  reason: string;
};

export type BlockResult =
  | { ok: true; conflicts: string[] }
  | { ok: false; message: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function createBlockAction(input: BlockInput): Promise<BlockResult> {
  if (!(await getAdminUser())) return FORBIDDEN as BlockResult;

  const { fromDate, fromTime, toDate, toTime } = input ?? {};
  if (!DATE_PATTERN.test(fromDate) || !DATE_PATTERN.test(toDate)) {
    return { ok: false, message: "Elegí las fechas de inicio y fin." };
  }
  if ((fromTime && !TIME_PATTERN.test(fromTime)) || (toTime && !TIME_PATTERN.test(toTime))) {
    return { ok: false, message: "Revisá los horarios." };
  }

  // Las fechas y horas que carga el admin son hora del local, no del navegador
  const startDate = zonedTime(fromDate, fromTime ? toMinutes(fromTime) : 0);
  const endDate = toTime ? zonedTime(toDate, toMinutes(toTime)) : zonedTime(addDays(toDate, 1), 0);
  if (endDate <= startDate) {
    return { ok: false, message: "El fin del bloqueo tiene que ser posterior al inicio." };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 100) : "";
  await prisma.blockedSchedule.create({ data: { startDate, endDate, reason: reason || null } });

  // Turnos activos que quedaron dentro del bloqueo: se avisan para que el admin decida
  const now = new Date();
  const overlapping = await prisma.appointment.findMany({
    where: { date: { lt: endDate }, endDate: { gt: startDate } },
    include: { user: true, service: true },
    orderBy: { date: "asc" },
  });
  const conflicts = overlapping
    .filter((appointment) => isActiveStatus(effectiveStatus(appointment, now)))
    .map(
      (appointment) =>
        `${appointment.user.firstName} ${appointment.user.lastName} · ${formatLongDate(
          appointment.date,
        )} ${formatTime(appointment.date)} hs · ${appointment.service.name}`,
    );

  revalidatePath("/admin");
  return { ok: true, conflicts };
}

export async function deleteBlockAction(blockId: string): Promise<ActionResult> {
  if (!(await getAdminUser())) return FORBIDDEN;
  if (typeof blockId !== "string") return { ok: false, message: "Bloqueo inválido." };

  await prisma.blockedSchedule.deleteMany({ where: { id: blockId } });
  return done();
}
