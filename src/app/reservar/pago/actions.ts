"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cancelAppointment } from "@/lib/appointment-mutations";

// "Elegir otro medio de pago" desde la página de vuelta: libera el horario retenido para que el
// cliente pueda volver a reservarlo (por ejemplo, pagando en el local) sin esperar a que venza.
// Quien tiene el id del Payment (un uuid que solo viaja en la URL de vuelta) es quien reservó.
export async function releasePendingPaymentAction(paymentId: string) {
  const id = z.uuid().safeParse(paymentId);
  if (id.success) {
    const payment = await prisma.payment.findUnique({
      where: { id: id.data },
      include: { appointment: true },
    });
    // Un pago en proceso todavía se puede acreditar: en ese caso no se toca nada
    if (
      payment?.method === "MERCADO_PAGO" &&
      (payment.status === "PENDING" || payment.status === "REJECTED") &&
      payment.appointment.status === "PENDING_PAYMENT"
    ) {
      await cancelAppointment(payment.appointmentId);
    }
  }
  redirect("/reservar");
}
