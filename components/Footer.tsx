"use client";

import Mascot from "@/components/Mascot";

const QUIPS = [
  "You scrolled all the way down. Respect.",
  "Say hi. Pujan replies faster than I do.",
  "I'm just ink. He's the one you hire.",
  "Poke me again, I dare you.",
];

export default function Footer() {
  return (
    <footer
      id="contact"
      className="relative w-full bg-[#0a0a0a] text-white px-6 md:px-10 pt-24 md:pt-36 pb-10"
    >
      <div className="max-w-[1400px] mx-auto">
        <p className="font-display text-xs tracking-[0.25em] uppercase mb-6 text-white/60">
          04 — Contact
        </p>
        <h2 className="font-display font-black text-[11vw] md:text-[7vw] leading-[0.92] tracking-tight mb-14 md:mb-20">
          Let&apos;s make something
          <br />
          that doesn&apos;t exist yet.
        </h2>

        <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-16 items-end">
          <div className="max-w-xl border border-white/20 bg-white/[0.03] p-5 md:p-6 font-mono text-[12px] md:text-[13px] leading-relaxed">
            <p className="font-bold mb-3">Thanks for scrolling.</p>
            <p className="text-white/70 mb-3">
              You pet a blob, plucked some strings and drove a guitar pick
              around. That&apos;s a better tour than most portfolios get. If
              you&apos;ve got something that needs building (AI, full-stack,
              or just weird), I&apos;d like to hear about it.
            </p>
            <ul className="space-y-1">
              <li>
                -{" "}
                <a
                  href="mailto:rohitpoudel020@gmail.com"
                  data-cursor-hover
                  className="wiggle text-[#f5d76e]"
                >
                  email
                </a>
              </li>
              <li>
                -{" "}
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  data-cursor-hover
                  className="wiggle text-[#f5d76e]"
                >
                  linkedin
                </a>
              </li>
              <li>
                -{" "}
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  data-cursor-hover
                  className="wiggle text-[#f5d76e]"
                >
                  github
                </a>
              </li>
            </ul>
          </div>

          <div className="flex md:justify-end">
            <Mascot quips={QUIPS} size={96} tone="light" />
          </div>
        </div>

        <div className="mt-20 md:mt-28 flex flex-wrap items-center justify-between gap-4 text-xs text-white/50 tracking-wide">
          <p>© 2026 Pujan Bhatt</p>
          <p>Built with three.js, GSAP and an unreasonable amount of coffee.</p>
        </div>
      </div>
    </footer>
  );
}
