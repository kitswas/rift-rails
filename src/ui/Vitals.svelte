<script lang="ts">
  import { Engine } from "../game/engine";
</script>

<div id="hud-bar">
  <div class="hud-cell" onclick={() => Engine.inspect("hull")}>
    <span>Hull [HP]</span>
    <span id="stat-hull"></span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("fuel")}>
    <span>Fuel [Jump]</span>
    <span id="stat-fuel"></span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("energy")}>
    <span>Energy [Turn]</span>
    <span id="stat-energy"></span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("flux")}>
    <span>Flux [Cred]</span>
    <span id="stat-flux"></span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("sector")}>
    <span>Sector</span>
    <span id="stat-sector"></span>
  </div>
</div>
