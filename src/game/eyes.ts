import type { MotionEntry } from "./types";
import { RiftMotion } from "./motion";

function motionEntry(portrait: HTMLElement, property: string): MotionEntry {
  return {
    value: 0,
    target: 0,
    velocity: 0,
    stiffness: 190,
    damping: 20,
    update: (value: number) => portrait.style.setProperty(property, `${value.toFixed(2)}px`),
  };
}

export const RiftEyes = {
  portrait: document.querySelector("#corvus-portrait") as HTMLElement | null,
  x: null as MotionEntry | null,
  y: null as MotionEntry | null,

  start(): void {
    if (!this.portrait) return;
    this.x = motionEntry(this.portrait, "--corvus-eye-x");
    this.y = motionEntry(this.portrait, "--corvus-eye-y");
    const rig = document.getElementById("game-container");
    if (rig) {
      rig.addEventListener("pointermove", this.aim, { passive: true });
      rig.addEventListener("pointerleave", this.center);
      rig.addEventListener("pointercancel", this.center);
      rig.addEventListener("pointerdown", this.aim, { passive: true });
    }
    this.center();
  },

  aim(this: void, event: PointerEvent): void {
    if (!RiftEyes.portrait || !RiftEyes.x || !RiftEyes.y) return;
    if (RiftMotion.reduced()) {
      RiftEyes.center();
      return;
    }
    const rect = RiftEyes.portrait.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const x = Math.max(-10, Math.min(10, dx * 0.1));
    const y = Math.max(-6, Math.min(6, dy * 0.07));
    RiftMotion.set(RiftEyes.x, x);
    RiftMotion.set(RiftEyes.y, y);
  },

  center(this: void): void {
    if (!RiftEyes.portrait || !RiftEyes.x || !RiftEyes.y) return;
    [RiftEyes.x, RiftEyes.y].forEach((entry) => {
      entry.target = 0;
      entry.value = 0;
      entry.velocity = 0;
      entry.update?.(entry.value, 1);
      RiftMotion.springs.delete(entry);
      entry.active = false;
    });
  },
};
