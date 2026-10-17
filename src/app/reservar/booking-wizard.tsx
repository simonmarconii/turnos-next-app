"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Clock,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { SlotPicker } from "@/components/slot-picker";
import { buttonPrimary, buttonSecondary, card, input } from "@/components/ui";
import { formatLongDate, formatTime } from "@/lib/dates";
import type { Availability } from "@/lib/availability";
import {
  createInStoreBookingAction,
  getAvailabilityAction,
  type BookingIdentity,
  type BookingResult,
} from "./actions";

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  priceLabel: string; // ya formateado en el servidor (el precio es Decimal)
};

type Step = "service" | "datetime" | "identity" | "summary" | "done";

const STEP_LABELS: Record<Exclude<Step, "done">, string> = {
  service: "Servicio",
  datetime: "Fecha y hora",
  identity: "Tus datos",
  summary: "Confirmación",
};

type BookingError = Extract<BookingResult, { ok: false }>;

export function BookingWizard({
  services,
  sessionEmail,
}: {
  services: ServiceOption[];
  // Email del usuario logueado; si hay sesión se saltea el paso "Tus datos"
  sessionEmail: string | null;
}) {
  const steps: Exclude<Step, "done">[] = sessionEmail
    ? ["service", "datetime", "summary"]
    : ["service", "datetime", "identity", "summary"];

  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<ServiceOption | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [identity, setIdentity] = useState<BookingIdentity | null>(null);
  const [bookingError, setBookingError] = useState<BookingError | null>(null);
  const [bookedEmail, setBookedEmail] = useState<string | null>(null);
  const [isLoadingSlots, startLoadingSlots] = useTransition();
  const [isBooking, startBooking] = useTransition();

  // Cada paso arranca desde arriba (en el celular el paso anterior suele quedar scrolleado)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function goTo(next: Step) {
    setBookingError(null);
    setStep(next);
  }

  function loadAvailability(serviceId: string) {
    setAvailability(null);
    setAvailabilityError(false);
    startLoadingSlots(async () => {
      try {
        const result = await getAvailabilityAction(serviceId);
        setAvailability(result);
        setAvailabilityError(result === null);
      } catch {
        setAvailabilityError(true);
      }
    });
  }

  function chooseService(option: ServiceOption) {
    if (option.id !== service?.id) setSlot(null);
    setService(option);
    loadAvailability(option.id);
    goTo("datetime");
  }

  function chooseSlot(start: string) {
    setSlot(start);
    goTo(sessionEmail ? "summary" : "identity");
  }

  function chooseIdentity(value: BookingIdentity) {
    setIdentity(value);
    goTo("summary");
  }

  function confirmInStore() {
    if (!service || !slot) return;
    setBookingError(null);
    startBooking(async () => {
      try {
        const result = await createInStoreBookingAction({
          serviceId: service.id,
          start: slot,
          identity: identity ?? undefined,
        });
        if (result.ok) {
          setBookedEmail(result.email);
          setStep("done");
        } else {
          setBookingError(result);
        }
      } catch {
        setBookingError({
          ok: false,
          code: "INVALID",
          message: "No pudimos confirmar la reserva. Revisá tu conexión e intentá de nuevo.",
        });
      }
    });
  }

  function pickAnotherSlot() {
    setSlot(null);
    if (service) loadAvailability(service.id);
    goTo("datetime");
  }

  if (step === "done" && service && slot) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <CircleCheck className="size-14 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="font-display text-3xl font-semibold">¡Tu turno está reservado!</h2>
        <BookingSummary service={service} slot={slot} className="w-full text-left" />
        <p className="text-muted">Pagás en el local el día del turno.</p>
        {!sessionEmail && (
          <p className="text-sm text-muted">
            Para ver y gestionar tus turnos,{" "}
            <Link href="/sign-in" className="font-semibold text-primary underline">
              iniciá sesión
            </Link>{" "}
            con {bookedEmail}: te vamos a mandar un código a ese email.
          </p>
        )}
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          {sessionEmail && (
            <Link href="/dashboard" className={buttonPrimary}>
              Ver mis turnos
            </Link>
          )}
          <Link href="/" className={buttonSecondary}>
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const currentIndex = steps.indexOf(step as Exclude<Step, "done">);

  return (
    <div className="flex flex-col gap-8">
      <StepIndicator steps={steps} currentIndex={currentIndex} />

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={() => goTo(steps[currentIndex - 1])}
          className="inline-flex items-center gap-2 self-start text-sm font-semibold text-primary hover:text-primary-hover"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver
        </button>
      )}

      {step === "service" && (
        <section className="flex flex-col gap-4">
          <StepTitle>¿Qué servicio querés?</StepTitle>
          {services.length === 0 ? (
            <p className={`${card} text-center text-muted`}>
              Por el momento no hay servicios disponibles para reservar online.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {services.map((option) => {
                const selected = option.id === service?.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => chooseService(option)}
                      aria-pressed={selected}
                      className={`flex w-full flex-col gap-2 rounded-2xl border p-5 text-left shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${
                        selected
                          ? "border-primary bg-soft"
                          : "border-line bg-surface hover:border-primary"
                      }`}
                    >
                      <span className="flex flex-col gap-1">
                        <span className="text-lg font-bold">{option.name}</span>
                        {option.description && (
                          <span className="text-sm text-muted">{option.description}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                        <span className="text-lg font-bold text-primary">{option.priceLabel}</span>
                        <span className="inline-flex items-center gap-1 text-sm text-muted">
                          <Clock className="size-4" aria-hidden="true" />
                          {option.duration} min
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {step === "datetime" && service && (
        <section className="flex flex-col gap-4">
          <StepTitle>Elegí día y horario</StepTitle>
          <p className="-mt-2 text-muted">
            {service.name} · {service.duration} min
          </p>
          {isLoadingSlots || (!availability && !availabilityError) ? (
            <p className={`${card} text-center text-muted`}>Buscando horarios disponibles…</p>
          ) : availabilityError || !availability ? (
            <div className={`${card} flex flex-col items-center gap-4 text-center`}>
              <p className="text-danger">No pudimos cargar los horarios.</p>
              <button
                type="button"
                onClick={() => loadAvailability(service.id)}
                className={buttonSecondary}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <SlotPicker
              key={service.id}
              availability={availability}
              value={slot}
              onChange={chooseSlot}
            />
          )}
        </section>
      )}

      {step === "identity" && (
        <section className="flex flex-col gap-4">
          <StepTitle>Tus datos</StepTitle>
          <IdentityForms value={identity} onSubmit={chooseIdentity} />
        </section>
      )}

      {step === "summary" && service && slot && (
        <section className="flex flex-col gap-6">
          <StepTitle>Revisá tu turno</StepTitle>
          <BookingSummary service={service} slot={slot} />
          <p className="-mt-2 text-sm text-muted">
            Reservando como{" "}
            <span className="font-semibold text-foreground">
              {sessionEmail ?? identity?.email}
            </span>
          </p>

          {bookingError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/5 p-5"
            >
              <p className="text-danger">{bookingError.message}</p>
              {bookingError.code === "SLOT_TAKEN" && (
                <button type="button" onClick={pickAnotherSlot} className={buttonSecondary}>
                  Elegir otro horario
                </button>
              )}
              {bookingError.code === "EMAIL_NOT_FOUND" && (
                <button type="button" onClick={() => goTo("identity")} className={buttonSecondary}>
                  Volver a mis datos
                </button>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={confirmInStore}
              disabled={isBooking}
              className={buttonPrimary}
            >
              {isBooking ? "Reservando…" : "Pagar en el local"}
            </button>
            <div className="flex flex-col gap-1">
              <button type="button" disabled className={`${buttonSecondary} w-full`}>
                Pagar con Mercado Pago
              </button>
              <p className="text-center text-xs text-muted">Muy pronto vas a poder pagar online.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl font-semibold">{children}</h2>;
}

function StepIndicator({
  steps,
  currentIndex,
}: {
  steps: Exclude<Step, "done">[];
  currentIndex: number;
}) {
  return (
    <ol className="flex items-start justify-between gap-2">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className="flex flex-1 flex-col items-center gap-2 text-center"
          >
            <span
              className={`grid size-9 place-items-center rounded-full border text-sm font-bold ${
                current
                  ? "border-primary bg-primary text-white"
                  : done
                    ? "border-primary bg-soft text-primary"
                    : "border-line bg-surface text-muted"
              }`}
            >
              {done ? <Check className="size-4" aria-label="Completado" /> : i + 1}
            </span>
            <span
              className={`text-xs sm:text-sm ${current ? "font-bold text-primary" : "text-muted"}`}
            >
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BookingSummary({
  service,
  slot,
  className = "",
}: {
  service: ServiceOption;
  slot: string;
  className?: string;
}) {
  const rows = [
    ["Servicio", service.name],
    ["Precio", service.priceLabel],
    ["Día", formatLongDate(slot)],
    ["Hora", `${formatTime(slot)} hs`],
  ];
  return (
    <dl className={`${card} flex flex-col gap-3 ${className}`}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        maxLength={type === "email" ? 254 : 60}
        className={`${input} font-normal`}
      />
    </label>
  );
}


type IdentityMode = BookingIdentity["mode"];

const IDENTITY_OPTIONS: { mode: IdentityMode; title: string; hint: string; icon: LucideIcon }[] = [
  { mode: "new", title: "Es mi primera vez", hint: "Completá tus datos", icon: UserPlus },
  { mode: "existing", title: "Ya reservé antes", hint: "Solo tu email", icon: UserCheck },
];

// Paso 3 (sección 3.1): dos botones y, debajo, el formulario de la opción elegida
function IdentityForms({
  value,
  onSubmit,
}: {
  value: BookingIdentity | null;
  onSubmit: (identity: BookingIdentity) => void;
}) {
  const [mode, setMode] = useState<IdentityMode | null>(value?.mode ?? null);
  const newValue = value?.mode === "new" ? value : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name)).trim();
    onSubmit(
      mode === "new"
        ? {
            mode: "new",
            email: field("email"),
            firstName: field("firstName"),
            lastName: field("lastName"),
            phone: field("phone"),
          }
        : { mode: "existing", email: field("email") },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {IDENTITY_OPTIONS.map(({ mode: option, title, hint, icon: Icon }) => {
          const selected = option === mode;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center shadow-sm transition-colors sm:p-6 ${
                selected ? "border-primary bg-soft" : "border-line bg-surface hover:border-primary"
              }`}
            >
              <Icon
                className={`size-7 ${selected ? "text-primary" : "text-accent"}`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="font-bold">{title}</span>
              <span className="text-xs text-muted sm:text-sm">{hint}</span>
            </button>
          );
        })}
      </div>

      {mode && (
        // `key` reinicia el formulario al cambiar de opción
        <form key={mode} onSubmit={submit} className={`${card} flex flex-col gap-4`}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={value?.mode === mode ? value.email : undefined}
          />
          {mode === "new" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Nombre"
                  name="firstName"
                  autoComplete="given-name"
                  defaultValue={newValue?.firstName}
                />
                <Field
                  label="Apellido"
                  name="lastName"
                  autoComplete="family-name"
                  defaultValue={newValue?.lastName}
                />
              </div>
              <Field
                label="Teléfono"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={newValue?.phone}
              />
            </>
          )}
          <button type="submit" className={`${buttonPrimary} mt-2`}>
            Continuar
          </button>
        </form>
      )}
    </div>
  );
}
