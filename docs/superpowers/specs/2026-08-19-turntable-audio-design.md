# Turntable audio — design

**Date:** 2026-08-19
**Status:** Approved for planning
**Repo:** `kwhan1115/kwhan1115.github.io`

## Goal

The hero record makes sound. The visitor picks a track from a list directly
under the record, and dragging the record scratches it the way dragging a real
record would — including backwards.

Three things the visitor should be able to do:

1. Choose what plays, from a short list under the record.
2. Hear the chosen track loop while the record spins at 33⅓.
3. Grab the record and hear the audio follow the hand — slowing, stopping,
   running backwards, and winding back up to speed on release.

## Decisions already taken

Recorded here so the plan does not relitigate them. Each is Kyuwon's call
unless noted.

| Decision | Choice | Notes |
|---|---|---|
| Audio source | He supplies the files; the site reads a manifest | Five MP3s delivered 2026-08-19 |
| First sound | Silent until a track is picked | No autoplay, no arming, no "drop the needle" control |
| Record label | Names what is actually playing | It may not name anything else |
| Exam-row cueing | Removed | Rows become plain list items again |
| Credits cueing | Removed | The musician list becomes plain text |
| Kapustin | Dropped from the site | Shipped separately in `b1b79e0` |
| Encode | AAC 96 kbps `.m4a`, full length, nothing trimmed | 22.4 MB → 13.3 MB |
| Buffer storage | Int16, not Float32 | Halves peak memory, 150 MB → 75 MB |
| Engine | AudioWorklet, position-driven with feedforward | Proven by spike, see "Prior art" |

## Prior art — the spike

A throwaway spike (2026-08-19, scratchpad) proved reverse playback is possible
and measured it:

- Output at −1× matches the source read backwards to <5e-3, and a guard test
  confirms it does **not** match the source read forwards.
- Commanded −720 deg/s measured −3.43× against −3.6× predicted.
- Idle spin advanced the head 48,600 samples/sec in a 48 kHz context.
- A round trip (scratch back 3×, forward 3×) landed within 400 samples.

It also found a defect worth carrying forward: a chase-only design flutters,
swinging 0.6–1.4× once per animation frame. The fix is a feedforward term. In
the browser the spread went 0.80 → 0.095; the residue is animation-frame jitter
leaking into the rate estimate, which **this build fixes** by anchoring target
messages to the audio clock (see §3).

## Architecture

Six pieces: three new modules (`tracks.js`, `groove.js`, `scratch-worklet.js`),
one new browser-glue module (`deck-audio.js`), and edits to two existing files
(`spin.js`, `main.js`). Everything with real logic is pure and unit-tested in
Node; `deck-audio.js` is the only file that touches browser audio APIs and it
holds no logic worth testing.

```
tracks.js ──────────────┐
                        │
js/audio/groove.js ─────┼──> js/audio/deck-audio.js ──> js/audio/scratch-worklet.js
                        │         (browser glue)              (the DSP)
js/spin.js (turns) ─────┘
        │
        └──> js/deck.js ──> js/main.js ──> index.html / style.css
```

### 1 · `tracks.js` — the manifest (new, repo root)

Sits beside `exams.js` and follows the same convention: data plus a pure render
helper, both unit-tested. Adding a track is one line.

```js
export const TRACKS = [
  { id: "hiromi",   artist: "Hiromi Uehara",   title: "Seeker",                 src: "./assets/audio/hiromi-seeker.m4a" },
  { id: "evans",    artist: "Bill Evans",      title: "Waltz for Debby",        src: "./assets/audio/evans-waltz-for-debby.m4a" },
  { id: "garner",   artist: "Erroll Garner",   title: "Misty",                  src: "./assets/audio/garner-misty.m4a" },
  { id: "anomalie", artist: "Anomalie",        title: "Ouverture",              src: "./assets/audio/anomalie-ouverture.m4a" },
  { id: "insane",   artist: "insaneintherain", title: "Rosalina's Observatory", src: "./assets/audio/insaneintherain-rosalina.m4a" },
];

export function trackPickerHTML(tracks): string
```

Artist and title are separate fields because the record label already has two
lines: `.record__title` takes the title, `.record__side` takes the artist.

**Invariant:** `id` is unique and is the value of `data-track` in the markup.
Tested.

### 2 · `js/spin.js` — rotation becomes cumulative (edit)

One new field on the deck state and one new line of physics:

```js
state.turns   // cumulative revolutions, signed, never wrapped
```

- `stepSpin` adds `vel * step / 360`.
- `deck.js`'s `pointermove` adds `delta / 360`.

