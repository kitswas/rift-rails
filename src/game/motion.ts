import type { MotionEntry } from "./types";

export const RiftReducedMotion: MediaQueryList = matchMedia("(prefers-reduced-motion: reduce)");

export const RiftMotion = {
  springs: new Set<MotionEntry>(),
  raf: 0,
  reduced: (): boolean => RiftReducedMotion.matches,
  add(entry: MotionEntry): void {
    if (RiftMotion.reduced()) {
      entry.value = entry.target;
      entry.velocity = 0;
      entry.update?.(entry.value, 1);
      entry.active = false;
      return;
    }
    entry.active = true;
    entry.last = performance.now();
    RiftMotion.springs.add(entry);
    if (!RiftMotion.raf) {
      RiftMotion.raf = requestAnimationFrame((now) => RiftMotion.tick(now));
    }
  },
  remove(entry: MotionEntry): void {
    entry.active = false;
    RiftMotion.springs.delete(entry);
    if (!RiftMotion.springs.size && RiftMotion.raf) {
      cancelAnimationFrame(RiftMotion.raf);
      RiftMotion.raf = 0;
    }
  },
  set(entry: MotionEntry | null | undefined, target: number): void {
    if (!entry) return;
    entry.target = target;
    RiftMotion.add(entry);
  },
  tick(now: number): void {
    let live = 0;
    RiftMotion.springs.forEach((entry) => {
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
        RiftMotion.springs.delete(entry);
      } else {
        live++;
      }
    });
    if (!live) {
      cancelAnimationFrame(RiftMotion.raf);
      RiftMotion.raf = 0;
    } else {
      RiftMotion.raf = requestAnimationFrame((now) => RiftMotion.tick(now));
    }
  },
};
