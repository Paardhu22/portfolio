'use client';

import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Link } from '@/components/Arrival';
import { travelAction } from '@/components/input';

export type Project = {
  name: string;
  blurb: string;
  tags: string[];
  links: Link[];
};

type SunWorldProps = {
  projects: Project[];
  name: string;
  line: string;
  links: Link[];
  /** The visitor asked to leave. The parent owns the transition back out. */
  onExit: () => void;
};

/* -------------------------------------------------------------------------
 * The sun: a layered stellar model in particles - fusing core, radiative and
 * convective zones, photosphere, spicules, coronal loops, prominences and
 * solar wind. Parameters are frozen from the tuned simulation.
 * ---------------------------------------------------------------------- */

/** Sun radius seen from outside, and what it swells to when you go in. */
const RADIUS = 47.8;
const RADIUS_INSIDE = 300;
/** The range the original Sun Radius slider covered, for the HUD readout. */
const RADIUS_MIN = 40;
const RADIUS_MAX = 300;
const FUSION = 0.5;
const CONVECT = 0;
const MAGNETIC = 0.12;
const WIND = 0.7;
const LOOPS = 11;

const TAU = Math.PI * 2;

// Where each layer ends, as a fraction of the particle count, core outward.
const BOUNDS = [0.12, 0.32, 0.55, 0.68, 0.78, 0.9, 0.97];

const enum Layer {
  Core,
  Radiative,
  Convective,
  Photosphere,
  Spicule,
  CoronalLoop,
  InnerWind,
  Prominence,
  OuterWind
}

/** World-space particle size; the shader turns it into pixels by distance. */
const PARTICLE_SIZE = 0.42;

/** Overview camera distance: the sun fills about two thirds of the height. */
const OVERVIEW_Z = 100;
/** Inside, the camera sits this far behind the centre - well within the swollen core. */
const INSIDE_OFFSET = 12;

const hash = (i: number, a: number, b: number) => Math.abs(Math.sin(i * a) * b) % 1;

type Control = 'prev' | 'next' | 'back';

/** Keys -> HUD control. Browsing is sideways; backing out is the tunnel's own reverse. */
function keyControl(e: KeyboardEvent): Control | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'Escape' || travelAction(e) === 'back') return 'back';
  if (e.key === 'ArrowRight' || e.code === 'KeyD') return 'next';
  if (e.key === 'ArrowLeft' || e.code === 'KeyA') return 'prev';
  return null;
}

/** A HUD pad: sinks and lights while its key (or the pointer) holds it down. */
const padClass = (down: boolean) =>
  `flex h-full items-center gap-2 px-3 transition-[transform,color,background-color,box-shadow] duration-150 active:scale-90 active:bg-accent/15 focus-visible:text-accent focus-visible:outline-none ${
    down
      ? 'scale-90 bg-accent/15 text-white shadow-[inset_0_0_18px_rgba(217,214,222,0.22)]'
      : 'text-accent/60 hover:text-accent'
  }`;

const capClass = (down: boolean) =>
  `hint-keys inline-flex h-6 min-w-6 items-center justify-center border px-1 font-roman text-[10px] leading-none transition-colors duration-150 ${
    down ? 'border-accent/70 bg-accent/20 text-white' : 'border-accent/20 text-accent/50'
  }`;

type Arc = { e1: number[]; e2: number[]; half: number; lift: number; phase: number };

/** A magnetic arc: a short great-circle segment lifted off the surface. */
function makeArcs(seeds: number[], ref: number[], halfBase: number, halfSpan: number, liftBase: number, liftSpan: number) {
  const arcs: Arc[] = [];
  for (let li = 0; li < LOOPS; li++) {
    const lh1 = hash(li, seeds[0], seeds[1]);
    const lh2 = hash(li, seeds[2], seeds[3]);
    const lh3 = hash(li, seeds[4], seeds[5]);
    const lh4 = hash(li, seeds[6], seeds[7]);
    const cz = lh2 * 2 - 1;
    const sz = Math.sqrt(Math.max(0, 1 - cz * cz));
    const p = [sz * Math.cos(lh1 * TAU), sz * Math.sin(lh1 * TAU), cz];
    const e1 = normalize(cross(ref, p));
    const e2 = normalize(cross(p, e1));
    arcs.push({
      e1,
      e2,
      half: halfBase + lh3 * halfSpan,
      // A fraction of the radius, so arcs scale when the sun swells.
      lift: (liftBase + lh3 * liftSpan) * Math.max(0.1, MAGNETIC),
      phase: lh4 * TAU
    });
  }
  return arcs;
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: number[]) {
  const l = Math.max(Math.hypot(v[0], v[1], v[2]), 1e-5);
  return [v[0] / l, v[1] / l, v[2] / l];
}

