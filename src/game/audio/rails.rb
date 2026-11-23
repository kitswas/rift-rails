# Rift Rails - Ley-Rail Rhythm (Kinetic)
# Standalone Sonic Pi program. Paste into Sonic Pi and press Run.
set :ambient_amp, 1.0 unless get(:ambient_amp)
set :duck, 1.0 unless get(:duck)

live_loop :rails do
  step = tick % 4
  if step == 0 || step == 2
    n = synth :tri, note: 49, note_slide: 0.025, cutoff: 80, attack: 0, sustain: 0.04,
              release: 0.005, amp: 0.25 * get(:ambient_amp) * get(:duck), amp_slide: 0.035
    control n, note: 16, cutoff: 52, amp: 0.001
  elsif step == 1
    n = synth :sine, note: 43, note_slide: 0.025, attack: 0, sustain: 0.04,
              release: 0.005, amp: 0.14 * get(:ambient_amp) * get(:duck), amp_slide: 0.035
    control n, note: 16, amp: 0.001
  end
  sleep 0.195
end
