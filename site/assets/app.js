/* Application module.

   Example posts are referenced by URL and rendered by the platforms' own embed
   widgets, which load only after the reader opts in. */

import {
  h, el, fmtPct, fmtNum, diverging, cssVar, chartCard, dataTable, legend,
  barsH, barsGrouped, lineChart, scatter, sankey, ttHtml,
} from "./charts.js";

const DATA = {};
const CONSENT_KEY = "pcd-embed-consent";

const PLATFORM_LABEL = { x: "X", instagram: "Instagram", tiktok: "TikTok" };
const SHAPE_BY_ORIGIN = {
  political_influencer: "circle", journalist: "square",
  entertainment: "triangle", politician: "diamond",
};

/* ---------- boot ---------- */
async function boot() {
  const page = document.body.dataset.page || "dashboard";
  const base = document.body.dataset.base || "";
  initTheme();

  // Umbrella and about pages carry no data; they only need the theme and footer.
  const needed = { dashboard: ["accounts", "overview", "quiz"], methods: ["overview", "methods"] }[page];
  if (needed) {
    // "no-cache" revalidates against the server before using a cached copy, so a
    // returning visitor never gets stale data after the JSON is rebuilt.
    const loaded = await Promise.all(needed.map((n) =>
      fetch(`${base}data/${n}.json`, { cache: "no-cache" }).then((r) => r.json())));
    needed.forEach((n, i) => { DATA[n] = loaded[i]; });
  }

  if (page === "methods") {
    renderMethods();
  } else if (page === "dashboard") {
    renderHero();
    renderRhythm();
    renderExplore();
    renderOrigins();
    renderTone();
    renderQuiz();
    initNavHighlight();
  }
  renderFooter();
}

/* ---------- theme ---------- */
function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("pcd-theme");
  if (saved) root.setAttribute("data-theme", saved);
  document.getElementById("theme-toggle").onclick = () => {
    const isDark = root.getAttribute("data-theme") === "dark"
      || (!root.getAttribute("data-theme")
          && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("pcd-theme", next);
    rerenderCharts();
  };
}

/* Charts read CSS variables at draw time, so a theme switch redraws them. */
function rerenderCharts() {
  const page = document.body.dataset.page || "dashboard";
  if (page === "methods") { renderMethods(); return; }
  if (page !== "dashboard") return;
  renderRhythm();
  renderExplore();
  renderOrigins();
  renderTone();
}

