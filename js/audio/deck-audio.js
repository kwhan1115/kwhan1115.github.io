// The audio engine. Owns the AudioContext, loads and decodes a track, and
// reports the record's rotation to the worklet as a target position.
//
// Everything with logic worth testing lives in groove.js and scratch-worklet.js.
// This file is the part that can only run in a browser, so it is kept thin on
// purpose.

import { samplesFromTurns } from "./groove.js";
import { WORKLET_SOURCE, PROCESSOR_NAME } from "./scratch-worklet.js";

// The source files are 44.1kHz. A default 48kHz context would make
// decodeAudioData resample every track on the way in — a pointless pass, and
// ~9% more memory held for the whole session.
const SAMPLE_RATE = 44100;

/**
 * Float samples to 16-bit. Halves what a decoded track costs in memory, at CD
 * depth, which is inaudible. Clips rather than wraps: decoded floats can exceed
 * +/-1, and wrapping would turn a track's loudest moment into noise.
 */
export function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i];
    out[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : Math.round(v * 32767);
  }
  return out;
}

/**
 * The feedforward rate implied by a new position sample, tracked across
 * calls in `state` ({ratePos, rateAtMs}, both null before the first sample).
 * Exported and split out of setTurns specifically so this exact computation
 * is provable in a fast Node test without an AudioContext.
 *
 * `nowMs` is optional and falls back to performance.now(), so this stays
 * usable from any caller that doesn't have its own clock handy. But a
 * caller-supplied timestamp is STRONGLY preferred whenever one is
 * available, for a reason subtle enough that someone will otherwise
 * "simplify" this default back into the only path: js/main.js's frame loop
 * advances deck.state.turns using the requestAnimationFrame timestamp, and
 * this function used to be inlined into setTurns sampling its OWN
 * performance.now() independently of that. The two clocks agree on average
 * but disagree by a few milliseconds on any single frame — whatever
 * per-frame work runs between them (measureFocus, deck.step) — which is
 * invisible to any test that calls this synchronously with no real elapsed
 * time, and only showed up as broadband pitch noise in a real browser
 * measurement. Passing the SAME timestamp that drove `turns` forward is
 * what makes the numerator (position travel) and denominator (elapsed
 * time) agree.
 */
export function nextTarget(pos, sampleRate, state, nowMs = performance.now()) {
  let rate = NaN;
  if (state.rateAtMs !== null) {
    const dtMs = nowMs - state.rateAtMs;
    // A non-positive gap can't be divided into a rate. NaN — not 0 — is the
    // value the worklet is built to read as "no update this frame"; sending
    // 0 would tell it the record had genuinely stopped turning.
    if (dtMs > 0) rate = (pos - state.ratePos) / ((dtMs / 1000) * sampleRate);
  }
  state.ratePos = pos;
  state.rateAtMs = nowMs;
  return { rate };
}

