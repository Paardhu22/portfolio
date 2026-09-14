import { ImageResponse } from 'next/og';

export const alt = 'A wireframe corridor receding into black, with a band of light hanging at a fixed depth';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Same projection as the shader: a corridor 1.0 wide and 0.4 tall at focal
// length 2, so the preview shows the actual geometry rather than a mood board
// of it. Spacing reads as even steps once perspective has divided it.
const DEPTHS = [0.5, 0.62, 0.78, 0.98, 1.24, 1.56, 1.96, 2.5, 3.2, 4.1, 5.3];

// Vanishing point pushed right of centre and above the midline, which opens up
// the lower left for the type instead of stacking them on top of each other.
const VX = size.width * 0.6;
const VY = size.height * 0.42;

const HALF = size.height / 2;
const ringW = (z: number) => (2 * 0.5 * 2 * HALF) / z;
const ringH = (z: number) => (2 * 0.2 * 2 * HALF) / z;

/** Exponential falloff, lifted where the scan ring sits at depth 1.2. */
function tone(z: number) {
  const band = Math.exp(-((z - 1.2) ** 2) / 0.13);
  const a = Math.min(0.95, 0.5 * Math.exp(-z * 0.58) * (1 + 4.2 * band));
  const m = Math.min(1, band * 0.95);
  return {
    a,
    r: Math.round(74 + (217 - 74) * m),
    g: Math.round(66 + (214 - 66) * m),
    b: Math.round(87 + (222 - 87) * m)
  };
}

export default function Image() {
  const nw = ringW(DEPTHS[0]) / 2;
  const nh = ringH(DEPTHS[0]) / 2;
  // The four corner rails, run well past the nearest ring so they leave frame.
  // Satori ignores transformOrigin and rotates about the centre, so each rail is
  // placed by its midpoint rather than pinned at the vanishing point.
  const rails = [
    [nw, nh],
    [-nw, nh],
    [nw, -nh],
    [-nw, -nh]
  ].map(([dx, dy]) => {
    const x = dx * 1.5;
    const y = dy * 1.5;
    const len = Math.hypot(x, y);
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return { len, deg, left: VX + x / 2 - len / 2, top: VY + y / 2 };
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: 'flex',
          position: 'relative',
          background: '#050408'
        }}
      >
        {rails.map(({ len, deg, left, top }) => (
          <div
            key={deg}
            style={{
              position: 'absolute',
              left,
              top,
              width: len,
              height: 1,
              transform: `rotate(${deg}deg)`,
              // Present only in the middle distance. Four rails all meeting at
              // the vanishing point would draw a bright X the shader's thirty-two
              // never produce, so the fade takes both ends and the gradient is
              // symmetric - which also makes the rail's direction irrelevant.
              background:
                'linear-gradient(90deg, rgba(74,66,87,0), rgba(126,120,140,0.34) 34%, rgba(126,120,140,0.34) 66%, rgba(74,66,87,0))'
            }}
          />
        ))}

        {DEPTHS.map(z => {
          const w = ringW(z);
          const h = ringH(z);
          const { a, r, g, b } = tone(z);
          return (
            <div
              key={z}
              style={{
                position: 'absolute',
                left: VX - w / 2,
                top: VY - h / 2,
                width: w,
                height: h,
                border: `1px solid rgba(${r},${g},${b},${a.toFixed(3)})`
              }}
            />
          );
        })}

        {/* Scrim so the type never has to compete with a grid line behind it. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: size.width,
            height: 320,
            background: 'linear-gradient(0deg, #050408 34%, rgba(5,4,8,0))'
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 76,
            bottom: 72,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 9, color: '#6E6879' }}>PORTFOLIO</div>
          <div style={{ marginTop: 18, fontSize: 78, fontWeight: 700, letterSpacing: -2, color: '#D9D6DE' }}>
            Hold forward.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
