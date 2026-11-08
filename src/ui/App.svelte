<script lang="ts">
import { onMount } from "svelte";
import { Engine } from "../game/engine";
import { RiftEyes } from "../game/eyes";
import { RiftReducedMotion } from "../game/motion";
import { TransitionFX } from "../game/fx";
import { syncVoyage } from "../stores/voyage.svelte";
import { sensors } from "../stores/sensors.svelte";
import { resetNav } from "../stores/nav.svelte";
import { bindRefs } from "../stores/refs.svelte";
import { settings } from "../stores/settings.svelte";
import { GAME_DATA } from "../game/data";
import Dial from "./Dial.svelte";
import Board from "./Board.svelte";
import Vitals from "./Vitals.svelte";
import Forge from "./Forge.svelte";
import Cutscene from "./Cutscene.svelte";
import Bridge from "./Bridge.svelte";
import Manual from "./Manual.svelte";
import Start from "./Start.svelte";
import Panels from "./Panels.svelte";

function collectRefs(): Record<string, HTMLElement | null> {
  const map: Record<string, HTMLElement | null> = {};
  for (const id of Object.values(GAME_DATA.dom.ids)) {
    map[id] = document.getElementById(id);
  }
  return map;
}

onMount(() => {
  bindRefs(collectRefs());
  RiftEyes.bindPortrait(document.getElementById(GAME_DATA.dom.ids.corvusPortrait!));
  RiftEyes.bindRig(document.getElementById(GAME_DATA.dom.ids.gameContainer!));
  TransitionFX.bindCanvas(
    document.getElementById(GAME_DATA.dom.ids.fxCanvas!) as HTMLCanvasElement | null,
  );
  TransitionFX.bindArtGlyph(document.getElementById(GAME_DATA.dom.ids.artGlyph!));
  TransitionFX.bindChrome(
    document.getElementById(GAME_DATA.dom.ids.gameContainer!),
    document.getElementById(GAME_DATA.dom.ids.bridgeScene!),
  );
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
<div id="bridge-scene" aria-hidden="true">
  {#if sensors.bridgeArtwork}{@html sensors.bridgeArtwork}{/if}
</div>

<Start />

<div id="nav-screen">
  <h1 id="lbl-nav-title">{settings.lblNavTitle}</h1>
  <Board />
  <Dial />
</div>

<div id="game-container">
  <Vitals />

  <div id="snap-slider" onscroll={() => Engine.syncTabsWithScroll()}>
    <Panels />

    <Bridge />

    <div class="pane" id="pane-forge">
      <Forge />
    </div>

    <Manual />
  </div>

  <div id="bottom-nav">
    <button class="nav-tab" id="tab-settings" onclick={() => Engine.scrollToPane(0)}>Settings</button>
    <button class="nav-tab" id="tab-sensors" onclick={() => Engine.scrollToPane(1)}>Sensors</button>
    <button class="nav-tab active" id="tab-bridge" onclick={() => Engine.scrollToPane(2)}>Bridge</button>
    <button class="nav-tab" id="tab-forge" onclick={() => Engine.scrollToPane(3)}>Workshop</button>
    <button class="nav-tab" id="tab-manual" onclick={() => Engine.scrollToPane(4)}>Manual</button>
  </div>
</div>

<Cutscene />
