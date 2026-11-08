import type { MotionEntry } from "./types";
import { RiftMotionService } from "./motion";

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

export interface EyesDeps {
  motion: RiftMotionService;
}

export class RiftEyesService {
  portrait: HTMLElement | null = null;
  x: MotionEntry | null = null;
  y: MotionEntry | null = null;
  private rig: HTMLElement | null = null;
  private readonly motion: RiftMotionService;

  constructor(deps: EyesDeps) {
    this.motion = deps.motion;
  }

  bindPortrait(el: HTMLElement | null): void {
    this.portrait = el;
  }

  bindRig(el: HTMLElement | null): void {
    this.rig = el;
  }

  start(): void {
    if (!this.portrait) return;
    this.x = motionEntry(this.portrait, "--corvus-eye-x");
    this.y = motionEntry(this.portrait, "--corvus-eye-y");
    const rig = this.rig;
    if (rig) {
      rig.addEventListener("pointermove", (e) => this.aim(e), { passive: true });
      rig.addEventListener("pointerleave", () => this.center());
      rig.addEventListener("pointercancel", () => this.center());
      rig.addEventListener("pointerdown", (e) => this.aim(e), { passive: true });
    }
    this.center();
  }

  aim(event: PointerEvent): void {
    if (!this.portrait || !this.x || !this.y) return;
    if (this.motion.reduced()) {
      this.center();
      return;
    }
    const rect = this.portrait.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const x = Math.max(-10, Math.min(10, dx * 0.1));
    const y = Math.max(-6, Math.min(6, dy * 0.07));
    this.motion.set(this.x, x);
    this.motion.set(this.y, y);
  }

  center(): void {
    if (!this.portrait || !this.x || !this.y) return;
    [this.x, this.y].forEach((entry) => {
      entry.target = 0;
      entry.value = 0;
      entry.velocity = 0;
      entry.update?.(entry.value, 1);
      this.motion.springs.delete(entry);
      entry.active = false;
    });
  }
}

export function createEyes(deps: EyesDeps): RiftEyesService {
  return new RiftEyesService(deps);
}
