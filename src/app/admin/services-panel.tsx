"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Clock, Pencil, Plus } from "lucide-react";
import { ErrorMessage } from "@/components/appointment-dialogs";
import { Modal } from "@/components/modal";
import { buttonPrimary, buttonSecondary, card, input } from "@/components/ui";
import { saveServiceAction, setServiceActiveAction } from "./actions";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: string; // "12000.00", para precargar el formulario
  priceLabel: string;
  isActive: boolean;
};

const smallButton = "h-9 px-4 text-sm";

export function ServicesPanel({ services }: { services: ServiceRow[] }) {
  // null = cerrado, "new" = crear, ServiceRow = editar
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-3xl font-semibold">Servicios</h2>
        <button type="button" onClick={() => setEditing("new")} className={buttonPrimary}>
          <Plus className="size-5" aria-hidden="true" />
          Nuevo servicio
        </button>
      </div>

      {services.length === 0 ? (
        <p className={`${card} text-center text-muted`}>Todavía no cargaste servicios.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} onEdit={() => setEditing(service)} />
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nuevo servicio" : "Editar servicio"}
      >
        {editing !== null && (
          <ServiceForm
            service={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function ServiceCard({ service, onEdit }: { service: ServiceRow; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Dar de baja no borra el servicio: deja de aparecer en el wizard y los turnos se mantienen
  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setServiceActiveAction(service.id, !service.isActive);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <li className={`${card} flex flex-col gap-3 ${service.isActive ? "" : "bg-surface/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`text-lg font-bold ${service.isActive ? "" : "text-muted"}`}>
          {service.name}
        </h3>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            service.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"
          }`}
        >
          {service.isActive ? "Activo" : "Dado de baja"}
        </span>
      </div>
      {service.description && <p className="text-sm text-muted">{service.description}</p>}
      <p className="flex items-center gap-4">
        <span className="text-lg font-bold text-primary">{service.priceLabel}</span>
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Clock className="size-4" aria-hidden="true" />
          {service.duration} min
        </span>
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={`${buttonSecondary} ${smallButton}`}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className={`${buttonSecondary} ${smallButton}`}
        >
          {isPending ? "Guardando…" : service.isActive ? "Dar de baja" : "Dar de alta"}
        </button>
      </div>
    </li>
  );
}

function ServiceForm({ service, onDone }: { service: ServiceRow | null; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "");
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveServiceAction(service?.id ?? null, {
          name: field("name"),
          description: field("description"),
          duration: field("duration"),
          price: field("price"),
        });
        if (result.ok) onDone();
        else setError(result.message);
      } catch {
        setError("No pudimos guardar el servicio. Intentá de nuevo.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Nombre
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={service?.name}
          className={`${input} font-normal`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Descripción <span className="font-normal text-muted">(opcional)</span>
        <textarea
          name="description"
          maxLength={300}
          rows={3}
          defaultValue={service?.description ?? ""}
          className={`${input} h-auto py-3 font-normal`}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Duración (minutos)
          <input
            name="duration"
            type="number"
            required
            min={5}
            max={540}
            step={5}
            defaultValue={service?.duration ?? 30}
            className={`${input} font-normal`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Precio ($)
          <input
            name="price"
            type="number"
            required
            min={0}
            step="0.01"
            defaultValue={service?.price}
            className={`${input} font-normal`}
          />
        </label>
      </div>
      {service && (
        <p className="text-sm text-muted">
          Los cambios de precio o duración no afectan a los turnos ya reservados.
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone} className={buttonSecondary}>
          Volver
        </button>
        <button type="submit" disabled={isPending} className={buttonPrimary}>
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
