# Rift Rails - Waypoint Pulse
# Original navigation-computer groove: layered kick, ticks and signals.
# Standalone Sonic Pi program. Paste into Sonic Pi and press Run.
set :ambient_amp, 1.0 unless get(:ambient_amp)
set :duck, 1.0 unless get(:duck)

# Low end: soft kick on the beat with a quiet ghost note.
live_loop :waypoint_kick do
  a = get(:ambient_amp) * get(:duck)
  sample :elec_soft_kick, amp: 0.5 * a
  sleep 0.25
  sample :elec_soft_kick, amp: 0.16 * a if one_in(3)
  sleep 0.25
end

# Fine ticks keep the grid alive without crowding it.
live_loop :waypoint_ticks do
  a = get(:ambient_amp) * get(:duck)
  sample :elec_tick, rate: [0.8, 1.2].choose, amp: 0.06 * a if one_in(2)
  sleep 0.125
end

# Signal layer: detuned pulses through echo and reverb.
with_fx :reverb, mix: 0.45, room: 0.75 do
  with_fx :echo, phase: 0.375, decay: 4, mix: 0.3 do
    live_loop :waypoint_signal do
      a = get(:ambient_amp) * get(:duck)
      with_synth :mod_pulse do
        play (scale :e3, :minor_pentatonic).choose, release: 0.22,
             amp: 0.07 * a, cutoff: 95, pulse_width: 0.35,
             mod_range: 7, mod_phase: 0.25, detune: rrand(-0.1, 0.1)
      end
      sleep [0.25, 0.375, 0.5].choose
    end
  end
end
