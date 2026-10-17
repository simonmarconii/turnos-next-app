import type { AppointmentStatus } from "@/generated/prisma/client";

// Etiquetas de estado de la sección 7.1 de la doc. Se usan en "Mis turnos" y en el panel admin.
const STATUS_STYLES: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Esperando pago", className: "bg-amber-100 text-amber-800" },
  PENDING: { label: "Reservado", className: "bg-soft text-primary" },
  CONFIRMED: { label: "Confirmado", className: "bg-emerald-100 text-emerald-800" },
  RESCHEDULED: { label: "Reprogramado", className: "bg-sky-100 text-sky-800" },
  COMPLETED: { label: "Realizado", className: "bg-stone-200 text-stone-700" },
  CANCELLED: { label: "Cancelado", className: "bg-danger/10 text-danger" },
  EXPIRED: { label: "Vencido", className: "bg-stone-100 text-stone-500" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}
