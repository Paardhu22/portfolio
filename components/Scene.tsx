'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Link } from '@/components/Arrival';
import { Checkpoint, type CheckpointData } from '@/components/Checkpoint';
import { Controls } from '@/components/Controls';
import { GridScan } from '@/components/GridScan';
import { SunWorld, type Project } from '@/components/SunWorld';

// depth = tunnel units travelled. 1.33 is where 2s of holding ArrowUp lands you.
const CHECKPOINTS: (CheckpointData & { depth: number })[] = [];

const DEPTHS = CHECKPOINTS.map(c => c.depth);

// One leg is the gap between markers and the run-out after the last one. At the
// base speed of 0.8 units/sec that's ~4s of flying per leg, ~2s boosted - so the
// whole piece is (markers + 1) legs long, and adding a marker lengthens it.
const LEG = 3.2;
const TRAVEL_END = (DEPTHS.length ? DEPTHS[DEPTHS.length - 1] : 0) + LEG;

// TODO: yours. This is the payload the whole flight exists to deliver.
const NAME = 'Paardhu';
const LINE = 'Thanks for flying the whole way. Here is where to find me.';
const LINKS: Link[] = [
  { label: 'Email', href: 'mailto:you@example.com' },
  { label: 'GitHub', href: 'https://github.com/Paardhu22' },
  { label: 'Resume', href: '/resume.pdf' }
];

// TODO: yours. Each one becomes a point of light inside the sun.
const PROJECTS: Project[] = [
  {
    name: 'This Portfolio',
    blurb: 'A site you fly through instead of scroll: a grid corridor that ends inside a 20,000-particle sun.',
    tags: ['Next.js', 'three.js', 'GLSL'],
    links: [{ label: 'GitHub', href: 'https://github.com/Paardhu22' }]
  },
  {
    name: 'Project Two',
    blurb: 'What it is, who it is for, and the one hard problem you solved to make it work.',
    tags: ['Stack', 'Goes', 'Here'],
    links: []
  },
  {
    name: 'Project Three',
    blurb: 'What it is, who it is for, and the one hard problem you solved to make it work.',
    tags: ['Stack', 'Goes', 'Here'],
    links: []
  },
  {
    name: 'Project Four',
    blurb: 'What it is, who it is for, and the one hard problem you solved to make it work.',
    tags: ['Stack', 'Goes', 'Here'],
    links: []
  }
];

// Tunnel -> flash -> sun, and the same in reverse. The flash is the cut: each
// world swaps in only while the screen is fully lit, so neither is ever seen
// popping in or out.
type Phase = 'tunnel' | 'entering' | 'sun' | 'leaving';
const FLASH_IN_MS = 900;
const FLASH_OUT_MS = 1600;

// You plunge into the sun while still moving: the corridor's own arrival eases
// out so gently that coming fully to rest takes well over a minute. Leaving
// re-arms the plunge only once you have reversed past REARM_GAP, so stepping
// out doesn't drop you straight back in.
const ENTER_GAP = 0.6;
const REARM_GAP = 1.2;

export function Scene() {
  const [active, setActive] = useState(-1);
  const [phase, setPhase] = useState<Phase>('tunnel');
  const glowRef = useRef<HTMLDivElement | null>(null);
  const armedRef = useRef(true);

  const onExit = useCallback(() => {
    armedRef.current = false;
    setPhase(p => (p === 'sun' ? 'leaving' : p));
  }, []);

  useEffect(() => {
    if (phase !== 'entering' && phase !== 'leaving') return;
    const t = window.setTimeout(() => setPhase(phase === 'entering' ? 'sun' : 'tunnel'), FLASH_IN_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // The sun waiting at the end of the corridor: a speck at the start, a disc
  // by the end. Written straight to the DOM - it runs every frame.
  const onTravel = useCallback((depth: number) => {
    const gap = TRAVEL_END - depth;
    if (gap > REARM_GAP) armedRef.current = true;
    if (armedRef.current && gap < ENTER_GAP) {
      armedRef.current = false;
      setPhase('entering');
    }

    const el = glowRef.current;
    if (!el) return;
    const p = Math.min(1, Math.max(0, depth / TRAVEL_END));
    el.style.opacity = String(0.2 + 0.8 * p * p);
    el.style.transform = `translate(-50%, -50%) scale(${0.06 + 0.94 * p * p * p})`;
  }, []);

  const inSun = phase === 'sun' || phase === 'leaving';
  const flashing = phase === 'entering' || phase === 'leaving';

  return (
    <>
      {/* glow tuning: anchor = depth of the ring, glow = its width, opacity = its strength */}
      <GridScan
        scanAnchor={1.2}
        scanGlow={0.6}
        scanSoftness={2}
        scanOpacity={0.2}
        checkpointDepths={DEPTHS}
        onCheckpointChange={setActive}
        travelEnd={TRAVEL_END}
        paused={phase === 'sun'}
        onTravel={onTravel}
      />
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-[5] size-[70vmin] rounded-full mix-blend-screen"
        style={{
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.06)',
          background:
            'radial-gradient(circle, #fff8e6 0%, #ffd27a 14%, rgba(255,140,40,0.55) 32%, rgba(255,70,40,0.14) 52%, transparent 70%)'
        }}
      />
      <Controls />
      <Checkpoint checkpoint={CHECKPOINTS[active] ?? null} />
      {inSun && <SunWorld projects={PROJECTS} name={NAME} line={LINE} links={LINKS} onExit={onExit} />}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-50"
        style={{
          opacity: flashing ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: `${flashing ? FLASH_IN_MS : FLASH_OUT_MS}ms`,
          transitionTimingFunction: flashing ? 'cubic-bezier(0.55, 0, 0.8, 0.2)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
          background: 'radial-gradient(circle, #fffaf0 0%, #ffd98a 30%, #ff8a30 65%, #5a1a00 100%)'
        }}
      />
    </>
  );
}
