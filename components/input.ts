/**
 * Travel key mapping, shared by GridScan (which moves you) and Controls (which
 * decides when the hint has done its job). Kept in one place so the two can't
 * drift apart.
 */

export type TravelAction = 'forward' | 'back';

// Both the physical position (e.code) and the letter the layout produced (e.key)
// count: `code` keeps W working under Shift and Caps Lock, `key` keeps it working
// on layouts where the W position isn't a 'w'.
const FORWARD = new Set(['ArrowUp', 'KeyW', 'w']);
const BACK = new Set(['ArrowDown', 'KeyS', 's']);

export function travelAction(e: KeyboardEvent): TravelAction | null {
  // Ctrl/Cmd/Alt combos belong to the browser and the OS - Cmd+S is a save, not a brake.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (FORWARD.has(e.code) || FORWARD.has(k)) return 'forward';
  if (BACK.has(e.code) || BACK.has(k)) return 'back';
  return null;
}

/** Arrows scroll the page and need suppressing; letters don't. */
export function scrollsPage(e: KeyboardEvent) {
  return e.key === 'ArrowUp' || e.key === 'ArrowDown';
}

/* -------------------------------------------------------------------------
 * Touch: drag distance is the throttle.
 *
 * There is no good touch equivalent of hold-a-key, and an on-screen d-pad would
 * wreck the look, so the finger becomes a spring-loaded throttle lever: drag up
 * and hold to travel, let go and it returns to idle. Distance sets speed, so
 * the analogue control the keyboard never had comes for free.
 * ---------------------------------------------------------------------- */

/** Slack around the origin, so a tap can't nudge you into motion. */
export const DRAG_DEADZONE = 14;

/**
 * Past this much of the throw, the afterburner lights - a detent, the way a
 * real throttle gates its reheat. Positional rather than a flick: you can hold
 * it, it needs no timing, and it can't misfire on a fast ordinary drag.
 */
export const BOOST_GATE = 0.9;

/** Full throw, in px. Scaled to the viewport but kept within thumb reach. */
export function dragSpan() {
  if (typeof window === 'undefined') return 160;
  return Math.min(240, Math.max(110, window.innerHeight * 0.24));
}

/** Up-positive drag in px -> signed throttle in [-1, 1]. */
export function dragThrottle(dy: number, span: number) {
  const mag = Math.abs(dy);
  if (mag <= DRAG_DEADZONE) return 0;
  // Re-normalised from the edge of the deadzone, so throttle eases off zero
  // instead of jumping to it.
  const t = Math.min(1, (mag - DRAG_DEADZONE) / Math.max(1, span - DRAG_DEADZONE));
  return dy < 0 ? -t : t;
}

/** Throttle -> boost, ramped across the gate rather than latching at it. */
export function dragBoost(throttle: number) {
  const mag = Math.abs(throttle);
  return mag <= BOOST_GATE ? 0 : (mag - BOOST_GATE) / (1 - BOOST_GATE);
}
