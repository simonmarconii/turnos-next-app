"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/appointments";
import type { Availability } from "@/lib/availability";
import { formatLongDate, formatTime } from "@/lib/dates";
import { SlotPicker } from "@/components/slot-picker";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/ui";

// Contenido de los modales de turnos. Los usan "Mis turnos" y el panel admin, cada uno con sus
// propias Server Actions (las del cliente validan dueño y límite de 24 hs; las del admin, el rol).

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-danger">
      {children}
    </p>
  );
}

// Confirmación de una acción (cancelar, marcar realizado, eliminar, …)
export function ConfirmDialog({
  children,
  confirmLabel,
  pendingLabel,
  danger = false,
  action,
  onDone,
}: {
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  danger?: boolean;
  action: () => Promise<ActionResult>;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) onDone();
        else setError(result.message);
      } catch {
        setError("No pudimos completar la acción. Intentá de nuevo.");
      }
    });
  }

  return (
    <>
      {children}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone} className={buttonSecondary}>
          Volver
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={isPending}
          className={danger ? buttonDanger : buttonPrimary}
        >
          {isPending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </>
  );
}

// Elegir un nuevo horario. `loadAvailability` y `reschedule` tienen que ser referencias estables
// (Server Actions importadas), porque los horarios se cargan una sola vez al abrir.
export function RescheduleDialog({
  appointmentId,
  description,
  loadAvailability,
  reschedule,
  onDone,
}: {
  appointmentId: string;
  description: React.ReactNode;
  loadAvailability: (appointmentId: string) => Promise<Availability | null>;
  reschedule: (appointmentId: string, start: string) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const [availability, setAvailability] = useState<Availability | null | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const fetchAvailability = useCallback(() => {
    startLoading(async () => {
      try {
        setAvailability(await loadAvailability(appointmentId));
      } catch {
        setAvailability(null);
      }
    });
  }, [appointmentId, loadAvailability]);

  // Se monta al abrir el modal, así que carga los horarios en ese momento
  useEffect(fetchAvailability, [fetchAvailability]);

  function confirm() {
    if (!slot) return;
    setError(null);
    startSaving(async () => {
      try {
        const result = await reschedule(appointmentId, slot);
        if (result.ok) {
          onDone();
        } else {
          setError(result.message);
          setAvailability(undefined);
          setSlot(null);
          fetchAvailability();
        }
      } catch {
        setError("No pudimos reprogramar el turno. Intentá de nuevo.");
      }
    });
  }

  return (
    <>
      <p className="text-muted">{description}</p>

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
