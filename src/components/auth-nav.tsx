import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

// Lee la sesión del request, así que debe renderizarse dentro de <Suspense>.
export function AuthNav() {
  return (
    <nav className="flex items-center gap-3">
      <Show when="signed-out">
        <SignInButton>
          <button className="rounded-full px-4 h-10 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900">
            Iniciar sesión
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="rounded-full bg-zinc-900 text-white px-4 h-10 text-sm font-medium hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
            Registrarse
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className="text-sm font-medium hover:underline">
          Mis turnos
        </Link>
        <UserButton />
      </Show>
    </nav>
  );
}
