"use server";

import { after } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { Preference } from "mercadopago";
import type { Prisma, Service, User } from "@/generated/prisma/client";
import { bookingConfig } from "@/config/booking";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import mercadoPagoClient from "@/lib/mercadopago";
import { notifyBooked } from "@/lib/notifications";
import {
  getAvailability,
  isSlotAvailable,
  lockSchedule,
  type Availability,
} from "@/lib/availability";

const preferenceClient = new Preference(mercadoPagoClient);

// Los argumentos de una Server Action llegan del navegador: se validan todos acá.

export async function getAvailabilityAction(serviceId: string): Promise<Availability | null> {
  if (typeof serviceId !== "string") return null;

  const service = await prisma.service.findFirst({ where: { id: serviceId, isActive: true } });
  if (!service) return null;

  return getAvailability(prisma, service.duration);
}

export type BookingIdentity =
  | { mode: "new"; email: string; firstName: string; lastName: string; phone: string }
  | { mode: "existing"; email: string };

export type BookingInput = {
  serviceId: string;
  start: string; // ISO
  // Se ignora si hay sesión: en ese caso se usa el usuario logueado
  identity?: BookingIdentity;
};

type BookingError = {
  ok: false;
  code: "SLOT_TAKEN" | "EMAIL_NOT_FOUND" | "INVALID" | "PAYMENT_ERROR";
  message: string;
};

export type BookingResult = { ok: true; email: string } | BookingError;

export type CheckoutResult = { ok: true; initPoint: string, email: string } | BookingError;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\s-]{6,20}$/;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function cleanEmail(value: unknown): string | null {
  const email = cleanText(value, 254)?.toLowerCase();
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

const invalid = (message: string): BookingError => ({ ok: false, code: "INVALID", message });

const SLOT_TAKEN: BookingError = {
  ok: false,
  code: "SLOT_TAKEN",
  message: "Ese horario se acaba de ocupar. Elegí otro, por favor.",
};

// Busca o crea el usuario para el que se hace la reserva (shadow account, sección 3.2)
async function resolveUser(
  identity: BookingIdentity | undefined,
): Promise<{ user: User } | { error: BookingError }> {
  const sessionUser = await getCurrentUser();
  if (sessionUser) return { user: sessionUser };

  if (!identity) return { error: invalid("Completá tus datos para reservar.") };

  const email = cleanEmail(identity.email);
  if (!email) return { error: invalid("Ingresá un email válido.") };

  if (identity.mode === "existing") {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        error: {
          ok: false,
          code: "EMAIL_NOT_FOUND",
          message:
            "No encontramos reservas con ese email. Completá tus datos en “Es mi primera vez”.",
        },
      };
    }
    return { user };
  }

  const firstName = cleanText(identity.firstName, 60);
  const lastName = cleanText(identity.lastName, 60);
  const phone = cleanText(identity.phone, 20);
  if (!firstName || !lastName) return { error: invalid("Completá tu nombre y apellido.") };
  if (!phone || !PHONE_PATTERN.test(phone)) return { error: invalid("Ingresá un teléfono válido.") };

  // Si el email ya existe se reutiliza ese usuario sin pisar sus datos: quien reserva no
  // necesariamente es el dueño de la cuenta.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, firstName, lastName, phone },
  });
  return { user };
}

// Shadow account en Clerk (sección 3.2): sin esto, quien reservó como invitado no puede iniciar
// sesión porque Clerk no conoce su email. El email se crea como "reserved": no está verificado,
// pero sirve para iniciar sesión (Clerk pide el código que manda al email) y nadie más puede
// registrarlo. No bloquea la reserva: si falla, la persona igual puede registrarse con ese email.
async function ensureClerkAccount(user: User) {
  if (user.clerkId) return;
  try {
    const clerk = await clerkClient();
    const { data } = await clerk.users.getUserList({ emailAddress: [user.email] });
    const existing = data.find((clerkUser) =>
      clerkUser.emailAddresses.some((address) => address.emailAddress.toLowerCase() === user.email),
    );
    const clerkUser =
      existing ??
      (await clerk.users.createUser({
        emailAddress: [user.email],
        emailAddressIdentificationStatus: ["reserved"],
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        skipPasswordRequirement: true,
      }));
    await prisma.user.update({ where: { id: user.id }, data: { clerkId: clerkUser.id } });
  } catch (error) {
    console.error(`No se pudo crear la cuenta de Clerk del usuario ${user.id}`, error);
  }
}

// Validaciones comunes a los dos medios de pago: datos, servicio activo y usuario
async function prepareBooking(
  input: BookingInput,
): Promise<{ service: Service; user: User; start: Date } | { error: BookingError }> {
  if (typeof input?.serviceId !== "string" || typeof input.start !== "string") {
    return { error: invalid("Faltan datos de la reserva.") };
  }

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return { error: invalid("El horario elegido no es válido.") };

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, isActive: true },
  });
  if (!service) return { error: invalid("El servicio elegido ya no está disponible.") };

  const resolved = await resolveUser(input.identity);
  if ("error" in resolved) return resolved;

  return { service, user: resolved.user, start };
}

