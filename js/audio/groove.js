// How the record's rotation becomes a position in the audio. Pure — no DOM, no
// audio API. Unit-tested in groove.test.js.
//
// One revolution of the record is one revolution's worth of audio. That single
// rule is the whole coupling between the picture and the sound: idle spin comes
// out at 1x, a throw pitches up, a backward drag runs backwards, and a record
// held still is silent — none of it tuned by ear.

export const RPM = 100 / 3;                    // 33 1/3
export const SECONDS_PER_TURN = 1.8;           // 60 / RPM

// A throw can reach ~2600 deg/s, which is 13x. Past about 8x the audio is not
// recognisable as music any more and the top octave aliases, so the head stops
// accelerating there. NOTE: duplicated as a literal in scratch-worklet.js,
// because an AudioWorklet scope cannot import. Kept honest by a test.
export const MAX_RATE = 8;

/** Where the needle should be, in samples, for a given cumulative rotation. */
export function samplesFromTurns(turns, sampleRate) {
  return turns * SECONDS_PER_TURN * sampleRate;
}

/** A rate the read head can actually use: finite, and inside MAX_RATE. */
export function clampRate(rate) {
  if (Number.isNaN(rate) || rate === undefined) return 0;
  return Math.max(-MAX_RATE, Math.min(MAX_RATE, rate));
}

/**
 * The audio rate implied by the record's current angular velocity (deg/s).
 * Exactly 1 at IDLE_VEL, because SECONDS_PER_TURN was tuned so idle spin
 * plays back at real speed — so this is the same "one revolution is one
 * revolution's worth of audio" rule, just run forwards from velocity instead
 * of from a position delta. Used to seed the worklet's feedforward the
 * moment a track loads: without a seed, the worklet has to rediscover
 * whatever the record is already doing through several EMA-smoothed target
 * messages, which is what let a freshly picked track visibly climb to its
 * correct pitch instead of starting there.
 */
export function rateFromVel(vel) {
  return (vel / 360) * SECONDS_PER_TURN;
}

/** The inverse of samplesFromTurns — a sample position back to a turns count. */
export function turnsFromSamples(samples, sampleRate) {
  return samples / (SECONDS_PER_TURN * sampleRate);
}

// A safety net for when the record's rotation and the worklet's actual head
// position have genuinely diverged — a tab-hidden freeze whose
// visibilitychange event never fired, or one the embedding throttled into
// uselessness, rather than the ordinary small drift the chase term exists to
// trim. One second of audio is the threshold: it sits far above both things
// that produce ordinary residual gaps — the worklet's telemetry is at most
// ~2400 samples (~54ms at 44.1kHz) stale, and chase=50000 keeps in-flight
// chase residual on the order of a thousand samples even during an active
// scratch (see scratch-worklet.js's own chase comment: it predicts ~0.016 of
// rate spread, which is ~0.016 * 50000 ≈ 800 samples of gap) — so neither ever
// trips this. It sits far BELOW what even a brief hidden tab produces: the
// record advances audio at roughly its own sample rate per second of real
// time (idle spin plays at 1x), so a freeze of even a couple of seconds
// clears this threshold several times over.
export const REANCHOR_GAP_SECONDS = 1;

/**
 * Should the engine re-anchor the origin instead of letting the chase term
 * close this gap? A chase is for trimming small residual error accumulated
 * a little at a time; a multi-second gap is not that, and chasing it means
 * dragging the head backward through however much audio the frozen clock
 * owes — audible as playback running in reverse.
 */
export function shouldReanchor(target, cur, sampleRate, thresholdSeconds = REANCHOR_GAP_SECONDS) {
  if (!Number.isFinite(target) || !Number.isFinite(cur)) return false;
  return Math.abs(target - cur) > thresholdSeconds * sampleRate;
}
