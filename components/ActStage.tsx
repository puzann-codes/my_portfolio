"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

/**
 * The acts as title cards. When the story arrives at a new act, a centred
 * card plays over the picture, the way a film announces a chapter: a thin
 * rule draws out from the middle, the act's number settles in small capitals,
 * the title resolves letter by letter out of a soft blur while its tracking
 * slowly closes, an anamorphic streak sweeps through, then the whole card
 * pushes forward and dissolves, and a quiet subtitle stays at the foot of the
 * frame for as long as the act lasts. Letterbox bars slide in while a card
 * plays. With reduced motion there are no bars and no letter animation: the
 * subtitle simply fades in.
 */

export type Card = {
  /** roman numeral of the act */
  numeral: string;
  /** the act's name, e.g. "The workspace" or a project's category */
  kicker: string;
  title: string;
  line: string;
  cta?: { href: string; label: string };
};

type Props = {
  stage: number;
  cards: (Card | null)[];
  /** the loader has gone: cards may play */
  live: boolean;
  reduced: boolean;
  /** index of the closing card, which stays on screen */
  endStage: number;
  onReplay: () => void;
  /** a card has started to play for this stage (for the sound under it) */
  onPlay?: (stage: number) => void;
};

const FILM = "font-[family-name:var(--font-film)]";

/**
 * The title is broken into lines once, here, never by the browser: one line
 * up to 14 characters, otherwise two balanced lines. Each line is
 * `nowrap`, and nothing about the title's layout is animated (the tracking
 * "closing" is a transform on each letter), so the lines can never re-wrap
 * while the card plays.
 */
