"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CalendarClock, CreditCard, X } from "lucide-react";
import type { AppointmentStatus } from "@/generated/prisma/client";
import type { Availability } from "@/lib/availability";
import { formatLongDate, formatTime } from "@/lib/dates";
import { whatsappUrl } from "@/config/site";
import { Modal } from "@/components/modal";
import { SlotPicker } from "@/components/slot-picker";
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

export function AppointmentCard({ appointment }: { appointment: AppointmentView }) {
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const close = () => setDialog(null);

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
            Faltan menos de 24 hs para tu turno:{" "}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline"
            >
              escribinos por WhatsApp
            </a>
            .
          </p>
        </div>
      )}

      <Modal open={dialog === "cancel"} onClose={close} title="Cancelar turno">
        <CancelDialog appointment={appointment} onDone={close} />
      </Modal>
      <Modal open={dialog === "reschedule"} onClose={close} title="Reprogramar turno">
        <RescheduleDialog appointment={appointment} onDone={close} />
      </Modal>
    </article>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-danger">
      {children}
    </p>
  );
}

function CancelDialog({
  appointment,
  onDone,
}: {
  appointment: AppointmentView;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelAppointmentAction(appointment.id);
        if (result.ok) onDone();
        else setError(result.message);
      } catch {
        setError("No pudimos cancelar el turno. Intentá de nuevo.");
      }
    });
  }

  return (
    <>
      <p>
        ¿Querés cancelar tu turno de <strong>{appointment.serviceName}</strong> del{" "}
        <strong>
          {appointment.dateLabel.toLowerCase()} a las {appointment.timeLabel} hs
        </strong>
        ?
      </p>
      {appointment.paidOnline && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          La cancelación no genera un reembolso automático. Para coordinarlo,{" "}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            escribinos por WhatsApp
          </a>
          .
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone} className={buttonSecondary}>
          Volver
        </button>
        <button type="button" onClick={confirm} disabled={isPending} className={buttonDanger}>
          {isPending ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </>
  );
}

function RescheduleDialog({
  appointment,
  onDone,
}: {
  appointment: AppointmentView;
  onDone: () => void;
}) {
  // Se monta al abrir el modal, así que carga los horarios en ese momento
  const [availability, setAvailability] = useState<Availability | null | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const fetchAvailability = useCallback(() => {
    startLoading(async () => {
      try {
        setAvailability(await getRescheduleAvailabilityAction(appointment.id));
      } catch {
        setAvailability(null);
      }
    });
  }, [appointment.id]);

  useEffect(fetchAvailability, [fetchAvailability]);

  function load() {
    setAvailability(undefined);
    setSlot(null);
    fetchAvailability();
  }

  function confirm() {
    if (!slot) return;
    setError(null);
    startSaving(async () => {
      try {
        const result = await rescheduleAppointmentAction(appointment.id, slot);
        if (result.ok) {
          onDone();
        } else {
          setError(result.message);
          load();
        }
      } catch {
        setError("No pudimos reprogramar el turno. Intentá de nuevo.");
      }
    });
  }

  return (
    <>
      <p className="text-muted">
        {appointment.serviceName} · hoy está para el {appointment.dateLabel.toLowerCase()} a las{" "}
        {appointment.timeLabel} hs.
      </p>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {isLoading || availability === undefined ? (
        <p className="py-6 text-center text-muted">Buscando horarios disponibles…</p>
      ) : availability === null ? (
        <ErrorMessage>No se puede reprogramar este turno.</ErrorMessage>
      ) : (
        <SlotPicker availability={availability} value={slot} onChange={setSlot} />
      )}

      {slot && (
        <p className="rounded-xl bg-soft p-4">
          Nuevo horario:{" "}
          <strong>
            {formatLongDate(slot)} a las {formatTime(slot)} hs
          </strong>
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone} className={buttonSecondary}>
          Volver
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!slot || isSaving}
          className={buttonPrimary}
        >
          {isSaving ? "Guardando…" : "Confirmar cambio"}
        </button>
      </div>
    </>
  );
}
