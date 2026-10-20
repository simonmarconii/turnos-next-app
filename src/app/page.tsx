import Link from "next/link";
import {
  Footprints,
  HandHeart,
  MessageCircle,
  Scissors,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { instagramUrl, siteConfig, whatsappUrl } from "@/config/site";
import { PhotoCarousel, type CarouselPhoto } from "@/components/photo-carousel";

// Contenido informativo fijo: los servicios con precio se cargan desde el panel de administración.
const treatments: { name: string; description: string; icon: LucideIcon }[] = [
  {
    name: "Corte de uñas",
    description: "Corte y limado correcto para prevenir uñas encarnadas y molestias.",
    icon: Scissors,
  },
  {
    name: "Onicomicosis",
    description: "Tratamiento de hongos en las uñas.",
    icon: ShieldCheck,
  },
  {
    name: "Onicocriptosis",
    description: "Tratamiento de la uña encarnada.",
    icon: HandHeart,
  },
  {
    name: "Hiperqueratosis",
    description: "Eliminación de callosidades y durezas.",
    icon: Footprints,
  },
];

// Fotos de Unsplash (licencia libre, no requiere atribución): Rune Enstad (las dos primeras) y
// Mayur Roxan. Están en public/carrusel.
const heroPhotos: CarouselPhoto[] = [
  { src: "/carrusel/pies-flores.jpg", alt: "Pies en un baño de agua tibia con flores" },
  {
    src: "/carrusel/cuidado-pies.jpg",
    alt: "Profesional con guantes realizando un tratamiento en un pie",
  },
  {
    src: "/carrusel/sala-pedicuria.jpg",
    alt: "Sala de pedicuría con sillón y bañera para pies",
  },
];

// lucide-react no incluye logos de marcas
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <h2 className="font-display text-4xl font-semibold text-foreground">{children}</h2>
      <span className="h-px w-16 bg-accent" />
    </div>
  );
}

// Cada sección ocupa al menos una pantalla completa (`svh` descuenta la barra del navegador en
// celulares) y crece si el contenido no entra. La primera descuenta el header de 4rem.
const sectionClass = "flex items-center px-6 py-16 sm:py-20";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className={`${sectionClass} min-h-[calc(100svh-4rem)]`}>
        {/* En pantallas grandes, texto a la izquierda y fotos a la derecha; en mobile, apilados */}
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
            <span className="h-px w-16 bg-accent" />
            <h1 className="font-display text-4xl leading-tight font-semibold text-foreground sm:text-5xl lg:text-6xl">
              Tus pies, en manos profesionales
            </h1>
            <p className="max-w-lg text-lg text-muted">
              Atención podológica con higiene, cuidado y calidez. Reservá tu turno online
              en minutos.
            </p>
            <Link
              href="/reservar"
              className="mt-2 inline-flex h-14 items-center rounded-full bg-primary px-10 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              Reservá tu turno
            </Link>
          </div>
          <PhotoCarousel photos={heroPhotos} />
        </div>
      </section>

      <section className={`${sectionClass} min-h-svh bg-soft`}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
          <SectionTitle>¿Qué hacemos?</SectionTitle>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {treatments.map(({ name, description, icon: Icon }) => (
              <li
                key={name}
                className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-6 text-center shadow-sm"
              >
                <Icon className="size-8 text-accent" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="text-lg font-bold text-foreground">{name}</h3>
                <p className="text-muted">{description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${sectionClass} min-h-svh`}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
          <SectionTitle>Contactanos</SectionTitle>
          <div className="grid gap-6 sm:grid-cols-2">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm transition-colors hover:border-primary"
            >
              <InstagramIcon className="size-8 shrink-0 text-primary" />
              <span className="flex flex-col">
                <span className="text-sm text-muted">Instagram</span>
                <span className="font-semibold text-foreground">
                  @{siteConfig.instagramUser}
                </span>
              </span>
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm transition-colors hover:border-primary"
            >
              <MessageCircle
                className="size-8 shrink-0 text-primary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span className="text-sm text-muted">WhatsApp</span>
                <span className="font-semibold text-foreground">
                  {siteConfig.whatsappDisplay}
                </span>
              </span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