function initNavHighlight() {
  const links = [...document.querySelectorAll(".nav-links a")];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${e.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("section[id]").forEach((s) => obs.observe(s));
}

/* ---------- hero ---------- */
function renderHero() {
  const { totals, origin, onesidedness } = DATA.overview;
  document.getElementById("hero-posts").textContent = totals.posts.toLocaleString("en-US");

  const tiles = [
    { value: totals.accounts, label: "accounts tracked",
      sub: `${totals.persons} people, across ${Object.keys(totals.platforms).length} platforms` },
    { value: totals.posts.toLocaleString("en-US"), label: "posts classified",
      sub: `${fmtPct(totals.political_share)} of them political` },
    { value: fmtPct(origin.migrated_accounts), label: "arrived already famous",
      sub: "came from news, entertainment or office" },
    { value: `${onesidedness.one_sided} of ${onesidedness.n}`, label: "accounts are one-sided",
      sub: "only " + onesidedness.mixed + " post both sides" },
  ];
  const host = document.getElementById("hero-tiles");
  host.replaceChildren(...tiles.map((t) =>
    h("div", { class: "tile" }, [
      h("div", { class: "value", text: String(t.value) }),
      h("div", { class: "label", text: t.label }),
      h("div", { class: "sub", text: t.sub }),
    ])));
}

/* ---------- explore: filters + creator map ---------- */
const filterState = { platform: "all", origin: "all", party: "all", q: "" };

function renderExplore() {
  renderFilters();
  drawCreatorMap();
}

function renderFilters() {
  const host = document.getElementById("explore-filters");
  if (host.dataset.ready) return;
  host.dataset.ready = "1";
  const { origin } = DATA.overview;

  const group = (label, key, options) => {
    const g = h("div", { class: "filter-group" }, [h("span", { class: "fl", text: label })]);
    options.forEach(([val, text]) => {
      const b = h("button", {
        class: "chip", type: "button", text,
        "aria-pressed": String(filterState[key] === val),
      });
      b.onclick = () => {
        filterState[key] = val;
        [...g.querySelectorAll(".chip")].forEach((c, i) =>
          c.setAttribute("aria-pressed", String(options[i][0] === val)));
        drawCreatorMap();
      };
      g.appendChild(b);
    });
    return g;
  };

  const search = h("input", {
    class: "search", type: "search", placeholder: "Search for an account…",
    "aria-label": "Search accounts by username",
  });
  search.oninput = () => { filterState.q = search.value.trim().toLowerCase(); drawCreatorMap(); };

  host.replaceChildren(
    group("Platform", "platform",
      [["all", "All"], ...Object.keys(PLATFORM_LABEL).map((p) => [p, PLATFORM_LABEL[p]])]),
    group("Origin", "origin",
      [["all", "All"], ...origin.order.map((o) => [o, origin.labels[o]])]),
    group("Lean", "party", [["all", "All"], ["Democrat", "Democratic"], ["Republican", "Republican"]]),
    search,
  );
}

const filtered = () => DATA.accounts.filter((a) =>
  (filterState.platform === "all" || a.platform === filterState.platform)
  && (filterState.origin === "all" || a.origin === filterState.origin)
  && (filterState.party === "all" || a.party === filterState.party)
  && (!filterState.q || a.username.toLowerCase().includes(filterState.q)));

function partisanColor(p) {
  return diverging(p, cssVar("--dem"), cssVar("--neutral"), cssVar("--rep"));
}

function drawCreatorMap() {
  const rows = filtered();
  const host = document.getElementById("explore-card");
  const { origin } = DATA.overview;

  const maxLikes = Math.max(...DATA.accounts.map((a) => a.median_likes || 0), 1);
  const sizeOf = (p) => 5 + Math.sqrt((p.a.median_likes || 0) / maxLikes) * 11;

  const card = chartCard({
    title: "Partisanship against share of posts that are political",
    note: "Bigger marks get more likes per post. Click any account to open it.",
    render(hostEl) {
      if (!rows.length) {
        hostEl.appendChild(h("p", { class: "card-note", text: "No accounts match these filters." }));
        return;
      }
      scatter(hostEl, {
        points: rows.map((a) => ({ a, x: a.p_signed, y: a.political_share })),
        xDomain: [-1, 1], yDomain: [0, 1],
        xLabel: "Partisan lean of political posts  (−1 fully Democratic · +1 fully Republican)",
        yLabel: "Share of posts that are political",
        xTicks: [{ v: -1, label: "−1 Dem" }, { v: -0.5, label: "−0.5" }, { v: 0, label: "0" },
                 { v: 0.5, label: "0.5" }, { v: 1, label: "+1 Rep" }],
        yTicks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: fmtPct(v) })),
        colorOf: (p) => partisanColor(p.a.p_signed),
        shapeOf: (p) => SHAPE_BY_ORIGIN[p.a.origin] || "circle",
        sizeOf,
        onSelect: (p) => openProfile(p.a),
        tooltipOf: (p) => ttHtml(`@${p.a.username}`, [
          ["Platform", PLATFORM_LABEL[p.a.platform]],
          ["Origin", origin.labels[p.a.origin] || "—"],
          ["Partisan lean", p.a.p_signed.toFixed(2)],
          ["Political posts", fmtPct(p.a.political_share)],
          ["Posts", p.a.n_posts.toLocaleString("en-US")],
          ["Median likes", fmtNum(p.a.median_likes)],
        ]),
      });
      hostEl.appendChild(shapeLegend(origin));
    },
    table: () => dataTable(
      ["Account", "Platform", "Origin", "Lean", "Political posts", "Posts", "Median likes"],
      rows.map((a) => [
        `@${a.username}`, PLATFORM_LABEL[a.platform], origin.labels[a.origin] || "—",
        a.p_signed.toFixed(2), fmtPct(a.political_share),
        a.n_posts.toLocaleString("en-US"), fmtNum(a.median_likes),
      ])),
  });
  host.replaceChildren(card);

  document.getElementById("explore-count").textContent =
    `Showing ${rows.length} of ${DATA.accounts.length} accounts.`;
}

function shapeLegend(origin) {
  const wrap = h("div", { class: "legend" });
  origin.order.forEach((o) => {
    const svg = el("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": "true" });
    const shape = { circle: () => el("circle", { cx: 8, cy: 8, r: 6 }),
      square: () => el("rect", { x: 2, y: 2, width: 12, height: 12, rx: 2 }),
      triangle: () => el("path", { d: "M8,1 L15,14 L1,14 Z" }),
      diamond: () => el("path", { d: "M8,0 L16,8 L8,16 L0,8 Z" }) }[SHAPE_BY_ORIGIN[o]]();
    shape.setAttribute("fill", cssVar("--text-secondary"));
    svg.appendChild(shape);
    wrap.appendChild(h("span", { class: "legend-item" }, [svg, h("span", { text: origin.labels[o] })]));
  });
  wrap.appendChild(partisanLegend().firstChild);
  return wrap;
}

/* The diverging lean scale, shared by both scatters so colour means the same
   thing on each. */
function partisanLegend() {
  return h("div", { class: "legend" }, [
    h("span", { class: "legend-item" }, [
      h("span", { class: "legend-swatch", style: "width:64px;border-radius:4px;"
        + `background:linear-gradient(90deg,${cssVar("--dem")},${cssVar("--neutral")},${cssVar("--rep")})` }),
      h("span", { text: "Democratic ← partisan lean → Republican" }),
    ]),
  ]);
}

