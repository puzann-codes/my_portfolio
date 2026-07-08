import type { Metadata } from "next";
import { Archivo, Inter, Unbounded } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import InkCursor from "@/components/InkCursor";
import CustomCursor from "@/components/CustomCursor";
import AudioUnlock from "@/components/AudioUnlock";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${archivo.variable} ${unbounded.variable} ${inter.variable}`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <div className="grain" aria-hidden="true" />
        <InkCursor />
        <CustomCursor />
        <AudioUnlock />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
