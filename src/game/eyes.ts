// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { RiftMotion } from "./motion";
export const RiftEyes: any = {
  portrait: document.querySelector("#corvus-portrait"),
  x: null,
  y: null,

  start() {
    if (!this.portrait) return;
    this.x = {
      value: 0,
      target: 0,
      velocity: 0,
      stiffness: 190,
      damping: 20,
      update: (value) => this.portrait.style.setProperty("--corvus-eye-x", `${value.toFixed(2)}px`),
    };
    this.y = {
      value: 0,
      target: 0,
      velocity: 0,
      stiffness: 190,
      damping: 20,
      update: (value) => this.portrait.style.setProperty("--corvus-eye-y", `${value.toFixed(2)}px`),
    };
    const rig = document.getElementById("game-container");
    if (rig) {
      rig.addEventListener("pointermove", this.aim, { passive: true });
      rig.addEventListener("pointerleave", this.center);
      rig.addEventListener("pointercancel", this.center);
      rig.addEventListener("pointerdown", this.aim, { passive: true });
    }
    this.center();
  },

  aim(event) {
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

  center() {
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
