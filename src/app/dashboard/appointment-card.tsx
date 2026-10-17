"use client";

import { useState } from "react";
import { CalendarClock, CreditCard, X } from "lucide-react";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { whatsappUrl } from "@/config/site";
import { ConfirmDialog, RescheduleDialog } from "@/components/appointment-dialogs";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { buttonDanger, buttonPrimary, buttonSecondary, card } from "@/components/ui";
import {
  cancelAppointmentAction,
  getRescheduleAvailabilityAction,
  rescheduleAppointmentAction,
} from "./actions";

// Datos ya formateados en el servidor (las fechas y el precio no cruzan como Date/Decimal)
export type AppointmentView = {
  id: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  status: AppointmentStatus;
  paymentLabel: string;
  priceLabel: string | null;
  paidOnline: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  // Faltan más de 24 hs: el cliente todavía puede reprogramar o cancelar
  withinLimit: boolean;
  payUrl: string | null;
};

const smallButton = "h-10 px-5 text-sm";

function WhatsAppLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-primary underline"
    >
      {children}
    </a>
  );
}

export function AppointmentCard({ appointment }: { appointment: AppointmentView }) {
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const close = () => setDialog(null);
  const when = `${appointment.dateLabel.toLowerCase()} a las ${appointment.timeLabel} hs`;

  return (
    <article className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold">{appointment.serviceName}</h3>
          <p className="font-semibold text-primary">
            {appointment.dateLabel} · {appointment.timeLabel} hs
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <p className="text-sm text-muted">
        {appointment.paymentLabel}
        {appointment.priceLabel && ` · ${appointment.priceLabel}`}
      </p>

      {appointment.withinLimit ? (
        <div className="flex flex-wrap gap-2">
          {appointment.payUrl && (
            <a href={appointment.payUrl} className={`${buttonPrimary} ${smallButton}`}>
              <CreditCard className="size-4" aria-hidden="true" />
              Completar pago
            </a>
          )}
          {appointment.canReschedule && (
            <button
              type="button"
              onClick={() => setDialog("reschedule")}
              className={`${buttonSecondary} ${smallButton}`}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              Reprogramar
            </button>
          )}
          {appointment.canCancel && (
            <button
              type="button"
              onClick={() => setDialog("cancel")}
              className={`${buttonDanger} ${smallButton}`}
            >
              <X className="size-4" aria-hidden="true" />
              Cancelar
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled className={`${buttonSecondary} ${smallButton}`}>
              Reprogramar
            </button>
            <button type="button" disabled className={`${buttonDanger} ${smallButton}`}>
              Cancelar
            </button>
          </div>
          <p className="text-sm text-muted">
            Faltan menos de 24 hs para tu turno: <WhatsAppLink>escribinos por WhatsApp</WhatsAppLink>.
          </p>
        </div>
      )}

      <Modal open={dialog === "cancel"} onClose={close} title="Cancelar turno">
        <ConfirmDialog
          danger
          confirmLabel="Sí, cancelar"
          pendingLabel="Cancelando…"
          action={() => cancelAppointmentAction(appointment.id)}
          onDone={close}
        >
          <p>
            ¿Querés cancelar tu turno de <strong>{appointment.serviceName}</strong> del{" "}
            <strong>{when}</strong>?
          </p>
          {appointment.paidOnline && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              La cancelación no genera un reembolso automático. Para coordinarlo,{" "}
              <WhatsAppLink>escribinos por WhatsApp</WhatsAppLink>.
            </p>
          )}
        </ConfirmDialog>
      </Modal>
      <Modal open={dialog === "reschedule"} onClose={close} title="Reprogramar turno">
        <RescheduleDialog
          appointmentId={appointment.id}
          description={`${appointment.serviceName} · hoy está para el ${when}.`}
          loadAvailability={getRescheduleAvailabilityAction}
          reschedule={rescheduleAppointmentAction}
          onDone={close}
        />
      </Modal>
    </article>
  );
}
