"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CarouselPhoto = { src: string; alt: string };

const INTERVAL_MS = 5000;

// Carrusel de fotos con fundido: avanza solo cada 5 segundos (salvo con el mouse encima o con
// "reducir movimiento" activado en el sistema) y se puede manejar con flechas y puntos.
export function PhotoCarousel({ photos }: { photos: CarouselPhoto[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (index: number) => setCurrent((index + photos.length) % photos.length);

  useEffect(() => {
    if (paused || photos.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setCurrent((index) => (index + 1) % photos.length), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [current, paused, photos.length]);

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-soft shadow-sm md:aspect-[4/5]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carrusel"
      aria-label="Fotos del local"
    >
      {photos.map((photo, index) => (
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="(min-width: 768px) 40vw, 100vw"
          // La primera foto se ve apenas carga la página
          preload={index === 0}
          aria-hidden={index !== current}
          className={`object-cover transition-opacity duration-700 ease-in-out ${
            index === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(current - 1)}
            className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-surface/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(current + 1)}
            className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-surface/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
            aria-label="Foto siguiente"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-surface/70 px-3 py-2 backdrop-blur-sm">
            {photos.map((photo, index) => (
              <button
                key={photo.src}
                type="button"
                onClick={() => go(index)}
                aria-label={`Ver foto ${index + 1}`}
                aria-current={index === current}
                className={`h-2 rounded-full transition-all ${
                  index === current ? "w-6 bg-primary" : "w-2 bg-muted/50 hover:bg-muted"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
