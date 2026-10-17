import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Reservá tu turno en segundos
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Elegí día y horario, recibí la confirmación y gestioná tus reservas
        desde un solo lugar.
      </p>
      <Link
        href="/dashboard"
        className="rounded-full bg-zinc-900 text-white px-6 h-12 inline-flex items-center font-medium hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Ver mis turnos
      </Link>
    </main>
  );
}
