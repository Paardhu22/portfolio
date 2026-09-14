'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type Link = { label: string; href: string };

type ArrivalProps = {
  /** True once travel has settled at the end of the corridor. */
  arrived: boolean;
  name: string;
  line: string;
  links: Link[];
  /** Milliseconds between each element's reveal. */
  stagger?: number;
};

function Rise({ show, index, stagger, children }: { show: boolean; index: number; stagger: number; children: ReactNode }) {
  return (
    <div
      // Reveals run outward on arrival and back inward on departure, so leaving
      // plays as the reverse of landing rather than a cut.
      style={{ transitionDelay: `${(show ? index : 6 - index) * stagger}ms` }}
      className={`transition-[transform,opacity] duration-[900ms] ease-out-expo motion-reduce:transition-none ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The terminus. Everything before this is passed through; this is the only
 * place the visitor is meant to stop, so it's the only place with anything to
 * click. Reversing out of the end plays the whole reveal backwards.
 */
export function Arrival({ arrived, name, line, links, stagger = 260 }: ArrivalProps) {
  // Stay mounted through the exit so the content doesn't vanish mid-fade.
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (arrived) setSeen(true);
  }, [arrived]);

  if (!seen) return null;

  return (
    // Nothing here blocks the canvas: only the links take a pointer, so a drag
    // anywhere else still flies you back out.
    <div className="absolute inset-0 z-30 grid place-items-center px-8 pointer-events-none">
      <div className="w-full max-w-[34ch]">
        <Rise show={arrived} index={0} stagger={stagger}>
          <p className="font-roman text-[10px] uppercase tracking-[0.45em] text-accent/30">End of the line</p>
        </Rise>

        <Rise show={arrived} index={1} stagger={stagger}>
          <h1 className="mt-5 font-sans text-[clamp(2rem,5.5vw,3.75rem)] font-black leading-[0.95] tracking-[-0.035em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.7)]">
            {name}
          </h1>
        </Rise>

        <Rise show={arrived} index={2} stagger={stagger}>
          <p className="mt-4 font-sans text-[15px] leading-relaxed text-accent/55">{line}</p>
        </Rise>

        <ul className="mt-9 flex flex-wrap gap-3">
          {links.map(({ label, href }, i) => (
            <li key={href}>
              <Rise show={arrived} index={3 + i} stagger={stagger}>
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noreferrer' : undefined}
                  // Unreachable by keyboard until you've actually arrived.
                  tabIndex={arrived ? 0 : -1}
                  className="pointer-events-auto inline-flex h-10 items-center border border-accent/20 bg-accent/[0.03] px-5 font-roman text-[11px] uppercase tracking-[0.24em] text-accent/70 transition-colors duration-300 hover:border-accent/45 hover:text-accent focus-visible:border-accent/60 focus-visible:text-accent focus-visible:outline-none"
                >
                  {label}
                </a>
              </Rise>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
