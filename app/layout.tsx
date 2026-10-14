import type { Metadata } from "next";
import { Archivo, Caveat, Inter, Sorts_Mill_Goudy, Unbounded } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import AirCursor from "@/components/AirCursor";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// the title cards: an old-style Goudy, the kind of face film posters of the
// '80s and '90s set their names in
const film = Sorts_Mill_Goudy({
  variable: "--font-film",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pujan Bhatt — AI Engineer & Full-Stack Developer",
  description:
    "Portfolio of Pujan Bhatt, AI Engineer & Full-Stack Developer. Selected work, experiments and ways to get in touch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${unbounded.variable} ${inter.variable} ${caveat.variable} ${film.variable}`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <div className="grain" aria-hidden="true" />
        <AirCursor />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