const vert = `
uniform float uScale;
uniform float uSizeMul;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vRot;
varying float vFade;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 0.001);
  gl_PointSize = clamp(aSize * uSizeMul * uScale / d, 1.0, 14.0);
  // Anything brushing the lens dissolves instead of filling the screen.
  vFade = smoothstep(2.0, 16.0, d);
  vColor = aColor;
  vRot = aSeed * 6.2831853;
  gl_Position = projectionMatrix * mv;
}
`;

// Each point is drawn as a small spun triangle, so the swarm reads as shards
// of light rather than round dots.
const frag = `
varying vec3 vColor;
varying float vRot;
varying float vFade;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p;
  const float k = 1.7320508;
  const float r = 0.78;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  float dist = -length(p) * sign(p.y);
  float a = 1.0 - smoothstep(-0.06, 0.06, dist);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a * vFade, 1.0);
}
`;

export function SunWorld({ projects, name, line, links, onExit }: SunWorldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const markerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const radiusValueRef = useRef<HTMLSpanElement | null>(null);
  const radiusFillRef = useRef<HTMLSpanElement | null>(null);
  const radiusKnobRef = useRef<HTMLSpanElement | null>(null);

  // -1 is the overview: the whole sun, and who made it. 0.. are the projects.
  const [index, setIndex] = useState(-1);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Which on-screen control a key is driving right now, so the HUD buttons
  // press in under your fingers the way a game's would.
  const [pressed, setPressed] = useState<Control | null>(null);
  // Direction of the last step, so the title slides in from the side you moved.
  const [dir, setDir] = useState(1);

  const total = projects.length + 1;
  const step = (d: number) => {
    setDir(d);
    setIndex(i => ((((i + 1 + d) % total) + total) % total) - 1);
  };

  useEffect(() => {
    const container = containerRef.current;
    const host = canvasHostRef.current;
    if (!container || !host) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const count = window.innerWidth < 768 ? 12000 : 20000;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.1, 3000);

    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uSizeMul: { value: 1 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    /* ---- Sun particles: everything static is worked out once, here. ---- */

    const hs = new Float32Array(count * 5);
    const layers = new Uint8Array(count);
    // Arc particles only: unit direction, then [bulge, lift, phase].
    const arcDir = new Float32Array(count * 3);
    const arcAux = new Float32Array(count * 3);

    const coronal = makeArcs([17.17, 6543.21, 29.71, 7654.32, 53.13, 8765.43, 71.91, 9876.54], [0, 1, 0.15], 0.2, 0.35, 0.1, 0.15);
    const prominences = makeArcs([21.31, 5432.19, 37.77, 6321.98, 59.59, 7219.87, 83.13, 8123.65], [0.15, 0, 1], 0.3, 0.5, 0.2, 0.3);

    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const sizes = new Float32Array(count).fill(PARTICLE_SIZE);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const h1 = hash(i, 12.9898, 43758.5453);
      const h5 = hash(i, 61.431, 31415.9265);
      hs.set([h1, hash(i, 78.233, 12543.123), hash(i, 45.164, 98765.432), hash(i, 33.719, 54321.987), h5], i * 5);
      seeds[i] = hash(i, 19.841, 27182.8182);

      const t = i / count;
      let layer = BOUNDS.findIndex(b => t < b);
      if (layer === -1) layer = Layer.OuterWind;
      else if (layer === 5) layer = h5 < 0.5 ? Layer.CoronalLoop : Layer.InnerWind;
      else if (layer === 6) layer = Layer.Prominence;
      layers[i] = layer;

      if (layer === Layer.CoronalLoop || layer === Layer.Prominence) {
        const arc = (layer === Layer.CoronalLoop ? coronal : prominences)[i % LOOPS];
        const alpha = (h1 - 0.5) * arc.half * 2;
        const ca = Math.cos(alpha);
        const sa = Math.sin(alpha);
        const d = normalize([arc.e1[0] * ca + arc.e2[0] * sa, arc.e1[1] * ca + arc.e2[1] * sa, arc.e1[2] * ca + arc.e2[2] * sa]);
        arcDir.set(d, i * 3);
        arcAux.set([Math.cos((h1 - 0.5) * Math.PI), arc.lift, arc.phase], i * 3);
      }

      // Start scattered: the sun condenses around you as you arrive.
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }

    const sunGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(cols, 3).setUsage(THREE.DynamicDrawUsage);
    sunGeo.setAttribute('position', posAttr);
    sunGeo.setAttribute('aColor', colAttr);
    sunGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    sunGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const sun = new THREE.Points(sunGeo, material);
    sun.frustumCulled = false;
    scene.add(sun);

    /* ---- Background stars: cold blue shards, far off. ---- */

    const STARS = 1600;
    const starPos = new Float32Array(STARS * 3);
    const starCol = new Float32Array(STARS * 3);
    const starSize = new Float32Array(STARS);
    const starSeed = new Float32Array(STARS);
    const starTint = new THREE.Color('#a8d2ff');
    for (let i = 0; i < STARS; i++) {
      const cz = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const sz = Math.sqrt(1 - cz * cz);
      const r = 300 + Math.random() * 600;
      starPos.set([r * sz * Math.cos(th), r * sz * Math.sin(th), r * cz], i * 3);
      const b = 0.25 + Math.random() * 0.55;
      starCol.set([starTint.r * b, starTint.g * b, starTint.b * b], i * 3);
      starSize[i] = 1.2 + Math.pow(Math.random(), 4) * 5;
      starSeed[i] = Math.random();
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
    // Own material: stars keep their size while the sun's shards grow.
    const starMaterial = material.clone();
    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    /* ---- Post: bloom is what turns 20k shards into a star. ---- */

    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({ intensity: 1.5, luminanceThreshold: 0.05, luminanceSmoothing: 0.4, mipmapBlur: true, radius: 0.65 });
    composer.addPass(new EffectPass(camera, bloom));

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Pixels per world unit at distance 1, in drawing-buffer pixels.
      const scale = (h * renderer.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      material.uniforms.uScale.value = scale;
      starMaterial.uniforms.uScale.value = scale;
    };
    onResize();
    window.addEventListener('resize', onResize);

    const look = new THREE.Vector2();
    const lookTarget = new THREE.Vector2();
    const onPointerMove = (e: PointerEvent) => {
      if (reduceMotion || e.pointerType !== 'mouse') return;
      lookTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener('pointermove', onPointerMove);

    // Projects ride a tilted ring inside the convective zone, so they are
    // always seen through the sun and reached by diving into it.
    const TILT = 0.7;
    const nodes = projects.map((_, k) => {
      const a = (k / Math.max(1, projects.length)) * TAU + 0.6;
      const r = RADIUS / 2;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * Math.cos(TILT), Math.sin(a) * r * Math.sin(TILT));
    });
    const nodeWorld = nodes.map(() => new THREE.Vector3());

    const col = new THREE.Color();
    const camPos = new THREE.Vector3(0, 0, reduceMotion ? OVERVIEW_Z : 4);
    // The view is damped as a direction, not a target point: swinging between
    // projects from inside the core would otherwise drag the look-at point
    // through the camera and flip the view.
    const camDir = new THREE.Vector3(0, 0, -1);
    const wantPos = new THREE.Vector3();
    const wantDir = new THREE.Vector3();
    let radius = RADIUS;
    let shownRadius = '';
    const ndc = new THREE.Vector3();

    const update = (time: number, k: number, R: number) => {
      const SRGB = THREE.SRGBColorSpace;
      const ang = time * 0.03;
      const rc = Math.cos(ang);
      const rs = Math.sin(ang);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const i5 = i * 5;
        const h1 = hs[i5];
        const h2 = hs[i5 + 1];
        const h3 = hs[i5 + 2];
        const h4 = hs[i5 + 3];
        const h5 = hs[i5 + 4];

        let px = 0;
        let py = 0;
        let pz = 0;
        let rad = 0;
        let theta = h1 * TAU;
        let cz = h2 * 2 - 1;
        let onArc = false;

        switch (layers[i]) {
          case Layer.Core: {
            const coreR = R *0.22;
            rad = Math.cbrt(Math.max(h3, 1e-4)) * coreR + Math.sin(time * 3 + h4 * TAU) * coreR * 0.03;
            const burst = Math.pow(0.5 + 0.5 * Math.sin(time * FUSION * 4 + h5 * 18.85), 6);
            col.setHSL(Math.max(0, 0.14 - burst * 0.05), 1, Math.min(0.95, 0.55 + (0.5 + 0.5 * burst) * 0.4), SRGB);
            break;
          }
          case Layer.Radiative: {
            rad = R *(0.22 + h1 * 0.24) + Math.sin(time * 0.08 + h4 * TAU) * R *0.02;
            theta = h2 * TAU + Math.sin(time * 0.03 + h3 * TAU) * 0.3;
            cz = h3 * 2 - 1;
            col.setHSL(0.06, 0.9, 0.25 + h5 * 0.1, SRGB);
            break;
          }
          case Layer.Convective: {
            theta = h2 * TAU;
            cz = h3 * 2 - 1;
            const cell =
              Math.sin(theta * 6 + time * CONVECT * 0.5) +
              Math.sin(cz * 18 + time * CONVECT * 0.4 + h4 * TAU) +
              Math.sin((theta + cz) * 12 - time * CONVECT * 0.6);
            const flow = cell * CONVECT * R *0.015;
            rad = R *(0.46 + h1 * 0.26) + flow;
            theta += flow * 0.01;
            const heat = (cell + 3) / 6;
            col.setHSL(Math.max(0, 0.08 - heat * 0.02), 1, 0.3 + heat * 0.35, SRGB);
            break;
          }
          case Layer.Photosphere: {
            const granule =
              Math.sin(theta * 24 + time * 0.6) + Math.sin(cz * 30 - time * 0.5 + h3 * TAU) + Math.sin(theta * 17 + cz * 13 + time * 0.4);
            const spot = Math.sin(theta * 3 + h4 * TAU) + Math.sin(cz * 4 + time * 0.05);
            const dark = Math.max(0, -spot - 1.1) * 0.8;
            rad = R *0.76 + granule * R *0.004;
            col.setHSL(0.13, 0.9, Math.max(0.08, Math.min(0.85, 0.6 + granule * 0.1 - dark)), SRGB);
            break;
          }
          case Layer.Spicule: {
            const len = R *0.05;
            const sp = Math.abs(Math.sin(time * 2 + h3 * 18.85)) * len;
            rad = R *0.79 + sp;
            col.setHSL(0.98, 0.85, 0.35 + (sp / len) * 0.25, SRGB);
            break;
          }
          case Layer.CoronalLoop: {
            const bulge = arcAux[i3];
            const pulse = 0.6 + 0.4 * Math.sin(time * 0.4 * MAGNETIC + arcAux[i3 + 2]);
            const r = R * (0.8 + arcAux[i3 + 1] * pulse * bulge);
            px = arcDir[i3] * r;
            py = arcDir[i3 + 1] * r;
            pz = arcDir[i3 + 2] * r;
            col.setHSL(0.55, 0.3, 0.45 + bulge * 0.3, SRGB);
            onArc = true;
            break;
          }
          case Layer.Prominence: {
            const bulge = arcAux[i3];
            const pulse = 0.5 + 0.5 * Math.sin(time * 0.5 * MAGNETIC + arcAux[i3 + 2]);
            const r = R * (0.79 + arcAux[i3 + 1] * pulse * bulge);
            px = arcDir[i3] * r;
            py = arcDir[i3 + 1] * r;
            pz = arcDir[i3 + 2] * r;
            col.setHSL(Math.max(0, 0.05 - pulse * 0.02), 0.95, 0.4 + pulse * 0.3 + bulge * 0.1, SRGB);
            onArc = true;
            break;
          }
          case Layer.InnerWind: {
            const travel = (time * WIND * 0.6 + h3 * 18) % 18;
            rad = R *0.82 + travel * R *0.05;
            col.setHSL(0.58, 0.4, 0.15 + Math.max(0, 1 - travel / 18) * 0.5, SRGB);
            break;
          }
          default: {
            const travel = (time * WIND * 1.1 + h3 * 70) % 70;
            rad = R *0.95 + travel * R *0.045;
            col.setHSL(0.6, 0.35, 0.1 + Math.max(0, 1 - travel / 70) * 0.4, SRGB);
          }
        }

        if (!onArc) {
          const sphi = Math.sqrt(Math.max(0, 1 - cz * cz));
          px = rad * sphi * Math.cos(theta);
          py = rad * sphi * Math.sin(theta);
          pz = rad * cz;
        }

        const fx = px * rc - py * rs;
        const fy = px * rs + py * rc;
        pos[i3] += (fx - pos[i3]) * k;
        pos[i3 + 1] += (fy - pos[i3 + 1]) * k;
        pos[i3 + 2] += (pz - pos[i3 + 2]) * k;
        cols[i3] = col.r;
        cols[i3 + 1] = col.g;
        cols[i3 + 2] = col.b;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Projects ride the swell too, so they stay at the same depth in the sun.
      const g = R / RADIUS;
      for (let n = 0; n < nodes.length; n++) {
        const v = nodes[n];
        nodeWorld[n].set((v.x * rc - v.y * rs) * g, (v.x * rs + v.y * rc) * g, v.z * g);
      }
    };

    const start = performance.now();
    let last = start;
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const time = (now - start) / 1000;

      // Intro: you come out of the core as the sun condenses around you.
      const intro = reduceMotion ? 1 : Math.min(1, time / 3.6);
      const eased = 1 - Math.pow(1 - intro, 3);
      const settle = 1 - Math.exp(-dt * THREE.MathUtils.lerp(1.4, 6, intro));
      const focused = indexRef.current;
      const inside = focused >= 0 && focused < nodes.length;

      // Going in: the sun itself swells past the camera until you sit inside
      // its core, and shrinks back away from you on the way out. Eased in log
      // space so every doubling of the radius takes the same time.
      const wantR = inside ? RADIUS_INSIDE : RADIUS;
      radius = reduceMotion ? wantR : Math.exp(THREE.MathUtils.lerp(Math.log(radius), Math.log(wantR), 1 - Math.exp(-dt * 1.4)));
      update(time, reduceMotion ? 1 : settle, radius);
      // Shards spread apart as the sun swells; grow them partway so it stays dense.
      material.uniforms.uSizeMul.value = Math.sqrt(radius / RADIUS);

      look.lerp(lookTarget, 1 - Math.exp(-dt * 3));
      if (inside) {
        // Just behind the centre, looking out through the core at the project.
        wantDir.copy(nodeWorld[focused]).normalize();
        wantPos.copy(wantDir).multiplyScalar(-INSIDE_OFFSET);
        wantPos.x += look.x * 3;
        wantPos.y += look.y * 2;
      } else {
        wantPos.set(look.x * 10, look.y * 6, THREE.MathUtils.lerp(4, OVERVIEW_Z, eased));
        wantDir.copy(wantPos).negate().normalize();
      }
      const follow = intro < 1 && !inside ? 1 : 1 - Math.exp(-dt * 2.2);
      camPos.lerp(wantPos, follow);
      camDir.lerp(wantDir, follow).normalize();
      camera.position.copy(camPos);
      camera.lookAt(ndc.copy(camPos).add(camDir));

      // Inside the core there is light on every side; ease the glow off so the
      // project stays legible.
      bloom.intensity += ((inside ? 0.8 : 1.5) - bloom.intensity) * (1 - Math.exp(-dt * 2));

      const label = radius.toFixed(2);
      if (label !== shownRadius) {
        shownRadius = label;
        const frac = THREE.MathUtils.clamp((radius - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN), 0, 1);
        if (radiusValueRef.current) radiusValueRef.current.textContent = label;
        if (radiusFillRef.current) radiusFillRef.current.style.transform = `scaleX(${frac})`;
        if (radiusKnobRef.current) radiusKnobRef.current.style.left = `${frac * 100}%`;
      }

      stars.rotation.y += dt * 0.004;

      const w = host.clientWidth;
      const h = host.clientHeight;
      const reveal = Math.max(0, Math.min(1, (intro - 0.55) / 0.45));
      for (let n = 0; n < nodes.length; n++) {
        const el = markerRefs.current[n];
        if (!el) continue;
        ndc.copy(nodeWorld[n]).project(camera);
        const behind = ndc.z > 1;
        const x = (ndc.x * 0.5 + 0.5) * w;
        const y = (-ndc.y * 0.5 + 0.5) * h;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-6px, -50%)`;
        const dim = focused === n ? 1 : focused < 0 ? 0.9 : 0.35;
        el.style.opacity = behind ? '0' : String(dim * reveal);
        el.style.visibility = behind || reveal === 0 ? 'hidden' : 'visible';
      }

      composer.render(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      sunGeo.dispose();
      starGeo.dispose();
      material.dispose();
      starMaterial.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    };
  }, [projects]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const control = keyControl(e);
      if (!control) return;
      e.preventDefault();
      setPressed(control);
      // One step per press: auto-repeat would spin the camera past everything.
      if (e.repeat) return;
      if (control === 'back') onExit();
      else step(control === 'next' ? 1 : -1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const control = keyControl(e);
      setPressed(p => (p === control ? null : p));
    };
    const onBlur = () => setPressed(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  });

  // A horizontal swipe browses; taps fall through to the buttons.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y)) step(dx < 0 ? 1 : -1);
  };

  const project = index >= 0 ? projects[index] : null;
  const panelLinks = project ? project.links : links;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className="absolute inset-0 z-30 overflow-hidden bg-black touch-none select-none"
    >
      <div ref={canvasHostRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0">
        {projects.map((p, k) => (
          <button
            key={p.name}
            ref={el => {
              markerRefs.current[k] = el;
            }}
            type="button"
            onClick={() => setIndex(k)}
            aria-label={`Open ${p.name}`}
            style={{ visibility: 'hidden' }}
            className="group pointer-events-auto absolute left-0 top-0 flex items-center gap-3 py-2 pr-2 will-change-transform focus-visible:outline-none"
          >
            <span
              className={`size-3 rotate-45 border transition-colors duration-500 ${
                index === k
                  ? 'border-white bg-white/70 shadow-[0_0_22px_6px_rgba(255,200,110,0.75)]'
                  : 'border-[#ffe3a8] bg-[#ffe3a8]/15 shadow-[0_0_16px_3px_rgba(255,170,70,0.5)] group-hover:bg-[#ffe3a8]/50'
              }`}
            />
            <span className="whitespace-nowrap font-roman text-[10px] uppercase tracking-[0.3em] text-white/85 [text-shadow:0_0_12px_rgba(0,0,0,1)] group-focus-visible:underline">
              {p.name}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onExit}
        className={`absolute left-4 top-4 flex h-10 items-center gap-3 border bg-black/40 px-4 font-roman text-[10px] uppercase tracking-[0.3em] backdrop-blur-sm transition-[transform,color,border-color,box-shadow] duration-150 active:scale-95 focus-visible:border-accent/60 focus-visible:text-accent focus-visible:outline-none sm:left-8 sm:top-8 ${
          pressed === 'back'
            ? 'scale-95 border-accent/60 text-white shadow-[0_0_24px_rgba(217,214,222,0.25)]'
            : 'border-accent/20 text-accent/70 hover:border-accent/45 hover:text-accent'
        }`}
      >
        <span aria-hidden>←</span> Back to tunnel
        <span aria-hidden className="hidden text-accent/35 sm:inline">Esc</span>
      </button>

      {/* Live readout of the one control that moves: the radius, swelling as you go in. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-8 top-8 hidden w-60 border border-accent/15 bg-black/45 px-4 pb-4 pt-3 backdrop-blur-sm sm:block"
      >
        <p className="font-roman text-[9px] uppercase tracking-[0.4em] text-accent/35">Simulation</p>
        <div className="mt-3 flex items-baseline justify-between font-roman text-[10px] uppercase tracking-[0.24em] text-accent/70">
          <span>Sun Radius</span>
          <span ref={radiusValueRef} className="text-accent">
            {RADIUS.toFixed(2)}
          </span>
        </div>
        <div className="relative mt-3 h-px bg-accent/15">
          <span
            ref={radiusFillRef}
            className="absolute inset-0 origin-left bg-accent/70"
            style={{ transform: `scaleX(${(RADIUS - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)})` }}
          />
          <span
            ref={radiusKnobRef}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-accent bg-black shadow-[0_0_10px_rgba(217,214,222,0.5)]"
            style={{ left: `${((RADIUS - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100}%` }}
          />
        </div>
      </div>

      <section
        aria-live="polite"
        className="absolute inset-x-4 bottom-24 border border-accent/15 bg-black/55 p-6 backdrop-blur-md sm:inset-x-auto sm:right-8 sm:w-[24rem] xl:bottom-8"
      >
        <div key={index} className="animate-rise-in motion-reduce:animate-none">
          <p className="font-roman text-[10px] uppercase tracking-[0.45em] text-accent/35">
            {project
              ? `Project ${String(index + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`
              : 'Inside the sun'}
          </p>
          <h2 className="mt-3 font-sans text-[clamp(1.5rem,3vw,2.25rem)] font-black leading-[0.95] tracking-[-0.03em] text-white">
            {project ? project.name : name}
          </h2>
          <p className="mt-3 font-sans text-[14px] leading-relaxed text-accent/60">{project ? project.blurb : line}</p>

          {project && project.tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {project.tags.map(tag => (
                <li key={tag} className="border border-accent/10 px-2 py-1 font-roman text-[9px] uppercase tracking-[0.24em] text-accent/50">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          {panelLinks.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-3">
              {panelLinks.map(({ label, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noreferrer' : undefined}
                    className="inline-flex h-10 items-center border border-accent/20 bg-accent/[0.03] px-5 font-roman text-[11px] uppercase tracking-[0.24em] text-accent/70 transition-colors duration-300 hover:border-accent/45 hover:text-accent focus-visible:border-accent/60 focus-visible:text-accent focus-visible:outline-none"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {!project && (
            <p className="mt-6 font-roman text-[10px] uppercase tracking-[0.24em] text-accent/30">
              Pick a light inside the sun · ← → or swipe
            </p>
          )}
        </div>
      </section>

      <nav
        aria-label="Projects"
        className="absolute bottom-6 left-1/2 flex h-12 -translate-x-1/2 items-center border border-accent/15 bg-black/55 backdrop-blur-md xl:bottom-8"
      >
        <button type="button" onClick={() => step(-1)} aria-label="Previous" className={padClass(pressed === 'prev')}>
          <span aria-hidden className={capClass(pressed === 'prev')}>
            A
          </span>
          <span aria-hidden className="text-[15px] leading-none">
            ←
          </span>
        </button>
        <span className="min-w-[11rem] overflow-hidden px-2 text-center">
          <span
            key={index}
            className={`block whitespace-nowrap font-roman text-[11px] uppercase tracking-[0.3em] text-accent/85 motion-reduce:animate-none ${
              dir > 0 ? 'animate-slide-in-right' : 'animate-slide-in-left'
            }`}
          >
            {project ? project.name : 'The Sun'}
          </span>
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next" className={padClass(pressed === 'next')}>
          <span aria-hidden className="text-[15px] leading-none">
            →
          </span>
          <span aria-hidden className={capClass(pressed === 'next')}>
            D
          </span>
        </button>
      </nav>
    </div>
  );
}
