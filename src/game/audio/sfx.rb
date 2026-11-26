# Rift Rails - one-shot sound effects.
# Standalone Sonic Pi program: paste into Sonic Pi, Run once, then call e.g. sfx_success.
set :sfx_amp, 1.0 unless get(:sfx_amp)
set :duck, 1.0 unless get(:duck)

# Old Web Audio jump: sawtooth 55->360 Hz through a bandpass 200->3600 Hz (Q 4),
# plus a sine 220->1300 Hz. Both swell to peak at 90% of the charge, then fade.
define :sfx_jump do |seconds|
  set :duck, 0.02
  a = get(:sfx_amp)
  with_fx :bpf, centre: 55, centre_slide: seconds, res: 0.8 do |f|
    control f, centre: 105
    s = synth :saw, note: 33, note_slide: seconds, amp: 0.01 * a,
              amp_slide: seconds * 0.9, sustain: seconds, release: 0.05
    control s, note: 66, amp: 0.2 * a
    w = synth :sine, note: 57, note_slide: seconds, amp: 0.01 * a,
              amp_slide: seconds * 0.9, sustain: seconds, release: 0.05
    control w, note: 88, amp: 0.14 * a
    sleep seconds * 0.9
    control s, amp: 0.0001, amp_slide: 0.08
    control w, amp: 0.0001, amp_slide: 0.08
  end
  sleep seconds * 0.1 + 0.6
  set :duck, 1.0
end

# Old Web Audio arrival: triangle 587.33 -> 880 Hz over 80 ms, 550 ms decay.
define :sfx_arrival do
  n = synth :tri, note: 74, note_slide: 0.08, release: 0.55, amp: 0.16 * get(:sfx_amp)
  control n, note: 81
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
