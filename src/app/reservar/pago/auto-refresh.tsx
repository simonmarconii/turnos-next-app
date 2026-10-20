"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Vuelve a renderizar la página cada `intervalMs` mientras se espera la confirmación del pago
// (cada render vuelve a consultar a Mercado Pago). Después de `maxAttempts` deja de intentar y
// muestra `fallback`.
export function AutoRefresh({
  intervalMs = 3000,
  maxAttempts = 10,
  fallback,
}: {
  intervalMs?: number;
  maxAttempts?: number;
  fallback: React.ReactNode;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= maxAttempts) return;
    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((count) => count + 1);
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [attempts, intervalMs, maxAttempts, router]);

  return attempts >= maxAttempts ? fallback : null;
}