function titleLines(title: string): string[] {
  const words = title.split(" ");
  if (title.length <= 14 || words.length < 2) return [title];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

function titleSize(lines: string[]) {
  const longest = Math.max(...lines.map((l) => l.length));
  const cap = lines.length === 1 ? 8.4 : 6.2;
  // ~0.9em per capital with its tracking; keep the widest line inside 86% of the width
  return `clamp(1.5rem, calc(86vw / ${(longest * 0.9).toFixed(1)}), ${cap}rem)`;
}

function Title({ lines }: { lines: string[] }) {
  return (
    <>
      <span className="sr-only">{lines.join(" ")}</span>
      <span aria-hidden="true" className="block">
        {lines.map((line, li) => (
          <span key={li} className="block whitespace-nowrap">
            {[...line].map((c, ci) => (
              <span key={ci} className="ch inline-block will-change-transform">
                {c === " " ? "\u00a0" : c}
              </span>
            ))}
          </span>
        ))}
      </span>
    </>
  );
}

export default function ActStage({ stage, cards, live, reduced, endStage, onReplay, onPlay }: Props) {
  const onPlayRef = useRef(onPlay);
  useEffect(() => {
    onPlayRef.current = onPlay;
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const shownRef = useRef(-1);

  useEffect(() => {
    if (!live) return;
    const root = rootRef.current;
    if (!root) return;
    const prev = shownRef.current;
    shownRef.current = stage;

    // whatever was on screen leaves quickly; fast scrolling never stacks cards
    tlRef.current?.kill();
    tlRef.current = null;
    const leaving = prev >= 0 && prev !== stage ? cardRefs.current[prev] : null;
    if (leaving) gsap.to(leaving, { autoAlpha: 0, duration: 0.35, overwrite: true });

    const el = cardRefs.current[stage];
    const bars = barsRef.current.filter(Boolean) as HTMLDivElement[];
    if (!el || !cards[stage]) {
      gsap.to(bars, { scaleY: 0, duration: 0.6, ease: "power2.inOut", overwrite: true });
      return;
    }

    const q = gsap.utils.selector(el);
    const isEnd = stage === endStage;
    // wait a beat: skimming past an act should not fire its card
    const timer = setTimeout(
      () => {
        gsap.set(el, { autoAlpha: 1 });
        onPlayRef.current?.(stage);
        if (reduced) {
          gsap.set(q(".title-wrap, .scrim"), { autoAlpha: 0 });
          gsap.fromTo(q(".sub > *"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, stagger: 0.08 });
          return;
        }
        const tl = gsap.timeline();
        tlRef.current = tl;
        gsap.set(q(".title-wrap"), { autoAlpha: 1, scale: 1, filter: "blur(0px)" });
        gsap.set(q(".sub > *"), { autoAlpha: 0, y: 14 });
        tl.to(bars, { scaleY: 1, duration: 0.9, ease: "power3.inOut" }, 0)
          .fromTo(q(".scrim"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: "sine.inOut" }, 0)
          .fromTo(q(".rule"), { scaleX: 0 }, { scaleX: 1, duration: 1.3, ease: "power3.out" }, 0.1)
          .fromTo(q(".kick"), { autoAlpha: 0, y: 8 }, { autoAlpha: 0.78, y: 0, duration: 1.4, ease: "power2.out" }, 0.15)
          .fromTo(
            q(".ch"),
            {
              autoAlpha: 0,
              yPercent: 32,
              scale: 1.2,
              filter: "blur(18px)",
              // spread outward from the middle, then close: tracking as a transform, not as layout
              xPercent: (i: number, _t: Element, all: ArrayLike<Element>) => (i - (all.length - 1) / 2) * 24,
            },
            { autoAlpha: 1, yPercent: 0, scale: 1, filter: "blur(0px)", xPercent: 0, duration: 1.9, ease: "power3.out", stagger: 0.045 },
            0.35
          )
          .fromTo(
            q(".streak"),
            { scaleX: 0, autoAlpha: 0 },
            { scaleX: 1, autoAlpha: 1, duration: 0.8, ease: "power2.out" },
            0.55
          )
          .to(q(".streak"), { autoAlpha: 0, duration: 1.1, ease: "sine.in" }, 1.35);
        if (isEnd) {
          // the closing card stays; its links arrive under it
          tl.to(bars, { scaleY: 0, duration: 1, ease: "power3.inOut" }, 2.2).to(
            q(".sub > *"),
            { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: "power2.out" },
            2.2
          );
        } else {
          tl.to(
            q(".title-wrap"),
            { autoAlpha: 0, scale: 1.14, filter: "blur(10px)", duration: 1.0, ease: "power2.in" },
            2.7
          )
            .to(q(".scrim"), { autoAlpha: 0, duration: 1.1, ease: "sine.inOut" }, 2.8)
            .to(bars, { scaleY: 0, duration: 1.0, ease: "power3.inOut" }, 2.9)
            .to(q(".sub > *"), { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: "power2.out" }, 3.0);
        }
      },
      stage === 0 ? 1100 : 260
    );

    return () => clearTimeout(timer);
  }, [stage, live, cards, reduced, endStage]);

  // leave nothing running when the section unmounts
  useEffect(
    () => () => {
      tlRef.current?.kill();
    },
    []
  );

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      {/* letterbox */}
      <div
        ref={(n) => {
          barsRef.current[0] = n;
        }}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[7vh] origin-top bg-black"
        style={{ transform: "scaleY(0)" }}
      />
      <div
        ref={(n) => {
          barsRef.current[1] = n;
        }}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[7vh] origin-bottom bg-black"
        style={{ transform: "scaleY(0)" }}
      />

      {cards.map((c, i) =>
        c ? (
          <section
            key={i}
            ref={(n) => {
              cardRefs.current[i] = n;
            }}
            aria-hidden={stage !== i}
            aria-label={`${c.kicker}: ${c.title}`}
            className="absolute inset-0 invisible opacity-0"
          >
            {/* darkens the middle so the title reads over any scene */}
            <div
              aria-hidden="true"
              className="scrim absolute inset-0 opacity-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 52% at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0) 100%)",
              }}
            />

            {/* the title card */}
            <div className="title-wrap absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <div className="mb-[2.2vh] flex w-full max-w-[min(46rem,88vw)] items-center justify-center gap-5">
                <span className="rule h-px flex-1 origin-right bg-gradient-to-l from-white/55 to-transparent" />
                <span className={`kick ${FILM} whitespace-nowrap text-[0.72rem] uppercase tracking-[0.36em] text-[#e9e1cf] md:text-[0.82rem]`}>
                  Act {c.numeral} &middot; {c.kicker}
                </span>
                <span className="rule h-px flex-1 origin-left bg-gradient-to-r from-white/55 to-transparent" />
              </div>
              <h2
                className={`title ${FILM} uppercase leading-[1.08] tracking-[0.12em] text-[#f3ecda]`}
                style={{ fontSize: titleSize(titleLines(c.title)), textShadow: "0 2px 40px rgba(0,0,0,0.55)" }}
              >
                <Title lines={titleLines(c.title)} />
              </h2>
              <span
                aria-hidden="true"
                className="streak mt-[2.4vh] block h-px w-[min(60vw,44rem)] origin-center opacity-0"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,246,224,0.95), transparent)",
                  boxShadow: "0 0 18px 2px rgba(255,236,200,0.45)",
                }}
              />
            </div>

            {/* the subtitle that stays */}
            <div
              className={`sub absolute inset-x-0 flex flex-col items-center px-6 text-center ${
                i === endStage ? "bottom-[13vh]" : "bottom-[9.5vh]"
              }`}
            >
              {i !== endStage && (
                <>
                  <p className={`${FILM} mb-2 text-[0.7rem] uppercase tracking-[0.34em] text-[#e9e1cf]/70 md:text-xs`}>
                    Act {c.numeral} &middot; {c.kicker}
                  </p>
                  <p
                    className={`${FILM} mb-3 text-[1.15rem] uppercase tracking-[0.2em] text-[#f6efdc] md:text-[1.45rem]`}
                    style={{ textShadow: "0 1px 18px rgba(0,0,0,0.7)" }}
                  >
                    {c.title}
                  </p>
                  <p
                    className={`${FILM} max-w-[min(34rem,86vw)] text-[1.02rem] italic leading-snug text-[#efe8d6]/90 md:text-[1.2rem]`}
                    style={{ textShadow: "0 1px 14px rgba(0,0,0,0.75)" }}
                  >
                    {c.line}
                  </p>
                </>
              )}
              {c.cta && (
                <Link
                  href={c.cta.href}
                  tabIndex={stage === i ? 0 : -1}
                  data-cursor-label="OPEN"
                  className={`${FILM} pointer-events-auto group mt-5 inline-flex items-center gap-3 border-b border-[#e9e1cf]/40 pb-1 text-[0.8rem] uppercase tracking-[0.3em] text-[#f6efdc] transition-colors hover:border-[#f6efdc] md:text-[0.88rem]`}
                >
                  {c.cta.label}
                  <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                    &rarr;
                  </span>
                </Link>
              )}
              {i === endStage && (
                <>
                  <p
                    className={`${FILM} max-w-[min(32rem,86vw)] text-[1.05rem] italic leading-snug text-[#efe8d6]/90 md:text-[1.25rem]`}
                    style={{ textShadow: "0 1px 14px rgba(0,0,0,0.75)" }}
                  >
                    {c.line}
                  </p>
                  <ul
                    className={`${FILM} pointer-events-auto mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[0.8rem] uppercase tracking-[0.28em] text-[#f6efdc] md:text-[0.88rem]`}
                  >
                    <li>
                      <a
                        href="mailto:rohitpoudel020@gmail.com"
                        data-cursor-label="EMAIL"
                        tabIndex={stage === i ? 0 : -1}
                        className="border-b border-[#e9e1cf]/45 pb-1 transition-colors hover:border-[#f6efdc]"
                      >
                        Say hello
                      </a>
                    </li>
                    <li>
                      <Link
                        href="/work"
                        tabIndex={stage === i ? 0 : -1}
                        className="border-b border-transparent pb-1 text-[#efe8d6]/80 transition-colors hover:border-[#f6efdc]"
                      >
                        All projects
                      </Link>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={onReplay}
                        tabIndex={stage === i ? 0 : -1}
                        className="border-b border-transparent pb-1 uppercase tracking-[0.28em] text-[#efe8d6]/60 transition-colors hover:border-[#f6efdc] hover:text-[#f6efdc]"
                      >
                        Replay
                      </button>
                    </li>
                  </ul>
                </>
              )}
            </div>
          </section>
        ) : null
      )}
    </div>
  );
}
