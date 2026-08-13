/* Chart primitives. Hand-rolled SVG, no dependencies.

   House style: thin marks, 4px rounded data-ends anchored to the baseline, 2px
   lines, >=8px markers, a 2px gap between adjacent fills, hairline grid and axes,
   selective direct labels, and a table view twin for every chart. */

const NS = "http://www.w3.org/2000/svg";
const GAP = 2;          // surface gap between adjacent fills
const R = 4;            // rounded data-end radius

export function el(name, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.appendChild(kid);
  return n;
}

export function h(name, attrs = {}, kids = []) {
  const n = document.createElement(name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.appendChild(kid);
  return n;
}

export const scale = (d0, d1, r0, r1) => (v) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export const fmtPct = (v, dp = 0) => `${(v * 100).toFixed(dp)}%`;
export const fmtNum = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
};

/* ---------- colour ---------- */
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2srgb = (c) => {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
function hex2oklab(hex) {
  const s = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => srgb2lin(parseInt(s.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q];
}
function oklab2hex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    lin2srgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    lin2srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    lin2srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
  return "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}

/** Diverging ramp through a neutral midpoint, interpolated in OKLab.
    t in [-1, 1]; negative -> low pole, positive -> high pole. */
export function diverging(t, low, mid, high) {
  const clamped = Math.max(-1, Math.min(1, t));
  const [from, to, k] = clamped < 0
    ? [hex2oklab(mid), hex2oklab(low), -clamped]
    : [hex2oklab(mid), hex2oklab(high), clamped];
  return oklab2hex(from.map((v, i) => v + (to[i] - v) * k));
}

export const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------- tooltip ----------
   The tooltip is anchored to the non-scrolling .chart-wrap rather than to the
   scroll container the SVG lives in: a box with overflow-x also clips on the
   y-axis, which would crop tooltips and spawn a stray vertical scrollbar.
   show() therefore takes viewport coordinates and converts them itself. */
export function makeTooltip(parent) {
  const anchor = parent.closest(".chart-wrap") || parent;
  const tip = h("div", { class: "tooltip", role: "status", "aria-live": "polite" });
  anchor.appendChild(tip);
  return {
    show(html, clientX, clientY) {
      tip.innerHTML = html;
      tip.classList.add("on");
      const box = anchor.getBoundingClientRect();
      const x = clientX - box.left, y = clientY - box.top;
      const tw = tip.offsetWidth;
      let left = x + 14;
      if (left + tw > anchor.clientWidth) left = x - tw - 14;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${y + 12}px`;
    },
    hide() { tip.classList.remove("on"); },
  };
}

/** Viewport coords for an event, falling back to an element's centre for
    keyboard focus, which carries no pointer position. */
export function evPoint(ev, fallbackEl) {
  if (ev && typeof ev.clientX === "number" && ev.clientX !== 0) {
    return [ev.clientX, ev.clientY];
  }
  const r = fallbackEl.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

const ttRow = (k, v) => `<div class="tt-row"><span>${k}</span><b>${v}</b></div>`;
export const ttHtml = (title, rows) =>
  `<div class="tt-title">${title}</div>${rows.map(([k, v]) => ttRow(k, v)).join("")}`;

/* ---------- card scaffold with chart / table toggle ---------- */
export function chartCard({ title, note, render, table }) {
  const card = h("div", { class: "card" });
  const head = h("div", { class: "card-head" });
  head.appendChild(h("div", { class: "card-title", text: title }));

  const toggle = h("div", { class: "view-toggle", role: "group", "aria-label": "View as" });
  const bChart = h("button", { type: "button", text: "Chart", "aria-pressed": "true" });
  const bTable = h("button", { type: "button", text: "Table", "aria-pressed": "false" });
  toggle.append(bChart, bTable);
  head.appendChild(toggle);
  card.appendChild(head);

  if (note) card.appendChild(h("div", { class: "card-note", text: note }));

  const chartHost = h("div", { class: "chart-wrap" });
  const chartScroll = h("div", { class: "chart-scroll" });
  chartHost.appendChild(chartScroll);
  const tableHost = h("div", { class: "table-scroll", hidden: "" });
  card.append(chartHost, tableHost);

  render(chartScroll);
  tableHost.appendChild(table());

  const set = (chart) => {
    bChart.setAttribute("aria-pressed", String(chart));
    bTable.setAttribute("aria-pressed", String(!chart));
    chartHost.hidden = !chart;
    tableHost.hidden = chart;
  };
  bChart.onclick = () => set(true);
  bTable.onclick = () => set(false);
  return card;
}

export function dataTable(headers, rows) {
  const t = h("table", { class: "data" });
  t.appendChild(h("thead", {}, h("tr", {}, headers.map((x) => h("th", { text: x, scope: "col" })))));
  t.appendChild(h("tbody", {}, rows.map((r) =>
    h("tr", {}, r.map((c, i) => h(i === 0 ? "th" : "td",
      i === 0 ? { text: String(c), scope: "row" } : { text: String(c) }))))));
  return t;
}

export function legend(items) {
  return h("div", { class: "legend" }, items.map(([label, color]) =>
    h("span", { class: "legend-item" }, [
      h("span", { class: "legend-swatch", style: `background:${color}` }),
      h("span", { text: label }),
    ])));
}

/* rounded rect path with the radius on the data end only */
function barPath(x, y, w, hgt, r, horizontal) {
  if (horizontal) {
    const rr = Math.min(r, w);
    return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + hgt - rr} `
      + `Q${x + w},${y + hgt} ${x + w - rr},${y + hgt} H${x} Z`;
  }
  const rr = Math.min(r, hgt);
  return `M${x},${y + hgt} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} `
    + `Q${x + w},${y} ${x + w},${y + rr} V${y + hgt} Z`;
}

/* ---------- horizontal bars, optional 95% CI whiskers ---------- */
export function barsH(host, { data, max, color, valueFmt = (v) => fmtPct(v, 0), labelWidth = 130 }) {
  const W = 640, rowH = 34, padT = 6, padB = 26;
  const H = padT + data.length * rowH + padB;
  const x0 = labelWidth, x1 = W - 56;
  const hi = max ?? Math.max(...data.map((d) => d.hi ?? d.value)) * 1.08;
  const sx = scale(0, hi, x0, x1);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

  for (let i = 0; i <= 4; i++) {
    const v = (hi / 4) * i;
    svg.appendChild(el("line", { x1: sx(v), x2: sx(v), y1: padT, y2: H - padB, class: "gridline" }));
    svg.appendChild(el("text", { x: sx(v), y: H - padB + 15, class: "tick-label", "text-anchor": "middle" },
      document.createTextNode(valueFmt(v))));
  }

  data.forEach((d, i) => {
    const y = padT + i * rowH;
    const bh = rowH - GAP * 2 - 8;
    const c = typeof color === "function" ? color(d, i) : color;
    svg.appendChild(el("text", { x: x0 - 10, y: y + bh / 2 + 8, class: "mark-label", "text-anchor": "end" },
      document.createTextNode(d.label)));
    svg.appendChild(el("path", { d: barPath(x0, y + 4, Math.max(1, sx(d.value) - x0), bh, R, true), fill: c }));
    if (d.lo != null && d.hi != null && !Number.isNaN(d.lo)) {
      const cy = y + 4 + bh / 2;
      svg.appendChild(el("line", { x1: sx(d.lo), x2: sx(d.hi), y1: cy, y2: cy,
        stroke: cssVar("--text-primary"), "stroke-width": 2, opacity: 0.55 }));
      for (const v of [d.lo, d.hi]) {
        svg.appendChild(el("line", { x1: sx(v), x2: sx(v), y1: cy - 4, y2: cy + 4,
          stroke: cssVar("--text-primary"), "stroke-width": 2, opacity: 0.55 }));
      }
    }
    svg.appendChild(el("text", { x: sx(d.hi ?? d.value) + 8, y: y + bh / 2 + 8, class: "mark-label" },
      document.createTextNode(valueFmt(d.value) + (d.n != null ? `  (n=${d.n})` : ""))));
  });

  host.appendChild(svg);
  return svg;
}

/* ---------- grouped vertical bars ---------- */
export function barsGrouped(host, { groups, series, colors, valueFmt = (v) => fmtPct(v, 1) }) {
  const W = 640, H = 300, padL = 44, padR = 12, padT = 12, padB = 58;
  const max = Math.max(...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0))) * 1.12 || 1;
  const sy = scale(0, max, H - padB, padT);
  const bandW = (W - padL - padR) / groups.length;
  const barW = Math.min(28, (bandW - 16) / series.length - GAP);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const tip = makeTooltip(host);

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 8, y: sy(v) + 4, class: "tick-label", "text-anchor": "end" },
      document.createTextNode(valueFmt(v))));
  }
  svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: sy(0), y2: sy(0), class: "axisline" }));

  groups.forEach((g, gi) => {
    const gx = padL + gi * bandW;
    const total = series.length * barW + (series.length - 1) * GAP;
    const start = gx + (bandW - total) / 2;
    series.forEach((s, si) => {
      const v = g.values[s.key] ?? 0;
      const x = start + si * (barW + GAP);
      const y = sy(v), hgt = sy(0) - y;
      const rect = el("path", {
        d: barPath(x, y, barW, Math.max(1, hgt), R, false),
        fill: colors[si % colors.length], tabindex: "0", role: "img",
        "aria-label": `${g.label}, ${s.label}: ${valueFmt(v)}`,
      });
      const show = (ev) => tip.show(ttHtml(g.label, [[s.label, valueFmt(v)]]), ...evPoint(ev, rect));
      rect.addEventListener("mousemove", show);
      rect.addEventListener("focus", show);
      rect.addEventListener("mouseleave", tip.hide);
      rect.addEventListener("blur", tip.hide);
      svg.appendChild(rect);
    });
    const label = el("text", { x: gx + bandW / 2, y: H - padB + 18, class: "tick-label", "text-anchor": "middle" });
    label.appendChild(document.createTextNode(g.label));
    svg.appendChild(label);
  });

  host.appendChild(svg);
  host.appendChild(legend(series.map((s, i) => [s.label, colors[i % colors.length]])));
  return svg;
}