/* ---------- account profile ---------- */
function initials(name) {
  const clean = name.replace(/[^A-Za-z0-9]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
}

function openProfile(a) {
  const { origin } = DATA.overview;
  const backdrop = h("div", { class: "profile-backdrop", role: "dialog", "aria-modal": "true",
    "aria-label": `Profile of ${a.username}` });
  const panel = h("div", { class: "profile" });

  const close = () => { backdrop.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  const closeBtn = h("button", { class: "close-btn", type: "button", "aria-label": "Close", text: "✕" });
  closeBtn.onclick = close;

  panel.appendChild(h("div", { class: "profile-head" }, [
    h("div", { class: "avatar", style: `background:${partisanColor(a.p_signed)}`,
      text: initials(a.username), "aria-hidden": "true" }),
    h("div", { class: "who" }, [
      h("div", { class: "name", text: `@${a.username}` }),
      h("div", { class: "meta",
        text: `${PLATFORM_LABEL[a.platform]} · ${origin.labels[a.origin] || "unclassified"}` }),
    ]),
    closeBtn,
  ]));

  const body = h("div", { class: "profile-body" });

  const pin = h("div", { class: "pin", style: `left:calc(${((a.p_signed + 1) / 2) * 100}% - 1.5px)` });
  body.appendChild(h("div", {}, [
    h("div", { class: "card-note", text: "Partisan lean of this account's political posts" }),
    h("div", { class: "gauge" }, [pin]),
    h("div", { class: "gauge-ends" }, [
      h("span", { text: "Fully Democratic" }),
      h("span", { text: a.p_signed.toFixed(2) }),
      h("span", { text: "Fully Republican" }),
    ]),
  ]));

  const stats = [
    [a.n_posts.toLocaleString("en-US"), "posts collected"],
    [fmtPct(a.political_share), "political"],
    [fmtNum(a.median_likes), "median likes"],
    [a.attack_rate != null ? fmtPct(a.attack_rate) : "—", "of partisan posts attack"],
    [a.advocacy_rate != null ? fmtPct(a.advocacy_rate) : "—", "advocate for a side"],
    [a.type.replace(/_/g, " "), "posting type"],
  ];
  body.appendChild(h("div", { class: "stat-row" }, stats.map(([v, k]) =>
    h("div", { class: "stat" }, [h("div", { class: "v", text: v }), h("div", { class: "k", text: k })]))));

  body.appendChild(h("h3", { text: "Posts from this account", style: "margin-top:18px" }));
  body.appendChild(embedSection(a.examples));

  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  closeBtn.focus();
}

/* ---------- platform embeds, behind a consent gate ---------- */
const hasConsent = () => localStorage.getItem(CONSENT_KEY) === "yes";

function embedSection(examples) {
  const wrap = h("div", {});
  if (!examples || !examples.length) {
    wrap.appendChild(h("p", { class: "card-note", text: "No example posts stored for this account." }));
    return wrap;
  }
  const host = h("div", { class: "embeds" });

  const mount = () => {
    host.replaceChildren(...examples.map(embedCard));
    examples.forEach((ex, i) => loadEmbed(host.children[i].querySelector(".embed-slot"), ex));
  };

  if (hasConsent()) {
    mount();
  } else {
    const note = h("div", { class: "consent-note" }, [
      h("div", { text: "Posts are shown using the platforms' own embed players. Loading them "
        + "contacts X, Instagram or TikTok, which may set cookies and will see your IP address. "
        + "Nothing loads until you choose to." }),
      (() => {
        const b = h("button", { class: "btn", type: "button", text: "Load posts from the platforms" });
        b.onclick = () => { localStorage.setItem(CONSENT_KEY, "yes"); note.remove(); mount(); };
        return b;
      })(),
    ]);
    wrap.appendChild(note);
  }
  wrap.appendChild(host);
  return wrap;
}

const TONE_LABEL = { attack: "Attacks the other side", advocacy: "Advocates for a side",
  both: "Attacks and advocates" };

function embedCard(ex) {
  const tags = [h("span", { class: "tag", text: PLATFORM_LABEL[ex.platform] })];
  if (ex.date) tags.push(h("span", { class: "tag", text: ex.date }));
  if (ex.tone) tags.push(h("span", { class: "tag signal", text: TONE_LABEL[ex.tone] }));
  if (ex.direction === "democrat") tags.push(h("span", { class: "tag on-dem", text: "Pro-Democratic side" }));
  if (ex.direction === "republican") tags.push(h("span", { class: "tag on-rep", text: "Pro-Republican side" }));
  if (ex.political === 0) tags.push(h("span", { class: "tag", text: "Not political" }));
  if (ex.likes != null) tags.push(h("span", { class: "tag", text: `${fmtNum(ex.likes)} likes` }));

  return h("div", { class: "embed-card" }, [
    h("div", { class: "embed-slot" }, [
      h("div", { class: "embed-fallback", text: "Loading post…" }),
    ]),
    h("div", { class: "embed-meta" }, [
      h("span", { text: "Our coding:" }), ...tags,
      h("a", { href: ex.url, target: "_blank", rel: "noopener noreferrer", text: "Open original ↗" }),
    ]),
  ]);
}

const scriptCache = {};
function loadScript(src) {
  if (scriptCache[src]) return scriptCache[src];
  scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptCache[src];
}

async function loadEmbed(slot, ex) {
  const fail = (msg) => {
    slot.replaceChildren(h("div", { class: "embed-fallback", text: msg }));
  };
  try {
    if (ex.platform === "x") {
      slot.innerHTML = `<blockquote class="twitter-tweet" data-dnt="true"><a href="${ex.url}"></a></blockquote>`;
      await loadScript("https://platform.twitter.com/widgets.js");
      await window.twttr?.widgets?.load(slot);
    } else if (ex.platform === "instagram") {
      slot.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${ex.url}"`
        + ` data-instgrm-version="14" style="width:100%;margin:0"></blockquote>`;
      await loadScript("https://www.instagram.com/embed.js");
      window.instgrm?.Embeds?.process();
    } else if (ex.platform === "tiktok") {
      const vid = (ex.url.match(/\/video\/(\d+)/) || [])[1];
      slot.innerHTML = `<blockquote class="tiktok-embed" cite="${ex.url}" data-video-id="${vid || ""}"`
        + ` style="max-width:100%;margin:0"><section></section></blockquote>`;
      await loadScript("https://www.tiktok.com/embed.js");
    }
    // If the widget never replaced our placeholder, say so rather than spinning.
    setTimeout(() => {
      const still = slot.querySelector(".embed-fallback");
      const rendered = slot.querySelector("iframe");
      if (!rendered && !still) {
        fail("This post is no longer available on the platform. Its classification above still applies.");
      } else if (!rendered && still) {
        fail("This post could not be loaded — it may have been deleted or made private.");
      }
    }, 6000);
  } catch {
    fail("The platform's embed script could not be loaded.");
  }
}

/* ---------- origins ---------- */
function renderOrigins() {
  const { origin, onesidedness, totals } = DATA.overview;
  const host = document.getElementById("origins-cards");
  const C = [cssVar("--series-1"), cssVar("--series-2"), cssVar("--series-3"), cssVar("--series-4")];

  const tiles = h("div", { class: "tiles" }, [
    { v: fmtPct(origin.migrated_accounts), l: "of accounts arrived already famous",
      s: "journalists, entertainers and politicians" },
    { v: origin.accounts.journalist, l: "journalist-origin accounts",
      s: `of ${totals.accounts}, and as one-sided as native creators` },
  ].map((t) => h("div", { class: "tile" }, [
    h("div", { class: "value", text: String(t.v) }),
    h("div", { class: "label", text: t.l }),
    h("div", { class: "sub", text: t.s }),
  ])));

  // The label stays with the data it qualifies; the full explanation lives in Methods.
  const provisional = h("p", { class: "card-note", style: "margin-top:14px" }, [
    h("span", { class: "provisional", text: "Provisional coding" }),
    h("span", { html: " Origin of fame is not yet human-validated. "
      + "<a href=\"methods.html\">See Methods and limitations</a>." }),
  ]);

  const platforms = ["x", "instagram", "tiktok"];
  const flows = origin.order.flatMap((o) =>
    platforms.map((p) => ({ source: o, target: p, value: origin.platform_mix[o][p] }))
  ).filter((f) => f.value > 0);

  const originFlow = chartCard({
    title: "Where the fame came from, and where it went",
    note: "Thicker ribbons carry more accounts.",
    render: (el2) => {
      sankey(el2, {
        sources: origin.order, targets: platforms, flows,
        colors: [C[0], C[1], C[2]],
        nodeLabel: (k) => origin.labels[k] || PLATFORM_LABEL[k] || k,
        valueLabel: "accounts",
      });
    },
    table: () => dataTable(["Origin", ...platforms.map((p) => PLATFORM_LABEL[p]), "Total"],
      origin.order.map((o) => [origin.labels[o], ...platforms.map((p) => origin.platform_mix[o][p]),
        platforms.reduce((a, p) => a + origin.platform_mix[o][p], 0)])),
  });

  const pabs = chartCard({
    title: "How one-sided each group is",
    note: "1.0 means every political post takes the same side. The bars behind each value show how "
      + "much the group's average could shift with a different set of accounts.",
    render: (el2) => barsH(el2, {
      data: origin.p_abs.map((r) => ({ label: origin.labels[r.key], value: r.mean, lo: r.lo, hi: r.hi, n: r.n })),
      max: 1.15, color: cssVar("--series-1"), valueFmt: (v) => v.toFixed(2), labelWidth: 120,
    }),
    table: () => dataTable(["Origin", "Accounts", "Mean |lean|", "95% CI"],
      origin.p_abs.map((r) => [origin.labels[r.key], r.n, r.mean.toFixed(3), `${r.lo}–${r.hi}`])),
  });

  host.replaceChildren(tiles, provisional, originFlow, pabs);
}

/* ---------- attack or advocate ---------- */
function renderTone() {
  const { engagement } = DATA.overview;
  const host = document.getElementById("tone-cards");

  const rows = DATA.accounts.filter((a) => a.attack_rate != null && a.advocacy_rate != null);

  const map = chartCard({
    title: "Attack against advocacy, one account per mark",
    note: "Above the line, the account attacks more than it advocates. A post can do both, so the two "
      + "shares can add up to more than everything the account posted. Click a mark to read its posts.",
    render: (hostEl) => {
      scatter(hostEl, {
        points: rows.map((a) => ({ a, x: a.advocacy_rate, y: a.attack_rate })),
        xDomain: [0, 1], yDomain: [0, 1],
        xLabel: "Share of partisan posts that advocate for a side",
        yLabel: "Share that attack the other side",
        xTicks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: fmtPct(v) })),
        yTicks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: fmtPct(v) })),
        colorOf: (p) => partisanColor(p.a.p_signed),
        shapeOf: () => "circle",
        sizeOf: (p) => 5 + Math.sqrt(Math.min(p.a.n_partisan, 3000) / 3000) * 10,
        onSelect: (p) => openProfile(p.a),
        tooltipOf: (p) => ttHtml(`@${p.a.username}`, [
          ["Attacks", fmtPct(p.a.attack_rate)],
          ["Advocates", fmtPct(p.a.advocacy_rate)],
          ["Partisan lean", p.a.p_signed.toFixed(2)],
          ["Partisan posts", p.a.n_partisan.toLocaleString("en-US")],
        ]),
        diagonal: true,
      });
      hostEl.appendChild(partisanLegend());
    },
    table: () => dataTable(["Account", "Attacks", "Advocates", "Partisan lean", "Partisan posts"],
      [...rows].sort((a, b) => b.attack_rate - a.attack_rate).map((a) => [
        `@${a.username}`, fmtPct(a.attack_rate, 1), fmtPct(a.advocacy_rate, 1),
        a.p_signed.toFixed(2), a.n_partisan.toLocaleString("en-US")])),
  });

  const caveat = h("p", { class: "card-note", style: "margin-top:10px" }, [
    h("span", { html: "The classifier is less precise on anti-Harris posts than on its other labels, so "
      + "attack rates are not equally reliable across the two sides. "
      + "<a href=\"methods.html\">See Methods and limitations</a>." }),
  ]);

  // Grouped by political vs non-political, coloured by party, so the comparison
  // the chart is making sits on the x-axis and party identity carries the colour.
  const engCard = chartCard({
    title: "Do political posts get more likes?",
    note: "Typical likes per post, for the same accounts, split by whether the post was political.",
    render: (el2) => barsGrouped(el2, {
      groups: [
        { label: "Political posts",
          values: Object.fromEntries(engagement.map((e) => [e.key, e.political])) },
        { label: "Non-political posts",
          values: Object.fromEntries(engagement.map((e) => [e.key, e.nonpolitical])) },
      ],
      series: [{ key: "Democrat", label: "Democratic-leaning" },
               { key: "Republican", label: "Republican-leaning" }],
      colors: [cssVar("--dem"), cssVar("--rep")], valueFmt: fmtNum,
    }),
    table: () => dataTable(["Post type", ...engagement.map((e) => e.key)], [
      ["Political", ...engagement.map((e) => fmtNum(e.political))],
      ["Non-political", ...engagement.map((e) => fmtNum(e.nonpolitical))],
    ]),
  });

  host.replaceChildren(map, caveat, engCard);
}

