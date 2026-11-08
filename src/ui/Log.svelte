<script lang="ts">
  import { ui } from "../stores/ui.svelte";
  import { menu, invokeMenuItem } from "../stores/menu.svelte";
</script>

<div id="story-log"></div>
<div id="action-buttons">
  <button id="btn-explore" class="btn-energy" disabled={ui.exploreDisabled}>{ui.exploreLabel}</button>
  <button id="btn-travel" class="btn-travel" disabled={ui.travelDisabled}>{ui.travelLabel}</button>
</div>
<button
  id="btn-desperate"
  class="btn-desperate"
  style="display: {ui.desperateVisible ? "block" : "none"}"
>
  {ui.desperateLabel}
</button>
<div id="encounter-choices">
  {#each menu.items as item (item.id)}
    <button
      class={item.uiClass}
      data-act-id={item.actId}
      data-yard-id={item.yardId}
      disabled={item.disabled}
      onclick={() => invokeMenuItem(item.id)}
    >
      {item.label}
    </button>
  {/each}
</div>