// Crea el turno con su primer Payment si el horario sigue libre; null si se ocupó mientras el
// cliente completaba el wizard. El advisory lock evita que dos reservas validen el mismo horario.
async function reserveAppointment({
  service,
  user,
  start,
  status,
  reservedUntil,
  payment,
}: {
  service: Service;
  user: User;
  start: Date;
  status: "PENDING" | "PENDING_PAYMENT";
  reservedUntil?: Date;
  payment: Omit<Prisma.PaymentCreateWithoutAppointmentInput, "amount">;
}) {
  return prisma.$transaction(async (tx) => {
    await lockSchedule(tx);

    if (!(await isSlotAvailable(tx, service.duration, start))) return null;

    return tx.appointment.create({
      data: {
        date: start,
        endDate: new Date(start.getTime() + service.duration * 60_000),
        status,
        reservedUntil,
        userId: user.id,
        serviceId: service.id,
        // El monto se congela con el precio actual del servicio
        payments: { create: { ...payment, amount: service.price } },
      },
      include: { payments: true },
    });
  });
}

// Reserva con pago en el local: turno en PENDING + Payment IN_STORE (sección 3.1, paso 4)
export async function createInStoreBookingAction(input: BookingInput): Promise<BookingResult> {
  const prepared = await prepareBooking(input);
  if ("error" in prepared) return prepared.error;
  const { service, user, start } = prepared;

  const appointment = await reserveAppointment({
    service,
    user,
    start,
    status: "PENDING",
    payment: { method: "IN_STORE", status: "PENDING" },
  });
  if (!appointment) return SLOT_TAKEN;

  // Después de responder, para no demorar la confirmación. En orden: el email decide si incluye
  // cómo iniciar sesión según la cuenta de Clerk que se crea antes.
  after(async () => {
    await ensureClerkAccount(user);
    await notifyBooked(appointment.id);
  });

  return { ok: true, email: user.email };
}

// Mercado Pago espera fechas con offset explícito (yyyy-MM-ddTHH:mm:ss.SSS±HH:mm)
function toMercadoPagoDate(date: Date) {
  return date.toISOString().replace("Z", "+00:00");
}

// Reserva con pago online (sección 4.2): turno en PENDING_PAYMENT que retiene el horario
// `paymentHoldMinutes`, Payment MERCADO_PAGO y la preferencia de Checkout Pro. Devuelve la URL de
// checkout a la que hay que redirigir al cliente. El turno se confirma recién en el webhook.
export async function createCheckout(input: BookingInput): Promise<CheckoutResult> {
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!appUrl) {
    console.error("Falta la variable de entorno APP_URL: no se puede crear la preferencia");
    return {
      ok: false,
      code: "PAYMENT_ERROR",
      message: "El pago online no está disponible en este momento. Podés elegir pagar en el local.",
    };
  }

  const prepared = await prepareBooking(input);
  if ("error" in prepared) return prepared.error;
  const { service, user, start } = prepared;

  // reservedUntil y Payment.expiresAt coinciden (sección 4.3)
  const reservedUntil = new Date(Date.now() + bookingConfig.paymentHoldMinutes * 60_000);

  const appointment = await reserveAppointment({
    service,
    user,
    start,
    status: "PENDING_PAYMENT",
    reservedUntil,
    payment: { method: "MERCADO_PAGO", status: "PENDING", expiresAt: reservedUntil },
  });
  if (!appointment) return SLOT_TAKEN;
  const payment = appointment.payments[0];

  // La llamada a Mercado Pago queda fuera de la transacción (sección 4.2)
  let initPoint: string;
  try {
    // Mercado Pago rechaza auto_return y notification_url que no sean públicos (ej. localhost):
    // para probar los pagos en desarrollo, APP_URL tiene que ser un túnel https (ngrok, etc.)
    const isPublicUrl = appUrl.startsWith("https://");
    const returnUrl = `${appUrl}/reservar/pago`;

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: service.id,
            title: service.name,
            quantity: 1,
            unit_price: payment.amount.toNumber(),
            currency_id: payment.currency,
          },
        ],
        payer: {
          email: user.email,
          name: user.firstName || undefined,
          surname: user.lastName || undefined,
        },
        // El webhook ubica el Payment con este id (sección 4.1)
        external_reference: payment.id,
        metadata: { appointment_id: appointment.id },
        // Vence junto con la retención del horario: después no se puede pagar
        expires: true,
        expiration_date_from: toMercadoPagoDate(new Date()),
        expiration_date_to: toMercadoPagoDate(reservedUntil),
        // La vuelta solo muestra un mensaje; la fuente de verdad es el webhook (sección 4.4)
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
        ...(isPublicUrl && {
          auto_return: "approved",
          notification_url: `${appUrl}/api/webhooks/mercadopago`,
        }),
      },
      // Si la llamada se reintenta, Mercado Pago no crea una segunda preferencia
      requestOptions: { idempotencyKey: payment.id },
    });

    if (!preference.id || !preference.init_point) {
      throw new Error("La respuesta de Mercado Pago no trae id o init_point");
    }
    initPoint = preference.init_point;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { mpPreferenceId: preference.id, mpInitPoint: initPoint },
    });
  } catch (error) {
    console.error(`No se pudo crear la preferencia del turno ${appointment.id}`, error);

    // Sin preferencia no hay forma de pagar: se borra el turno para liberar el horario en el
    // momento (en vez de dejarlo retenido 10 minutos) y que no aparezca en "Mis turnos".
    await prisma
      .$transaction([
        prisma.payment.deleteMany({ where: { appointmentId: appointment.id } }),
        prisma.appointment.delete({ where: { id: appointment.id } }),
      ])
      .catch((cleanupError) =>
        console.error(`No se pudo liberar el turno ${appointment.id}`, cleanupError),
      );

    return {
      ok: false,
      code: "PAYMENT_ERROR",
      message:
        "No pudimos iniciar el pago con Mercado Pago. Intentá de nuevo o elegí pagar en el local.",
    };
  }

  after(() => ensureClerkAccount(user));

  return { ok: true, initPoint, email: user.email };
}
