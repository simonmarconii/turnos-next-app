"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarClock, CircleCheck, Mail, Phone, X } from "lucide-react";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { ConfirmDialog, RescheduleDialog } from "@/components/appointment-dialogs";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { buttonDanger, buttonSecondary, card, input } from "@/components/ui";
import {
  adminCancelAppointmentAction,
  adminGetRescheduleAvailabilityAction,
  adminRescheduleAppointmentAction,
  completeAppointmentAction,
  registerPaymentAction,
} from "./actions";

export type AdminAppointmentRow = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  serviceName: string;
  status: AppointmentStatus;
  paymentLabel: string;
  priceLabel: string | null;
  paidOnline: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canComplete: boolean;
  canRegisterPayment: boolean;
};

// Valor de `?estado=` en la URL. Qué estados incluye cada uno se define en page.tsx.
export type StatusFilter = "todos" | "reservados" | "cancelados";

type FilterState = {
  status: StatusFilter | null; // null = próximos turnos activos
  from: string;
  to: string;
};

const STATUS_FILTERS: [StatusFilter, string][] = [
  ["todos", "Todos"],
  ["reservados", "Reservados"],
  ["cancelados", "Cancelados"],
];

const chipClass = (selected: boolean) =>
  `h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${
    selected
      ? "border-primary bg-primary text-white"
      : "border-line bg-surface text-foreground hover:border-primary"
  }`;

const smallButton = "h-9 px-4 text-sm";

