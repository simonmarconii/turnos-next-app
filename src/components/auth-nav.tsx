import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";

const linkClass = "text-sm font-semibold text-foreground hover:text-primary";

async function AdminLink() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return null;

  return (
    <Link href="/admin" className={linkClass}>
      Administración
    </Link>
  );
}

// Lee la sesión del request, así que debe renderizarse dentro de <Suspense>.
export function AuthNav() {
  return (
    <nav className="flex items-center gap-2 sm:gap-4">
      <Show when="signed-out">
        <SignInButton>
          <button className="h-10 rounded-full px-3 text-sm font-semibold text-foreground hover:bg-soft sm:px-4">
            Iniciar sesión
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="h-10 rounded-full border border-primary px-3 text-sm font-semibold text-primary hover:bg-soft sm:px-4">
            Registrarse
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <AdminLink />
        <Link href="/dashboard" className={linkClass}>
          Mis turnos
        </Link>
        <UserButton />
      </Show>
    </nav>
  );
}
