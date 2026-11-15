// Nav module: the voyage-vector dial and carriage selection state machine.
import { GAME_DATA } from "../game/data";
import type { RiftMotionService } from "../game/motion";
import type { ConduitDeck } from "../game/conduit";
import type { Registry } from "../game/registry";
import type { MotionEntry, Trajectory } from "../game/types";
import { el } from "./dom";

export function needleAngle(slot: number, count: number): number {
  if (count <= 1) return 90;
  return slot === 0 ? 305 : 55;
}

export function nearestSlot(angle: number, count: number): number {
  if (count <= 1) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let slot = 0; slot < count; slot++) {
    const d = Math.abs(((angle - needleAngle(slot, count) + 540) % 360) - 180);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

export interface NavDeps {
  motion: Pick<RiftMotionService, "set">;
  conduit: Pick<ConduitDeck, "commitTrajectory">;
  /** Called after a confirmed selection with the committed dimension. */
  finalizeJump: (dimId: string, dimName: string) => void;
  registry: Pick<Registry, "getNode">;
}

export interface NavModule {
  setChoices(choices: Trajectory[]): void;
  resetNav(): void;
  /** Wires pointer, click and keyboard handlers onto the dial element. */
  bindDial(dial: HTMLElement): void;
  /** Reset armed/locked state when reduced-motion preference changes. */
  handleReducedMotionChange(): void;
}

export function createNav(deps: NavDeps): NavModule {
  const { motion, conduit, finalizeJump, registry } = deps;
  let navChoices: Trajectory[] = [];
  let armedSlot = -1;
  let lockSlot = -1;
  let vectorDragging = false;
  let vectorDragMoved = false;
  let vectorDownX = 0;
  let vectorDownY = 0;
  let suppressVectorClick = false;

  let needleEntry: MotionEntry | null = null;
  function getNeedleEntry(): MotionEntry {
    if (!needleEntry) {
      needleEntry = {
        value: 0,
        target: 0,
        velocity: 0,
        stiffness: 210,
        damping: 20,
        update: (value) => {
          el("rift-vector-needle")?.setAttribute("transform", `rotate(${value.toFixed(2)} 80 80)`);
        },
      };
      needleEntry.update?.(0);
    }
    return needleEntry;
  }
  function setNeedle(angle: number): void {
    const entry = getNeedleEntry();
    // Unwrap to the shortest rotation so the needle never sweeps
    // through the empty lower half of the dial.
    const delta = ((angle - entry.value + 540) % 360) - 180;
    motion.set(entry, entry.value + delta);
  }

  function buildRailSvg(count: number): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "nav-board-svg");
    svg.setAttribute("viewBox", "0 0 1000 360");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
            <g class="board-frame">
              <rect x="18" y="18" width="964" height="324"/>
              <path d="M18 18 H982"/>
              <path d="M18 278 H982"/>
            </g>
            <g class="board-rail">
              <path class="board-rail-back" d="M40 278H960"/>
              <path class="board-rail-base" d="M80 278H920"/>
              <g class="board-sleepers">${Array.from(
                { length: 22 },
                (_, i) => `<path d="M${90 + i * 38} 271V285"/>`,
              ).join("")}</g>
              <path class="board-rail-notch" d="M220 278H300"/>
              <path class="board-rail-notch" d="M500 278H700"/>
              <path class="board-rail-notch" d="M860 278H880"/>
            </g>
            <g class="board-coupler" data-slot="0">
              ${
                count === 1
                  ? `<path class="board-leader board-leader-outer" d="M500 142 C494 190, 506 230, 500 266"/>
                     <path class="board-leader board-leader-inner" d="M500 142 C494 190, 506 230, 500 266"/>
                     <rect class="board-port" x="494" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="497" y="139" width="6" height="6"/>
                     <rect class="board-port" x="494" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="497" y="275" width="6" height="6"/>`
                  : `<path class="board-leader board-leader-outer" d="M250 142 C250 210, 380 212, 450 266"/>
                     <path class="board-leader board-leader-inner" d="M250 142 C250 210, 380 212, 450 266"/>
                     <rect class="board-port" x="244" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="247" y="139" width="6" height="6"/>
                     <rect class="board-port" x="448" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="451" y="275" width="6" height="6"/>`
              }
            </g>
            ${
              count === 1
                ? ""
                : `<g class="board-coupler" data-slot="1">
                     <path class="board-leader board-leader-outer" d="M750 142 C750 210, 620 212, 550 266"/>
                     <path class="board-leader board-leader-inner" d="M750 142 C750 210, 620 212, 550 266"/>
                     <rect class="board-port" x="744" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="747" y="139" width="6" height="6"/>
                     <rect class="board-port" x="540" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="543" y="275" width="6" height="6"/>
                   </g>`
            }
            <g class="board-hub">
              <circle cx="500" cy="278" r="46"/>
              <circle cx="500" cy="278" r="36"/>
              <circle cx="500" cy="278" r="14"/>
              <path d="M442 278H452"/>
              <path d="M548 278H558"/>
            </g>
          `;
    return svg;
  }

  function lift(index: number): void {
    const hostEl = el("nav-choices");
    if (hostEl) {
      for (const node of Array.from(hostEl.children)) {
        if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
        node.dataset.lift = Number(node.dataset.slot) === index ? "true" : "false";
      }
    }
    markCoupler(index);
  }

  function markCoupler(index: number): void {
    el("nav-choices")
      ?.querySelectorAll(".board-coupler")
      .forEach((node) => {
        node.setAttribute(
          "data-active",
          Number(node.getAttribute("data-slot")) === index ? "true" : "false",
        );
      });
  }

  function lockNavSlot(index: number): void {
    const hostEl = el("nav-choices");
    if (hostEl) {
      for (const node of Array.from(hostEl.children)) {
        if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
        const selected = Number(node.dataset.slot) === index;
        node.dataset.lock = selected ? "true" : "false";
        node.dataset.lift = selected ? "true" : "false";
        node.dataset.arm = selected ? "true" : "false";
        const axis = node.querySelector(".carriage-axis");
        if (axis) axis.textContent = selected ? "VECTOR LOCKED" : "TAP TO ARM";
      }
    }
  }
  function updateNavButtons(): void {
    const hostEl = el("nav-choices");
    if (hostEl) {
      for (const node of Array.from(hostEl.children)) {
        if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
        const slot = Number(node.dataset.slot);
        const selected = slot === armedSlot;
        node.dataset.arm = selected ? "true" : "false";
        node.setAttribute("aria-pressed", selected ? "true" : "false");
        const axis = node.querySelector(".carriage-axis");
        if (axis) axis.textContent = selected ? "TAP AGAIN TO CONFIRM" : "TAP TO ARM";
      }
    }
    const dial = el("nav-vector");
    if (dial) {
      dial.dataset.armed = armedSlot >= 0 ? "true" : "false";
      dial.dataset.solo = navChoices.length <= 1 ? "true" : "false";
    }
    const s0 = el("vector-slot-0");
    if (s0) s0.dataset.selected = armedSlot === 0 ? "true" : "false";
    const s1 = el("vector-slot-1");
    if (s1) s1.dataset.selected = armedSlot === 1 ? "true" : "false";
    setNeedle(armedSlot >= 0 ? needleAngle(armedSlot, navChoices.length) : 0);
    const status = el("nav-vector-status");
    if (status) {
      if (lockSlot >= 0) status.textContent = "Vector breaching";
      else if (armedSlot >= 0)
        status.textContent = `Vector ${armedSlot + 1} - tap again to confirm`;
      else status.textContent = "Vector idle";
    }
  }
  function armNavSlot(index: number): void {
    armedSlot = index;
    lift(index);
    updateNavButtons();
  }
  function confirmNavSlot(index: number): boolean {
    if (lockSlot >= 0) return false;
    if (armedSlot !== index || index < 0 || index >= navChoices.length) return false;
    const choice = navChoices[index];
    if (!choice) return false;
    lockSlot = index;
    lockNavSlot(index);
    setNeedle(needleAngle(index, navChoices.length));
    const status = el("nav-vector-status");
    if (status) status.textContent = "Vector breaching";
    const dial = el("nav-vector");
    if (dial) {
      dial.dataset.armed = "true";
      dial.dataset.solo = navChoices.length <= 1 ? "true" : "false";
    }
    const committed = conduit.commitTrajectory(choice);
    finalizeJump(committed.dimId, committed.dimName);
    return true;
  }
  function handleNavSlot(index: number): void {
    if (armedSlot === index) confirmNavSlot(index);
    else armNavSlot(index);
  }
  function vectorAngle(e: { clientX: number; clientY: number }): number {
    const dial = el("nav-vector");
    const gauge = dial?.querySelector("svg") ?? el("rift-vector-scale");
    const rect = gauge?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  const setChoices = (choices: Trajectory[]): void => {
    navChoices = [...choices];
    armedSlot = -1;
    lockSlot = -1;
    const hostEl = el("nav-choices");
    if (hostEl) {
      hostEl.innerHTML = "";
      const count = choices.length;
      if (count) hostEl.appendChild(buildRailSvg(count));
      choices.forEach((choice, index) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "nav-carriage";
        b.dataset.slot = String(index);
        b.setAttribute("aria-pressed", "false");
        if (count === 1) b.dataset.single = "true";
        const head = document.createElement("span");
        head.className = "carriage-head";
        const badge = document.createElement("span");
        badge.className = "carriage-badge";
        badge.innerHTML =
          index === 0
            ? '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M0 0h8v3H0zM0 3h1v5H0zM7 3h1v5H7zM1 7h6v1H1z"/></svg>'
            : '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2zM3 3h2v2H3z"/></svg>';
        const tag = document.createElement("span");
        tag.className = "carriage-tag";
        tag.textContent = `VECTOR ${String(index + 1).padStart(2, "0")}`;
        head.append(badge, tag);
        const shell = document.createElement("span");
        shell.className = "carriage-shell";
        const name = document.createElement("span");
        name.className = "carriage-name";
        name.textContent = GAME_DATA.text.formatDimName(choice.name);
        const type = document.createElement("span");
        type.className = "carriage-type";
        type.textContent = GAME_DATA.text.formatDimType(
          registry.getNode(choice.id)?.label ?? choice.id,
        );
        const axis = document.createElement("span");
        axis.className = "carriage-axis";
        axis.textContent = "TAP TO ARM";
        shell.append(name, type, axis);
        b.append(head, shell);
        b.addEventListener("click", () => handleNavSlot(index));
        b.addEventListener("pointerleave", () => {
          if (lockSlot < 0) lift(-1);
        });
        b.addEventListener("blur", () => {
          if (lockSlot < 0) lift(-1);
        });
        hostEl.appendChild(b);
      });
    }
    const screen = el("nav-screen");
    if (screen) screen.style.display = "flex";
    updateNavButtons();
  };
  const resetNav = (): void => {
    navChoices = [];
    armedSlot = -1;
    lockSlot = -1;
    const hostEl = el("nav-choices");
    if (hostEl) hostEl.innerHTML = "";
    const dial = el("nav-vector");
    if (dial) {
      dial.removeAttribute("data-armed");
      dial.removeAttribute("data-solo");
    }
    const s0 = el("vector-slot-0");
    if (s0) s0.dataset.selected = "false";
    const s1 = el("vector-slot-1");
    if (s1) s1.dataset.selected = "false";
    setNeedle(0);
    const status = el("nav-vector-status");
    if (status) status.textContent = "Vector idle";
  };

  const handleReducedMotionChange = (): void => {
    armedSlot = -1;
    lockSlot = -1;
    el("nav-vector")?.removeAttribute("data-armed");
    el("nav-vector")?.removeAttribute("data-solo");
    const slot0 = el("vector-slot-0");
    if (slot0) slot0.dataset.selected = "false";
    const slot1 = el("vector-slot-1");
    if (slot1) slot1.dataset.selected = "false";
    setNeedle(0);
    const status = el("nav-vector-status");
    if (status) status.textContent = "Vector idle";
  };

  const bindDial = (dial: HTMLElement): void => {
    dial.setAttribute("tabindex", "0");
    dial.addEventListener("pointerdown", (e) => {
      const count = navChoices.length;
      if (!count) return;
      vectorDragging = true;
      vectorDragMoved = false;
      vectorDownX = (e as PointerEvent).clientX;
      vectorDownY = (e as PointerEvent).clientY;
      const angle = vectorAngle(e as PointerEvent);
      const slot = nearestSlot(angle, count);
      (dial as HTMLElement).setPointerCapture?.((e as PointerEvent).pointerId);
      setNeedle(angle);
      const status = el("nav-vector-status");
      if (status) status.textContent = `Vector ${slot + 1}`;
    });
    dial.addEventListener("pointermove", (e) => {
      if (!vectorDragging) return;
      const count = navChoices.length;
      if (!count) return;
      const pe = e as PointerEvent;
      if (Math.hypot(pe.clientX - vectorDownX, pe.clientY - vectorDownY) > 4)
        vectorDragMoved = true;
      const angle = vectorAngle(pe);
      const slot = nearestSlot(angle, count);
      setNeedle(angle);
      lift(slot);
      const status = el("nav-vector-status");
      if (status) status.textContent = `Vector ${slot + 1}`;
    });
    dial.addEventListener("pointerup", (e) => {
      if (!vectorDragging) return;
      vectorDragging = false;
      const count = navChoices.length;
      if (!count) return;
      if (vectorDragMoved) {
        suppressVectorClick = true;
        const slot = nearestSlot(vectorAngle(e as PointerEvent), count);
        armNavSlot(slot);
      }
    });
    dial.addEventListener("pointercancel", () => {
      vectorDragging = false;
    });
    dial.addEventListener("click", (e) => {
      if (suppressVectorClick) {
        suppressVectorClick = false;
        return;
      }
      const count = navChoices.length;
      if (!count) return;
      const slot = nearestSlot(vectorAngle(e as MouseEvent), count);
      handleNavSlot(slot);
    });
    dial.addEventListener("keydown", (e) => {
      const count = navChoices.length;
      if (!count) return;
      const ke = e as KeyboardEvent;
      if (ke.key === "ArrowLeft") {
        e.preventDefault();
        armNavSlot(0);
        return;
      }
      if (ke.key === "ArrowRight") {
        e.preventDefault();
        armNavSlot(Math.min(count - 1, 1));
        return;
      }
      if (ke.key === "Enter" || ke.key === " ") {
        e.preventDefault();
        if (armedSlot >= 0) confirmNavSlot(armedSlot);
        else armNavSlot(0);
      }
    });
  };

  return { setChoices, resetNav, bindDial, handleReducedMotionChange };
}
