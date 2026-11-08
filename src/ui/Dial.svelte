<script lang="ts">
  // Presentational dial: markup owner for #nav-vector so legacy
  // RiftVectorDial (motion, drag/tap, keyboard) can attach via same IDs.
  // Needle transform is driven imperatively by dial entry update;
  // Svelte does not re-render the transform to avoid fighting motion.
</script>

<div
  id="nav-vector"
  class="instrument"
  tabindex="0"
  role="button"
  aria-label="Rift vector dial. Drag or tap a vector once to choose it, then tap again to confirm."
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
      <g class="vector-ticks" aria-hidden="true">
        <rect x="27.2" y="42.4" width="4" height="4" />
        <rect x="37.1" y="31.4" width="4" height="4" />
        <rect x="49.4" y="23.0" width="4" height="4" />
        <rect x="63.3" y="17.8" width="4" height="4" />
        <rect x="78" y="16" width="4" height="4" />
        <rect x="92.7" y="17.8" width="4" height="4" />
        <rect x="106.6" y="23.0" width="4" height="4" />
        <rect x="118.9" y="31.4" width="4" height="4" />
        <rect x="128.8" y="42.4" width="4" height="4" />
      </g>
      <g id="vector-slot-0" class="vector-slot" data-slot="0">
        <rect x="31" y="44" width="12" height="12" />
        <rect class="vector-slot-dot" x="34" y="47" width="6" height="6" />
        <path d="M37 56L45 64" />
        <text class="vector-label" x="37" y="37" text-anchor="middle">V1</text>
      </g>
      <g id="vector-slot-1" class="vector-slot" data-slot="1">
        <rect x="117" y="44" width="12" height="12" />
        <rect class="vector-slot-dot" x="120" y="47" width="6" height="6" />
        <path d="M123 56L115 64" />
        <text class="vector-label" x="123" y="37" text-anchor="middle">V2</text>
      </g>
      <g id="vector-slot-solo" class="vector-slot" data-slot="0">
        <rect x="126" y="74" width="12" height="12" />
        <rect class="vector-slot-dot" x="129" y="77" width="6" height="6" />
        <path d="M126 80L118 88" />
        <text class="vector-label" x="132" y="68" text-anchor="middle">V1</text>
      </g>
      <g id="rift-vector-needle" transform="rotate(0 80 80)" data-pivot="80 80">
        <path d="M80 22 L84.5 78 L80 90 L75.5 78 Z" />
        <circle cx="80" cy="80" r="4" fill="var(--action)" />
      </g>
      <title>Rift Vector</title>
      <desc>Rift charge vector</desc>
    </svg>
  </div>
  <span id="nav-vector-status" aria-live="polite">Vector idle</span>
</div>