/* ---------- rhythm ---------- */
function renderRhythm() {
  const { timeseries, window: win, events, origin } = DATA.overview;
  const host = document.getElementById("rhythm-cards");
  const days = win.days;

  const byParty = chartCard({
    title: "Daily posts, by partisan lean",
    note: "All 140 accounts. Weekends are shaded grey: posting drops inside almost every band and "
      + "climbs again midweek. The pattern is easiest to see on the "
      + "Republican-leaning line, whose much higher volume makes the weekly swing more visible. "
      + "Almost every high-volume account in the dataset shows it, and it is strongest among accounts "
      + "run by people with a daily show. For many of these creators, political posting keeps the "
      + "hours of a job.",
    render: (el2) => lineChart(el2, {
      dates: days, events,
      series: [
        { label: "Democratic-leaning", values: timeseries.by_party.Democrat },
        { label: "Republican-leaning", values: timeseries.by_party.Republican },
      ],
      colors: [cssVar("--dem"), cssVar("--rep")], yLabel: "posts/day",
    }),
    table: () => dataTable(["Date", "Democratic-leaning", "Republican-leaning"],
      days.map((d, i) => [d, timeseries.by_party.Democrat[i], timeseries.by_party.Republican[i]])),
  });

  const byOrigin = chartCard({
    title: "Daily posts, by origin of fame",
    note: "Native creators post at a volume the other groups never approach. Weekends are shaded grey.",
    render: (el2) => lineChart(el2, {
      dates: days, events,
      series: origin.order.map((o) => ({ label: origin.labels[o], values: timeseries.by_origin[o] })),
      colors: [cssVar("--series-1"), cssVar("--series-2"), cssVar("--series-3"), cssVar("--series-4")],
      yLabel: "posts/day",
    }),
    table: () => dataTable(["Date", ...origin.order.map((o) => origin.labels[o])],
      days.map((d, i) => [d, ...origin.order.map((o) => timeseries.by_origin[o][i])])),
  });

  const share = chartCard({
    title: "Share of all posts that were political, by day",
    note: "The feed did not become steadily more political; it spiked around events and peaked at the "
      + "vote. Weekends are shaded grey.",
    render: (el2) => lineChart(el2, {
      dates: days, events,
      series: [{ label: "Political share", values: timeseries.political_share }],
      colors: [cssVar("--series-1")], yFmt: (v) => fmtPct(v), yLabel: "share political",
    }),
    table: () => dataTable(["Date", "Political share"],
      days.map((d, i) => [d, fmtPct(timeseries.political_share[i], 1)])),
  });

  host.replaceChildren(byParty, byOrigin, share);
}

