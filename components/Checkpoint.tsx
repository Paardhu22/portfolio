'use client';

import { useEffect, useState } from 'react';

export type CheckpointData = {
  lines: string[];
};

type CheckpointProps = {
  checkpoint: CheckpointData | null;
  /** Milliseconds between each line's reveal. */
  stagger?: number;
};

export function Checkpoint({ checkpoint, stagger = 420 }: CheckpointProps) {
  // Hold the last content while fading out, so lines don't vanish mid-transition.
  const [shown, setShown] = useState<CheckpointData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (checkpoint) {
      setShown(checkpoint);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [checkpoint]);

  if (!shown) return null;

  const last = shown.lines.length - 1;

  return (
    <div className="absolute inset-0 z-20 grid place-items-center px-8 pointer-events-none">
      <div className="max-w-[26ch] text-left font-sans text-[clamp(1.5rem,3.6vw,3.25rem)] font-black leading-[0.98] tracking-[-0.035em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.7)]">
        {shown.lines.map((line, i) => (
          // Each line rides in a mask; pb gives descenders room so they don't clip.
          <span key={line} className={`block overflow-hidden pb-[0.14em] ${i > 0 ? 'mt-[0.34em]' : ''}`}>
            <span
              style={{ transitionDelay: `${(visible ? i : last - i) * stagger}ms` }}
              className={`block transition-transform duration-[1100ms] ease-out-expo will-change-transform motion-reduce:transition-none ${
                visible ? 'translate-y-0' : 'translate-y-[115%]'
              }`}
            >
              {line}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