export function AppointmentsPanel({
  rows,
  filters,
  truncated,
}: {
  rows: AdminAppointmentRow[];
  filters: FilterState;
  truncated: boolean;
}) {
  const router = useRouter();
  const [isFiltering, startFiltering] = useTransition();

  // Los filtros viven en la URL: así se pueden compartir y sobreviven a un refresh
  function apply(next: Partial<FilterState>) {
    const { status, from, to } = { ...filters, ...next };
    const params = new URLSearchParams();
    if (status) params.set("estado", status);
    if (from) params.set("desde", from);
    if (to) params.set("hasta", to);
    const query = params.toString();
    startFiltering(() => router.push(query ? `/admin?${query}` : "/admin", { scroll: false }));
  }

  // Se elige un solo estado; tocar el que ya está elegido vuelve a la vista por defecto
  function toggle(status: StatusFilter) {
    apply({ status: filters.status === status ? null : status });
  }

  const hasFilters = filters.status !== null || filters.from || filters.to;

  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(([status, label]) => {
            const selected = filters.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggle(status)}
                aria-pressed={selected}
                className={chipClass(selected)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Desde
            <input
              type="date"
              value={filters.from}
              onChange={(event) => apply({ from: event.target.value })}
              className={`${input} h-10 w-44 font-normal`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Hasta
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => apply({ to: event.target.value })}
              className={`${input} h-10 w-44 font-normal`}
            />
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={() => apply({ status: null, from: "", to: "" })}
              className="h-10 text-sm font-semibold text-primary hover:text-primary-hover"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <p className="text-sm text-muted">
          {isFiltering
            ? "Buscando…"
            : filters.status === null
              ? "Mostrando los próximos turnos activos."
              : `${rows.length} ${rows.length === 1 ? "turno" : "turnos"}.`}
          {truncated && " Se muestran los primeros 200: usá las fechas para acotar la búsqueda."}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className={`${card} text-center text-muted`}>No hay turnos con estos filtros.</p>
      ) : (
        <div className={`${card} overflow-hidden p-0 ${isFiltering ? "opacity-60" : ""}`}>
          {/* Encabezado de la "tabla": solo en pantallas grandes; en mobile cada fila es una tarjeta */}
          <div className="hidden grid-cols-[11rem_1fr_1fr_11rem] gap-4 border-b border-line bg-soft px-5 py-3 text-sm font-bold text-muted lg:grid">
            <span>Fecha</span>
            <span>Cliente</span>
            <span>Servicio y pago</span>
            <span>Estado</span>
          </div>
          <ul>
            {rows.map((row) => (
              <AppointmentRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Dialog = "cancel" | "reschedule" | "complete" | "payment";

function AppointmentRow({ row }: { row: AdminAppointmentRow }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const when = `${row.dateLabel.toLowerCase()} a las ${row.timeLabel} hs`;
  const hasActions = row.canReschedule || row.canCancel || row.canComplete || row.canRegisterPayment;

  return (
    <li className="flex flex-col gap-4 border-b border-line px-5 py-5 last:border-0">
      <div className="grid gap-3 lg:grid-cols-[11rem_1fr_1fr_11rem] lg:gap-4">
        <div className="flex flex-col">
          <span className="font-bold">{row.dateLabel}</span>
          <span className="text-primary">{row.timeLabel} hs</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <span className="text-base font-semibold">{row.clientName}</span>
          {row.clientPhone && (
            <a
              href={`tel:${row.clientPhone}`}
              className="inline-flex items-center gap-1.5 text-muted hover:text-primary"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              {row.clientPhone}
            </a>
          )}
          <a
            href={`mailto:${row.clientEmail}`}
            className="inline-flex min-w-0 items-center gap-1.5 text-muted hover:text-primary"
          >
            <Mail className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{row.clientEmail}</span>
          </a>
        </div>
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="text-base font-semibold">{row.serviceName}</span>
          <span className="text-muted">
            {row.paymentLabel}
            {row.priceLabel && ` · ${row.priceLabel}`}
          </span>
        </div>
        <div>
          <StatusBadge status={row.status} />
        </div>
      </div>

      {hasActions && (
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {row.canRegisterPayment && (
            <button
              type="button"
              onClick={() => setDialog("payment")}
              className={`${buttonSecondary} ${smallButton}`}
            >
              <Banknote className="size-4" aria-hidden="true" />
              Registrar cobro
            </button>
          )}
          {row.canComplete && (
            <button
              type="button"
              onClick={() => setDialog("complete")}
              className={`${buttonSecondary} ${smallButton}`}
            >
              <CircleCheck className="size-4" aria-hidden="true" />
              Marcar realizado
            </button>
          )}
          {row.canReschedule && (
            <button
              type="button"
              onClick={() => setDialog("reschedule")}
              className={`${buttonSecondary} ${smallButton}`}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              Reprogramar
            </button>
          )}
          {row.canCancel && (
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
      )}

      <Modal open={dialog === "cancel"} onClose={close} title="Cancelar turno">
        <ConfirmDialog
          danger
          confirmLabel="Sí, cancelar"
          pendingLabel="Cancelando…"
          action={() => adminCancelAppointmentAction(row.id)}
          onDone={close}
        >
          <p>
            ¿Cancelar el turno de <strong>{row.clientName}</strong> del <strong>{when}</strong>?
          </p>
          {row.paidOnline && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Este turno se pagó con Mercado Pago. La app no hace reembolsos: si corresponde, la
              devolución se hace desde Mercado Pago.
            </p>
          )}
        </ConfirmDialog>
      </Modal>

      <Modal open={dialog === "reschedule"} onClose={close} title="Reprogramar turno">
        <RescheduleDialog
          appointmentId={row.id}
          description={`${row.clientName} · ${row.serviceName} · hoy está para el ${when}.`}
          loadAvailability={adminGetRescheduleAvailabilityAction}
          reschedule={adminRescheduleAppointmentAction}
          onDone={close}
        />
      </Modal>

      <Modal open={dialog === "complete"} onClose={close} title="Marcar como realizado">
        <ConfirmDialog
          confirmLabel="Marcar realizado"
          pendingLabel="Guardando…"
          action={() => completeAppointmentAction(row.id)}
          onDone={close}
        >
          <p>
            ¿Confirmás que se realizó el turno de <strong>{row.clientName}</strong> del{" "}
            <strong>{when}</strong>?
          </p>
        </ConfirmDialog>
      </Modal>

      <Modal open={dialog === "payment"} onClose={close} title="Registrar cobro">
        <ConfirmDialog
          confirmLabel="Registrar cobro"
          pendingLabel="Guardando…"
          action={() => registerPaymentAction(row.id)}
          onDone={close}
        >
          <p>
            ¿Registrar que <strong>{row.clientName}</strong> pagó{" "}
            {row.priceLabel ? <strong>{row.priceLabel}</strong> : "el turno"} en el local?
          </p>
        </ConfirmDialog>
      </Modal>
    </li>
  );
}
