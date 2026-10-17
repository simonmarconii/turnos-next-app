// Clases compartidas para los elementos que se repiten en todas las pantallas (sección 7.1 de la doc)

export const buttonPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-primary bg-surface px-8 font-semibold text-primary transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface";

export const buttonDanger =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-danger bg-surface px-8 font-semibold text-danger transition-colors hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface";

export const card = "rounded-2xl border border-line bg-surface p-6 shadow-sm";

export const input =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-foreground placeholder:text-muted/60 focus:border-primary";
