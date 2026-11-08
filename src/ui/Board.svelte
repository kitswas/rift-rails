<script lang="ts">
  import { GAME_DATA } from "../game/data";
  import { RiftCouplingBoard } from "../game/board";
  import type { Trajectory } from "../game/types";

  let {
    choices,
    activeSlot = -1,
    armedSlot = -1,
    lockSlot = -1,
    onArm,
    onConfirm,
  }: {
    choices: Trajectory[];
    activeSlot?: number;
    armedSlot?: number;
    lockSlot?: number;
    onArm?: (index: number, count: number) => void;
    onConfirm?: (index: number, count: number) => void;
  } = $props();

  const count: number = $derived(RiftCouplingBoard.slotCount(choices));
</script>

<div id="nav-choices">
  {#if count > 0}
    <svg
      class="nav-board-svg"
      viewBox="0 0 1000 360"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g class="board-frame">
        <rect x="18" y="18" width="964" height="324" />
        <path d="M18 18 H982" />
        <path d="M18 278 H982" />
      </g>
      <g class="board-rail">
        <path class="board-rail-back" d="M40 278H960" />
        <path class="board-rail-base" d="M80 278H920" />
        <path class="board-rail-notch" d="M220 278H300" />
        <path class="board-rail-notch" d="M500 278H700" />
        <path class="board-rail-notch" d="M860 278H880" />
      </g>
      <g class="board-hub">
        <circle cx="500" cy="278" r="46" />
        <circle cx="500" cy="278" r="36" />
        <circle cx="500" cy="278" r="14" />
      </g>
    </svg>
    {#each choices as choice, index (choice.id + index)}
      <button
        class="nav-carriage"
        type="button"
        data-slot={index}
        data-lift={activeSlot === index ? "true" : "false"}
        data-arm={armedSlot === index ? "true" : "false"}
        data-lock={lockSlot === index ? "true" : "false"}
        aria-pressed={armedSlot === index ? "true" : "false"}
        onclick={() => {
          const c = RiftCouplingBoard.slotCount(choices);
          if (armedSlot === index) onConfirm?.(index, c);
          else onArm?.(index, c);
        }}
      >
        <span class="carriage-head">
          <span class="carriage-badge" aria-hidden="true"></span>
          <span class="carriage-tag">VECTOR {String(index + 1).padStart(2, "0")}</span>
        </span>
        <span class="carriage-shell">
          <span class="carriage-name">{GAME_DATA.text.formatDimName(choice.name)}</span>
          <span class="carriage-type">
            {GAME_DATA.text.formatDimType(GAME_DATA.nodes[choice.id].label)}
          </span>
          <span class="carriage-axis">
            {lockSlot === index
              ? "VECTOR LOCKED"
              : armedSlot === index
                ? "TAP AGAIN TO CONFIRM"
                : "TAP TO ARM"}
          </span>
        </span>
      </button>
    {/each}
  {/if}
</div>
