<script lang="ts">
  import { VECTOR_IDLE_ANGLE } from "../game/config";
  import { RiftCouplingBoard } from "../game/board";

  let {
    angle = VECTOR_IDLE_ANGLE,
    status = "Vector idle",
    armed = false,
    solo = false,
  }: {
    angle?: number;
    status?: string;
    armed?: boolean;
    solo?: boolean;
  } = $props();

  const slotA = 0;
  const slotB = 1;

  function isActive(slot: number): boolean {
    return angle === RiftCouplingBoard.needleAngle(slot, solo ? 1 : 2);
  }
</script>

<div
  id="nav-vector"
  class="instrument"
  tabindex="0"
  role="button"
  aria-label="Rift vector dial. Drag or tap a vector once to choose it, then tap again to confirm."
  data-armed={armed ? "true" : "false"}
  data-solo={solo ? "true" : "false"}
>
  <div class="dial-plate-head">
    <span class="dial-badge" aria-hidden="true">
      <svg viewBox="0 0 8 8"><path d="M0 1h8v1H0zM0 3h8v1H0zM0 5h8v1H0zM0 7h5v1H0z" /></svg>
    </span>
    <span class="dial-title">RIFT VECTOR</span>
    <span class="dial-code">RV-02</span>
  </div>
  <div class="dial-face">
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <pattern
          id="rift-vector-mesh"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0h6M0 6h6" stroke="var(--border-bright)" stroke-width="0.4" fill="none" />
        </pattern>
      </defs>
      <path
        id="rift-vector-scale"
        d="M20 80A52 52 0 1 1 140 80"
        fill="none"
        stroke="var(--border-bright)"
        stroke-width="2"
      />
      <circle cx="80" cy="80" r="52" fill="url(#rift-vector-mesh)" opacity="0.24" />
      <g id="vector-slot-0" class="vector-slot" data-slot="0" data-selected={isActive(slotA) ? "true" : "false"}>
        <rect x="31" y="44" width="12" height="12" />
        <rect class="vector-slot-dot" x="34" y="47" width="6" height="6" />
        <path d="M37 56L45 64" />
        <text class="vector-label" x="37" y="37" text-anchor="middle">V1</text>
      </g>
      <g id="vector-slot-1" class="vector-slot" data-slot="1" data-selected={isActive(slotB) ? "true" : "false"}>
        <rect x="117" y="44" width="12" height="12" />
        <rect class="vector-slot-dot" x="120" y="47" width="6" height="6" />
        <path d="M123 56L115 64" />
        <text class="vector-label" x="123" y="37" text-anchor="middle">V2</text>
      </g>
      <g id="rift-vector-needle" transform={`rotate(${angle.toFixed(2)} 80 80)`} data-pivot="80 80">
        <path d="M80 22 L84.5 78 L80 90 L75.5 78 Z" />
        <circle cx="80" cy="80" r="4" fill="var(--action)" />
      </g>
      <title>Rift Vector</title>
      <desc>Rift charge vector</desc>
    </svg>
  </div>
  <span id="nav-vector-status" aria-live="polite">{status}</span>
</div>

<!-- tap threshold is {DRAG_TAP_THRESHOLD_PX}px: drag > threshold cancels tap-to-confirm -->
