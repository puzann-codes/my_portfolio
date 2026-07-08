"use client";

import Link from "next/link";

export default function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-6 md:px-10 py-6 md:py-7 flex items-center justify-between mix-blend-difference text-white">
      <Link
        href="/"
        className="font-display font-extrabold tracking-tight text-sm md:text-base"
        data-cursor-hover
      >
        PB.
      </Link>
      <nav className="flex items-center gap-6 md:gap-10 text-xs md:text-sm font-medium tracking-wide">
        <a href="#top-works" data-cursor-hover className="hidden sm:inline">
          WORK
        </a>
        <Link href="/work" data-cursor-hover>
          ALL PROJECTS
        </Link>
        <a href="mailto:rohitpoudel020@gmail.com" data-cursor-hover>
          CONTACT
        </a>
      </nav>
    </header>
  );
}
