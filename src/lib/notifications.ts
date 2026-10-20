import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { paymentLabel } from "@/lib/appointments";
import { formatLongDate, formatTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import EmailTemplate, { type EmailTemplateProps } from "@/components/email-template";

// Emails de turnos (sección 5 de la doc). Quién recibe qué:
//
// | Evento                               | Cliente | Admins |
// | Reserva confirmada                   |   sí    |   sí   |  en el local: al reservar; Mercado Pago: al acreditarse
// | Reprogramación / cancelación cliente |   sí    |   sí   |  al cliente le sirve de comprobante
// | Reprogramación / cancelación admin   |   sí    |   no   |
// | Pago tardío sin horario              |   no    |   sí   |  hay que devolver la plata a mano
//
// "Admins" son todos los usuarios con rol ADMIN. Las funciones nunca tiran error: un email que
// no sale no tiene que romper la acción que lo disparó. Llamarlas con `after()`.

export type Actor = "client" | "admin";

type EmailContent = Omit<EmailTemplateProps, "preview"> & { subject: string; preview?: string };

const appUrl = () => process.env.APP_URL?.replace(/\/+$/, "");

function loadAppointment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { user: true, service: true, payments: { orderBy: { createdAt: "desc" } } },
  });
}

type FullAppointment = NonNullable<Awaited<ReturnType<typeof loadAppointment>>>;

async function send(to: string | string[], content: EmailContent) {
  if (Array.isArray(to) && to.length === 0) return;
  const { subject, preview, ...props } = content;
  try {
    await sendEmail({
      to,
      subject,
      react: EmailTemplate({ ...props, preview: preview ?? subject }),
    });
  } catch (error) {
    console.error(`No se pudo enviar el email "${subject}"`, error);
  }
}

async function adminEmails() {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  return admins.map((admin) => admin.email);
}

// Texto para iniciar sesión, solo si la persona todavía no entró nunca a su cuenta (por ejemplo,
// la shadow account que se creó al reservar como invitado). Inicia sesión con código por email.
async function loginHint(appointment: FullAppointment): Promise<string | null> {
  const { clerkId } = appointment.user;
  if (!clerkId) {
    return `Para ver, reprogramar o cancelar tus turnos, registrate en ${siteConfig.name} con este mismo email.`;
  }
  try {
    const clerkUser = await (await clerkClient()).users.getUser(clerkId);
    if (clerkUser.lastSignInAt) return null;
  } catch (error) {
    console.error(`No se pudo consultar el usuario de Clerk ${clerkId}`, error);
    return null;
  }
  return "Creamos una cuenta con este email. Para ver, reprogramar o cancelar tus turnos, tocá “Iniciar sesión”, escribí este email y te mandamos un código para entrar. No necesitás contraseña.";
}

// ------------------------------------------------------
// Datos que se repiten en los emails
// ------------------------------------------------------

const when = (date: Date) => `${formatLongDate(date)} a las ${formatTime(date)} hs`;

function clientName(appointment: FullAppointment) {
  return `${appointment.user.firstName} ${appointment.user.lastName}`.trim() || appointment.user.email;
}

function paymentRow(appointment: FullAppointment): [string, string] {
  const payment = appointment.payments.find((p) => p.status === "PAID") ?? appointment.payments[0];
  const price = payment ? ` · ${formatPrice(payment.amount.toNumber())}` : "";
  return ["Pago", `${paymentLabel(appointment.payments)}${price}`];
}

function appointmentRows(appointment: FullAppointment): [string, string][] {
  return [
    ["Servicio", appointment.service.name],
    ["Día", formatLongDate(appointment.date)],
    ["Hora", `${formatTime(appointment.date)} hs`],
    paymentRow(appointment),
  ];
}

function clientRows(appointment: FullAppointment): [string, string][] {
  return [
    ["Cliente", clientName(appointment)],
    ["Teléfono", appointment.user.phone ?? "—"],
    ["Email", appointment.user.email],
  ];
}

function paidOnline(appointment: FullAppointment) {
  return appointment.payments.some((p) => p.method === "MERCADO_PAGO" && p.status === "PAID");
}

function link(path: string, label: string) {
  const base = appUrl();
  return base ? { label, url: `${base}${path}` } : undefined;
}

const hello = (appointment: FullAppointment) =>
  appointment.user.firstName ? `Hola, ${appointment.user.firstName}.` : "Hola.";

// ------------------------------------------------------
// Eventos
// ------------------------------------------------------

// Turno confirmado: en el local al reservar, con Mercado Pago cuando se acredita el pago
export async function notifyBooked(appointmentId: string) {
  const appointment = await loadAppointment(appointmentId).catch(() => null);
  if (!appointment) return;
  const hint = await loginHint(appointment);

  await Promise.all([
    send(appointment.user.email, {
      subject: `Se confirmó tu turno para el ${formatLongDate(appointment.date).toLowerCase()}`,
      title: "¡Tu turno está confirmado!",
      intro: [
        hello(appointment),
        `Te esperamos el ${when(appointment.date).toLowerCase()}. Estos son los datos de tu turno:`,
      ],
      rows: appointmentRows(appointment),
      notes: [
        ...(hint ? [hint] : []),
        "Podés reprogramar o cancelar tu turno hasta 24 hs antes desde “Mis turnos”. Después de ese plazo, escribinos por WhatsApp.",
      ],
      cta: link("/dashboard", "Ver mis turnos"),
    }),
    send(await adminEmails(), {
      subject: `Reservaron un turno: ${clientName(appointment)} · ${when(appointment.date)}`,
      title: "Reservaron un turno",
      intro: [`${clientName(appointment)} reservó un turno.`],
      rows: [...clientRows(appointment), ...appointmentRows(appointment)],
      cta: link("/admin", "Ver en el panel"),
    }),
  ]);
}

