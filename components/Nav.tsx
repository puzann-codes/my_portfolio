"use client";

import Link from "next/link";
import SoundToggle from "@/components/SoundToggle";

/** The same quiet header on every page that is not the desk itself. */
export default function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-6 md:px-10 py-6 md:py-7 flex items-center justify-between bg-gradient-to-b from-[#0a0a0b] via-[#0a0a0b]/70 to-transparent text-[#efe8d6]">
      <Link href="/" className="text-sm md:text-base uppercase tracking-[0.34em]" data-cursor-hover>
        Pujan Bhatt
      </Link>
      <nav className="flex items-center gap-5 md:gap-9 text-[0.7rem] md:text-xs uppercase tracking-[0.28em]">
        <Link href="/" data-cursor-hover className="hidden sm:inline opacity-70 hover:opacity-100 transition-opacity">
          The desk
        </Link>
        <Link href="/work" data-cursor-hover className="opacity-70 hover:opacity-100 transition-opacity">
          All projects
        </Link>
        <a
          href="mailto:rohitpoudel020@gmail.com"
          data-cursor-hover
          className="hidden sm:inline opacity-70 hover:opacity-100 transition-opacity"
        >
          Contact
        </a>
        <SoundToggle />
      </nav>
    </header>
  );
}
