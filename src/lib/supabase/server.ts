import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Envía el token de sesión de Clerk, por lo que las políticas RLS pueden usar
 * `auth.jwt()->>'sub'` para identificar al usuario.
 */
export async function createServerSupabaseClient() {
  const { getToken } = await auth();

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => (await getToken()) ?? null,
    },
  );
}
