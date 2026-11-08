import type { MotionEntry } from "./types";

export interface MotionDeps {
  reducedMotion?: () => boolean;
  now?: () => number;
  requestFrame?: (cb: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

export class RiftMotionService {
  readonly springs = new Set<MotionEntry>();
  raf = 0;
  private readonly reducedMotion: () => boolean;
  private readonly now: () => number;
  private readonly requestFrame: ((cb: (now: number) => void) => number) | undefined;
  private readonly cancelFrame: ((id: number) => void) | undefined;

  constructor(deps: MotionDeps = {}) {
    this.reducedMotion = deps.reducedMotion ?? (() => false);
    this.now = deps.now ?? (() => Date.now());
    this.requestFrame = deps.requestFrame;
    this.cancelFrame = deps.cancelFrame;
  }

  reduced(): boolean {
    return this.reducedMotion();
  }

  add(entry: MotionEntry): void {
    if (this.reduced() || !this.requestFrame) {
      entry.value = entry.target;
      entry.velocity = 0;
      entry.update?.(entry.value, 1);
      entry.active = false;
      return;
    }
    entry.active = true;
    entry.last = this.now();
    this.springs.add(entry);
    if (!this.raf) {
      this.raf = this.requestFrame((t) => this.tick(t));
    }
  }

  remove(entry: MotionEntry): void {
    entry.active = false;
    this.springs.delete(entry);
    if (!this.springs.size && this.raf) {
      this.cancelFrame?.(this.raf);
      this.raf = 0;
    }
  }

  set(entry: MotionEntry | null | undefined, target: number): void {
    if (!entry) return;
    entry.target = target;
    this.add(entry);
  }

  tick(now: number): void {
    let live = 0;
    this.springs.forEach((entry) => {
      const dt = Math.min(1, (now - (entry.last ?? now)) / 1000);
      entry.last = now;
      const pull = (entry.target - entry.value) * (entry.stiffness ?? 180);
      entry.velocity += pull * dt;
      entry.velocity *= Math.exp(-(entry.damping ?? 22) * dt);
      entry.value += entry.velocity * dt;
      entry.update?.(entry.value);
      if (Math.abs(entry.target - entry.value) < 0.01 && Math.abs(entry.velocity) < 0.01) {
        entry.value = entry.target;
        entry.velocity = 0;
        entry.update?.(entry.value, 1);
        entry.active = false;
        this.springs.delete(entry);
      } else {
        live++;
      }
    });
    if (!live || !this.requestFrame) {
      this.cancelFrame?.(this.raf);
      this.raf = 0;
    } else {
      this.raf = this.requestFrame((t) => this.tick(t));
    }
  }
}

export function createMotion(deps: MotionDeps = {}): RiftMotionService {
  return new RiftMotionService(deps);
}
