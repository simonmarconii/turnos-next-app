import "server-only";

import { MPNotFoundError, Payment as MercadoPagoPayment } from "mercadopago";
import { z } from "zod";
import type { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import mercadoPagoClient from "@/lib/mercadopago";
import { isSlotAvailable, lockSchedule } from "@/lib/availability";
import { formatLongDate, formatTime } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import EmailTemplate from "@/components/email-template";

// Sincroniza un pago de Mercado Pago con la base (secciones 4.5 y 4.6 de la doc). La usan el
// webhook y la página de vuelta del checkout (/reservar/pago), así las dos aplican la misma
// lógica. Siempre consulta el pago a la API: nunca confía en datos que vengan del request.

const paymentClient = new MercadoPagoPayment(mercadoPagoClient);

// Tabla 4.6 de la doc: estado de Mercado Pago → estado simplificado del Payment
const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: "PENDING",
  authorized: "PENDING",
  in_process: "IN_PROCESS",
  in_mediation: "IN_PROCESS",
  approved: "PAID",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "CHARGED_BACK",
};

export type SyncOutcome = {
  status: "PROCESSED" | "IGNORED" | "FAILED";
  // Detalle para WebhookEvent.error (también en pagos procesados que requieren revisión)
  note?: string;
  // Turno que esta sincronización pasó a CONFIRMED: hay que mandarle el email de confirmación
  confirmedAppointmentId?: string;
};

export async function syncMercadoPagoPayment(mpPaymentId: string): Promise<SyncOutcome> {
  let mpPayment: Awaited<ReturnType<typeof paymentClient.get>>;
  try {
    mpPayment = await paymentClient.get({ id: mpPaymentId });
  } catch (error) {
    // Ej. la notificación de prueba del panel de Mercado Pago: reintentar no lo va a arreglar
    if (error instanceof MPNotFoundError) {
      return { status: "IGNORED", note: `Mercado Pago no encuentra el pago ${mpPaymentId}` };
    }
    throw error;
  }

  // external_reference es el id del Payment (sección 4.1). Si no es un uuid, no es de esta app.
  const paymentId = z.uuid().safeParse(mpPayment.external_reference);
  if (!paymentId.success) return { status: "IGNORED", note: "Pago sin external_reference de la app" };

  const status = mpPayment.status ? STATUS_MAP[mpPayment.status] : undefined;
  if (!status) return { status: "IGNORED", note: `Estado de Mercado Pago desconocido: ${mpPayment.status}` };

  // Se guarda la respuesta completa para auditoría, sin los headers HTTP que agrega el SDK
  const mpData = JSON.parse(JSON.stringify(mpPayment));
  delete mpData.api_response;
  const now = new Date();

  // Con el lock del horario: confirmar un pago tardío compite con las reservas nuevas
  return prisma.$transaction(async (tx) => {
    await lockSchedule(tx);

    const payment = await tx.payment.findUnique({
      where: { id: paymentId.data },
      include: { appointment: true },
    });
    if (!payment || payment.method !== "MERCADO_PAGO") {
      return { status: "IGNORED", note: `No existe el Payment ${paymentId.data}` };
    }

    // No pisar un pago aprobado con la notificación (quizás tardía) de otro intento de la misma
    // preferencia. Las del mismo pago sí se aplican (reembolso, contracargo).
    if (payment.status === "PAID" && payment.mpPaymentId && payment.mpPaymentId !== String(mpPayment.id)) {
      return { status: "IGNORED", note: "El Payment ya tiene otro pago aprobado" };
    }

    // Un pago aprobado por menos del monto del turno no confirma nada: queda para revisar a mano
    if (
      status === "PAID" &&
      ((mpPayment.transaction_amount ?? 0) < payment.amount.toNumber() ||
        mpPayment.currency_id !== payment.currency)
    ) {
      return {
        status: "FAILED",
        note: `Monto pagado (${mpPayment.transaction_amount} ${mpPayment.currency_id}) distinto del turno (${payment.amount} ${payment.currency})`,
      };
    }

    const refunded = mpPayment.transaction_amount_refunded ?? 0;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status,
        mpPaymentId: String(mpPayment.id),
        mpStatus: mpPayment.status,
        mpStatusDetail: mpPayment.status_detail,
        mpPaymentTypeId: mpPayment.payment_type_id,
        mpPaymentMethodId: mpPayment.payment_method_id,
        mpMerchantOrderId: mpPayment.order?.id != null ? String(mpPayment.order.id) : undefined,
        mpPayment: mpData as Prisma.InputJsonValue,
        ...(status === "PAID" && !payment.paidAt && {
          paidAt: mpPayment.date_approved ? new Date(mpPayment.date_approved) : now,
        }),
        // También cubre devoluciones parciales, en las que el estado sigue siendo "approved"
        ...(refunded > 0 && {
          refundedAmount: refunded,
          refundedAt: mpPayment.date_last_updated ? new Date(mpPayment.date_last_updated) : now,
        }),
      },
    });

    const appointment = payment.appointment;
    const holdActive =
      appointment.status === "PENDING_PAYMENT" &&
      appointment.reservedUntil !== null &&
      appointment.reservedUntil > now;

    if (status === "PAID") {
      if (appointment.status !== "PENDING_PAYMENT" && appointment.status !== "EXPIRED") {
        // Ya confirmado, reprogramado o realizado: nada que hacer. Cancelado: la plata se devuelve
        // por fuera de la app (sección 7.8).
        return appointment.status === "CANCELLED"
          ? { status: "PROCESSED", note: "Pago aprobado para un turno cancelado: revisar devolución" }
          : { status: "PROCESSED" };
      }

      // Pago dentro de la reserva, o fuera de término pero con el horario todavía libre
      const duration = (appointment.endDate.getTime() - appointment.date.getTime()) / 60_000;
      if (holdActive || (await isSlotAvailable(tx, duration, appointment.date, appointment.id))) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: "CONFIRMED", reservedUntil: null },
        });
        return { status: "PROCESSED", confirmedAppointmentId: appointment.id };
      }

      // Pago fuera de término y el horario ya lo tomó otra persona: la devolución es manual
      if (appointment.status === "PENDING_PAYMENT") {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: "EXPIRED", reservedUntil: null },
        });
      }
      return {
        status: "PROCESSED",
        note: "Pago aprobado fuera de término con el horario ocupado: requiere devolución manual",
      };
    }

    // Preferencia cancelada o vencida sin pago: el turno ya no retiene el horario. Un rechazo
    // deja el turno como está, para que el cliente pueda reintentar dentro de la reserva.
    if (status === "CANCELLED" && appointment.status === "PENDING_PAYMENT" && !holdActive) {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: "EXPIRED", reservedUntil: null },
      });
    }

    return { status: "PROCESSED" };
  });
}

export async function sendConfirmationEmail(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { service: true, user: true },
    });
    await sendEmail({
      to: appointment.user.email,
      subject: "Tu turno está confirmado",
      react: EmailTemplate({
        name: appointment.user.firstName,
        lastname: appointment.user.lastName,
        date: formatLongDate(appointment.date),
        time: `${formatTime(appointment.date)} hs`,
        serviceName: appointment.service.name,
      }),
    });
  } catch (error) {
    console.error(`No se pudo enviar el email de confirmación del turno ${appointmentId}`, error);
  }
}
