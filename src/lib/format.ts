const priceFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// "$ 12.000". Recibe number: los Decimal de Prisma se convierten antes con `.toNumber()`.
export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}
