// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { RiftCouplingBoard } from "./board";
import { RiftMotion } from "./motion";
export const VECTOR_IDLE_ANGLE = 0;

export const RiftVectorDial: any = {
  root: null,
  gauge: null,
  needle: null,
  statusEl: null,
  entry: null,
  dragging: false,
  dragMoved: false,
  downX: 0,
  downY: 0,
  dragStartSlot: -1,

  init() {
    if (this.entry) return;
    this.root = document.querySelector("#nav-vector");
    this.gauge = this.root?.querySelector("svg");
    this.needle = document.querySelector("#rift-vector-needle");
    this.statusEl = document.querySelector("#nav-vector-status");
    this.entry = {
      value: VECTOR_IDLE_ANGLE,
      target: VECTOR_IDLE_ANGLE,
      velocity: 0,
      stiffness: 210,
      damping: 20,
      update: (value) => {
        this.needle?.setAttribute("transform", `rotate(${value.toFixed(2)} 80 80)`);
      },
    };
    this.entry.update(this.entry.value);
    this.root?.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.root?.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.root?.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.root?.addEventListener("pointercancel", () => {
      this.dragging = false;
    });
    this.root?.addEventListener("keydown", (event) => this.keyDown(event));
  },

  set(angle, status) {
    if (!this.entry) this.init();
    if (status && this.statusEl) this.statusEl.textContent = status;
    // Unwrap to the shortest rotation so the needle never sweeps
    // through the empty lower half of the dial.
    const current = this.entry.value;
    const delta = ((angle - current + 540) % 360) - 180;
    RiftMotion.set(this.entry, current + delta);
  },

  setSlot(index, count, armed = false) {
    this.set(
      RiftCouplingBoard.needleAngle(index, count),
      armed ? `Vector ${index + 1} — tap again to confirm` : `Vector ${index + 1}`,
    );
    if (this.root) {
      this.root.dataset.armed = armed ? "true" : "false";
      this.root.dataset.solo = count <= 1 ? "true" : "false";
      this.root.querySelectorAll(".vector-slot").forEach((node) => {
        node.dataset.selected = Number(node.dataset.slot) === index ? "true" : "false";
      });
    }
  },

  breach(index, count) {
    if (!this.entry) this.init();
    if (this.root) {
      this.root.dataset.armed = "true";
      this.root.dataset.solo = count <= 1 ? "true" : "false";
      this.root.querySelectorAll(".vector-slot").forEach((node) => {
        node.dataset.selected = Number(node.dataset.slot) === index ? "true" : "false";
      });
    }
    this.set(RiftCouplingBoard.needleAngle(index, count), "Vector breaching");
  },

  arm(index, count) {
    this.setSlot(index, count, true);
  },

  reset() {
    if (!this.entry) this.init();
    this.root?.removeAttribute("data-armed");
    this.root?.removeAttribute("data-solo");
    this.root?.querySelectorAll(".vector-slot").forEach((node) => {
      node.dataset.selected = "false";
    });
    this.set(VECTOR_IDLE_ANGLE, "Vector idle");
  },

  angle(event) {
    const rect = this.gauge.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return ((degrees % 360) + 360) % 360;
  },

  angularDistance(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  },

  nearestSlot(angle, count) {
    if (count <= 1) return 0;
    let bestSlot = 0;
    let bestDistance = Infinity;
    for (let slot = 0; slot < count; slot++) {
      const distance = this.angularDistance(angle, RiftCouplingBoard.needleAngle(slot, count));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSlot = slot;
      }
    }
    return bestSlot;
  },

  pointerDown(event) {
    const count = RiftCouplingBoard.slotCount(RiftCouplingBoard.choices);
    if (!count || !this.entry) return;
    this.dragging = true;
    this.dragMoved = false;
    this.downX = event.clientX;
    this.downY = event.clientY;
    const startAngle = this.angle(event);
    this.dragStartSlot = this.nearestSlot(startAngle, count);
    this.root.setPointerCapture?.(event.pointerId);
    this.set(startAngle, `Vector ${this.dragStartSlot + 1}`);
  },

  pointerMove(event) {
    if (!this.dragging) return;
    const count = RiftCouplingBoard.slotCount(RiftCouplingBoard.choices);
    if (!count) return;
    // Any real pointer travel cancels tap-to-confirm; only a
    // stationary press-and-release (<= 4px) counts as a tap.
    if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > 4) {
      this.dragMoved = true;
    }
    const angle = this.angle(event);
    const slot = this.nearestSlot(angle, count);
    this.set(angle, `Vector ${slot + 1}`);
    RiftCouplingBoard.lift(slot);
  },

  pointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    const count = RiftCouplingBoard.slotCount(RiftCouplingBoard.choices);
    if (!count) return;
    const slot = this.nearestSlot(this.angle(event), count);
    if (!this.dragMoved && RiftCouplingBoard.armedSlot === slot) {
      RiftCouplingBoard.confirm(slot, count);
    } else {
      RiftCouplingBoard.arm(slot, count);
    }
  },

  keyDown(event) {
    const count = RiftCouplingBoard.slotCount(RiftCouplingBoard.choices);
    if (!count) return;
    let slot = null;
    if (event.key === "ArrowLeft") slot = 0;
    if (event.key === "ArrowRight") slot = Math.min(count - 1, 1);
    if (slot !== null) {
      event.preventDefault();
      RiftCouplingBoard.arm(slot, count);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (RiftCouplingBoard.armedSlot >= 0) {
        RiftCouplingBoard.confirm(RiftCouplingBoard.armedSlot, count);
      } else {
        const target = this.entry?.target ?? VECTOR_IDLE_ANGLE;
        RiftCouplingBoard.arm(this.nearestSlot(target, count), count);
      }
    }
  },
};
