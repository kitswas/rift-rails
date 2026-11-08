import { DOM } from "../ui/dom";
import { ConduitDeck } from "./conduit";
import { GAME_DATA } from "./data";
import { RiftVectorDial } from "./dial";
import { Engine } from "./engine";
import type { Trajectory } from "./types";

export const RiftCouplingBoard = {
  choices: [] as Trajectory[],
  activeSlot: -1,
  armedSlot: -1,
  lockSlot: -1,

  slotCount(choices: Trajectory[] | null | undefined): number {
    return choices && choices.length ? choices.length : 0;
  },

  slotGeometry(index: number, count: number): { left: number; top: number; width: number } {
    if (count === 1) return { left: 29, top: 46, width: 42 };
    return index === 0 ? { left: 4, top: 46, width: 42 } : { left: 54, top: 46, width: 42 };
  },

  needleAngle(slot: number, count: number): number {
    if (count <= 1) return 90;
    return slot === 0 ? 305 : 55;
  },

  buildRailSvg(count: number): SVGSVGElement {
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
  },

  render(choices: Trajectory[]): boolean {
    const host = DOM.navChoices;
    if (!host || !Array.isArray(choices)) return false;
    this.choices = choices;
    this.activeSlot = -1;
    this.armedSlot = -1;
    this.lockSlot = -1;
    host.innerHTML = "";
    const count = this.slotCount(choices);
    if (!count) return false;
    host.appendChild(this.buildRailSvg(count));
    choices.forEach((choice, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-carriage";
      btn.dataset.slot = String(index);
      btn.setAttribute("aria-pressed", "false");
      if (count === 1) btn.dataset.single = "true";
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
      type.textContent = GAME_DATA.text.formatDimType(GAME_DATA.nodes[choice.id].label);
      const axis = document.createElement("span");
      axis.className = "carriage-axis";
      axis.textContent = "TAP TO ARM";
      shell.append(name, type, axis);
      btn.append(head, shell);
      btn.addEventListener("click", () => {
        if (this.armedSlot === index) {
          this.confirm(index, count);
        } else {
          this.arm(index, count);
        }
      });
      btn.addEventListener("pointerleave", () => {
        if (this.lockSlot < 0) this.lift(-1);
      });
      btn.addEventListener("blur", () => {
        if (this.lockSlot < 0) this.lift(-1);
      });
      host.appendChild(btn);
    });
    return true;
  },

  lift(index: number): void {
    this.activeSlot = index;
    [...DOM.navChoices.children].forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) {
        return;
      }
      node.dataset.lift = Number(node.dataset.slot) === index ? "true" : "false";
    });
    this.markCoupler(index);
  },

  markCoupler(index: number): void {
    DOM.navChoices?.querySelectorAll(".board-coupler").forEach((node) => {
      (node as HTMLElement).dataset.active =
        Number((node as HTMLElement).dataset.slot) === index ? "true" : "false";
    });
  },

  arm(index: number, count: number): void {
    this.armedSlot = index;
    this.lift(index);
    [...DOM.navChoices.children].forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) {
        return;
      }
      const selected = Number(node.dataset.slot) === index;
      node.dataset.arm = selected ? "true" : "false";
      node.setAttribute("aria-pressed", selected ? "true" : "false");
      const axis = node.querySelector(".carriage-axis");
      if (axis) {
        axis.textContent = selected ? "TAP AGAIN TO CONFIRM" : "TAP TO ARM";
      }
    });
    RiftVectorDial.arm(index, count);
  },

  confirm(index: number, count: number): boolean {
    if (this.armedSlot !== index) return false;
    this.lock(index);
    RiftVectorDial.breach(index, count);
    const choice = this.choices[index];
    if (!choice) return false;
    const committed = ConduitDeck.commitTrajectory(choice);
    Engine.finalizeJump(committed.dimId, committed.dimName);
    return true;
  },

  reset(): void {
    this.choices = [];
    this.activeSlot = -1;
    this.armedSlot = -1;
    this.lockSlot = -1;
  },

  lock(index: number): void {
    this.lockSlot = index;
    [...DOM.navChoices.children].forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) {
        return;
      }
      const selected = Number(node.dataset.slot) === index;
      node.dataset.lock = selected ? "true" : "false";
      node.dataset.lift = selected ? "true" : "false";
      node.dataset.arm = selected ? "true" : "false";
      const axis = node.querySelector(".carriage-axis");
      if (axis) {
        axis.textContent = selected ? "VECTOR LOCKED" : "TAP TO ARM";
      }
    });
  },
};
