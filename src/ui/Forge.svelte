<script lang="ts">
  import { Engine } from "../game/engine";
</script>

<div class="panel-card" id="right-panel">
  <h2>Train Configuration</h2>
  <div class="train-setup-grid">
    <div class="hud-cell" onclick={() => Engine.inspect("engine")}>
      <span>Engine</span>
      <span id="equip-engine"></span>
    </div>
    <div class="hud-cell" onclick={() => Engine.inspect("weapon")}>
      <span>Weapon</span>
      <span id="equip-weapon"></span>
    </div>
    <div class="hud-cell" onclick={() => Engine.inspect("module")}>
      <span>Module</span>
      <span id="equip-module"></span>
    </div>
    <div class="hud-cell" onclick={() => Engine.inspect("carriage")}>
      <span>Carriage</span>
      <span id="equip-carriage"></span>
    </div>
    <div class="hud-cell" style="grid-column: span 2" onclick={() => Engine.inspect("crew")}>
      <span>Crew Member</span>
      <span id="equip-crew"></span>
    </div>
  </div>
  <h4 style="margin: 6px 0" id="lbl-forge"></h4>
  <button id="btn-forge-engine"></button>
  <button id="btn-forge-weapon"></button>
</div>
