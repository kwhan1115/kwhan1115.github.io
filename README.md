# kwhan1115.github.io

My personal hub — single static page, dark Gengar theme, served by GitHub Pages.

## Edit

- Text/links: edit `index.html`.
- Exam list: edit the `EXAMS` array in `exams.js` (summary auto-updates).
- Theme colors: edit the `:root` tokens in `style.css`.
- Avatar: replace `assets/avatar.jpg` (square; shown in a circle).
- Photos: drop `assets/photoN.jpg` and add a matching `<li>` in the `.gallery` list in `index.html`. Thumbnails are square-cropped by CSS; the lightbox shows the full image.
- Tracks the record can play: add one line to the `TRACKS` array in `tracks.js` and drop the matching file in `assets/audio/`. That's the whole change — the picker list, the label, and the scratch DSP all read from the same entry.

## Develop locally

Modules need a server (not `file://`):

    python -m http.server 8000    # then open http://localhost:8000

## Test

    node --test
