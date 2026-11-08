<script lang="ts">
import { onMount } from "svelte";
import { Engine } from "../game/engine";
import { RiftEyes } from "../game/eyes";
import { RiftReducedMotion } from "../game/motion";
import { syncVoyage } from "../stores/voyage.svelte";
import { resetNav } from "../stores/nav.svelte";
import Dial from "./Dial.svelte";
import Board from "./Board.svelte";
import Vitals from "./Vitals.svelte";
import Forge from "./Forge.svelte";
import Cutscene from "./Cutscene.svelte";
import Bridge from "./Bridge.svelte";
import Manual from "./Manual.svelte";
import Start from "./Start.svelte";
import Panels from "./Panels.svelte";

onMount(() => {
  const onChange = () => {
    RiftEyes.center();
    resetNav();
  };
  RiftReducedMotion.addEventListener("change", onChange);
  RiftEyes.start();
  Engine.init();
  syncVoyage();
  return () => {
    RiftReducedMotion.removeEventListener("change", onChange);
  };
});
</script>

<canvas id="fx-canvas"></canvas>
<div id="bridge-scene" aria-hidden="true"></div>

<Start />

<div id="nav-screen">
  <h1 id="lbl-nav-title"></h1>
  <Board />
  <Dial />
</div>

<div id="game-container">
  <Vitals />

  <div id="snap-slider">
    <Panels />

    <Bridge />

    <div class="pane" id="pane-forge">
      <Forge />
    </div>

    <Manual />
  </div>

  <div id="bottom-nav">
    <button class="nav-tab" id="tab-settings">Settings</button>
    <button class="nav-tab" id="tab-sensors">Sensors</button>
    <button class="nav-tab active" id="tab-bridge">Bridge</button>
    <button class="nav-tab" id="tab-forge">Workshop</button>
    <button class="nav-tab" id="tab-manual">Manual</button>
  </div>
</div>

<Cutscene />
