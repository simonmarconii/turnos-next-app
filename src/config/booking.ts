// Reglas de negocio de las reservas (sección 7.8 de docs/documentacion_proyecto.md).
export const bookingConfig = {
  // Todos los horarios del local se interpretan en esta zona, sin importar dónde esté el cliente
  timeZone: "America/Argentina/Buenos_Aires",

  // Horario de atención por día de la semana (0 = domingo … 6 = sábado), en minutos desde la
  // medianoche. Los días que no figuran están cerrados.
  openingHours: {
    1: { open: 8 * 60, close: 17 * 60 },
    2: { open: 8 * 60, close: 17 * 60 },
    3: { open: 8 * 60, close: 17 * 60 },
    4: { open: 8 * 60, close: 17 * 60 },
    5: { open: 8 * 60, close: 17 * 60 },
    6: { open: 8 * 60, close: 17 * 60 },
  } as Partial<Record<number, { open: number; close: number }>>,

  // Cada cuánto puede empezar un turno (8:00, 8:30, …). El turno tiene que terminar antes del cierre.
  slotIntervalMinutes: 30,

  // Se puede reservar desde hoy hasta la misma fecha del mes siguiente, inclusive
  maxMonthsAhead: 1,

  // Tiempo que se retiene el horario mientras se paga con Mercado Pago
  paymentHoldMinutes: 10,

  // El cliente puede reprogramar o cancelar hasta esta cantidad de horas antes del turno
  clientChangeLimitHours: 24,
};
