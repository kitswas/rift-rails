<script lang="ts">
  import Log from "./Log.svelte";
</script>

<div class="pane" id="pane-bridge">
  <div class="panel-card">
    <h2 id="location-name" tabindex="-1"></h2>
    <h3 id="location-type"></h3>
    <figure id="corvus-portrait" aria-label="Master Corvus, veiled scholar">
      <svg viewBox="0 0 400 520" aria-hidden="true">
        <defs>
          <radialGradient id="eye-glow-left" cx="37%" cy="38%" r="40%">
            <stop offset="0%" stop-color="#FFF5D6" />
            <stop offset="25%" stop-color="#FFC02B" />
            <stop offset="60%" stop-color="#D97706" />
            <stop offset="100%" stop-color="#7C2D12" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="eye-glow-right" cx="63%" cy="38%" r="40%">
            <stop offset="0%" stop-color="#FFF5D6" />
            <stop offset="25%" stop-color="#FFC02B" />
            <stop offset="60%" stop-color="#D97706" />
            <stop offset="100%" stop-color="#7C2D12" stop-opacity="0" />
          </radialGradient>
          <g id="sparkle">
            <path d="M 0,-8 Q 0,0 8,0 Q 0,0 0,8 Q 0,0 -8,0 Q 0,0 0,-8 Z" fill="#FFEAA7" opacity="0.8" />
          </g>
        </defs>
        <g class="corvus-figure">
          <g id="robe">
            <polygon points="0,520 80,420 200,480 320,420 400,520" fill="#0B0F19" />
            <polygon points="0,520 0,380 70,300 120,410 80,420" fill="#181F2C" />
            <polygon points="0,380 50,250 110,290 70,300" fill="#222B3D" />
            <polygon points="70,300 110,290 150,370 120,410" fill="#1C2436" />
            <polygon points="120,410 150,370 200,440 140,520 80,420" fill="#131A26" />
            <polygon points="400,520 400,380 330,300 280,410 320,420" fill="#121824" />
            <polygon points="400,380 350,250 290,290 330,300" fill="#1A2232" />
            <polygon points="330,300 290,290 250,370 280,410" fill="#161D2B" />
            <polygon points="280,410 250,370 200,440 260,520 320,420" fill="#0F141F" />
            <polygon points="150,370 200,330 250,370 200,440" fill="#0D121D" />
            <polygon points="130,320 200,280 270,320 250,370 150,370" fill="#141B28" />
            <polygon points="160,260 200,230 240,260 270,320 130,320" fill="#0A0E17" />
          </g>
          <g id="veil">
            <polygon points="200,48 260,70 200,105 140,70" fill="#3D4B5E" />
            <polygon points="200,48 140,70 90,130 150,115 200,105" fill="#4B5B72" />
            <polygon points="200,48 260,70 310,130 250,115 200,105" fill="#2F3B4C" />
            <polygon points="90,130 50,220 110,210 150,115" fill="#3A4759" />
            <polygon points="50,220 0,380 70,300 110,210" fill="#2C3747" />
            <polygon points="110,210 70,300 130,320 160,260" fill="#242F3D" />
            <polygon points="310,130 350,220 290,210 250,115" fill="#242E3D" />
            <polygon points="350,220 400,380 330,300 290,210" fill="#1A222E" />
            <polygon points="290,210 330,300 270,320 240,260" fill="#1D2634" />
            <polygon points="150,115 200,105 250,115 220,135 180,135" fill="#586A85" />
            <polygon points="150,115 180,135 140,190 110,210" fill="#46546B" />
            <polygon points="250,115 220,135 260,190 290,210" fill="#323E50" />
          </g>
          <g id="mask">
            <polygon points="140,190 180,135 220,135 260,190 270,320 130,320" fill="#04060A" />
            <polygon points="180,135 200,130 220,135 200,155" fill="#12151F" />
            <polygon points="140,190 180,135 200,155 160,200" fill="#1A1E2B" />
            <polygon points="260,190 220,135 200,155 240,200" fill="#0D0F18" />
            <polygon points="160,200 200,155 200,230 150,250" fill="#151824" />
            <polygon points="240,200 200,155 200,230 250,250" fill="#090B12" />
          </g>
          <g id="beak">
            <polygon points="200,180 206,240 200,320 194,240" fill="#2B313E" />
            <polygon points="200,180 194,240 160,260" fill="#202531" />
            <polygon points="194,240 200,320 170,310 160,260" fill="#181D27" />
            <polygon points="200,320 206,390 196,380 170,310" fill="#11151F" />
            <polygon points="200,320 203,420 196,380" fill="#1D222E" />
            <polygon points="200,180 206,240 240,260" fill="#171A24" />
            <polygon points="206,240 200,320 230,310 240,260" fill="#10131B" />
            <polygon points="200,320 206,390 230,310" fill="#0A0C12" />
            <polygon points="200,320 203,420 206,390" fill="#0F1219" />
            <polygon points="200,320 208,410 203,425 197,410" fill="#3A4252" />
          </g>
          <g id="eye-sockets">
            <g class="corvus-eye-socket left">
              <polygon points="148,190 178,185 182,215 152,220" fill="#07090E" stroke="#1C2230" stroke-width="1.5" />
              <circle cx="165" cy="200" r="28" fill="url(#eye-glow-left)" />
              <polygon points="154,193 174,189 177,211 157,214" fill="#B45309" />
              <g class="corvus-eye-pupil">
                <polygon points="158,196 170,193 172,208 160,210" fill="#FBBF24" />
                <polygon class="corvus-eye-glint" points="161,198 167,196 168,205 162,206" fill="#FFFBEB" />
              </g>
            </g>
            <g class="corvus-eye-socket right">
              <polygon points="222,185 252,190 248,220 218,215" fill="#040508" stroke="#141824" stroke-width="1.5" />
              <circle cx="235" cy="200" r="28" fill="url(#eye-glow-right)" />
              <polygon points="226,189 246,193 243,214 223,211" fill="#B45309" />
              <g class="corvus-eye-pupil">
                <polygon points="230,193 242,196 240,210 228,208" fill="#FBBF24" />
                <polygon class="corvus-eye-glint" points="233,196 239,198 238,206 232,205" fill="#FFFBEB" />
              </g>
            </g>
            <use href="#sparkle" x="145" y="175" transform="scale(0.7)" />
            <use href="#sparkle" x="255" y="175" transform="scale(0.7)" />
            <use href="#sparkle" x="175" y="225" transform="scale(0.5)" />
            <use href="#sparkle" x="225" y="225" transform="scale(0.5)" />
            <use href="#sparkle" x="340" y="460" transform="scale(1.2)" />
          </g>
        </g>
      </svg>
    </figure>
    <Log />
  </div>
</div>
