# Rift Rails - Rift Drift
# Original ambient soundscape for the voyage between waypoints.
# Standalone Sonic Pi program. Paste into Sonic Pi and press Run.
set :ambient_amp, 1.0 unless get(:ambient_amp)
set :duck, 1.0 unless get(:duck)

with_fx :reverb, mix: 0.7, room: 0.8 do
  with_fx :lpf, cutoff: 100 do
    live_loop :rift_drift do
      a = get(:ambient_amp) * get(:duck)
      use_synth :hollow
      chord(:e3, :m9).each do |n|
        play n, attack: 2, sustain: 1, release: 3, amp: 0.06 * a
        sleep 0.75
      end
    end
  end
end
