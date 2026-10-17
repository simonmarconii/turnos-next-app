"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Modal sobre <dialog> nativo: maneja el foco, Escape y el fondo oscuro sin librerías
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Un click en el fondo (fuera del contenido) cierra el modal
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-surface text-foreground shadow-lg backdrop:bg-foreground/40"
    >
      <div className="flex max-h-[85svh] flex-col gap-5 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-soft"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
