<div
  id="cutscene-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="cutscene-speaker"
  aria-describedby="cutscene-body"
  hidden
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
      <button class="btn-cutscene-choice" id="cutscene-btn-a" type="button"></button>
      <button class="btn-cutscene-choice" id="cutscene-btn-b" type="button"></button>
    </div>
  </section>
</div>
<div id="tutorial-cue" role="status" hidden></div>
