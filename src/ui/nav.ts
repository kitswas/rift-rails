// Nav module: the voyage-vector dial and carriage selection state machine.
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
  let pendingSlot = -1;
  let needleEntry: MotionEntry | null = null;
  function getNeedleEntry(): MotionEntry {
    if (!needleEntry) {
      needleEntry = {
        value: 0,
        target: 0,
        velocity: 0,
        stiffness: 210,
        damping: 20,
        update: (value, done) => {
          el("rift-vector-needle")?.setAttribute(
            "transform",
            `rotate(${value.toFixed(2)} ${CX} ${CY})`,
          );
          if (done === 1 && pendingSlot >= 0) {
            const slot = pendingSlot;
            pendingSlot = -1;
            confirmNavSlot(slot);
          }
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

  const CX = 260;
  const CY = 260;
  const R = 196;

  function pointAt(deg: number, radius: number): { x: number; y: number } {
    const rad = (deg * Math.PI) / 180;
    return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
  }

  function buildCompassSvg(choices: Trajectory[]): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "compass-svg");
    svg.setAttribute("viewBox", "0 0 520 520");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Rift vector compass");

    const ticks = Array.from({ length: 24 }, (_, index) => {
      const deg = index * 15;
      const major = index % 3 === 0;
      const from = pointAt(deg, major ? 174 : 184);
      const to = pointAt(deg, 194);
      return `<path class="compass-tick${major ? " major" : ""}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}"/>`;
    }).join("");

    const degrees = ([0, 90, 180, 270] as const)
      .map((deg) => {
        const point = pointAt(deg, deg === 180 ? 206 : 220);
        return `<text class="compass-degree" x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${String(deg).padStart(3, "0")}</text>`;
      })
      .join("");

    const nodes = choices
      .map((choice, index) => {
        const angle = needleAngle(index, choices.length);
        const point = pointAt(angle, R);
        const ordinal = pointAt(angle, R + 24);
        const labelTarget = point.x < CX ? { x: 132, y: 82 } : { x: 388, y: 82 };
        const labelX = point.x < CX ? 32 : 478;
        const name = choice.name;
        const type = registry.getNode(choice.id)?.label ?? choice.id;
        return `
          <g class="compass-node" data-slot="${index}" tabindex="0" role="button" aria-pressed="false"
             aria-label="Vector ${index + 1}: ${name}">
            <circle class="compass-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="18"/>
            <circle class="compass-halo" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="16"/>
            <rect class="compass-marker" x="${(point.x - 7).toFixed(2)}" y="${(point.y - 7).toFixed(2)}" width="14" height="14"/>
            <rect class="compass-marker-dot" x="${(point.x - 3).toFixed(2)}" y="${(point.y - 3).toFixed(2)}" width="6" height="6"/>
            <path class="compass-leader" d="M${point.x.toFixed(2)} ${point.y.toFixed(2)}L${labelTarget.x} ${labelTarget.y}"/>
            <circle class="compass-ordinal" cx="${ordinal.x.toFixed(2)}" cy="${ordinal.y.toFixed(2)}" r="12"/>
            <text class="compass-ordinal-text" x="${ordinal.x.toFixed(2)}" y="${ordinal.y.toFixed(2)}">${index + 1}</text>
          </g>
          <g class="compass-label">
            <rect x="${point.x < CX ? 24 : 306}" y="50" width="190" height="38"/>
            <text class="compass-label-name" x="${labelX}" y="66" text-anchor="${point.x < CX ? "start" : "end"}">${name.toUpperCase()}</text>
            <text class="compass-label-type" x="${labelX}" y="81" text-anchor="${point.x < CX ? "start" : "end"}">${type.toUpperCase()}</text>
          </g>`;
      })
      .join("");

    svg.innerHTML = `
      <defs>
        <pattern id="compass-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V7" stroke="var(--paper-ink)" stroke-width="1" opacity="0.35"/>
        </pattern>
        <pattern id="compass-wood" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <path d="M0 2H9 M0 6H9" stroke="var(--wood-shadow)" stroke-width="1" opacity="0.45"/>
        </pattern>
        <linearGradient id="compass-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--gold)"/>
          <stop offset="0.45" stop-color="var(--gold-light)"/>
          <stop offset="1" stop-color="var(--gold)"/>
        </linearGradient>
      </defs>
      <circle class="compass-ring" cx="${CX}" cy="${CY}" r="${R}"/>
      <circle class="compass-ring-grain" cx="${CX}" cy="${CY}" r="${R}"/>
      <circle class="compass-face" cx="${CX}" cy="${CY}" r="182"/>
      <circle class="compass-face-grain" cx="${CX}" cy="${CY}" r="182"/>
      <g class="compass-axis"><path d="M260 64V456 M64 260H456"/></g>
      <g class="compass-ticks">${ticks}</g>
      <g class="compass-degrees">${degrees}</g>
      ${nodes}
      <g id="rift-vector-needle" transform="rotate(0 ${CX} ${CY})">
        <path class="compass-needle" d="M${CX} ${CY - R} L${CX + 5} 250 L${CX + 2} 278 L${CX - 2} 278 L${CX - 5} 250 Z"/>
        <circle class="compass-hub-dot" cx="${CX}" cy="${CY}" r="7"/>
      </g>
      <circle class="compass-hub-ring" cx="${CX}" cy="${CY}" r="20"/>
      <g class="compass-jump" transform="rotate(-4 ${CX} 410)">
        <rect x="198" y="382" width="124" height="54" fill="var(--bg)"/>
        <rect class="compass-jump-frame" x="202" y="386" width="116" height="46"/>
        <text x="${CX}" y="412" text-anchor="middle">JUMP</text>
        <text class="compass-jump-code" x="${CX}" y="427" text-anchor="middle">VECTOR</text>
      </g>
      <text class="compass-caption" x="${CX}" y="490" text-anchor="middle">COMPASS PLATE</text>
    `;
    return svg;
  }

  function updateNavButtons(): void {
    const dial = el("nav-vector");
    dial?.querySelectorAll<SVGGElement>(".compass-node").forEach((node) => {
      const selected = Number(node.dataset.slot) === armedSlot;
      node.dataset.selected = String(selected);
      node.setAttribute("aria-pressed", String(selected));
    });
    if (dial) dial.dataset.armed = armedSlot >= 0 ? "true" : "false";
    setNeedle(armedSlot >= 0 ? needleAngle(armedSlot, navChoices.length) : 0);
    const status = el("nav-vector-status");
    if (status) {
      if (lockSlot >= 0) status.textContent = "Vector breaching";
      else if (armedSlot >= 0) status.textContent = `Vector ${armedSlot + 1} — aligning`;
      else status.textContent = "Vector idle";
    }
  }
  function armNavSlot(index: number): void {
    if (lockSlot >= 0) return;
    armedSlot = index;
    pendingSlot = index;
    updateNavButtons();
  }
  function confirmNavSlot(index: number): boolean {
    if (lockSlot >= 0) return false;
    if (armedSlot !== index || index < 0 || index >= navChoices.length) return false;
    const choice = navChoices[index];
    if (!choice) return false;
    pendingSlot = -1;
    lockSlot = index;
    updateNavButtons();
    const dial = el("nav-vector");
    if (dial) {
      dial.dataset.armed = "true";
      dial.dataset.jumped = "true";
    }
    const committed = conduit.commitTrajectory(choice);
    finalizeJump(committed.dimId, committed.dimName);
    return true;
  }
  function handleNavSlot(index: number): void {
    armNavSlot(index);
  }
  const setChoices = (choices: Trajectory[]): void => {
    navChoices = [...choices];
    armedSlot = -1;
    lockSlot = -1;
    pendingSlot = -1;
    const dial = el("nav-vector");
    const face = dial?.querySelector(".dial-face");
    if (face) face.replaceChildren(buildCompassSvg(choices));
    if (dial) {
      dial.removeAttribute("data-armed");
      dial.removeAttribute("data-jumped");
    }
    const screen = el("nav-screen");
    if (screen) screen.style.display = "flex";
    updateNavButtons();
  };

  const resetNav = (): void => {
    navChoices = [];
    armedSlot = -1;
    lockSlot = -1;
    pendingSlot = -1;
    const dial = el("nav-vector");
    if (dial) {
      dial.removeAttribute("data-armed");
      dial.removeAttribute("data-jumped");
      const face = dial.querySelector(".dial-face");
      if (face) face.replaceChildren();
    }
    setNeedle(0);
    const status = el("nav-vector-status");
    if (status) status.textContent = "Vector idle";
  };

  const handleReducedMotionChange = (): void => {
    armedSlot = -1;
    lockSlot = -1;
    pendingSlot = -1;
    el("nav-vector")?.removeAttribute("data-armed");
    el("nav-vector")?.removeAttribute("data-jumped");
    setNeedle(0);
    const status = el("nav-vector-status");
    if (status) status.textContent = "Vector idle";
  };

  const bindDial = (dial: HTMLElement): void => {
    dial.addEventListener("click", (event) => {
      const node = (event.target as Element).closest<SVGGElement>(".compass-node");
      if (node) handleNavSlot(Number(node.dataset.slot));
    });
    dial.addEventListener("keydown", (event) => {
      const node = (event.target as Element).closest<SVGGElement>(".compass-node");
      if (!node) return;
      const slot = Number(node.dataset.slot);
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleNavSlot(slot);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const target = event.key === "ArrowLeft" ? 0 : Math.min(navChoices.length - 1, 1);
        handleNavSlot(target);
      }
    });
  };

  return { setChoices, resetNav, bindDial, handleReducedMotionChange };
}
