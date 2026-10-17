import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";

async function Greeting() {
  // El proxy ya protege esta ruta, así que siempre hay un usuario logueado.
  const user = await currentUser();

  return (
    <h1 className="text-3xl font-semibold tracking-tight">
      Hola, {user?.firstName ?? "usuario"}
    </h1>
  );
}

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-10 max-w-3xl w-full mx-auto">
      <Suspense
        fallback={<h1 className="text-3xl font-semibold tracking-tight">Hola</h1>}
      >
        <Greeting />
      </Suspense>
      <p className="text-zinc-600 dark:text-zinc-400">
        Acá vas a ver y gestionar tus turnos.
      </p>
    </main>
  );
}