export async function notifyRescheduled(appointmentId: string, previousDate: Date, actor: Actor) {
  const appointment = await loadAppointment(appointmentId).catch(() => null);
  if (!appointment) return;

  const changeRows: [string, string][] = [
    ["Servicio", appointment.service.name],
    ["Antes", when(previousDate)],
    ["Ahora", when(appointment.date)],
  ];

  await Promise.all([
    send(appointment.user.email, {
      subject:
        actor === "admin"
          ? `Reprogramamos tu turno para el ${formatLongDate(appointment.date).toLowerCase()}`
          : `Tu turno quedó reprogramado para el ${formatLongDate(appointment.date).toLowerCase()}`,
      title: actor === "admin" ? "Reprogramamos tu turno" : "Tu turno quedó reprogramado",
      intro: [
        hello(appointment),
        actor === "admin"
          ? `Tuvimos que cambiar el horario de tu turno. Ahora te esperamos el ${when(appointment.date).toLowerCase()}.`
          : `Este es el comprobante del cambio. Te esperamos el ${when(appointment.date).toLowerCase()}.`,
      ],
      rows: changeRows,
      notes:
        actor === "admin"
          ? ["Si el nuevo horario no te queda cómodo, escribinos por WhatsApp y lo coordinamos."]
          : [],
      cta: link("/dashboard", "Ver mis turnos"),
    }),
    actor === "client" &&
      send(await adminEmails(), {
        subject: `${clientName(appointment)} reprogramó su turno`,
        title: "Reprogramaron un turno",
        intro: [`${clientName(appointment)} reprogramó su turno desde “Mis turnos”.`],
        rows: [...clientRows(appointment), ...changeRows],
        cta: link("/admin", "Ver en el panel"),
      }),
  ]);
}

export async function notifyCancelled(appointmentId: string, actor: Actor) {
  const appointment = await loadAppointment(appointmentId).catch(() => null);
  if (!appointment) return;
  const paid = paidOnline(appointment);

  await Promise.all([
    send(appointment.user.email, {
      subject:
        actor === "admin"
          ? `Cancelamos tu turno del ${formatLongDate(appointment.date).toLowerCase()}`
          : `Cancelaste tu turno del ${formatLongDate(appointment.date).toLowerCase()}`,
      title: actor === "admin" ? "Cancelamos tu turno" : "Cancelaste tu turno",
      intro: [
        hello(appointment),
        actor === "admin"
          ? `Tuvimos que cancelar tu turno del ${when(appointment.date).toLowerCase()}. Escribinos por WhatsApp y coordinamos uno nuevo.`
          : `Este es el comprobante de la cancelación de tu turno del ${when(appointment.date).toLowerCase()}.`,
      ],
      rows: appointmentRows(appointment),
      notes: paid
        ? [
            actor === "admin"
              ? "Como el turno estaba pagado con Mercado Pago, escribinos por WhatsApp para coordinar la devolución."
              : "La cancelación no genera un reembolso automático. Para coordinarlo, escribinos por WhatsApp.",
          ]
        : [],
      cta: link("/reservar", "Reservar otro turno"),
    }),
    actor === "client" &&
      send(await adminEmails(), {
        subject: `${clientName(appointment)} canceló su turno`,
        title: "Cancelaron un turno",
        intro: [
          `${clientName(appointment)} canceló su turno del ${when(appointment.date).toLowerCase()}. El horario quedó libre.`,
        ],
        rows: [...clientRows(appointment), ...appointmentRows(appointment)],
        notes: paid
          ? ["Estaba pagado con Mercado Pago: si corresponde, la devolución se hace desde Mercado Pago."]
          : [],
        cta: link("/admin", "Ver en el panel"),
      }),
  ]);
}

// Pago de Mercado Pago acreditado fuera de término, cuando el horario ya lo tomó otra persona
export async function notifyPaidWithoutSlot(appointmentId: string) {
  const appointment = await loadAppointment(appointmentId).catch(() => null);
  if (!appointment) return;

  await send(await adminEmails(), {
    subject: `Pago recibido sin turno: ${clientName(appointment)}`,
    title: "Pago recibido sin turno",
    intro: [
      `${clientName(appointment)} pagó con Mercado Pago después de que venciera su reserva, y el horario ya lo había tomado otra persona.`,
      "Hay que contactar al cliente para coordinar otro turno o devolverle el dinero desde Mercado Pago.",
    ],
    rows: [...clientRows(appointment), ...appointmentRows(appointment)],
    cta: link("/admin", "Ver en el panel"),
  });
}
