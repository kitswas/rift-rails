import { ConduitDeck } from "../game/conduit";
import { GAME_DATA } from "../game/data";
import { DRAG_TAP_THRESHOLD_PX, VECTOR_IDLE_ANGLE } from "../game/config";
import type { Trajectory } from "../game/types";

export const nav = $state({
  choices: [] as Trajectory[],
  activeSlot: -1,
  armedSlot: -1,
  lockSlot: -1,
  angle: VECTOR_IDLE_ANGLE,
  status: "Vector idle",
  armedDial: false,
  solo: false,
});

export function slotCount(choices: Trajectory[] | null | undefined): number {
  return choices && choices.length ? choices.length : 0;
}

export function needleAngle(slot: number, count: number): number {
  if (count <= 1) return 90;
  return slot === 0 ? 305 : 55;
}

export function slotGeometry(
  index: number,
  count: number,
): {
  left: number;
  top: number;
  width: number;
} {
  if (count === 1) return { left: 29, top: 46, width: 42 };
  return index === 0 ? { left: 4, top: 46, width: 42 } : { left: 54, top: 46, width: 42 };
}

function setNeedle(angle: number, status?: string): void {
  const current = nav.angle;
  const delta = ((angle - current + 540) % 360) - 180;
  nav.angle = current + delta;
  if (status) nav.status = status;
}

export function setChoices(choices: Trajectory[]): boolean {
  nav.choices = choices;
  nav.activeSlot = -1;
  nav.armedSlot = -1;
  nav.lockSlot = -1;
  return slotCount(choices) > 0;
}

export function resetNav(): void {
  nav.choices = [];
  nav.activeSlot = -1;
  nav.armedSlot = -1;
  nav.lockSlot = -1;
  nav.angle = VECTOR_IDLE_ANGLE;
  nav.status = "Vector idle";
  nav.armedDial = false;
  nav.solo = false;
}

export function lift(index: number): void {
  nav.activeSlot = index;
}

export function arm(index: number, count: number): void {
  nav.armedSlot = index;
  nav.activeSlot = index;
  setNeedle(needleAngle(index, count), `Vector ${index + 1} - tap again to confirm`);
  nav.armedDial = true;
  nav.solo = count <= 1;
}

export function breach(index: number, count: number): void {
  nav.armedDial = true;
  nav.solo = count <= 1;
  setNeedle(needleAngle(index, count), "Vector breaching");
}

export function lock(index: number): void {
  nav.lockSlot = index;
  nav.activeSlot = index;
  nav.armedSlot = index;
}

export function confirm(index: number, count: number): boolean {
  if (nav.armedSlot !== index) return false;
  lock(index);
  breach(index, count);
  const choice = nav.choices[index];
  if (!choice) return false;
  const committed = ConduitDeck.commitTrajectory(choice);
  const w = window as unknown as {
    Engine?: { finalizeJump: (dimId: string, dimName: string) => void };
  };
  if (w.Engine?.finalizeJump) {
    w.Engine.finalizeJump(committed.dimId, committed.dimName);
  } else {
    void import("../game/engine").then((m) =>
      m.Engine.finalizeJump(committed.dimId, committed.dimName),
    );
  }
  return true;
}

export function setAngle(angle: number, status?: string): void {
  setNeedle(angle, status);
}

export function setSlot(index: number, count: number, armed = false): void {
  if (armed) arm(index, count);
  else {
    nav.armedDial = false;
    nav.solo = count <= 1;
    setNeedle(needleAngle(index, count), `Vector ${index + 1}`);
  }
}

export function angularDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function nearestSlot(angle: number, count: number): number {
  if (count <= 1) return 0;
  let bestSlot = 0;
  let best = Infinity;
  for (let slot = 0; slot < count; slot++) {
    const d = angularDistance(angle, needleAngle(slot, count));
    if (d < best) {
      best = d;
      bestSlot = slot;
    }
  }
  return bestSlot;
}

export const TAP_THRESHOLD = DRAG_TAP_THRESHOLD_PX;
export { GAME_DATA };
