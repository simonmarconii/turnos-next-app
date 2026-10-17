import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rutas accesibles sin iniciar sesión. Todo lo demás requiere autenticación.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/reservar(.*)", // Wizard de reserva: se puede reservar como invitado
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Saltea internos de Next.js y archivos estáticos, salvo que aparezcan en query params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre ejecutar para rutas de API
    "/(api|trpc)(.*)",
  ],
};
