"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { ConfirmDialog, ErrorMessage } from "@/components/appointment-dialogs";
import { Modal } from "@/components/modal";
import { buttonDanger, buttonPrimary, card, input } from "@/components/ui";
import { createBlockAction, deleteBlockAction } from "./actions";

export type BlockRow = {
  id: string;
  label: string; // ya formateado en el servidor
  reason: string | null;
  current: boolean; // el bloqueo ya empezó
};

const REASONS = ["Vacaciones", "Licencia", "Feriado"];

export function BlocksPanel({ blocks, today }: { blocks: BlockRow[]; today: string }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-3xl font-semibold">Bloqueo de fechas</h2>
        <p className="text-muted">
          Los horarios bloqueados no se pueden reservar. Si no cargás horas, se bloquean los días
          completos.
        </p>
      </div>
      <BlockForm today={today} />
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Bloqueos vigentes y próximos</h3>
        {blocks.length === 0 ? (
          <p className={`${card} text-center text-muted`}>No hay fechas bloqueadas.</p>
        ) : (
          <ul className={`${card} p-0`}>
            {blocks.map((block) => (
              <BlockItem key={block.id} block={block} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function BlockForm({ today }: { today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fromDate, setFromDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "");
    setError(null);
    setConflicts([]);
    startTransition(async () => {
      try {
        const result = await createBlockAction({
          fromDate: field("fromDate"),
          fromTime: field("fromTime"),
          toDate: field("toDate"),
          toTime: field("toTime"),
          reason: field("reason"),
        });
        if (result.ok) {
          formRef.current?.reset();
          setFromDate("");
          setConflicts(result.conflicts);
        } else {
          setError(result.message);
        }
      } catch {
        setError("No pudimos guardar el bloqueo. Intentá de nuevo.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className={`${card} flex flex-col gap-4`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Desde</legend>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input
              name="fromDate"
              type="date"
              required
              min={today}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label="Fecha de inicio"
              className={input}
            />
            <input name="fromTime" type="time" step={1800} aria-label="Hora de inicio (opcional)" className={input} />
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Hasta</legend>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input
              name="toDate"
              type="date"
              required
              min={fromDate || today}
              aria-label="Fecha de fin"
              className={input}
            />
            <input name="toTime" type="time" step={1800} aria-label="Hora de fin (opcional)" className={input} />
          </div>
        </fieldset>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Motivo
        <input
          name="reason"
          list="block-reasons"
          maxLength={100}
          placeholder="Ej. Vacaciones"
          className={`${input} font-normal`}
        />
        <datalist id="block-reasons">
          {REASONS.map((reason) => (
            <option key={reason} value={reason} />
          ))}
        </datalist>
      </label>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {conflicts.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">
            El bloqueo se guardó, pero estos turnos quedaron dentro del rango. Reprogramalos o
            cancelalos desde la lista de turnos:
          </p>
          <ul className="list-disc pl-5">
            {conflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="submit" disabled={isPending} className={`${buttonPrimary} self-start`}>
        <CalendarOff className="size-5" aria-hidden="true" />
        {isPending ? "Guardando…" : "Bloquear fechas"}
      </button>
    </form>
  );
}

function BlockItem({ block }: { block: BlockRow }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-0">
      <div className="flex flex-col">
        <span className="font-semibold">{block.label}</span>
        <span className="text-sm text-muted">
          {block.reason ?? "Sin motivo"}
          {block.current && " · En curso"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonDanger} h-9 px-4 text-sm`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Eliminar
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Eliminar bloqueo">
        <ConfirmDialog
          danger
          confirmLabel="Sí, eliminar"
          pendingLabel="Eliminando…"
          action={() => deleteBlockAction(block.id)}
          onDone={() => setOpen(false)}
        >
          <p>
            ¿Eliminar el bloqueo <strong>{block.label.toLowerCase()}</strong>? Esos horarios vuelven
            a estar disponibles para reservar.
          </p>
        </ConfirmDialog>
      </Modal>
    </li>
  );
}
