# Rift Rails - Bridge Telemetry (Lo-Fi)
# Standalone Sonic Pi program. Paste into Sonic Pi and press Run.
set :ambient_amp, 1.0 unless get(:ambient_amp)
set :duck, 1.0 unless get(:duck)

live_loop :telemetry do
  if one_in(5)
    n = synth :sine, note: 93 + rand(6), attack: 0, sustain: 0.035, release: 0.005,
              amp: 0.06 * get(:ambient_amp) * get(:duck), amp_slide: 0.035
    control n, amp: 0.001
  else
    n = synth :square, note: 23, cutoff: 47, attack: 0, sustain: 0.004, release: 0.002,
              amp: 0.08 * get(:ambient_amp) * get(:duck), amp_slide: 0.004
    control n, amp: 0.001
  end
  sleep 0.14 + rand * 0.68
end
