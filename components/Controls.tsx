'use client';

import { useEffect, useRef, useState } from 'react';
import { dragSpan, dragThrottle, travelAction } from '@/components/input';

// Rows list their bindings as alternatives: two groups render either side of a
// slash ("either of these"), two caps inside a group render adjacent ("twice").
const KEY_ROWS: { groups: string[][]; label: string }[] = [
  { groups: [['↑'], ['W']], label: 'Move Forward' },
  { groups: [['↓'], ['S']], label: 'Move Back' },
  { groups: [['↑', '↑']], label: 'Double Tap to Speed Up' }
];

const TOUCH_ROWS: { dir: 1 | -1; gate?: boolean; label: string }[] = [
  { dir: 1, label: 'Drag Up to Fly' },
  { dir: -1, label: 'Drag Down to Reverse' },
  { dir: 1, gate: true, label: 'Past the Gate to Boost' }
];

const CAP =
  'grid h-8 w-8 flex-none place-items-center border border-accent/20 bg-accent/[0.03] text-[15px] leading-none text-accent/70 shadow-[0_0_14px_rgba(217,214,222,0.10)]';
const LABEL =
  'text-[12px] uppercase tracking-[0.24em] text-accent/45 [text-shadow:0_0_12px_rgba(217,214,222,0.22)]';

/** A finger on a track, not a key: the glyph should read as a gesture. */
function DragGlyph({ dir, gate }: { dir: 1 | -1; gate?: boolean }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden className="flex-none">
      <g transform={dir === -1 ? 'rotate(180 16 16)' : undefined}>
        <path d="M16 25V8" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
        <path d="M11.5 12L16 7.5L20.5 12" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.25" />
        {gate && <path d="M9.5 15.5H22.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.25" strokeDasharray="2 2" />}
        <circle cx="16" cy="25" r="2.75" fill="currentColor" fillOpacity="0.55" />
      </g>
    </svg>
  );
}

type ControlsProps = {
  /** Cumulative ms of forward travel after which the hint retires itself. */
  dismissAfterMs?: number;
};

export function Controls({ dismissAfterMs = 2000 }: ControlsProps) {
  const [dismissed, setDismissed] = useState(false);
  // null = trust the media query; set once a real input proves which one is used.
  const [mode, setMode] = useState<'keys' | 'touch' | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let held = 0;
    let heldSince: number | null = null;
    let timer: number | null = null;

    // Counted by physical key, so releasing one forward key while another is
    // still down doesn't stop the clock.
    const keysDown = new Set<string>();
    let dragForward = false;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Keyboard and drag both feed one clock: the hint retires on forward travel,
    // whichever way you asked for it.
    const sync = () => {
      const forward = keysDown.size > 0 || dragForward;
      if (forward && heldSince === null) {
        heldSince = performance.now();
        timer = window.setTimeout(() => setDismissed(true), Math.max(0, dismissAfterMs - held));
      } else if (!forward && heldSince !== null) {
        held += performance.now() - heldSince;
        heldSince = null;
        clear();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (travelAction(e) === null) return;
      setMode('keys');
      if (travelAction(e) !== 'forward' || e.repeat) return;
      keysDown.add(e.code);
      sync();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!keysDown.delete(e.code)) return;
      sync();
    };

    let activeId: number | null = null;
    let originY = 0;
    let span = dragSpan();

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || activeId !== null) return;
      setMode('touch');
      activeId = e.pointerId;
      originY = e.clientY;
      span = dragSpan();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      dragForward = dragThrottle(originY - e.clientY, span) > 0;
      sync();
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      dragForward = false;
      sync();
    };

    const onBlur = () => {
      keysDown.clear();
      dragForward = false;
      activeId = null;
      sync();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onBlur);
    return () => {
      clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', onBlur);
    };
  }, [dismissAfterMs]);

  return (
    <div
      ref={root}
      aria-hidden={dismissed}
      data-mode={mode ?? undefined}
      className={`absolute bottom-10 left-10 z-10 font-roman select-none pointer-events-none transition-[opacity,transform,filter] duration-[900ms] ease-out motion-reduce:transition-none ${
        dismissed ? 'translate-y-2 opacity-0 blur-[2px]' : 'translate-y-0 opacity-100 blur-0'
      }`}
    >
      <p className="mb-4 text-[10px] uppercase tracking-[0.45em] text-accent/30">Controls</p>

      <ul className="hint-keys flex-col gap-3">
        {KEY_ROWS.map(({ groups, label }) => (
          <li key={label} className="flex items-center gap-4">
            <span aria-hidden className="flex w-[7rem] items-center gap-2">
              {groups.map((caps, g) => (
                <span key={g} className="flex items-center gap-2">
                  {g > 0 && <span className="text-[11px] leading-none text-accent/25">/</span>}
                  {caps.map((glyph, i) => (
                    <span key={i} className={CAP}>
                      {glyph}
                    </span>
                  ))}
                </span>
              ))}
            </span>
            <span className={LABEL}>{label}</span>
          </li>
        ))}
      </ul>

      <ul className="hint-touch flex-col gap-3">
        {TOUCH_ROWS.map(({ dir, gate, label }) => (
          <li key={label} className="flex items-center gap-4">
            <span aria-hidden className="flex w-[3rem] items-center text-accent/70">
              <DragGlyph dir={dir} gate={gate} />
            </span>
            <span className={LABEL}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
