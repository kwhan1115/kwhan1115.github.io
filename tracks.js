// What the record can play, and the pure helper that renders the picker.
// Sits beside exams.js and follows the same shape: data plus a render function,
// both unit-tested, so adding a track is one line and nothing else.
//
// `artist` and `title` are separate because the record's label already has two
// lines — the title goes on .record__title, the artist on .record__side.

export const TRACKS = [
  { id: "hiromi",    artist: "Hiromi Uehara",    title: "Seeker",                       src: "./assets/audio/hiromi-seeker.m4a" },
  { id: "evans",     artist: "Bill Evans",       title: "Waltz for Debby",              src: "./assets/audio/evans-waltz-for-debby.m4a" },
  { id: "garner",    artist: "Erroll Garner",    title: "Misty",                        src: "./assets/audio/garner-misty.m4a" },
  { id: "anomalie",  artist: "Anomalie",         title: "Ouverture",                    src: "./assets/audio/anomalie-ouverture.m4a" },
  { id: "insane",    artist: "insaneintherain",  title: "Rosalina in the Observatory",  src: "./assets/audio/insaneintherain-rosalina.m4a" },
];

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The list under the record. Each row is a button: pressing it drops the needle
 * on that track, pressing the playing one lifts it. The visible text is title
 * over artist; the accessible name spells the action out, because "Seeker"
 * alone does not say the row does anything.
 */
export function trackPickerHTML(tracks) {
  const items = tracks.map((t) => {
    const id = escapeHTML(t.id);
    const title = escapeHTML(t.title);
    const artist = escapeHTML(t.artist);
    return `<li class="picker__item">` +
      `<button class="picker__btn" type="button" data-track="${id}" aria-pressed="false"` +
        ` aria-label="Play ${title} by ${artist}.">` +
        `<span class="picker__mark" aria-hidden="true"></span>` +
        `<span class="picker__text">` +
          `<span class="picker__title">${title}</span>` +
          `<span class="picker__artist">${artist}</span>` +
        `</span>` +
      `</button>` +
    `</li>`;
  }).join("");
  return `<ul class="picker">${items}</ul>`;
}
