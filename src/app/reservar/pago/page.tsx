import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { z } from "zod";
import {
  CalendarX,
  CircleAlert,
  CircleCheck,
  Clock,
  LoaderCircle,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { whatsappUrl } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { effectiveStatus } from "@/lib/appointments";
import { formatLongDate, formatTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import { sendConfirmationEmail, syncMercadoPagoPayment } from "@/lib/mercadopago-payments";
import { BookingSummary } from "@/components/booking-summary";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { releasePendingPaymentAction } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Tu pago" };

// Página de vuelta del checkout de Mercado Pago (back_urls, sección 4.4 de la doc). Mercado Pago
// agrega a la URL `external_reference` (el id del Payment), `payment_id` y `status`. El estado
// que se muestra sale de la base, nunca de la URL: `status` solo se usa para elegir el mensaje
// mientras el pago todavía no se sincronizó.

type SearchParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function loadPayment(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: { appointment: { include: { service: true, user: true } } },
  });
}

function Result({
  icon: Icon,
  tone = "primary",
  title,
  children,
}: {
  icon: LucideIcon;
  tone?: "primary" | "muted" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const iconColor = { primary: "text-primary", muted: "text-muted", danger: "text-danger" }[tone];
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Icon
        className={`size-14 ${iconColor} ${Icon === LoaderCircle ? "animate-spin" : ""}`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">{children}</div>
  );
}

const HomeButton = () => (
  <Link href="/" className={buttonSecondary}>
    Volver al inicio
  </Link>
);

async function PaymentResult({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const reference = z.uuid().safeParse(single(params.external_reference));
  const mpPaymentId = single(params.payment_id) ?? single(params.collection_id);
  const urlStatus = single(params.status) ?? single(params.collection_status);

  let payment = reference.success ? await loadPayment(reference.data) : null;

  // Verificación directa: si el webhook todavía no llegó (o no puede llegar, como en localhost),
  // se consulta el pago a Mercado Pago con la misma lógica que el webhook
  if (payment && payment.status !== "PAID" && mpPaymentId && /^\d+$/.test(mpPaymentId)) {
    try {
      const { confirmedAppointmentId } = await syncMercadoPagoPayment(mpPaymentId);
      if (confirmedAppointmentId) after(() => sendConfirmationEmail(confirmedAppointmentId));
      payment = await loadPayment(payment.id);
    } catch (error) {
      console.error(`No se pudo verificar el pago ${mpPaymentId} en Mercado Pago`, error);
    }
  }

  if (!payment || payment.method !== "MERCADO_PAGO") {
    return (
      <Result icon={CircleAlert} tone="muted" title="No encontramos ese pago">
        <p className="text-muted">
          Si pagaste un turno y no lo ves, escribinos por WhatsApp y lo revisamos.
        </p>
        <Actions>
          <HomeButton />
        </Actions>
      </Result>
    );
  }

  const { appointment } = payment;
  const now = new Date();
  const status = effectiveStatus(appointment, now);
  const holdActive =
    appointment.status === "PENDING_PAYMENT" &&
    appointment.reservedUntil !== null &&
    appointment.reservedUntil > now;
  const email = appointment.user.email;

  const summary = (
    <BookingSummary
      className="w-full"
      rows={[
        ["Servicio", appointment.service.name],
        ["Precio", formatPrice(payment.amount.toNumber())],
        ["Día", formatLongDate(appointment.date)],
        ["Hora", `${formatTime(appointment.date)} hs`],
      ]}
    />
  );

  // Pago acreditado
  if (payment.status === "PAID") {
    if (["CONFIRMED", "RESCHEDULED", "COMPLETED"].includes(appointment.status)) {
      return (
        <Result icon={CircleCheck} title="¡Tu turno está reservado!">
          {summary}
          <p className="text-muted">
            Te enviamos los detalles a <strong className="text-foreground">{email}</strong>.
          </p>
          <Actions>
            <Link href="/dashboard" className={buttonPrimary}>
              Ver mis turnos
            </Link>
            <HomeButton />
          </Actions>
        </Result>
      );
    }
    // Pagó fuera de término y el horario ya no estaba libre (o el turno se canceló)
    return (
      <Result icon={CircleAlert} tone="danger" title="Recibimos tu pago, pero el horario ya no está disponible">
        {summary}
        <p className="text-muted">
          Escribinos por WhatsApp y coordinamos otro turno o la devolución del dinero.
        </p>
        <Actions>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonPrimary}>
            <MessageCircle className="size-5" aria-hidden="true" />
            Escribinos por WhatsApp
          </a>
          <HomeButton />
        </Actions>
      </Result>
    );
  }

  // Medios que se acreditan más tarde (ej. pago en efectivo) o en revisión
  if (
    payment.status === "IN_PROCESS" ||
    (payment.status === "PENDING" && (urlStatus === "pending" || urlStatus === "in_process"))
  ) {
    return (
      <Result icon={Clock} title="Tu pago se está procesando">
        {summary}
        <p className="text-muted">
          Cuando Mercado Pago lo acredite te avisamos a{" "}
          <strong className="text-foreground">{email}</strong>.
        </p>
        <Actions>
          <HomeButton />
        </Actions>
      </Result>
    );
  }

  // Mercado Pago dice que se aprobó pero todavía no lo pudimos sincronizar: se reintenta solo
  if (urlStatus === "approved") {
    return (
      <Result icon={LoaderCircle} title="Estamos confirmando tu pago…">
        {summary}
        <p className="text-muted">Esto puede tardar unos segundos. No cierres esta página.</p>
        <AutoRefresh
          fallback={
            <p className="text-muted">
              Todavía no recibimos la confirmación de Mercado Pago. Apenas se acredite te enviamos
              un email a <strong className="text-foreground">{email}</strong>.
            </p>
          }
        />
      </Result>
    );
  }

  // Rechazado o abandonado, pero el horario todavía está retenido: puede reintentar
  if (holdActive && payment.mpInitPoint) {
    const rejected = payment.status === "REJECTED" || urlStatus === "rejected";
    return (
      <Result
        icon={CircleAlert}
        tone="danger"
        title={rejected ? "El pago no se pudo completar" : "Todavía no completaste el pago"}
      >
        {summary}
        <p className="text-muted">
          Te guardamos el horario hasta las{" "}
          <strong className="text-foreground">{formatTime(appointment.reservedUntil!)} hs</strong>.
          Podés intentar de nuevo o elegir otro medio de pago.
        </p>
        <Actions>
          <a href={payment.mpInitPoint} className={buttonPrimary}>
            Intentar de nuevo
          </a>
          <form action={releasePendingPaymentAction.bind(null, payment.id)}>
            <button type="submit" className={`${buttonSecondary} w-full`}>
              Elegir otro medio de pago
            </button>
          </form>
        </Actions>
      </Result>
    );
  }

  // Venció la reserva sin pago (o el turno se canceló): el horario ya se liberó
  return (
    <Result icon={CalendarX} tone="muted" title="El tiempo para pagar venció">
      <p className="text-muted">
        {status === "CANCELLED"
          ? "Esta reserva se canceló."
          : "No recibimos el pago a tiempo y el horario se liberó."}{" "}
        Podés reservar otro turno cuando quieras.
      </p>
      <Actions>
        <Link href="/reservar" className={buttonPrimary}>
          Elegir otro horario
        </Link>
        <HomeButton />
      </Actions>
    </Result>
  );
}

export default function PaymentReturnPage({ searchParams }: PageProps<"/reservar/pago">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
      <Suspense
        fallback={<p className="text-center text-muted">Verificando tu pago…</p>}
      >
        <PaymentResult searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
