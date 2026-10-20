import { card } from "@/components/ui";

// Tarjeta de resumen de un turno: pares etiqueta/valor (servicio, precio, día, hora…)
export function BookingSummary({
  rows,
  className = "",
}: {
  rows: [label: string, value: string][];
  className?: string;
}) {
  return (
    <dl className={`${card} flex flex-col gap-3 text-left ${className}`}>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"
        >
          <dt className="text-muted">{label}</dt>
          <dd className="text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
