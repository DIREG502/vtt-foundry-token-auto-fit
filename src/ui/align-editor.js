// Manual alignment editor: the token image with a draggable border overlay.
// Plain DOM + SVG, no Foundry dependencies (shared by the module window and the macro).
//
// Mouse : drag inside the shape to move; drag a corner handle to resize (opposite corner stays,
//         Alt = resize about the centre, Shift = keep proportions); drag an edge handle to
//         resize one axis; Ctrl + wheel to zoom.
// Keys  : arrows move 1 px (Shift: 10 px); Ctrl/Cmd + arrows change width/height;
//         + / - grow / shrink uniformly; all in source-image pixels.

const SVGNS = "http://www.w3.org/2000/svg";
const UNIT = {
  "hex-pointy": [[0, -0.5], [0.5, -0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.25], [-0.5, -0.25]],
  "hex-flat": [[0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0], [-0.25, -0.5], [0.25, -0.5]],
  square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
};
const BASE_ASPECT = { "hex-pointy": Math.sqrt(3) / 2, "hex-flat": 2 / Math.sqrt(3), square: 1, circle: 1 };

function el(tag, attrs = {}, parent = null, ns = null) {
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else if (k === "class") e.setAttribute("class", v);
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

export class AlignEditor {
  /**
   * @param {HTMLElement} container
   * @param {object} o
   * @param {string} o.src image URL
   * @param {number} o.width natural image width
   * @param {number} o.height natural image height
   * @param {{shape,cx,cy,w,h,thickness?}} o.initial
   * @param {(state)=>void} [o.onChange]
   * @param {object} [o.labels] localized strings
   */
  constructor(container, o) {
    this.c = container;
    this.o = o;
    this.W = o.width; this.H = o.height;
    this.state = { shape: "hex-pointy", ...o.initial };
    this.labels = { shape: "Shape", zoom: "Zoom", fit: "Fit", lock: "Keep proportions", regular: "Regular shape", ...o.labels };
    this.zoom = "fit";
    this.lock = true;
    this._raf = 0;
    this.build();
    this.render();
  }

  build() {
    const root = el("div", { class: "tbaf-editor" }, this.c);
    const bar = el("div", { class: "tbaf-editor-bar" }, root);
    const shapeLab = el("label", {}, bar);
    el("span", { text: this.labels.shape }, shapeLab);
    this.shapeSel = el("select", { "data-role": "shape" }, shapeLab);
    for (const s of ["hex-pointy", "hex-flat", "circle", "square"]) {
      const op = el("option", { value: s, text: this.labels[s] ?? s }, this.shapeSel);
      if (s === this.state.shape) op.selected = true;
    }
    this.shapeSel.addEventListener("change", () => this.set({ shape: this.shapeSel.value }));
    const zoomLab = el("label", {}, bar);
    el("span", { text: this.labels.zoom }, zoomLab);
    this.zoomSel = el("select", { "data-role": "zoom" }, zoomLab);
    for (const [v, txt] of [["fit", this.labels.fit], ["1", "100%"], ["2", "200%"], ["4", "400%"]]) el("option", { value: v, text: txt }, this.zoomSel);
    this.zoomSel.addEventListener("change", () => { this.zoom = this.zoomSel.value; this.layout(); });
    const lockLab = el("label", { class: "tbaf-check" }, bar);
    this.lockBox = el("input", { type: "checkbox" }, lockLab);
    this.lockBox.checked = this.lock;
    el("span", { text: this.labels.lock }, lockLab);
    this.lockBox.addEventListener("change", () => { this.lock = this.lockBox.checked; });
    const regBtn = el("button", { type: "button", class: "tbaf-mini", text: this.labels.regular, "data-tooltip": this.labels.regularHint ?? "" }, bar);
    regBtn.addEventListener("click", () => {
      const s = this.state, a = BASE_ASPECT[s.shape];
      const h = Math.sqrt((s.w * s.h) / a); // keep area
      this.set({ w: a * h, h });
    });
    this.readout = el("div", { class: "tbaf-readout" }, bar);

    this.view = el("div", { class: "tbaf-view", tabindex: "0" }, root);
    this.stage = el("div", { class: "tbaf-stage" }, this.view);
    this.img = el("img", { src: this.o.src, draggable: "false", alt: "" }, this.stage);
    this.svg = el("svg", { class: "tbaf-overlay" }, this.stage, SVGNS);
    this.outline = el("polygon", { class: "tbaf-outline" }, this.svg, SVGNS);
    this.inner = el("polygon", { class: "tbaf-inner" }, this.svg, SVGNS);
    this.bbox = el("rect", { class: "tbaf-bbox" }, this.svg, SVGNS);
    this.cross = el("path", { class: "tbaf-cross" }, this.svg, SVGNS);
    this.handles = {};
    for (const h of ["nw", "ne", "se", "sw", "n", "e", "s", "w"]) {
      this.handles[h] = el("rect", { class: `tbaf-handle tbaf-${h.length === 1 ? "edge" : "corner"}`, "data-h": h }, this.svg, SVGNS);
    }
    this.img.addEventListener("load", () => this.layout());
    this.view.addEventListener("pointerdown", (e) => this.onDown(e));
    this.view.addEventListener("keydown", (e) => this.onKey(e));
    this.view.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const steps = ["fit", "1", "2", "4"];
      const i = Math.max(0, steps.indexOf(this.zoom) + (e.deltaY < 0 ? 1 : -1));
      this.zoom = steps[Math.min(steps.length - 1, i)];
      this.zoomSel.value = this.zoom;
      this.layout();
    }, { passive: false });
    this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.layout()) : null;
    this.ro?.observe(this.view);
    this.layout();
  }

  destroy() { this.ro?.disconnect(); cancelAnimationFrame(this._raf); }

  layout() {
    const vw = this.view.clientWidth || 480, vh = this.view.clientHeight || 480;
    const fitScale = Math.min(vw / this.W, vh / this.H);
    // "fit" shows the whole image; 100/200/400 % are relative to the image's natural pixels.
    this.k = this.zoom === "fit" ? fitScale : Number(this.zoom);
    const w = this.W * this.k, h = this.H * this.k;
    for (const n of [this.stage, this.img]) { n.style.width = `${w}px`; n.style.height = `${h}px`; }
    this.svg.setAttribute("width", w); this.svg.setAttribute("height", h);
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    this.render();
  }

  get() { return { ...this.state }; }

  set(patch, { silent = false } = {}) {
    const s = { ...this.state, ...patch };
    s.w = Math.max(4, s.w); s.h = Math.max(4, s.h);
    this.state = s;
    if (this.shapeSel.value !== s.shape) this.shapeSel.value = s.shape;
    this.render();
    if (!silent && this.o.onChange) {
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => this.o.onChange(this.get()));
    }
  }

  points(s, inset = 0) {
    const k = inset ? Math.max(0.05, 1 - (2 * inset) / Math.min(s.w, s.h)) : 1;
    const w = s.w * k, h = s.h * k;
    if (s.shape === "circle") {
      const pts = [];
      for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push([s.cx + Math.cos(a) * w / 2, s.cy + Math.sin(a) * h / 2]); }
      return pts;
    }
    return UNIT[s.shape].map(([u, v]) => [s.cx + u * w, s.cy + v * h]);
  }

  render() {
    const s = this.state, k = this.k || 1;
    const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    this.outline.setAttribute("points", fmt(this.points(s)));
    this.outline.style.strokeWidth = `${2 / k}px`;
    if (s.thickness > 1) {
      this.inner.setAttribute("points", fmt(this.points(s, s.thickness)));
      this.inner.style.display = "";
      this.inner.style.strokeWidth = `${1 / k}px`;
    } else this.inner.style.display = "none";
    const x0 = s.cx - s.w / 2, y0 = s.cy - s.h / 2;
    Object.entries({ x: x0, y: y0, width: s.w, height: s.h }).forEach(([a, v]) => this.bbox.setAttribute(a, v));
    this.bbox.style.strokeWidth = `${1 / k}px`;
    const c = 8 / k;
    this.cross.setAttribute("d", `M${s.cx - c} ${s.cy} H${s.cx + c} M${s.cx} ${s.cy - c} V${s.cy + c}`);
    this.cross.style.strokeWidth = `${1.5 / k}px`;
    const hs = 9 / k;
    const pos = { nw: [x0, y0], ne: [x0 + s.w, y0], se: [x0 + s.w, y0 + s.h], sw: [x0, y0 + s.h], n: [s.cx, y0], e: [x0 + s.w, s.cy], s: [s.cx, y0 + s.h], w: [x0, s.cy] };
    for (const [h, [x, y]] of Object.entries(pos)) {
      const r = this.handles[h];
      r.setAttribute("x", x - hs / 2); r.setAttribute("y", y - hs / 2); r.setAttribute("width", hs); r.setAttribute("height", hs);
      r.style.strokeWidth = `${1 / k}px`;
    }
    this.readout.textContent = `x ${s.cx.toFixed(1)}  y ${s.cy.toFixed(1)}  w ${s.w.toFixed(1)}  h ${s.h.toFixed(1)}`;
  }

  toImage(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.W, y: ((e.clientY - r.top) / r.height) * this.H };
  }

  onDown(e) {
    if (e.button !== 0) return;
    this.view.focus({ preventScroll: true });
    const p0 = this.toImage(e);
    const s0 = this.get();
    // Grab the nearest handle within 12 screen px (handles are small; exact hits are fiddly).
    let h = e.target?.dataset?.h ?? null;
    if (!h) {
      const x0 = s0.cx - s0.w / 2, y0 = s0.cy - s0.h / 2;
      const pos = { nw: [x0, y0], ne: [x0 + s0.w, y0], se: [x0 + s0.w, y0 + s0.h], sw: [x0, y0 + s0.h], n: [s0.cx, y0], e: [x0 + s0.w, s0.cy], s: [s0.cx, y0 + s0.h], w: [x0, s0.cy] };
      let best = 12 / (this.k || 1);
      for (const [name, [hx, hy]] of Object.entries(pos)) {
        const d = Math.hypot(p0.x - hx, p0.y - hy);
        if (d < best) { best = d; h = name; }
      }
    }
    let mode = h;
    if (!mode) {
      // Inside the bounding box (generous) -> move.
      if (Math.abs(p0.x - s0.cx) <= s0.w / 2 + 6 / this.k && Math.abs(p0.y - s0.cy) <= s0.h / 2 + 6 / this.k) mode = "move";
      else return;
    }
    e.preventDefault();
    const target = e.target;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      const p = this.toImage(ev);
      const dx = p.x - p0.x, dy = p.y - p0.y;
      if (mode === "move") return this.set({ cx: s0.cx + dx, cy: s0.cy + dy });
      this.set(this.resize(s0, mode, dx, dy, ev.altKey, ev.shiftKey !== this.lock));
    };
    const up = (ev) => {
      target.releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** New state when dragging handle `h` by (dx, dy). */
  resize(s0, h, dx, dy, aboutCenter, keepAspect) {
    const sx = h.includes("e") ? 1 : h.includes("w") ? -1 : 0;
    const sy = h.includes("s") ? 1 : h.includes("n") ? -1 : 0;
    const f = aboutCenter ? 2 : 1;
    let w = s0.w + sx * dx * f, h2 = s0.h + sy * dy * f;
    if (keepAspect) {
      const a = s0.w / s0.h;
      if (sx && sy) { const k = Math.max(w / s0.w, h2 / s0.h); w = s0.w * k; h2 = s0.h * k; }
      else if (sx) h2 = w / a; else w = h2 * a;
    }
    w = Math.max(4, w); h2 = Math.max(4, h2);
    let cx = s0.cx, cy = s0.cy;
    if (!aboutCenter) {
      if (sx) cx = s0.cx + (sx * (w - s0.w)) / 2;
      if (sy) cy = s0.cy + (sy * (h2 - s0.h)) / 2;
      if (keepAspect && !sx) cx = s0.cx;
      if (keepAspect && !sy) cy = s0.cy;
    }
    return { cx, cy, w, h: h2 };
  }

  onKey(e) {
    const step = e.shiftKey ? 10 : 1;
    const s = this.state;
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (k) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Left/Right: width, Ctrl+Up/Down: height (Up grows); proportional when locked.
        if (k[0]) {
          const w = s.w + k[0] * step * 2;
          this.set(this.lock ? { w, h: s.h * (w / s.w) } : { w });
        } else {
          const h = s.h - k[1] * step * 2;
          this.set(this.lock ? { h, w: s.w * (h / s.h) } : { h });
        }
      } else this.set({ cx: s.cx + k[0] * step, cy: s.cy + k[1] * step });
      return;
    }
    if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      const d = (e.key === "+" || e.key === "=" ? 1 : -1) * step * 2;
      const kk = (s.w + d) / s.w;
      this.set({ w: s.w * kk, h: s.h * kk });
    }
  }
}