/* ---------- quiz: estimate the population, then see the measurement ---------- */
function renderQuiz() {
  const host = document.getElementById("quiz-host");
  const items = DATA.quiz.perception;
  const guesses = [];
  let i = 0;

  const card = h("div", { class: "card quiz" });
  const unit = (it, v) => (it.unit === "percent" ? `${Number(v).toFixed(0)}%` : `${Number(v).toFixed(1)}×`);

  const draw = () => {
    if (i >= items.length) return finish();
    const it = items[i];
    const start = it.unit === "percent" ? 50 : 3;

    card.replaceChildren();
    card.appendChild(h("div", { class: "quiz-progress" }, [
      h("span", { text: `Question ${i + 1} of ${items.length}` }),
      h("span", { text: "Your best guess" }),
    ]));
    card.appendChild(h("h3", { text: it.question, style: "margin:6px 0 18px" }));

    const readout = h("div", { class: "guess-readout", text: unit(it, start) });
    const slider = h("input", {
      class: "guess-slider", type: "range", min: String(it.min), max: String(it.max),
      step: it.unit === "percent" ? "1" : "0.1", value: String(start),
      "aria-label": it.question,
    });
    slider.oninput = () => { readout.textContent = unit(it, slider.value); };

    card.append(readout, slider, h("div", { class: "gauge-ends" }, [
      h("span", { text: unit(it, it.min) }), h("span", { text: unit(it, it.max) }),
    ]));

    const submit = h("button", { class: "btn", type: "button", text: "Lock in my guess",
      style: "margin-top:16px" });
    submit.onclick = () => {
      const guess = Number(slider.value);
      guesses.push({ key: it.key, guess, answer: it.answer });
      slider.disabled = true;
      submit.remove();

      const off = Math.abs(guess - it.answer);
      const verdict = it.unit === "percent"
        ? (off <= 5 ? "Very close." : off <= 15 ? "In the right area." : "A long way off.")
        : (off <= 0.3 ? "Very close." : off <= 1 ? "In the right area." : "A long way off.");
      const dir = guess > it.answer ? "an overestimate" : guess < it.answer ? "an underestimate" : "exact";

      card.appendChild(h("div", { class: "quiz-reveal" }, [
        compareBar(it, guess),
        h("div", { style: "margin-top:12px", html:
          `<strong>${verdict}</strong> You said <strong>${unit(it, guess)}</strong>. `
          + `The measured value is <strong>${unit(it, it.answer)}</strong>`
          + `${dir === "exact" ? "." : `, so that is ${dir}.`}` }),
        h("div", { class: "card-note", style: "margin-top:8px", text: it.reveal }),
        (() => {
          const nb = h("button", { class: "btn", type: "button", style: "margin-top:12px",
            text: i + 1 < items.length ? "Next question" : "See how I did" });
          nb.onclick = () => { i++; draw(); };
          return nb;
        })(),
      ]));
      card.querySelector(".quiz-reveal").scrollIntoView({ block: "nearest" });
    };
    card.appendChild(submit);
  };

  const compareBar = (it, guess) => {
    const pos = (v) => ((v - it.min) / (it.max - it.min)) * 100;
    return h("div", { class: "compare" }, [
      h("div", { class: "compare-track" }, [
        h("div", { class: "compare-span",
          style: `left:${Math.min(pos(guess), pos(it.answer))}%;`
            + `width:${Math.abs(pos(guess) - pos(it.answer))}%` }),
        h("div", { class: "compare-pin guess", style: `left:${pos(guess)}%` }),
        h("div", { class: "compare-pin truth", style: `left:${pos(it.answer)}%` }),
      ]),
      h("div", { class: "compare-key" }, [
        h("span", { html: `<span class="dot guess"></span> your guess ${unit(it, guess)}` }),
        h("span", { html: `<span class="dot truth"></span> measured ${unit(it, it.answer)}` }),
      ]),
    ]);
  };

  const finish = () => {
    // Mean absolute error on the percent items only, so the multiplier item does
    // not get averaged with percentage points.
    const pct = guesses.filter((g) => items.find((it) => it.key === g.key).unit === "percent");
    const mae = pct.reduce((a, g) => a + Math.abs(g.guess - g.answer), 0) / (pct.length || 1);
    const over = pct.filter((g) => g.guess > g.answer).length;

    const verdict = mae <= 8
      ? "Your guesses were close to the measurements throughout."
      : mae <= 18
        ? "Your guesses were in the right area on most questions."
        : "Your guesses were some way from the measurements on several questions.";
    const tilt = over > pct.length / 2
      ? "You guessed too high more often than too low."
      : over < pct.length / 2
        ? "You guessed too low more often than too high."
        : "Your guesses were evenly split between too high and too low.";

    card.replaceChildren(h("div", { class: "quiz-score" }, [
      h("div", { class: "big", text: `${mae.toFixed(0)} pts` }),
      h("div", { class: "label", text: "average distance between your guesses and the measurements" }),
      h("p", { class: "card-note", style: "margin-top:10px", text: `${verdict} ${tilt}` }),
    ]));

    const rows = guesses.map((g) => {
      const it = items.find((x) => x.key === g.key);
      return [it.question.length > 62 ? `${it.question.slice(0, 60)}…` : it.question,
        unit(it, g.guess), unit(it, g.answer),
        it.unit === "percent" ? `${Math.abs(g.guess - g.answer).toFixed(0)} pts`
          : `${Math.abs(g.guess - g.answer).toFixed(1)}×`];
    });
    card.appendChild(h("div", { class: "table-scroll", style: "margin-top:14px" },
      [dataTable(["Question", "You", "Measured", "Off by"], rows)]));

    const row = h("div", { style: "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px" });
    const again = h("button", { class: "btn ghost", type: "button", text: "Try again" });
    again.onclick = () => renderQuiz();
    const share = h("button", { class: "btn", type: "button", text: "Share result" });
    share.onclick = async () => {
      const text = `My guesses about the US political creator landscape were off by an average of `
        + `${mae.toFixed(0)} percentage points. How close can you get?`;
      if (navigator.share) {
        try { await navigator.share({ title: "Who is in your political feed?", text, url: location.href }); }
        catch { /* dismissed */ }
      } else {
        await navigator.clipboard?.writeText(`${text} ${location.href}`);
        share.textContent = "Copied to clipboard";
      }
    };
    row.append(again, share);
    card.appendChild(row);
    card.appendChild(h("p", { class: "card-note", style: "text-align:center;margin-top:14px",
      text: "Your answers stay in your browser. Nothing is sent anywhere and nothing is stored." }));
  };

  host.replaceChildren(card);
  draw();
}

