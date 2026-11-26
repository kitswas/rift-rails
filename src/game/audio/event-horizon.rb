# Rift Rails - Event Horizon
# Original sparse soundscape: drone, bells and shimmer echoing across the rift.
# Standalone Sonic Pi program. Paste into Sonic Pi and press Run.
set :ambient_amp, 1.0 unless get(:ambient_amp)
set :duck, 1.0 unless get(:duck)

with_fx :reverb, room: 0.9, mix: 0.8 do
  with_fx :echo, phase: 0.75, decay: 6, mix: 0.4 do

    # A slow, detuned sub whose filter breathes open and closed.
    live_loop :event_drone do
      a = get(:ambient_amp) * get(:duck)
      with_synth :dsaw do
        s = play :e2, attack: 4, sustain: 6, release: 4, amp: 0.09 * a,
                 detune: rrand(-0.2, 0.2), cutoff: 45, cutoff_slide: 6
        control s, cutoff: 70
      end
      sleep 12
    end

    # Irregular bells walk a fixed sequence rather than repeating at random.
    live_loop :event_bells do
      a = get(:ambient_amp) * get(:duck)
      with_synth :sine do
        play (ring :e2, :b2, :g3, :e4, :b3, :g4).tick,
             release: rrand(2, 4), amp: 0.11 * a
      end
      sleep [0.75, 1.5, 1.5, 2.25].choose
    end

    # A higher, panned shimmer drifts against the bell rhythm.
    live_loop :event_shimmer do
      a = get(:ambient_amp) * get(:duck)
      with_synth :hollow do
        play (chord :e4, :m9).choose + 12, attack: 1.5, release: 3,
             amp: 0.04 * a, pan: rrand(-0.8, 0.8)
      end
      sleep rrand(2.5, 4.5)
    end

  end
end
