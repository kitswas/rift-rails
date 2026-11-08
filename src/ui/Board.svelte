<script lang="ts">
  import { GAME_DATA } from "../game/data";
  import { arm, confirm, lift, nav, slotCount } from "../stores/nav.svelte";

  const count = $derived(slotCount(nav.choices));
</script>

<div id="nav-choices" data-svelte-board="true">
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
        <g class="board-sleepers">
          {#each Array.from({ length: 22 }, (_, i) => i) as i (i)}
            <path d={`M${90 + i * 38} 271V285`} />
          {/each}
        </g>
        <path class="board-rail-notch" d="M220 278H300" />
        <path class="board-rail-notch" d="M500 278H700" />
        <path class="board-rail-notch" d="M860 278H880" />
      </g>
      <g class="board-coupler" data-slot="0" data-active={nav.activeSlot === 0 ? "true" : "false"}>
        {#if count === 1}
          <path class="board-leader board-leader-outer" d="M500 142 C494 190, 506 230, 500 266" />
          <path class="board-leader board-leader-inner" d="M500 142 C494 190, 506 230, 500 266" />
          <rect class="board-port" x="494" y="136" width="12" height="12" />
          <rect class="board-port-dot" x="497" y="139" width="6" height="6" />
          <rect class="board-port" x="494" y="272" width="12" height="12" />
          <rect class="board-port-dot" x="497" y="275" width="6" height="6" />
        {:else}
          <path class="board-leader board-leader-outer" d="M250 142 C250 210, 380 212, 450 266" />
          <path class="board-leader board-leader-inner" d="M250 142 C250 210, 380 212, 450 266" />
          <rect class="board-port" x="244" y="136" width="12" height="12" />
          <rect class="board-port-dot" x="247" y="139" width="6" height="6" />
          <rect class="board-port" x="448" y="272" width="12" height="12" />
          <rect class="board-port-dot" x="451" y="275" width="6" height="6" />
        {/if}
      </g>
      {#if count > 1}
        <g class="board-coupler" data-slot="1" data-active={nav.activeSlot === 1 ? "true" : "false"}>
          <path class="board-leader board-leader-outer" d="M750 142 C750 210, 620 212, 550 266" />
          <path class="board-leader board-leader-inner" d="M750 142 C750 210, 620 212, 550 266" />
          <rect class="board-port" x="744" y="136" width="12" height="12" />
          <rect class="board-port-dot" x="747" y="139" width="6" height="6" />
          <rect class="board-port" x="540" y="272" width="12" height="12" />
          <rect class="board-port-dot" x="543" y="275" width="6" height="6" />
        </g>
      {/if}
      <g class="board-hub">
        <circle cx="500" cy="278" r="46" />
        <circle cx="500" cy="278" r="36" />
        <circle cx="500" cy="278" r="14" />
        <path d="M442 278H452" />
        <path d="M548 278H558" />
      </g>
    </svg>
    {#each nav.choices as choice, index (choice.id + index)}
      <button
        class="nav-carriage"
        type="button"
        data-slot={index}
        data-single={count === 1 ? "true" : undefined}
        data-lift={nav.activeSlot === index ? "true" : "false"}
        data-arm={nav.armedSlot === index ? "true" : "false"}
        data-lock={nav.lockSlot === index ? "true" : "false"}
        aria-pressed={nav.armedSlot === index ? "true" : "false"}
        onclick={() => {
          if (nav.armedSlot === index) confirm(index, count);
          else arm(index, count);
        }}
        onpointerenter={() => {
          if (nav.lockSlot < 0) lift(index);
        }}
        onpointerleave={() => {
          if (nav.lockSlot < 0) lift(-1);
        }}
        onblur={() => {
          if (nav.lockSlot < 0) lift(-1);
        }}
      >
        <span class="carriage-head">
          <span class="carriage-badge" aria-hidden="true">
            {#if index === 0}
              <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M0 0h8v3H0zM0 3h1v5H0zM7 3h1v5H7zM1 7h6v1H1z" /></svg>
            {:else}
              <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2zM3 3h2v2H3z" /></svg>
            {/if}
          </span>
          <span class="carriage-tag">VECTOR {String(index + 1).padStart(2, "0")}</span>
        </span>
        <span class="carriage-shell">
          <span class="carriage-name">{GAME_DATA.text.formatDimName(choice.name)}</span>
          <span class="carriage-type">
            {GAME_DATA.text.formatDimType(GAME_DATA.nodes[choice.id].label)}
          </span>
          <span class="carriage-axis">
            {nav.lockSlot === index
              ? "VECTOR LOCKED"
              : nav.armedSlot === index
                ? "TAP AGAIN TO CONFIRM"
                : "TAP TO ARM"}
          </span>
        </span>
      </button>
    {/each}
  {/if}
</div>
