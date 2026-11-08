<script lang="ts">
  import { CutsceneEngine } from "../game/cutscene";
</script>

<div
  id="cutscene-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="cutscene-speaker"
  aria-describedby="cutscene-body"
  tabindex="-1"
  hidden
  onkeydown={(e) => CutsceneEngine.trapFocus(e as unknown as KeyboardEvent)}
  onfocusin={(e) => CutsceneEngine.trapFocus(e as unknown as Event)}
>
  <section class="cutscene-frame">
    <img class="cutscene-portrait" src="assets/corvus.svg" alt="" aria-hidden="true" />
    <div class="cutscene-header">
      <span class="cutscene-speaker" id="cutscene-speaker">
        <span aria-hidden="true">✦</span> MASTER CORVUS // VEILED SCHOLAR
      </span>
      <span id="cutscene-progress" class="cutscene-pips"></span>
    </div>
    <div id="cutscene-body" class="cutscene-text" aria-live="polite"></div>
    <div id="cutscene-choices" class="cutscene-options">
      <button
        class="btn-cutscene-choice"
        id="cutscene-btn-a"
        type="button"
        aria-label="Cutscene choice A"
        onclick={() => CutsceneEngine.advance()}
      ></button>
      <button
        class="btn-cutscene-choice"
        id="cutscene-btn-b"
        type="button"
        aria-label="Cutscene choice B"
        onclick={() => CutsceneEngine.advance()}
      ></button>
    </div>
  </section>
</div>

