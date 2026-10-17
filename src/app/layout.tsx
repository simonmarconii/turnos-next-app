import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Nunito, Quicksand } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthNav } from "@/components/auth-nav";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/config/site";
import "./globals.css";

// Títulos: geométrica y redondeada. Para h1/h2 y el nombre del local.
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

// Cuerpo, botones y formularios: terminaciones redondeadas
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#4f6f63",
          colorForeground: "#2f2a26",
          fontFamily: "var(--font-nunito)",
        },
      }}
    >
      <html
        lang="es"
        className={`${quicksand.variable} ${nunito.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col font-sans">
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
              <Link
                href="/"
                className="font-display text-xl leading-tight font-semibold text-foreground sm:text-2xl"
              >
                {siteConfig.name}
              </Link>
              <Suspense>
                <AuthNav />
              </Suspense>
            </div>
          </header>
          {children}
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
