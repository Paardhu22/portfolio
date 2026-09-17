'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export type Title = {
  /** Tunnel depth this title is anchored to. */
  depth: number;
  eyebrow: string;
  lines: string[];
  note?: string;
  /** The title card at depth 0: revealed by the boot clock, not by approach. */
  hero?: boolean;
  /** Overrides for how long it sits, and how far it takes to leave. */
  hold?: number;
  out?: number;
};

export type TitlesHandle = {
  /** Called from the corridor's own frame loop. */
  update: (depth: number, velocity: number) => void;
};

/* -------------------------------------------------------------------------
 * Everything here is a function of depth, never of time - the one exception
 * being the hero's boot reveal, which has no approach to be driven by. Tie the
 * motion to position and flying backwards plays the whole sequence in reverse
 * for free, which a time-based timeline can never do.
 * ---------------------------------------------------------------------- */

/** Units of approach over which a title assembles. */
const IN = 1.0;
/** Units it stays fully legible once you reach it. */
const HOLD = 0.85;
/** Units over which it blows past the camera. */
const OUT = 0.85;
/** Fraction of a word's own duration between successive word starts. */
const STAGGER = 0.55;

/**
 * Corridor extents, matching the shader's -0.5..0.5 by -0.2..0.2 box.
 *
 * The shader fires rays as normalize(vec3(p, 2.0)) with p spanning [-1, 1] over
 * the viewport height, so a point at (X, Y, Z) lands X * H / Z px from centre.
 * The focal length cancels, which is why a gate is just extent * H / z.
 */
const CORRIDOR_W = 1.0;
const CORRIDOR_H = 0.4;

const BOOT_MS = 1500;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Expo-out, the same curve as --ease-out-expo in the theme. */
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

type Slot = {
  block: HTMLDivElement | null;
  gate: HTMLDivElement | null;
  prompt: HTMLDivElement | null;
  words: (HTMLSpanElement | null)[];
};

type TitlesProps = {
  titles: Title[];
  /** Depth the corridor ends at, for the progress readout. */
  travelEnd: number;
  /** Top speed, for normalising the velocity-reactive effects. */
  maxSpeed: number;
  ref?: Ref<TitlesHandle>;
};