/* ---------- methods ---------- */
function renderMethods() {
  const { validation, model, n_validation_posts } = DATA.methods;
  const { totals, window: win } = DATA.overview;
  const host = document.getElementById("methods-host");

  const table = chartCard({
    title: "Classifier accuracy against human coding",
    note: `The five measures behind everything shown on the dashboard, each validated against a `
      + `hand-coded gold standard of up to ${n_validation_posts} posts. F1 combines precision and `
      + `recall; 1.0 is perfect.`,
    render: (elx) => {
      barsH(elx, {
        data: validation.map((r) => ({ label: r.label, value: r.f1 })),
        max: 1.1, color: cssVar("--series-1"),
        valueFmt: (v) => v.toFixed(2), labelWidth: 170,
      });
    },
    table: () => dataTable(["Measure", "Precision", "Recall", "F1", "n", "Used for"],
      validation.map((r) => [r.label, r.precision.toFixed(3), r.recall.toFixed(3),
        r.f1.toFixed(3), r.n, r.used_for])),
  });

  const prose = h("div", { class: "card" }, [
    h("h3", { text: "What was collected" }),
    h("p", { html: `Posts mentioning Donald Trump or Kamala Harris were collected between `
      + `<strong>${win.start}</strong> and <strong>${win.end}</strong> across X, Instagram and TikTok. `
      + `From these, the 50 most-followed US accounts per platform were retained, giving `
      + `<strong>${totals.accounts} accounts</strong> (${totals.persons} distinct people, since some run `
      + `accounts on several platforms) and <strong>${totals.posts.toLocaleString("en-US")} posts</strong>. `
      + `All accounts have more than 100,000 followers. Reposts and replies on X are excluded.` }),

    h("h3", { text: "How posts were classified" }),
    h("p", { html: `Each post was classified by <strong>${model || "a large language model"}</strong> at `
      + `temperature 0, using a fixed codebook. Image text and video transcripts were included, so posts `
      + `that carry their politics in video rather than caption are still measured. An account's partisan `
      + `lean is the balance of its pro- and anti- posts for each side, on a −1 (fully Democratic) to `
      + `+1 (fully Republican) scale.` }),

    h("h3", { text: "What is provisional" }),
    h("p", { html: `<span class="provisional">Provisional coding</span> Origin of fame, the four-way split `
      + `between native creators, journalists, entertainment and politicians, is an <strong>automated first `
      + `pass that has not been validated by human coders</strong>. Human validation is under way. `
      + `Individual account labels in the "Who they are" section may be wrong; the aggregate patterns are `
      + `more reliable than any single label, but both should be treated as preliminary. Every other measure `
      + `on the site is validated against human coding, as reported above.` }),

    h("h3", { text: "Known limitations" }),
    h("p", { html: `<strong>The party comparison of negativity.</strong> Precision on anti-Harris/Democrat `
      + `posts is .61, well below every other label. That can inflate measured attack rates on one side. `
      + `The comparison appears on the dashboard because it is in the data, but it should not be read as `
      + `evidence that one party's creators are more negative than the other's.` }),
    h("p", { html: `<strong>No follower counts.</strong> More than 100,000 followers was a selection `
      + `criterion, but the count itself was never stored. Account size on the dashboard is median likes `
      + `per post instead, which reflects engagement rather than audience size.` }),
    h("p", { html: `<strong>Timestamps on X were reconstructed.</strong> X posts arrived without a `
      + `collection date. Their timestamps were recovered from the identifier embedded in each post's URL, `
      + `which resolves all but four of them. Instagram and TikTok timestamps are native.` }),
    h("p", { html: `<strong>This is the top of the field, not a sample of it.</strong> The accounts are the `
      + `most-followed political accounts per platform, selected because they posted about the candidates. `
      + `The dataset describes what was most visible, and says nothing about smaller creators.` }),
    h("p", { html: `<strong>A few accounts dominate the totals.</strong> Post volume is very unevenly `
      + `distributed, so any chart of raw post counts is weighted towards a handful of prolific accounts. `
      + `Group averages on this site are computed across accounts rather than across posts, so that one `
      + `high-volume account cannot stand in for its whole group.` }),

    h("h3", { text: "Posts and copyright" }),
    h("p", { html: `This site stores <strong>no post text and no images</strong>. Example posts are `
      + `referenced by their public URL and rendered by the platforms' own embed players, which load only `
      + `after you opt in. Where a post has since been deleted the embed will not load, and only our `
      + `classification of it remains.` }),

    h("h3", { text: "The quiz" }),
    h("p", { html: `The quiz asks you to estimate population quantities, not to judge individual posts. `
      + `That is deliberate. Asking visitors to label single posts would score them against the `
      + `classifier, so any borderline case would read as the classifier being wrong in public, which `
      + `tells you nothing about how accurate it actually is. The accuracy table above is the honest `
      + `answer to that question. <strong>The quiz stores nothing and sends nothing anywhere</strong>; `
      + `your answers stay in your browser.` }),

    h("h3", { text: "Corrections" }),
    h("p", { html: `If you appear in this dataset and believe a classification is wrong, please write to `
      + `<a href="mailto:e.vogel@ikmz.uzh.ch">e.vogel@ikmz.uzh.ch</a>. We will check the underlying posts `
      + `and correct the site if the coding is in error.` }),

    h("p", { style: "margin-top:18px" },
      [h("a", { href: "index.html", text: "← Back to the dashboard" })]),
  ]);

  host.replaceChildren(table, prose);
}

function renderFooter() {
  const host = document.getElementById("footer-host");
  if (!host) return;
  const base = document.body.dataset.base || "";
  const page = document.body.dataset.page || "dashboard";

  const credit = h("p", { html: `<strong>PSMI Dashboards</strong> — Eva-Maria Vogel, Morgan Wack, `
    + `Christian Pipal and Frank Esser. Department of Communication and Media Research (IKMZ), `
    + `University of Zurich, Andreasstrasse 15, 8050 Zürich, Switzerland.` });

  const provenance = page === "dashboard"
    ? h("p", { html: `Figures on this page are generated directly from the classified research `
        + `dataset; see <a href="methods.html">Methods</a> for accuracy and limitations.` })
    : page === "methods"
      ? h("p", { text: "Figures across this dashboard are generated directly from the classified "
          + "research dataset." })
      : null;

  const links = h("p", { html: `<a href="${base}about.html">About us</a> · `
    + `Contact: <a href="mailto:e.vogel@ikmz.uzh.ch">e.vogel@ikmz.uzh.ch</a>` });

  host.replaceChildren(...[credit, provenance, links].filter(Boolean));
}

boot();
