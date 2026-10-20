import { after, type NextRequest } from "next/server";
import { WebhookSignatureValidator } from "mercadopago";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sendConfirmationEmail,
  syncMercadoPagoPayment,
  type SyncOutcome,
} from "@/lib/mercadopago-payments";

// Webhook de Mercado Pago (sección 4.5 de la doc). Es pública (ver src/proxy.ts): la autenticidad
// se verifica con la firma `x-signature`. El procesamiento del pago está en
// src/lib/mercadopago-payments.ts, compartido con la página de vuelta del checkout.

// Cuerpo de la notificación. Solo sirve para identificar el evento: los datos del pago se
// consultan siempre a la API, nunca se confía en lo que trae la notificación.
const notificationSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]) }),
});

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Falta la variable de entorno MERCADO_PAGO_WEBHOOK_SECRET");
    return json({ error: "Server misconfiguration" }, 500);
  }

  // 1. Firma: se calcula con el `data.id` del query string y el header `x-request-id`
  const xRequestId = request.headers.get("x-request-id");
  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId,
      dataId: request.nextUrl.searchParams.get("data.id"),
      secret,
    });
  } catch {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = notificationSchema.safeParse(payload);
  if (!parsed.success) return json({ error: "Invalid payload" }, 400);
  const notification = parsed.data;

  const resourceId = String(notification.data.id);
  // El `id` de la notificación se repite en los reintentos de Mercado Pago
  const externalId = String(notification.id ?? xRequestId ?? `${notification.action}:${resourceId}`);

  // 2. Registro del evento (idempotencia). Si ya se procesó, es un reintento: no se reprocesa.
  // Si quedó RECEIVED o FAILED, se vuelve a intentar.
  const event = await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider: "MERCADO_PAGO", externalId } },
    create: {
      provider: "MERCADO_PAGO",
      externalId,
      type: notification.type ?? "payment",
      action: notification.action,
      resourceId,
      payload: payload as Prisma.InputJsonValue,
    },
    update: {},
  });
  if (event.status === "PROCESSED" || event.status === "IGNORED") {
    return new Response(null, { status: 200 });
  }

  // 3. Procesamiento. Se hace antes de responder (es una consulta a la API y unas pocas
  // escrituras): si falla se responde 500 y Mercado Pago reintenta solo.
  let outcome: SyncOutcome;
  try {
    outcome =
      (notification.type ?? "payment") === "payment"
        ? await syncMercadoPagoPayment(resourceId)
        : { status: "IGNORED", note: `Tipo de notificación no usado: ${notification.type}` };
  } catch (error) {
    console.error(`Error procesando el webhook ${event.id} de Mercado Pago`, error);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) },
    });
    return json({ error: "Internal server error" }, 500);
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: outcome.status, error: outcome.note ?? null, processedAt: new Date() },
  });
  if (outcome.note) console.warn(`Webhook ${event.id} de Mercado Pago: ${outcome.note}`);

  // 4. Email de confirmación, después de responder: si falla no afecta al pago ya registrado
  const { confirmedAppointmentId } = outcome;
  if (confirmedAppointmentId) after(() => sendConfirmationEmail(confirmedAppointmentId));

  return new Response(null, { status: 200 });
}