/* ---------- multi-series daily line chart with event annotations ---------- */
export function lineChart(host, { dates, series, colors, events = [], yFmt = fmtNum, yLabel = "" }) {
  // padT leaves a clear band above the plot for the unit label and event badges,
  // so neither can collide with the topmost y tick label.
  const W = 760, H = 330, padL = 52, padR = 16, padT = 42, padB = 42;
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.1 || 1;
  const sx = scale(0, dates.length - 1, padL, W - padR);
  const sy = scale(0, max, H - padB, padT);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const tip = makeTooltip(host);

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 8, y: sy(v) + 4, class: "tick-label", "text-anchor": "end" },
      document.createTextNode(yFmt(v))));
  }
  if (yLabel) {
    // Anchored at the left edge, not at the axis: an end-anchored unit label
    // overflows the viewBox for anything longer than the tick labels.
    svg.appendChild(el("text", { x: 0, y: 14, class: "axis-label", "text-anchor": "start" },
      document.createTextNode(yLabel)));
  }

  // month ticks; the first is start-anchored so it clears the zero y tick
  dates.forEach((d, i) => {
    if (d.slice(-2) !== "01" && i !== 0) return;
    svg.appendChild(el("text", {
      x: sx(i), y: H - padB + 16, class: "tick-label",
      "text-anchor": i === 0 ? "start" : "middle",
    }, document.createTextNode(new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }))));
  });

  // Event rules carry a numbered badge; the labels themselves go in a caption
  // below the chart, where they cannot collide with tick labels.
  const marked = [];
  events.forEach((ev) => {
    const i = dates.indexOf(ev.date);
    if (i < 0) return;
    const n = marked.length + 1;
    marked.push({ n, ...ev });
    svg.appendChild(el("line", { x1: sx(i), x2: sx(i), y1: padT, y2: H - padB,
      stroke: cssVar("--axis"), "stroke-width": 1 }));
    svg.appendChild(el("circle", { cx: sx(i), cy: padT - 13, r: 8,
      fill: cssVar("--surface-1"), stroke: cssVar("--axis"), "stroke-width": 1 }));
    svg.appendChild(el("text", { x: sx(i), y: padT - 9, class: "tick-label", "text-anchor": "middle" },
      document.createTextNode(String(n))));
  });

  svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: sy(0), y2: sy(0), class: "axisline" }));

  series.forEach((s, si) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    svg.appendChild(el("path", { d, fill: "none", stroke: colors[si % colors.length],
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  });

  // crosshair + nearest-index tooltip
  const cross = el("line", { y1: padT, y2: H - padB, stroke: cssVar("--axis"), "stroke-width": 1, opacity: 0 });
  svg.appendChild(cross);
  const dots = series.map((s, si) => {
    const c = el("circle", { r: 4, fill: colors[si % colors.length], stroke: cssVar("--surface-1"),
      "stroke-width": 2, opacity: 0 });
    svg.appendChild(c);
    return c;
  });
  const hit = el("rect", { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB,
    fill: "transparent", style: "cursor:crosshair" });
  hit.addEventListener("mousemove", (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.round(Math.max(0, Math.min(dates.length - 1,
      ((px - padL) / (W - padR - padL)) * (dates.length - 1))));
    cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("opacity", 1);
    dots.forEach((c, si) => {
      c.setAttribute("cx", sx(i)); c.setAttribute("cy", sy(series[si].values[i]));
      c.setAttribute("opacity", 1);
    });
    tip.show(ttHtml(new Date(dates[i]).toLocaleDateString("en-US",
      { month: "short", day: "numeric", year: "numeric" }),
      series.map((s) => [s.label, yFmt(s.values[i])])),
      ev.clientX, ev.clientY);
  });
  hit.addEventListener("mouseleave", () => {
    cross.setAttribute("opacity", 0);
    dots.forEach((c) => c.setAttribute("opacity", 0));
    tip.hide();
  });
  svg.appendChild(hit);

  host.appendChild(svg);
  if (series.length > 1) host.appendChild(legend(series.map((s, i) => [s.label, colors[i % colors.length]])));
  if (marked.length) {
    host.appendChild(h("div", { class: "card-note", style: "margin-top:6px" },
      marked.map((m, k) => h("span", {
        text: `${k ? " · " : ""}${m.n} ${m.label} (${new Date(m.date)
          .toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      }))));
  }
  return svg;
}

/* ---------- sankey: source nodes -> target nodes, ribbons sized by count ----------
   Ribbons are coloured by target, not source: four categorical hues cannot stay
   distinguishable when any two can sit adjacent, but three can. Sources carry
   direct labels instead of a hue. */
export function sankey(host, { sources, targets, flows, colors, nodeLabel, valueLabel = "accounts" }) {
  const W = 700, padT = 18, padB = 18, nodeW = 13, gap = 10;
  const rowsMax = Math.max(sources.length, targets.length);
  const H = padT + padB + rowsMax * 46 + 24;
  const total = flows.reduce((a, f) => a + f.value, 0);
  const usableH = H - padT - padB;
  const scaleV = (v) => (v / total) * (usableH - gap * (Math.max(sources.length, targets.length) - 1));

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const tip = makeTooltip(host);
  const xL = 168, xR = W - 168;

  const stack = (keys, sumOf) => {
    let y = padT;
    const pos = {};
    keys.forEach((k) => {
      const hgt = Math.max(2, scaleV(sumOf(k)));
      pos[k] = { y0: y, y1: y + hgt, cursor: y };
      y += hgt + gap;
    });
    return pos;
  };
  const srcSum = (s) => flows.filter((f) => f.source === s).reduce((a, f) => a + f.value, 0);
  const tgtSum = (t) => flows.filter((f) => f.target === t).reduce((a, f) => a + f.value, 0);
  const L = stack(sources, srcSum), Rp = stack(targets, tgtSum);

  // ribbons first, so nodes and labels sit above them
  [...flows].sort((a, b) => b.value - a.value).forEach((f) => {
    const hgt = Math.max(1.5, scaleV(f.value));
    const a = L[f.source], b = Rp[f.target];
    if (!a || !b) return;
    const y0 = a.cursor, y1 = b.cursor;
    a.cursor += hgt; b.cursor += hgt;
    const cx = (xL + nodeW + xR) / 2;
    const d = `M${xL + nodeW},${y0} C${cx},${y0} ${cx},${y1} ${xR},${y1} `
      + `L${xR},${y1 + hgt} C${cx},${y1 + hgt} ${cx},${y0 + hgt} ${xL + nodeW},${y0 + hgt} Z`;
    const path = el("path", { d, fill: colors[targets.indexOf(f.target) % colors.length],
      opacity: 0.42, tabindex: "0", role: "img",
      "aria-label": `${nodeLabel(f.source)} to ${nodeLabel(f.target)}: ${f.value} ${valueLabel}` });
    const show = (ev) => {
      path.setAttribute("opacity", 0.72);
      tip.show(ttHtml(`${nodeLabel(f.source)} → ${nodeLabel(f.target)}`,
        [[valueLabel, f.value], ["share of group", fmtPct(f.value / srcSum(f.source), 0)]]),
        ...evPoint(ev, path));
    };
    const hide = () => { path.setAttribute("opacity", 0.42); tip.hide(); };
    path.addEventListener("mousemove", show);
    path.addEventListener("focus", show);
    path.addEventListener("mouseleave", hide);
    path.addEventListener("blur", hide);
    svg.appendChild(path);
  });

  const drawNodes = (keys, pos, x, anchor, labelX, colored) => {
    keys.forEach((k, i) => {
      const p = pos[k];
      svg.appendChild(el("rect", { x, y: p.y0, width: nodeW, height: p.y1 - p.y0, rx: 3,
        fill: colored ? colors[i % colors.length] : cssVar("--text-secondary") }));
      const sum = colored ? tgtSum(k) : srcSum(k);
      const t = el("text", { x: labelX, y: (p.y0 + p.y1) / 2 + 4, class: "mark-label",
        "text-anchor": anchor });
      t.appendChild(document.createTextNode(`${nodeLabel(k)}  ${sum}`));
      svg.appendChild(t);
    });
  };
  drawNodes(sources, L, xL, "end", xL - 10, false);
  drawNodes(targets, Rp, xR, "start", xR + nodeW + 10, true);

  svg.appendChild(el("text", { x: xL, y: H - 6, class: "axis-label", "text-anchor": "end" },
    document.createTextNode("came from")));
  svg.appendChild(el("text", { x: xR + nodeW, y: H - 6, class: "axis-label", "text-anchor": "start" },
    document.createTextNode("posts on")));

  host.appendChild(svg);
  return svg;
}

/* ---------- scatter with shape-coded categories (the creator map) ---------- */
export const SHAPES = {
  circle: (x, y, s) => el("circle", { cx: x, cy: y, r: s }),
  square: (x, y, s) => el("rect", { x: x - s, y: y - s, width: s * 2, height: s * 2, rx: 2 }),
  triangle: (x, y, s) =>
    el("path", { d: `M${x},${y - s * 1.15} L${x + s * 1.1},${y + s * 0.8} L${x - s * 1.1},${y + s * 0.8} Z` }),
  diamond: (x, y, s) => el("path", { d: `M${x},${y - s * 1.25} L${x + s * 1.25},${y} L${x},${y + s * 1.25} L${x - s * 1.25},${y} Z` }),
};

export function scatter(host, {
  points, xDomain, yDomain, xLabel, yLabel, xTicks, yTicks,
  colorOf, shapeOf, sizeOf, onSelect, tooltipOf, diagonal = false,
}) {
  const W = 760, H = 470, padL = 54, padR = 20, padT = 16, padB = 52;
  const sx = scale(xDomain[0], xDomain[1], padL, W - padR);
  const sy = scale(yDomain[0], yDomain[1], H - padB, padT);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `${yLabel} against ${xLabel}, ${points.length} accounts` });
  const tip = makeTooltip(host);

  yTicks.forEach((t) => {
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: sy(t.v), y2: sy(t.v), class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 8, y: sy(t.v) + 4, class: "tick-label", "text-anchor": "end" },
      document.createTextNode(t.label)));
  });
  xTicks.forEach((t) => {
    svg.appendChild(el("line", { x1: sx(t.v), x2: sx(t.v), y1: padT, y2: H - padB, class: "gridline" }));
    svg.appendChild(el("text", { x: sx(t.v), y: H - padB + 17, class: "tick-label", "text-anchor": "middle" },
      document.createTextNode(t.label)));
  });
  svg.appendChild(el("text", { x: (padL + W - padR) / 2, y: H - 12, class: "axis-label", "text-anchor": "middle" },
    document.createTextNode(xLabel)));
  const yl = el("text", { x: 14, y: (padT + H - padB) / 2, class: "axis-label", "text-anchor": "middle",
    transform: `rotate(-90 14 ${(padT + H - padB) / 2})` });
  yl.appendChild(document.createTextNode(yLabel));
  svg.appendChild(yl);

  if (diagonal) {
    svg.appendChild(el("line", {
      x1: sx(xDomain[0]), y1: sy(yDomain[0]), x2: sx(xDomain[1]), y2: sy(yDomain[1]),
      stroke: cssVar("--axis"), "stroke-width": 1,
    }));
  }

  const layer = el("g");
  const placed = points.map((p) => {
    const x = sx(p.x), y = sy(p.y), s = sizeOf(p);
    const node = SHAPES[shapeOf(p)](x, y, s);
    node.setAttribute("fill", colorOf(p));
    node.setAttribute("stroke", cssVar("--surface-1"));
    node.setAttribute("stroke-width", GAP);      // surface ring on overlapping marks
    node.setAttribute("opacity", 0.92);
    layer.appendChild(node);
    return { p, x, y, s, node };
  });
  svg.appendChild(layer);

  // nearest-point hit layer, so no pinpoint targets
  const hit = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" });
  let active = null;
  const nearest = (px, py) => {
    let best = null, bd = Infinity;
    for (const q of placed) {
      const d = (q.x - px) ** 2 + (q.y - py) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    return bd <= 30 ** 2 ? best : null;
  };
  const locate = (ev) => {
    const box = svg.getBoundingClientRect();
    return [((ev.clientX - box.left) / box.width) * W, ((ev.clientY - box.top) / box.height) * H];
  };
  hit.addEventListener("mousemove", (ev) => {
    const [px, py] = locate(ev);
    const q = nearest(px, py);
    if (active && active !== q) active.node.setAttribute("stroke", cssVar("--surface-1"));
    active = q;
    if (!q) { tip.hide(); svg.style.cursor = "default"; return; }
    q.node.setAttribute("stroke", cssVar("--text-primary"));
    svg.style.cursor = "pointer";
    tip.show(tooltipOf(q.p), ev.clientX, ev.clientY);
  });
  hit.addEventListener("mouseleave", () => {
    if (active) active.node.setAttribute("stroke", cssVar("--surface-1"));
    active = null; tip.hide();
  });
  hit.addEventListener("click", (ev) => {
    const q = nearest(...locate(ev));
    if (q) onSelect(q.p);
  });
  svg.appendChild(hit);

  host.appendChild(svg);
  return svg;
}
