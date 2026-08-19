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

export function createDeckAudio({ onState } = {}) {
  let ctx = null;
  let node = null;
  let moduleReady = null;
  let current = null;      // the track id that is loaded or loading
  let origin = null;       // turns at the moment the needle went down
  let lastTurns = 0;
  let token = 0;           // guards against a slow load landing after a newer one
  let abort = null;
  let muted = false;
  let telemetry = null;    // last {cur, rate, rms} the worklet posted

  const report = (id, status) => onState?.({ id, status });

  const isSupported = () =>
    typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";

  async function ensureGraph() {
    if (node) return;
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (!moduleReady) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      moduleReady = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    }
    await moduleReady;
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
  }

  async function load(track) {
    const mine = ++token;
    abort?.abort();
    abort = new AbortController();
    current = track.id;
    origin = null;
    report(track.id, "loading");

    try {
      await ensureGraph();
      // Safari suspends the context until a gesture; this call is inside the
      // click that picked the track, so it is allowed to resume here.
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch(track.src, { signal: abort.signal });
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
      report(track.id, "playing");
    } catch (err) {
      if (err.name === "AbortError" || mine !== token) return;
      console.warn(`[deck-audio] could not play ${track.id}:`, err);
      current = null;
      report(track.id, "failed");
    }
  }

  function setTurns(turns) {
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
    node.port.postMessage({
      type: "target",
      pos: samplesFromTurns(turns - origin, ctx.sampleRate),
      at: ctx.currentTime,
    });
  }

  function setMuted(value) {
    muted = value;
    node?.port.postMessage({ type: "gain", value: muted ? 0 : 1 });
  }

  function stop() {
    abort?.abort();
    token++;
    origin = null;
    const was = current;
    current = null;
    node?.port.postMessage({ type: "gain", value: 0 });
    if (was) report(was, "idle");
  }

  // The last telemetry the worklet posted, or null before the first message
  // has arrived. This is the only window this module has into whether the
  // DSP is actually doing what setTurns has been asking it to do.
  function getTelemetry() {
    return telemetry;
  }

  return { load, setTurns, setMuted, stop, isSupported, getTelemetry };
}
