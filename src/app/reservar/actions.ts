"use server";

import { after } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAvailability, isSlotAvailable, type Availability } from "@/lib/availability";

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

export type BookingResult =
  | { ok: true; email: string }
  | {
      ok: false;
      code: "SLOT_TAKEN" | "EMAIL_NOT_FOUND" | "INVALID";
      message: string;
    };

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

const invalid = (message: string): BookingResult => ({ ok: false, code: "INVALID", message });

// Busca o crea el usuario para el que se hace la reserva (shadow account, sección 3.2)
async function resolveUser(
  identity: BookingIdentity | undefined,
): Promise<{ user: User } | { error: BookingResult }> {
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

// Clave fija del advisory lock que serializa las reservas: atiende una sola persona, así que
// dos reservas simultáneas nunca pueden validar el mismo horario como libre.
const BOOKING_LOCK_KEY = 4_815_162_342;

// Reserva con pago en el local: turno en PENDING + Payment IN_STORE (sección 3.1, paso 4)
export async function createInStoreBookingAction(input: BookingInput): Promise<BookingResult> {
  if (typeof input?.serviceId !== "string" || typeof input.start !== "string") {
    return invalid("Faltan datos de la reserva.");
  }

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return invalid("El horario elegido no es válido.");

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, isActive: true },
  });
  if (!service) return invalid("El servicio elegido ya no está disponible.");

  const resolved = await resolveUser(input.identity);
  if ("error" in resolved) return resolved.error;
  const { user } = resolved;

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`);

    if (!(await isSlotAvailable(tx, service.duration, start))) return null;

    return tx.appointment.create({
      data: {
        date: start,
        endDate: new Date(start.getTime() + service.duration * 60_000),
        status: "PENDING",
        userId: user.id,
        serviceId: service.id,
        payments: {
          // El monto se congela con el precio actual del servicio
          create: { method: "IN_STORE", status: "PENDING", amount: service.price },
        },
      },
    });
  });

  if (!appointment) {
    return {
      ok: false,
      code: "SLOT_TAKEN",
      message: "Ese horario se acaba de ocupar. Elegí otro, por favor.",
    };
  }

  // Después de responder, para no demorar la confirmación con las llamadas a Clerk
  after(() => ensureClerkAccount(user));

  return { ok: true, email: user.email };
}