`state.angle` stays wrapped for painting; `turns` is the audio's clock. This
is the whole coupling between the record and the sound — there is no second
notion of playback rate anywhere in the system.

**Why not velocity:** `deck.js` sets `state.vel = 0` on `pointerdown` and lets
the pointer drive `state.angle` directly. Velocity therefore reads zero during
the exact gesture that should make the most interesting sound. Angle is always
live.

### 3 · `js/audio/groove.js` — the mapping (new, pure)

```js
export const SECONDS_PER_TURN = 1.8;          // 60 / (33 + 1/3)
export const MAX_RATE = 8;
export function samplesFromTurns(turns, sampleRate): number
export function clampRate(rate): number
```

`MAX_RATE` is duplicated as a literal inside `WORKLET_SOURCE`, because an
AudioWorklet scope cannot import. The worklet is the one that enforces it; the
`groove.js` copy exists so the value is testable and documented in one obvious
place. The plan must assert the two agree.

One revolution of the record is one revolution's worth of audio. At 33⅓ that
is 1.8 s, so idle spin plays at exactly 1× and every other behaviour —
pitch-up on a throw, reverse on a backward drag, silence at a standstill —
falls out of the physics rather than being tuned by ear.

### 4 · `js/audio/scratch-worklet.js` — the DSP (new)

Exports `WORKLET_SOURCE`, a string. The browser turns it into a Blob URL for
`audioWorklet.addModule()`; the Node test evaluates the same text against stub
globals. One source, genuinely tested. (AudioWorklet scopes do not support ES
module imports, so a string is the only way to avoid duplicating the maths.)

**Storage.** Two `Int16Array` channels. `decodeAudioData` yields Float32; the
engine converts before transfer. 16 bits is CD depth, and it halves the
resident size of every track.

**Read.** Catmull-Rom through the four samples around a fractional head.
Linear interpolation aliases audibly once a scratch sweeps the rate.

**Rate.** Feedforward plus a slow correction:

```
nominal   = rate implied by successive target messages, smoothed
projected = target + nominal * (samples since that message)
want      = nominal + (projected - cur) / CHASE
```

`nominal` carries the pitch, so a direction change lands within one frame.
The chase only trims residual error, slowly enough to stay inaudible, which
is what keeps position exact over a long scratch without flutter.

**The audio-clock fix.** Target messages carry `at: audioCtx.currentTime`, and
`nominal` is derived from `(pos - lastPos) / ((at - lastAt) * sampleRate)`.
Deriving it from block counts instead — as the spike did — bakes animation-frame
jitter into the pitch, which is the ±5% residue the spike measured.

**Rate is slewed across the block**, not stepped once per block. Stepping puts
a click at every 128-sample boundary.

**Gain gate.** Below ~2% rate the output fades out, so a held record is silent
rather than a DC thump.

Message protocol:

| direction | message | meaning |
|---|---|---|
| → worklet | `{type:"buffer", left, right, sampleRate}` | transferables; replaces any current track |
| → worklet | `{type:"target", pos, at}` | head should be at `pos` samples, as of audio time `at` |
| → worklet | `{type:"reset", pos}` | drop the needle at `pos`, clear rate state |
| → worklet | `{type:"gain", value}` | master level, for mute |
| → main | `{type:"pos", cur, rate, rms}` | throttled telemetry, drives the UI and the tests |

### 5 · `js/audio/deck-audio.js` — browser glue (new)

```js
createDeckAudio({ onState }) -> { load(track), setTurns(turns), setMuted(bool), stop() }
```

- The `AudioContext` is constructed on the first `load()` — this is a user
  gesture, which the autoplay policy requires.
- **Constructed at 44100 Hz** to match the source files. A default 48 kHz
  context makes `decodeAudioData` resample every track on the way in, costing
  ~9% more memory and a pointless resampling pass.
- Exactly one decoded track is resident. Loading a new one releases the old and
  aborts any in-flight fetch.
- `onState` reports `{ id, status }` where status is
  `idle | loading | playing | failed`, which is all the UI needs.

### 6 · `js/main.js` — wiring (edit)

- Picking a track: `audio.load(track)`, `deck.cue(track.title, track.artist)`,
  and un-pause the record. Picking the playing track stops it.
- **`deck.js` must grow one export for this.** `paused` is module-private and
  `togglePaused` is only reachable from a click on the record itself, so
  `createDeck` gains `setPaused(bool)` (keeping `aria-pressed` in step). Without
  it a picked track on a stopped record is silent with nothing on screen saying
  why — which is also the reduced-motion path, where the record starts still.
- Per frame: `audio.setTurns(deck.state.turns)`.
- Delete the `[data-cue]` button wiring (exam rows and credits).

