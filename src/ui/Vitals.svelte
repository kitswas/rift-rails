<script lang="ts">
  import { Engine } from "../game/engine";
  import { ui } from "../stores/ui.svelte";
</script>

<div id="hud-bar">
  <div class="hud-cell" onclick={() => Engine.inspect("hull")}>
    <span>Hull [HP]</span>
    <span id="stat-hull" style="color: {ui.hullColor}">{ui.hull}</span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("fuel")}>
    <span>Fuel [Jump]</span>
    <span id="stat-fuel" style="color: {ui.fuelColor}">{ui.fuel}</span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("energy")}>
    <span>Energy [Turn]</span>
    <span id="stat-energy" style="color: {ui.energyColor}">{ui.energy}</span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("flux")}>
    <span>Flux [Cred]</span>
    <span id="stat-flux">{ui.flux}</span>
  </div>
  <div class="hud-cell" onclick={() => Engine.inspect("sector")}>
    <span>Sector</span>
    <span id="stat-sector">{ui.sector}</span>
  </div>
</div>
