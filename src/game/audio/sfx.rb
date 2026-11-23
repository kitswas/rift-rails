# Rift Rails - one-shot sound effects.
# Standalone Sonic Pi program: paste into Sonic Pi, Run once, then call e.g. sfx_success.
set :sfx_amp, 1.0 unless get(:sfx_amp)
set :duck, 1.0 unless get(:duck)

define :sfx_jump do |seconds|
  set :duck, 0.02
  a = get(:sfx_amp)
  s = synth :tb303, note: 30, amp: 0.01 * a, amp_slide: seconds, attack: 0.01,
            sustain: seconds * 0.85, release: 0.05, cutoff: 120, cutoff_slide: seconds
  control s, amp: 0.2 * a, cutoff: 86
  w = synth :sine, note: 70, note_slide: seconds, amp: 0.01 * a, amp_slide: seconds,
            attack: 0.01, sustain: seconds * 0.85, release: 0.05
  control w, note: 85, amp: 0.14 * a
  sleep seconds + 0.6
  set :duck, 1.0
end

define :sfx_arrival do
  n = synth :tri, note: 76, note_slide: 0.08, release: 0.55, amp: 0.16 * get(:sfx_amp)
  control n, note: 79
end

define :sfx_dialogue do
  synth :sine, note: 84, release: 0.22, amp: 0.08 * get(:sfx_amp)
end

define :sfx_success do
  a = 0.18 * get(:sfx_amp)
  play 72, release: 0.28, amp: a
  sleep 0.06
  play 76, release: 0.28, amp: a
  sleep 0.06
  play 79, release: 0.28, amp: a
end

define :sfx_damage do
  n = synth :saw, note: 45, note_slide: 0.2, release: 0.22, amp: 0.25 * get(:sfx_amp)
  control n, note: 33
end

define :sfx_silence do
  set :duck, 0.0
end
