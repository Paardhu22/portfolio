# Portfolio

A single-page portfolio built with Next.js 16, Tailwind v4 and Motion.
Design is a rebuild of a creative-studio landing page: a panel-wipe intro,
a cursor spotlight that pulls colour out of a desaturated hero, an oversized
display word cropped by the fold, and a slide-down menu panel.

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Making it yours

Almost everything lives in **`lib/content.ts`** — name, headline, bio,
projects, skills, experience, education, socials. Edit that one file and the
whole page follows. Nothing else needs touching for a content swap.

A few things worth doing before you ship:

| What | Where |
| --- | --- |
| Your name, headline, bio | `lib/content.ts` → `profile` |
| Projects (title, summary, tags, links, card colours) | `lib/content.ts` → `projects` |
| Experience + education | `lib/content.ts` → `journey` |
| **Add `public/resume.pdf`** — the hero links to it | `public/` |
| Real social URLs (they're placeholder `#` links now) | `lib/content.ts` → `profile.socials` |

### Colours and type

Design tokens are declared once in `app/globals.css` under `@theme`:

```css
--color-ink: #111111;   /* text */
--color-paper: #e4e4e4; /* hero background */
--color-cream: #f4f1e8; /* light sections */
--color-accent: #75c5de;/* the blue */
--color-deep: #0b0b0b;  /* dark sections */
```

Change `--color-accent` and the whole site re-skins — buttons, menu, badges,
hover states and the hero artwork's blue all read from it.

### The hero artwork

`public/hero-art.svg` is an abstract composition drawn so both hero layers
share identical geometry. To use a photo of yourself instead, drop it in
`public/` and change the two `backgroundImage` URLs in `components/Hero.tsx`
— the greyscale base and the full-colour spotlight layer point at the same
file on purpose.

## How the spotlight works

The reference implementation redrew a canvas gradient every frame and
re-encoded it with `canvas.toDataURL()` to use as a CSS mask — a full
base64 round trip at 60fps.

This version masks a fixed circle once, then moves two elements in opposite
directions: the lens translates to the cursor, the artwork inside it
translates back by the same amount. The image looks pinned to the panel
while only compositor transforms change per frame — no repaint, no
re-encoding. See `components/Hero.tsx`.

## Behaviour notes

- The intro runs once per tab. A pre-paint inline script in
  `components/Splash.tsx` sets `data-splash-seen`, so a reload doesn't
  replay it.
- `prefers-reduced-motion` shortcuts the intro, scroll reveals, marquee and
  spotlight.
- Coarse pointers (touch) skip the spotlight entirely and get the hero art
  in full colour instead.

## Deploy

Push to GitHub and import at [vercel.com/new](https://vercel.com/new) — no
configuration needed. `npm run build` output is fully static.
