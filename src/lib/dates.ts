// Fechas del local. Se usan en el servidor y en el cliente.
//
// Un día se representa como string "YYYY-MM-DD" en la zona horaria del local (`DateKey`); un
// instante, como `Date` o string ISO en UTC. Así el calendario no depende de la zona del navegador.
import { bookingConfig } from "@/config/booking";

export type DateKey = string;

const { timeZone } = bookingConfig;

// en-CA formatea como YYYY-MM-DD
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateKeyInZone(date: Date): DateKey {
  return dateKeyFormatter.format(date);
}

function keyToUtcDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

function utcDateToKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

// 0 = domingo … 6 = sábado
export function weekdayOf(key: DateKey): number {
  return keyToUtcDate(key).getUTCDay();
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = keyToUtcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToKey(date);
}

// Si el día no existe en el mes de destino (ej. 31/01 + 1 mes) se usa el último día de ese mes
export function addMonths(key: DateKey, months: number): DateKey {
  const [year, month, day] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return utcDateToKey(new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))));
}

export function daysInMonth(key: DateKey): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Diferencia en minutos entre la hora local de la zona y UTC en ese instante
function zoneOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

// Instante que corresponde a `minutes` minutos desde la medianoche del día `key` en la zona del local
export function zonedTime(key: DateKey, minutes: number): Date {
  const naive = keyToUtcDate(key).getTime() + minutes * 60_000;
  return new Date(naive - zoneOffsetMinutes(new Date(naive)) * 60_000);
}

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const longDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Para días sueltos (DateKey) se formatea en UTC, que es como se construyen con keyToUtcDate
const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "09:30"
export function formatTime(instant: Date | string): string {
  return timeFormatter.format(new Date(instant));
}

// "Jueves 12 de marzo"
export function formatLongDate(instant: Date | string): string {
  return capitalize(longDateFormatter.format(new Date(instant)).replace(",", ""));
}

// "Noviembre de 2026"
export function formatMonth(key: DateKey): string {
  return capitalize(monthFormatter.format(keyToUtcDate(key)));
}