export function createDeckAudio({ onState } = {}) {
  let ctx = null;
  let node = null;
  // Memoised setup: every load() awaits the SAME promise, so two overlapping
  // loads can't each build their own AudioContext and leave the loser's node
  // silently disconnected from a worklet module that never loaded for it.
  let graphReady = null;
  let current = null;      // the track id that is loaded or loading
  let origin = null;       // turns at the moment the needle went down
  let lastTurns = 0;
  let token = 0;           // guards against a slow load landing after a newer one
  let abort = null;
  let muted = false;
  let telemetry = null;    // last {cur, rate, rms} the worklet posted
  let rateState = { ratePos: null, rateAtMs: null };  // see nextTarget()

  const report = (id, status) => onState?.({ id, status });

  const isSupported = () =>
    typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";

  // Idempotent under concurrency: the check-and-set on graphReady happens
  // synchronously (JS runs an async function's body up to its first await
  // without interleaving), so the second of two overlapping load() calls sees
  // graphReady already set and awaits the first one's setup instead of
  // starting a second AudioContext of its own.
  function ensureGraph() {
    if (!graphReady) {
      graphReady = (async () => {
        ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
        node = new AudioWorkletNode(ctx, PROCESSOR_NAME, { outputChannelCount: [2] });
        // The worklet posts {type:"pos"} roughly every 2400 samples. Nobody can
        // hear this feature from a terminal, so this stream is the only evidence
        // that the rate is steady, that a backward drag drives the head negative,
        // or that a held record goes silent — keep the latest one for whoever
        // asks via getTelemetry().
        node.port.onmessage = (e) => {
          const m = e.data;
          if (m.type === "pos") telemetry = { cur: m.cur, rate: m.rate, rms: m.rms };
        };
        node.connect(ctx.destination);
      })();
    }
    return graphReady;
  }

  async function load(track) {
    const mine = ++token;
    abort?.abort();
    // Captured locally: `abort` (the shared closure variable) gets
    // reassigned the instant a later load() starts, which can happen while
    // this invocation is still awaiting ensureGraph()/ctx.resume() — before
    // it ever reaches the fetch below. Reading `abort.signal` at that point
    // would bind this fetch to the NEXT invocation's controller, so a stop()
    // or a third load() would abort the wrong request and this one's
    // multi-megabyte download/decode would run to completion for nothing.
    const myAbort = new AbortController();
    abort = myAbort;
    current = track.id;
    origin = null;
    // A stale reading from whatever track was playing before this one must
    // not answer for this one — clear it now, synchronously, not after the
    // new buffer's first pos message happens to arrive.
    telemetry = null;
    report(track.id, "loading");

    try {
      await ensureGraph();
      // Safari suspends the context until a gesture; this call is inside the
      // click that picked the track, so it is allowed to resume here.
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch(track.src, { signal: myAbort.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
      if (mine !== token) return;                       // a newer pick won

      const left = toInt16(decoded.getChannelData(0));
      const right = decoded.numberOfChannels > 1 ? toInt16(decoded.getChannelData(1)) : left;
      const transfer = right === left ? [left.buffer] : [left.buffer, right.buffer];
      node.port.postMessage({ type: "buffer", left, right }, transfer);
      node.port.postMessage({ type: "reset", pos: 0 });
      node.port.postMessage({ type: "gain", value: muted ? 0 : 1 });

      // The record has been turning since the page loaded, so its rotation
      // count means nothing to a track that just went on. Anchor here: from now
      // on, position is measured from this moment.
      origin = lastTurns;
      // A rate carried over from the previous track would be a delta against
      // a position measured from a completely different origin — drop it, so
      // the first setTurns call for this track only plants an anchor.
      rateState = { ratePos: null, rateAtMs: null };
      report(track.id, "playing");
    } catch (err) {
      if (err.name === "AbortError" || mine !== token) return;
      console.warn(`[deck-audio] could not play ${track.id}:`, err);
      current = null;
      report(track.id, "failed");
    }
  }

  function setTurns(turns, nowMs) {
    // The worklet trusts its message contract and never validates an inbound
    // number: `cur += NaN` would poison the read head for every sample after
    // it, and read() would then index the buffer with NaN. This module is the
    // only sender, so the guard has to live here. A non-finite turns value
    // would also get baked into `origin` (via lastTurns) at the next load,
    // poisoning every position on the next track too — so reject it before
    // either lastTurns or the worklet ever sees it, not just before the post.
    if (!Number.isFinite(turns)) return;
    lastTurns = turns;
    if (!node || origin === null) return;

    const pos = samplesFromTurns(turns - origin, ctx.sampleRate);
    // `nowMs` should be the SAME timestamp the caller used to advance
    // `turns` in the first place — see nextTarget()'s own comment for why
    // that matters more than it looks like it should.
    const { rate } = nextTarget(pos, ctx.sampleRate, rateState, nowMs);
    node.port.postMessage({ type: "target", pos, rate });
  }

  function setMuted(value) {
    muted = value;
    node?.port.postMessage({ type: "gain", value: muted ? 0 : 1 });
  }

  function stop() {
    abort?.abort();
    token++;
    origin = null;
    // A silent record has to read as silent. Without this, getTelemetry()
    // would keep answering with whatever rms was last measured before the
    // stop — a completely silent record would then measure as still
    // playing, the exact failure mode where a no-op and a pass look
    // identical. The worklet itself keeps running (gain 0 mutes the output,
    // it does not pause process()), so a fresh, legitimately-near-zero
    // reading repopulates the cache on its own within one telemetry
    // interval; this just closes the gap where the old one would otherwise
    // still be served.
    telemetry = null;
    rateState = { ratePos: null, rateAtMs: null };
    const was = current;
    current = null;
    node?.port.postMessage({ type: "gain", value: 0 });
    if (was) report(was, "idle");
  }

  // The last telemetry the worklet posted, or null before the first message
  // has arrived for the current track — that includes right after load()
  // starts and right after stop(), both of which clear the cache rather than
  // let it go on answering for a track that is no longer the one playing.
  // This is the only window this module has into whether the DSP is actually
  // doing what setTurns has been asking it to do, so a stale reading here
  // would make a no-op and a pass look identical from the outside.
  function getTelemetry() {
    return telemetry;
  }

  return { load, setTurns, setMuted, stop, isSupported, getTelemetry };
}