## UI

The picker lives inside `.deck`, immediately under the record, as asked.

- One button per track: title on the first line, artist on the second.
- Four visible states: idle, loading, playing, unavailable.
- A mute toggle sits with the picker.
- Playing state is carried by the existing "now playing" strip and the record
  label, which already exist and already animate.

Removed: the six credit buttons become a plain list (five, post-Kapustin), and
the exam rows lose their buttons. `examRowHTML` returns a non-interactive row;
its aria-label and `data-cue`/`data-sub` attributes go with it.

**Colour rule carried over:** red/magenta is reserved for "running past its own
speed" on this page. The picker must not spend it on ordinary selection.

## Accessibility

- Each picker button is a real `<button>` with `aria-pressed`.
- Track status is announced through the existing `aria-live="polite"` strip;
  the picker itself does not need a second live region.
- Reduced motion: the record starts still. Picking a track must start the
  spin, or the visitor gets silence and no explanation. Explicit in the plan.
- Nothing about the feature is pointer-only. The record already answers arrow
  keys; the picker is keyboard-operable by construction.
- Mute is reachable by keyboard and labelled.

## Error handling

| Failure | Behaviour |
|---|---|
| Fetch 404 / network error | That row shows "unavailable", page keeps working |
| `decodeAudioData` rejects | Same, with a console warning naming the track |
| `addModule` fails (no AudioWorklet) | Picker is not rendered at all; the record stays a silent visual |
| Pick during another load | Previous fetch aborted, previous buffer released |
| Tab hidden | Existing `visibilitychange` halt already stops the frame loop; audio follows because `turns` stops advancing |

## Testing

Node `--test`, matching the repo's existing convention. Current baseline is 57.

| Suite | Covers |
|---|---|
| `js/audio/scratch-worklet.test.js` | Ported spike tests: reverse match, forward-mismatch guard, flutter, reversal latency, standstill silence, round-trip exactness, NaN safety, rate clamp. Plus stereo independence and Int16 round-trip fidelity |
| `js/audio/groove.test.js` | Turn→sample mapping, idle = 1×, clamps |
| `tracks.test.js` | Manifest well-formed, ids unique, picker HTML escapes, every `src` under `./assets/audio/` |
| `js/spin.test.js` | `turns` accumulates signed and unwrapped; survives the 0/360 seam; frame-rate independent |
| `exams.test.js` | Rows are no longer buttons; no `data-cue` survives |

**Browser verification is required, not optional.** The feature's evidence is
partly an absence (no flutter, no click), and a no-op looks identical to a pass.
Verify by measurement, not by eye:

- Idle rate spread < 0.02 with the audio-clock fix in place (the spike measured
  0.095 without it).
- A scripted backward drag moves the reported head negative while RMS stays
  above 0.1.
- Zero console messages.
- Repeat on the live URL after the Pages build reports `built`.

## Asset pipeline

```
ffmpeg -i <source>.mp3 -c:a aac -b:a 96k -movflags +faststart assets/audio/<id>.m4a
```

Sources are at `C:\Users\kwhan\Desktop\Github Website Audio`. Output committed
to the repo: five files, 13.3 MB total.

Measured cost of the encode, mean energy by band, Hiromi (the 191 kbps source,
worst case): −0.7 dB above 14 kHz, −1.7 dB above 16 kHz, −3.3 dB above 18 kHz,
in a band already 53 dB below the program. Bill Evans is unchanged within
0.2 dB because his source was already ~100 kbps.

This measures spectral energy only. It does not detect pre-echo or stereo-image
collapse, and no one has listened critically.

## Risks

- **Licensing.** Five commercial recordings will be served from a public
  repository and a public site. The exposure is a DMCA takedown against the
  repo. Raised 2026-08-19; Kyuwon chose to supply the files and own the call.
- **Repo weight is permanent.** 13.3 MB enters git history and cannot be
  removed by a later delete. Re-encoding later adds, it does not replace. Get
  the encode right once.
- **Peak memory 75 MB** on the Hiromi track. Safe on desktop and on current
  phones; it is the number to revisit if a longer track is ever added.
- **Safari is unverified.** AudioWorklet has been supported since 14.1 and AAC
  decodes everywhere, but no Safari device is available here. Untested, not
  broken.

## Out of scope

Crossfader and DJ-style cuts (no mixer, so transform and flare scratches are
not reachable). Playlists and auto-advance — the chosen track loops, which is
what a record does. A volume slider beyond mute. Per-track artwork. Any
waveform display of the audio itself; the existing waveform is the scroll
progress bar and stays that.
