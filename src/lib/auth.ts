import "server-only";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Devuelve el `User` de la base vinculado a la sesión de Clerk, o null si no hay sesión.
// Si todavía no está vinculado, lo busca por email (shadow account o admin del seed) o lo crea.
// El webhook `user.created` hará lo mismo; esto cubre el caso de que todavía no haya llegado.
export const getCurrentUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const linked = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (linked) return linked;

  const clerkUser = await currentUser();
  const primaryEmail = clerkUser?.primaryEmailAddress;
  // Solo se vincula por email si Clerk lo verificó: si no, cualquiera podría
  // registrarse con el email de otro y ver sus turnos.
  if (!clerkUser || primaryEmail?.verification?.status !== "verified") return null;

  const email = primaryEmail.emailAddress.toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {
      clerkId: userId,
      firstName: clerkUser.firstName ?? undefined,
      lastName: clerkUser.lastName ?? undefined,
    },
    create: {
      clerkId: userId,
      email,
      firstName: clerkUser.firstName ?? "",
      lastName: clerkUser.lastName ?? "",
    },
  });
});
