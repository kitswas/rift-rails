<script lang="ts">
  import { Engine } from "../game/engine";
  import { ui } from "../stores/ui.svelte";

  function onStatKey(e: KeyboardEvent, topic: string): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      Engine.inspect(topic);
    }
  }
</script>

<div id="hud-bar">
  <div class="hud-cell" role="button" tabindex="0" onclick={() => Engine.inspect("hull")} onkeydown={(e) => onStatKey(e, "hull")}>
    <span>Hull [HP]</span>
    <span id="stat-hull" style="color: {ui.hullColor}">{ui.hull}</span>
  </div>
  <div class="hud-cell" role="button" tabindex="0" onclick={() => Engine.inspect("fuel")} onkeydown={(e) => onStatKey(e, "fuel")}>
    <span>Fuel [Jump]</span>
    <span id="stat-fuel" style="color: {ui.fuelColor}">{ui.fuel}</span>
  </div>
  <div class="hud-cell" role="button" tabindex="0" onclick={() => Engine.inspect("energy")} onkeydown={(e) => onStatKey(e, "energy")}>
    <span>Energy [Turn]</span>
    <span id="stat-energy" style="color: {ui.energyColor}">{ui.energy}</span>
  </div>
  <div class="hud-cell" role="button" tabindex="0" onclick={() => Engine.inspect("flux")} onkeydown={(e) => onStatKey(e, "flux")}>
    <span>Flux [Cred]</span>
    <span id="stat-flux">{ui.flux}</span>
  </div>
  <div class="hud-cell" role="button" tabindex="0" onclick={() => Engine.inspect("sector")} onkeydown={(e) => onStatKey(e, "sector")}>
    <span>Sector</span>
    <span id="stat-sector">{ui.sector}</span>
  </div>
</div>
