// The groove field: dust riding the grooves around the hero record, plus motes
// drifting through the stage light across the rest of the page.
//
// Draws only — it never asks for a frame. main.js owns the clock and hands in
// both the elapsed time and the record's live angle, so the whole page animates
// off one requestAnimationFrame.

const TAU = Math.PI * 2;

// How close the pointer has to be to shove a particle off its groove, and how
// hard it shoves.
const PUSH_RADIUS = 120;
const PUSH_FORCE = 34;

const rand = (a, b) => a + Math.random() * (b - a);

export function createStage(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0;
  let grooves = [];
  let motes = [];
  let focus = null; // { x, y, r } — the record, in viewport coordinates
  const pointer = { x: -9999, y: -9999 };

  function seed() {
    const area = w * h;
    const grooveCount = Math.max(24, Math.min(90, Math.round(area / 14000)));
    const moteCount = Math.max(14, Math.min(52, Math.round(area / 30000)));

    grooves = Array.from({ length: grooveCount }, () => ({
      // radius as a multiple of the record's own radius: some ride the disc,
      // some orbit just outside it
      rad: rand(0.42, 2.05),
      th: rand(0, TAU),
      // outer particles lag, like the outer groove passing more slowly
      lag: rand(0.35, 1),
      sz: rand(0.7, 2.1),
      a: rand(0.18, 0.7),
      warm: Math.random() < 0.18, // a few magenta specks among the plum
      ox: 0, oy: 0,
    }));

    motes = Array.from({ length: moteCount }, () => ({
      x: rand(0, w), y: rand(0, h),
      vy: rand(-11, -3), vx: rand(-3, 3),
      sz: rand(0.6, 1.9),
      a: rand(0.1, 0.4),
      ox: 0, oy: 0,
    }));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  /** Where the record is right now, or null once it has scrolled away. */
  function setFocus(next) { focus = next; }
  function setPointer(x, y) { pointer.x = x; pointer.y = y; }

  // Ease a particle's displacement toward whatever the pointer is asking for,
  // so it slides off the groove and then drifts back rather than snapping.
  function shove(p, x, y, dt) {
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const d = Math.hypot(dx, dy);
    let tx = 0, ty = 0;
    if (d < PUSH_RADIUS && d > 0.01) {
      const strength = (1 - d / PUSH_RADIUS) ** 2 * PUSH_FORCE;
      tx = (dx / d) * strength;
      ty = (dy / d) * strength;
    }
    const k = 1 - Math.exp(-dt / 0.22);
    p.ox += (tx - p.ox) * k;
    p.oy += (ty - p.oy) * k;
  }

  function dot(x, y, sz, alpha, warm) {
    const rgb = warm ? "255, 61, 110" : "199, 125, 255";
    // Two flat circles instead of a shadow blur — same bloom, far cheaper.
    ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.22})`;
    ctx.beginPath(); ctx.arc(x, y, sz * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {number} angle the record's current rotation, degrees
   * @param {number} vel the record's angular velocity, deg/s
   */
  function draw(dt, angle, vel) {
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    if (focus) {
      // Faint concentric grooves centred on the record.
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        const r = focus.r * (0.6 + i * 0.32);
        ctx.strokeStyle = `rgba(199, 125, 255, ${0.05 - i * 0.006})`;
        ctx.beginPath(); ctx.arc(focus.x, focus.y, r, 0, TAU); ctx.stroke();
      }

      const spin = (angle * Math.PI) / 180;
      for (const p of grooves) {
        const r = focus.r * p.rad;
        const th = p.th + spin * p.lag;
        const x = focus.x + Math.cos(th) * r;
        const y = focus.y + Math.sin(th) * r;
        shove(p, x, y, dt);
        // Fast spin brightens the field — the record throws off more dust.
        const heat = Math.min(1, Math.abs(vel) / 900);
        dot(x + p.ox, y + p.oy, p.sz, p.a * (0.75 + heat * 0.5), p.warm);
      }
    }

    for (const m of motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -10) { m.y = h + 10; m.x = rand(0, w); }
      if (m.x < -10) m.x = w + 10;
      if (m.x > w + 10) m.x = -10;
      shove(m, m.x, m.y, dt);
      dot(m.x + m.ox, m.y + m.oy, m.sz, m.a, false);
    }
  }

  resize();
  return { resize, setFocus, setPointer, draw };
}
