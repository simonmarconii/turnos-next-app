import { cacheLife } from "next/cache";
import { siteConfig } from "@/config/site";

// Con Cache Components no se puede leer la fecha en el shell estático sin cachearla;
// el año se recalcula como mucho una vez por día.
export async function SiteFooter() {
  "use cache";
  cacheLife("days");

  return (
    <footer className="border-t border-accent/40 bg-sand">
      <p className="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-muted">
        © {new Date().getFullYear()} {siteConfig.name}. Todos los derechos reservados.
      </p>
    </footer>
  );
}
