<script lang="ts">
  // Host-only board: Svelte owns the #nav-choices mount point so legacy
  // RiftCouplingBoard.render() can populate rail SVG + carriage buttons
  // imperatively until the declarative switch lands. Keep IDs/classes stable
  // for the Edge harness (.nav-carriage, .board-coupler, data-slot).
</script>

<div id="nav-choices" data-svelte-board="true"></div>