export function Titles({ titles, travelEnd, maxSpeed, ref }: TitlesProps) {
  const slots = useRef<Slot[]>([]);
  const depthRef = useRef<HTMLSpanElement | null>(null);
  const velRef = useRef<HTMLSpanElement | null>(null);
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const shownRef = useRef('');
  const viewportH = useRef(0);
  const bootStart = useRef(0);
  const reduceMotion = useRef(false);

  const slot = (i: number): Slot =>
    (slots.current[i] ??= { block: null, gate: null, prompt: null, words: [] });

  useEffect(() => {
    const onResize = () => {
      viewportH.current = window.innerHeight;
    };
    onResize();
    window.addEventListener('resize', onResize);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduceMotion.current = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);

    bootStart.current = performance.now();
    return () => {
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', sync);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      update(depth: number, velocity: number) {
        const rm = reduceMotion.current;
        const H = viewportH.current || 1;
        // Normalised speed drives the smear, the chromatic split and the shake.
        const v = rm ? 0 : clamp01(Math.abs(velocity) / Math.max(1e-3, maxSpeed));
        const boot = bootStart.current
          ? clamp01((performance.now() - bootStart.current) / BOOT_MS)
          : 0;

        for (let i = 0; i < titles.length; i++) {
          const t = titles[i];
          const s = slots.current[i];
          if (!s) continue;

          const hold = t.hold ?? HOLD;
          const out = t.out ?? OUT;

          // Reveal: the hero has no approach to read, so it boots on a clock.
          // Everything else assembles as you close the last unit of distance.
          // Both stay linear - the per-word expoOut below is the only easing,
          // so the hero's cascade has the same character as a checkpoint's.
          const r = t.hero ? boot : clamp01((depth - (t.depth - IN)) / IN);
          // Exit: begins once you have held it, and finishes as it passes you.
          const x = clamp01((depth - (t.depth + hold)) / out);

          const live = r > 0 && x < 1;
          if (s.block) {
            s.block.style.visibility = live ? 'visible' : 'hidden';
          }

          if (live) {
            const n = s.words.length;
            // Overlapped so the last word still lands exactly at r = 1.
            const span = 1 / (1 + STAGGER * (n - 1));
            for (let w = 0; w < n; w++) {
              const el = s.words[w];
              if (!el) continue;
              const e = expoOut(clamp01((r - w * STAGGER * span) / span));
              if (rm) {
                el.style.transform = '';
                el.style.filter = '';
                el.style.opacity = String(e);
                continue;
              }
              // Each word rides up out of its own mask, un-skewing and
              // sharpening as it settles.
              el.style.transform = `translateY(${((1 - e) * 115).toFixed(2)}%) skewY(${((1 - e) * 5).toFixed(2)}deg)`;
              const blur = (1 - e) * 7;
              el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
              el.style.opacity = String(Math.min(1, e * 2.2));
            }

            // Leaving accelerates: it grows and softens as it passes the lens,
            // so it reads as flown-past rather than faded-out.
            const xe = x * x;
            const opacity = 1 - clamp01(x * 1.25);
            if (s.block) {
              if (rm) {
                s.block.style.transform = '';
                s.block.style.filter = '';
              } else {
                s.block.style.transform = `translate3d(0, ${(-xe * 26).toFixed(2)}%, 0) scale(${(1 + xe * 0.26).toFixed(4)}) scaleX(${(1 + v * 0.05).toFixed(4)})`;
                const blur = xe * 12;
                s.block.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
              }
              s.block.style.opacity = String(opacity);

              // The chromatic split rides the glyphs themselves as a shadow, so
              // it cannot drift out of register with the words, and cannot clip
              // differently from them the way a duplicated layer does. Set on
              // the block because text-shadow inherits: one write, not one per
              // word.
              const dx = v * 4;
              s.block.style.textShadow =
                dx > 0.05
                  ? `0 4px 44px rgba(0,0,0,0.78), ${dx.toFixed(2)}px 0 0 rgba(255,138,48,${(v * 0.5).toFixed(3)}), ${(-dx).toFixed(2)}px 0 0 rgba(90,170,255,${(v * 0.42).toFixed(3)})`
                  : '0 4px 44px rgba(0,0,0,0.78)';
            }
            // The call to action retires the instant it is obeyed.
            if (s.prompt) s.prompt.style.opacity = String(1 - clamp01(depth / 0.35));
          }

          // Gate: the corridor's own perspective, drawn in screen space. A
          // point at (x, y, z) lands at x * H / z px, so the gate is a real
          // frame around the tunnel rather than a decoration on top of it.
          const gate = s.gate;
          if (gate) {
            const z = t.depth - depth;
            const near = clamp01((z - 0.18) / 0.9);
            const far = 1 - clamp01((z - 3.0) / 4.0);
            const op = rm ? 0 : near * far * 0.55;
            if (op > 0.002) {
              gate.style.visibility = 'visible';
              gate.style.opacity = String(op);
              gate.style.width = `${((CORRIDOR_W * H) / z).toFixed(1)}px`;
              gate.style.height = `${((CORRIDOR_H * H) / z).toFixed(1)}px`;
            } else {
              gate.style.visibility = 'hidden';
            }
          }
        }

        // Telemetry, written only when the reading actually changes.
        const label = `${depth.toFixed(2)}|${Math.abs(velocity).toFixed(2)}`;
        if (label !== shownRef.current) {
          shownRef.current = label;
          if (depthRef.current) depthRef.current.textContent = depth.toFixed(2).padStart(5, '0');
          if (velRef.current) velRef.current.textContent = Math.abs(velocity).toFixed(2);
          if (progressRef.current) {
            progressRef.current.style.transform = `scaleX(${clamp01(depth / travelEnd).toFixed(4)})`;
          }
        }
      }
    }),
    [titles, travelEnd, maxSpeed]
  );

  return (
    <>
      {/* The flight is the presentation, but the copy is the content: it stays
          in the document for crawlers and screen readers, which can't fly. */}
      <div className="sr-only">
        {titles.map(t => (
          <section key={t.depth}>
            <h2>{t.eyebrow}</h2>
            <p>{t.lines.join(' ')}</p>
            {t.note && <p>{t.note}</p>}
          </section>
        ))}
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
        {titles.map((t, i) => (
          <div
            key={`gate-${t.depth}`}
            ref={el => {
              slot(i).gate = el;
            }}
            style={{ visibility: 'hidden' }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-accent/40 will-change-[width,height]"
          />
        ))}
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-8">
        {titles.map((t, i) => {
          // Flat word index across every line, so the stagger runs through the
          // whole block instead of restarting on each line.
          let w = -1;
          return (
            <div
              key={t.depth}
              ref={el => {
                slot(i).block = el;
              }}
              style={{ visibility: 'hidden' }}
              // Sized by its own longest line, not by a ch measure - `ch` here
              // would resolve against the block's inherited 16px, not the
              // display size, and strangle the headline.
              className="col-start-1 row-start-1 w-max max-w-[92vw] origin-center will-change-[transform,opacity,filter]"
            >
              <p className="mb-5 font-roman text-[10px] uppercase tracking-[0.45em] text-accent/40">{t.eyebrow}</p>

              {/* One mask per line. The lines never wrap - the copy's own
                  array decides every break - so the mask is only ever asked to
                  clip vertically, which is all the reveal needs. pb gives
                  descenders room so they aren't shaved off. */}
              {t.lines.map(line => (
                <span
                  key={line}
                  className="block overflow-hidden whitespace-nowrap pb-[0.1em] font-sans text-[clamp(1.75rem,6.2vw,5.5rem)] font-black leading-[0.92] tracking-[-0.04em] text-white"
                >
                  {line.split(' ').map((word, wi, arr) => {
                    w += 1;
                    const at = w;
                    return (
                      <span
                        key={`${line}-${at}`}
                        ref={el => {
                          slot(i).words[at] = el;
                        }}
                        className="inline-block origin-bottom-left will-change-[transform,opacity,filter]"
                      >
                        {word}
                        {/* A real space between words, but none trailing the
                            last one, which would pad the mask's width. */}
                        {wi < arr.length - 1 ? ' ' : ''}
                      </span>
                    );
                  })}
                </span>
              ))}

              {t.note && (
                <p className="mt-6 max-w-[34ch] font-sans text-[15px] leading-relaxed text-accent/55">{t.note}</p>
              )}

              {t.hero && (
                <div
                  ref={el => {
                    slot(i).prompt = el;
                  }}
                  className="mt-10 font-roman text-[11px] uppercase tracking-[0.4em] text-accent/45"
                >
                  {/* The pulse lives on the child: a CSS animation outranks an
                      inline style, so it would fight the per-frame opacity. */}
                  <span className="inline-block motion-safe:animate-prompt-pulse">Hold ↑ to fly</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Telemetry: the same instrument language as the sun's readout, so the
          two worlds feel like one machine. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-10 z-10 hidden w-44 font-roman sm:block"
      >
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.3em] text-accent/40">
          <span>Depth</span>
          <span ref={depthRef} className="text-accent/75">
            00.00
          </span>
        </div>
        <div className="relative mt-3 h-px bg-accent/15">
          <span ref={progressRef} className="absolute inset-0 origin-left bg-accent/60" style={{ transform: 'scaleX(0)' }} />
        </div>
        <div className="mt-3 flex items-baseline justify-between text-[10px] uppercase tracking-[0.3em] text-accent/30">
          <span>Vel</span>
          <span ref={velRef}>0.00</span>
        </div>
      </div>
    </>
  );
}
