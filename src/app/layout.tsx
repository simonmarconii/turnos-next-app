import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthNav } from "@/components/auth-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Turnos",
  description: "Reservá y gestioná turnos online",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="es"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 h-16 dark:border-zinc-800">
            <Link href="/" className="font-semibold text-lg">
              Turnos
            </Link>
            <Suspense>
              <AuthNav />
            </Suspense>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
