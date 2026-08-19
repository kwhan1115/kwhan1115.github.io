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
