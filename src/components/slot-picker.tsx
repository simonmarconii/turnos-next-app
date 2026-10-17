"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Availability } from "@/lib/availability";
import {
  addMonths,
  dateKeyInZone,
  daysInMonth,
  formatLongDate,
  formatMonth,
  formatTime,
  weekdayOf,
  type DateKey,
} from "@/lib/dates";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function monthOf(key: DateKey): DateKey {
  return `${key.slice(0, 8)}01`;
}

// Calendario mensual + horarios libres del día elegido. Se usa en el wizard de reserva y
// se va a reutilizar para reprogramar turnos.
export function SlotPicker({
  availability,
  value,
  onChange,
}: {
  availability: Availability;
  value: string | null;
  onChange: (start: string) => void;
}) {
  const { minDate, maxDate, days } = availability;
  const firstAvailableDay = Object.keys(days).sort()[0];
  const initialDay = value ? dateKeyInZone(new Date(value)) : null;

  const [selectedDay, setSelectedDay] = useState<DateKey | null>(initialDay);
  const [month, setMonth] = useState<DateKey>(monthOf(initialDay ?? firstAvailableDay ?? minDate));

  if (!firstAvailableDay) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
        No quedan horarios disponibles para el próximo mes. Escribinos por WhatsApp y lo
        coordinamos.
      </p>
    );
  }

  const canGoBack = month > monthOf(minDate);
  const canGoForward = month < monthOf(maxDate);
  const leadingBlanks = (weekdayOf(month) + 6) % 7; // la semana arranca el lunes
  const monthDays = Array.from(
    { length: daysInMonth(month) },
    (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`,
  );
  const slots = selectedDay ? (days[selectedDay] ?? []) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            disabled={!canGoBack}
            className="grid size-10 place-items-center rounded-full text-foreground hover:bg-soft disabled:invisible"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="font-display text-lg font-semibold">{formatMonth(month)}</p>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={!canGoForward}
            className="grid size-10 place-items-center rounded-full text-foreground hover:bg-soft disabled:invisible"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((weekday, i) => (
            <span key={i} className="pb-2 text-xs font-bold text-muted">
              {weekday}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {monthDays.map((day) => {
            const enabled = day in days;
            const selected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                disabled={!enabled}
                onClick={() => setSelectedDay(day)}
                aria-pressed={selected}
                aria-label={formatLongDate(`${day}T12:00:00Z`)}
                className={`mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-primary text-white"
                    : enabled
                      ? "text-foreground hover:bg-soft"
                      : "cursor-not-allowed text-muted/40"
                }`}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{formatLongDate(`${selectedDay}T12:00:00Z`)}</p>
          {slots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((start) => {
                const selected = start === value;
                return (
                  <button
                    key={start}
                    type="button"
                    onClick={() => onChange(start)}
                    aria-pressed={selected}
                    className={`h-11 rounded-full border text-sm font-semibold transition-colors ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-foreground hover:border-primary"
                    }`}
                  >
                    {formatTime(start)}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-muted">No quedan horarios para este día. Probá con otra fecha.</p>
          )}
        </div>
      ) : (
        <p className="text-center text-muted">Elegí un día para ver los horarios disponibles.</p>
      )}
    </div>
  );
}
