// Photo lightbox. Without JavaScript the thumbnails are plain links to the
// full image, so this only ever upgrades what already works.

export function createLightbox(root, frames) {
  const img = root.querySelector(".lightbox__img");
  const closeBtn = root.querySelector(".lightbox__close");
  const prevBtn = root.querySelector(".lightbox__nav--prev");
  const nextBtn = root.querySelector(".lightbox__nav--next");

  let index = -1;
  let openedFrom = null; // the thumbnail that opened it — where focus goes back

  const many = frames.length > 1;
  prevBtn.hidden = !many;
  nextBtn.hidden = !many;

  function show(i) {
    index = (i + frames.length) % frames.length;
    const a = frames[index];
    img.src = a.getAttribute("href");
    img.alt = a.querySelector("img")?.alt || "";
  }

  function open(i) {
    openedFrom = frames[i];
    show(i);
    root.hidden = false;
    closeBtn.focus();
  }

  function close() {
    root.hidden = true;
    img.src = "";
    index = -1;
    openedFrom?.focus();
    openedFrom = null;
  }

  frames.forEach((a, i) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      open(i);
    });
  });

  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));

  document.addEventListener("keydown", (e) => {
    if (root.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft" && many) show(index - 1);
    else if (e.key === "ArrowRight" && many) show(index + 1);
  });

  return { open, close };
}
