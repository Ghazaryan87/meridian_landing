/* ============================================================
   MERIDIAN — interactions & generated content
   Vanilla JS. No framework (React loads only for the Tweaks island).
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Visibility watcher --------------------------------
     IntersectionObserver is unreliable in some embedded preview
     contexts (initial callback never delivered), which would leave
     reveal elements stuck at opacity:0. Use a scroll/rAF rect check
     instead — bulletproof everywhere. */
  const _watchers = [];
  function watch(el, cb, once = true) {
    if (el) _watchers.push({ el, cb, once, done: false });
  }
  function checkWatchers() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    for (const w of _watchers) {
      if (w.done) continue;
      const r = w.el.getBoundingClientRect();
      if (r.top < vh * 0.9 && r.bottom > 0) {
        w.cb(w.el);
        if (w.once) w.done = true;
      }
    }
  }
  let _ticking = false;
  function onScrollResize() {
    if (_ticking) return;
    _ticking = true;
    requestAnimationFrame(() => { checkWatchers(); _ticking = false; });
  }
  // rAF scroll-poll: detects scrollTop changes even where 'scroll' events
  // don't fire (some embedded iframes). Stops once every watcher is done.
  let _lastTop = -1;
  function pollLoop() {
    const sc = (document.scrollingElement || document.documentElement).scrollTop;
    if (sc !== _lastTop) { _lastTop = sc; checkWatchers(); }
    if (_watchers.some(w => !w.done)) requestAnimationFrame(pollLoop);
  }
  // Safety net: never leave content permanently hidden. After a grace period
  // reveal/trigger anything still pending, regardless of scroll detection.
  function revealAllPending() {
    for (const w of _watchers) {
      if (!w.done) { w.cb(w.el); w.done = true; }
    }
  }

  /* ---- SVG path helpers ---------------------------------- */
  // smooth cubic path through points
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  function series(n, base, amp, seed) {
    let s = seed || 1;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const out = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v += (rnd() - 0.5) * amp;
      v = Math.max(base - amp * 1.6, Math.min(base + amp * 1.6, v));
      out.push(v);
    }
    return out;
  }

  /* ---- Counters ------------------------------------------ */
  function animateCount(el) {
    const to = parseFloat(el.dataset.to);
    const fmt = el.dataset.fmt || "int";
    const dur = 1400;
    const start = performance.now();
    if (reduce) { el.textContent = format(to, fmt); return; }
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(to * e, fmt);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function format(v, fmt) {
    if (fmt === "int") return Math.round(v).toLocaleString("en-US");
    if (fmt === "pct") return v.toFixed(2);
    return String(Math.round(v));
  }

  /* ---- Hero area chart (with live streaming) ------------- */
  function buildArea() {
    const svg = $("#heroArea");
    if (!svg) return;
    const W = 600, H = 120;
    let p99 = series(40, 70, 26, 7);
    let p50 = series(40, 36, 14, 21);
    const ns = "http://www.w3.org/2000/svg";

    // gradient + grid defs
    svg.innerHTML = `
      <defs>
        <linearGradient id="agp50" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".34"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="agp99" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--info)" stop-opacity=".2"/>
          <stop offset="100%" stop-color="var(--info)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g id="agGrid"></g>
      <path id="agArea99" fill="url(#agp99)"/>
      <path id="agArea50" fill="url(#agp50)"/>
      <path id="agLine99" fill="none" stroke="var(--info)" stroke-width="2" stroke-linecap="round" opacity=".85"/>
      <path id="agLine50" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>
      <circle id="agDot" r="3.5" fill="var(--accent)"/>
    `;
    const grid = $("#agGrid", svg);
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", 0); l.setAttribute("x2", W);
      l.setAttribute("y1", y); l.setAttribute("y2", y);
      l.setAttribute("stroke", "var(--line)"); l.setAttribute("stroke-width", "1");
      grid.appendChild(l);
    }

    function render() {
      const max = 120, min = 8;
      const toPt = (arr) => arr.map((v, i) => [
        (i / (arr.length - 1)) * W,
        H - ((v - min) / (max - min)) * H
      ]);
      const pt50 = toPt(p50), pt99 = toPt(p99);
      const area = (pts) => smoothPath(pts) + `L${W},${H} L0,${H} Z`;
      $("#agArea50", svg).setAttribute("d", area(pt50));
      $("#agArea99", svg).setAttribute("d", area(pt99));
      $("#agLine50", svg).setAttribute("d", smoothPath(pt50));
      $("#agLine99", svg).setAttribute("d", smoothPath(pt99));
      const last = pt50[pt50.length - 1];
      $("#agDot", svg).setAttribute("cx", last[0]);
      $("#agDot", svg).setAttribute("cy", last[1]);
    }
    render();

    if (!reduce) {
      setInterval(() => {
        p50.shift(); p99.shift();
        const n50 = p50[p50.length - 1] + (Math.random() - 0.5) * 12;
        const n99 = p99[p99.length - 1] + (Math.random() - 0.5) * 20;
        p50.push(Math.max(20, Math.min(60, n50)));
        p99.push(Math.max(45, Math.min(105, n99)));
        render();
      }, 1800);
    }
  }

  /* ---- Sparklines (KPI) ---------------------------------- */
  // (kept inline-light; hero KPIs use counters only)

  /* ---- Trust logos --------------------------------------- */
  // Stylized wordmarks (fictional companies) — text-based, no third-party brand marks.
  const TRUST = ["Northwind", "Vanta Freight", "HelioPay", "Quanta", "Lumen Grid", "Ardent", "Kestrel"];
  function buildTrust() {
    const wrap = $("#trustLogos");
    if (!wrap) return;
    wrap.innerHTML = TRUST.map(n =>
      `<span class="lg" style="display:flex;align-items:center;gap:7px;font-family:var(--font-display);font-weight:700;font-size:17px;letter-spacing:-.02em">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:.7"><circle cx="12" cy="12" r="9"/><path d="M7 13l3-4 2 3 2-5 3 6"/></svg>${n}</span>`
    ).join("");
  }

  /* ---- PILLARS ------------------------------------------- */
  const PILLARS = [
    {
      id: "monitoring", n: "01", name: "Full-stack monitoring",
      blurb: "Every host, container and service on one real-time map.",
      icon: '<path d="M3 13h4l3-8 4 16 3-8h4" stroke-linecap="round" stroke-linejoin="round"/>',
      render: () => panelMonitoring()
    },
    {
      id: "apm", n: "02", name: "APM & distributed tracing",
      blurb: "Follow a request across every service, down to the slow span.",
      icon: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" stroke-linecap="round"/>',
      render: () => panelTrace()
    },
    {
      id: "logs", n: "03", name: "Log management",
      blurb: "Ingest, search and correlate logs with traces in one click.",
      icon: '<path d="M4 6h16M4 12h16M4 18h10" stroke-linecap="round"/>',
      render: () => panelLogs()
    },
    {
      id: "infra", n: "04", name: "Infrastructure & cloud",
      blurb: "AWS, GCP, Azure and Kubernetes, auto-discovered and tagged.",
      icon: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01" stroke-linecap="round"/>',
      render: () => panelInfra()
    },
    {
      id: "ai", n: "05", name: "AI anomaly & root-cause",
      blurb: "Detects what's wrong and writes you why, in plain language.",
      icon: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/>',
      render: () => panelAI()
    }
  ];

  function panelMonitoring() {
    const rows = [
      ["api-gateway", 99.99, "healthy", 42],
      ["checkout-api", 99.94, "warn", 78],
      ["payments-svc", 99.98, "healthy", 51],
      ["inventory-db", 99.99, "healthy", 33],
      ["search-svc", 99.91, "healthy", 64],
      ["notify-worker", 99.97, "healthy", 28]
    ];
    return `
      <div class="panel-bar"><div class="panel-dots"><i></i><i></i><i></i></div><span class="panel-title">services · prod-us-east</span><span class="panel-tag"><span class="dot live"></span> 1,284 hosts</span></div>
      <div style="padding:14px 16px">
        <div style="display:grid;grid-template-columns:1.4fr .8fr 1fr .6fr;gap:8px;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mute-solid);padding:0 8px 10px;border-bottom:1px solid var(--line)">
          <span>Service</span><span>Uptime</span><span>Latency p99</span><span style="text-align:right">State</span>
        </div>
        ${rows.map(([name, up, st, lat], i) => `
          <div class="mon-row" style="display:grid;grid-template-columns:1.4fr .8fr 1fr .6fr;gap:8px;align-items:center;padding:11px 8px;border-bottom:1px solid var(--line);animation:monIn .5s ${i * 0.06}s both">
            <span style="font-family:var(--font-mono);font-size:13px;color:var(--text)">${name}</span>
            <span class="mono tnum" style="font-size:13px;color:var(--text-dim)">${up}%</span>
            <span style="display:flex;align-items:center;gap:8px"><span style="flex:1;height:4px;border-radius:3px;background:var(--bg-3);overflow:hidden;max-width:90px"><i style="display:block;height:100%;width:${Math.min(100, lat)}%;background:${st === 'warn' ? 'var(--warn)' : 'var(--accent)'}"></i></span><span class="mono tnum" style="font-size:12px;color:var(--text-mute-solid)">${lat}ms</span></span>
            <span style="text-align:right"><span style="font-family:var(--font-mono);font-size:11px;color:${st === 'warn' ? 'var(--warn)' : 'var(--healthy)'};display:inline-flex;align-items:center;gap:6px"><span class="dot" style="background:${st === 'warn' ? 'var(--warn)' : 'var(--healthy)'}"></span>${st}</span></span>
          </div>`).join("")}
      </div>`;
  }

  function panelTrace() {
    const spans = [
      ["api-gateway", 0, 100, "var(--accent)"],
      ["auth-svc", 4, 18, "var(--info)"],
      ["checkout-api", 24, 64, "var(--accent)"],
      ["payments-svc", 30, 40, "var(--warn)"],
      ["fraud-check", 34, 22, "var(--info)"],
      ["inventory-db", 72, 14, "var(--accent)"],
      ["notify-worker", 88, 10, "var(--info)"]
    ];
    return `
      <div class="panel-bar"><div class="panel-dots"><i></i><i></i><i></i></div><span class="panel-title">trace · 7f3a··· · checkout flow</span><span class="panel-tag mono">312ms total</span></div>
      <div style="padding:16px">
        ${spans.map(([name, off, w, c], i) => `
          <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;padding:7px 0;animation:monIn .5s ${i * 0.07}s both">
            <span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-dim);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
            <div style="position:relative;height:22px;background:var(--bg-2);border-radius:5px">
              <div style="position:absolute;left:${off}%;width:${w}%;top:3px;bottom:3px;background:${c};border-radius:4px;display:flex;align-items:center;padding:0 7px;min-width:34px">
                <span class="mono" style="font-size:10px;color:var(--accent-ink);font-weight:600">${Math.round(w * 3.12)}ms</span>
              </div>
            </div>
          </div>`).join("")}
        <div style="margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:color-mix(in oklab,var(--warn) 8%,transparent);display:flex;gap:10px;align-items:center">
          <span class="dot" style="background:var(--warn)"></span>
          <span style="font-size:12.5px;color:var(--text-dim)"><b style="color:var(--text)">payments-svc</b> span is 2.1× its 7-day baseline. Likely cause: connection-pool saturation.</span>
        </div>
      </div>`;
  }

  function panelLogs() {
    const L = [
      ["12:04:51.220", "INFO", "checkout-api", "POST /v2/checkout 200 · 142ms · trace=7f3a", "var(--text-dim)"],
      ["12:04:51.244", "INFO", "payments-svc", "charge.authorize ok · amount=4200 · stripe_ms=88", "var(--text-dim)"],
      ["12:04:51.910", "WARN", "payments-svc", "db pool 47/50 in use · wait=210ms", "var(--warn)"],
      ["12:04:52.001", "ERROR", "payments-svc", "timeout acquiring connection after 3000ms", "var(--crit)"],
      ["12:04:52.014", "INFO", "meridian-ai", "anomaly linked → trace 7f3a · INC-4471 opened", "var(--accent)"],
      ["12:04:52.330", "INFO", "checkout-api", "retry succeeded on replica · 96ms", "var(--text-dim)"]
    ];
    return `
      <div class="panel-bar"><div class="panel-dots"><i></i><i></i><i></i></div><span class="panel-title">logs · live tail · service:payments-svc</span><span class="panel-tag"><span class="dot live"></span> tailing</span></div>
      <div style="padding:10px 0;font-family:var(--font-mono);font-size:12px">
        ${L.map(([t, lvl, svc, msg, c], i) => `
          <div style="display:grid;grid-template-columns:auto auto auto 1fr;gap:12px;padding:6px 16px;align-items:baseline;animation:monIn .4s ${i * 0.08}s both;${lvl === 'ERROR' ? 'background:color-mix(in oklab,var(--crit) 7%,transparent)' : ''}">
            <span style="color:var(--text-mute-solid)">${t}</span>
            <span style="color:${c};font-weight:600;width:46px">${lvl}</span>
            <span style="color:var(--text-dim)">${svc}</span>
            <span style="color:${lvl === 'ERROR' ? 'var(--crit)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${msg}</span>
          </div>`).join("")}
      </div>`;
  }

  function panelInfra() {
    const clouds = [["AWS", 642, "us-east-1"], ["GCP", 318, "europe-west4"], ["Azure", 204, "eastus2"], ["On-prem", 120, "dc-fra"]];
    const k8s = [["prod-cluster", 84, 92], ["staging", 24, 61], ["data-plane", 38, 74]];
    return `
      <div class="panel-bar"><div class="panel-dots"><i></i><i></i><i></i></div><span class="panel-title">infrastructure · all regions</span><span class="panel-tag mono">1,284 hosts</span></div>
      <div style="padding:16px;display:grid;gap:14px">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${clouds.map(([c, h, r], i) => `
            <div style="padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--bg-2);animation:monIn .5s ${i * 0.06}s both">
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-mute-solid)">${c}</div>
              <div style="font-family:var(--font-mono);font-size:22px;font-weight:600;margin:6px 0 2px">${h}</div>
              <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-dim)">${r}</div>
            </div>`).join("")}
        </div>
        <div style="padding:13px;border:1px solid var(--line);border-radius:10px">
          <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mute-solid);margin-bottom:12px">Kubernetes clusters · CPU / Mem</div>
          ${k8s.map(([name, cpu, mem]) => `
            <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;align-items:center;padding:7px 0;font-family:var(--font-mono);font-size:12px">
              <span style="color:var(--text-dim)">${name}</span>
              <span style="display:flex;align-items:center;gap:8px"><span style="flex:1;height:5px;border-radius:3px;background:var(--bg-3);overflow:hidden"><i style="display:block;height:100%;width:${cpu}%;background:var(--accent)"></i></span><span style="color:var(--text-mute-solid);width:34px">${cpu}%</span></span>
              <span style="display:flex;align-items:center;gap:8px"><span style="flex:1;height:5px;border-radius:3px;background:var(--bg-3);overflow:hidden"><i style="display:block;height:100%;width:${mem}%;background:var(--info)"></i></span><span style="color:var(--text-mute-solid);width:34px">${mem}%</span></span>
            </div>`).join("")}
        </div>
      </div>`;
  }

  function panelAI() {
    return `
      <div class="panel-bar"><div class="panel-dots"><i></i><i></i><i></i></div><span class="panel-title">meridian AI · incident INC-4471</span><span class="panel-tag" style="color:var(--accent)"><span class="dot"></span> root cause found</span></div>
      <div style="padding:18px">
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px">
          <div style="width:34px;height:34px;border-radius:9px;flex:none;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke-linecap="round"/></svg></div>
          <div>
            <div style="font-size:13px;color:var(--text-mute-solid);font-family:var(--font-mono);margin-bottom:6px">Plain-language summary</div>
            <p style="font-size:15px;line-height:1.55;color:var(--text)">A <b style="color:var(--accent)">deploy of <span class="mono">payments-svc v2.31.0</span></b> at 12:01 reduced the DB connection-pool ceiling from 80 to 50. Under peak checkout load the pool saturated, causing <b style="color:var(--crit)">3s acquire timeouts</b> and a latency spike on <span class="mono">checkout-api</span>.</p>
          </div>
        </div>
        <div style="display:grid;gap:8px">
          ${[
            ["Confidence", "94%", "var(--accent)"],
            ["Blast radius", "checkout-api, payments-svc", "var(--text)"],
            ["Suggested fix", "Roll back v2.31.0 or raise pool to 80", "var(--text)"],
            ["Linked evidence", "1 deploy · 3 spans · 12 log lines", "var(--text-dim)"]
          ].map(([k, v, c], i) => `
            <div style="display:grid;grid-template-columns:130px 1fr;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg-2);animation:monIn .5s ${i * 0.07}s both">
              <span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-mute-solid)">${k}</span>
              <span style="font-size:13.5px;color:${c}">${v}</span>
            </div>`).join("")}
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <span class="btn btn-primary" style="font-size:13px;padding:.6em 1em">Roll back deploy</span>
          <span class="btn btn-ghost" style="font-size:13px;padding:.6em 1em">View full timeline</span>
        </div>
      </div>`;
  }

  function buildPillars() {
    const tabs = $("#pillTabs"), stage = $("#pillStage");
    if (!tabs || !stage) return;
    PILLARS.forEach((p, i) => {
      const t = document.createElement("button");
      t.className = "pill-tab";
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", i === 0 ? "true" : "false");
      t.dataset.idx = i;
      t.innerHTML = `
        <span class="pt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">${p.icon}</svg></span>
        <div><h3>${p.name}</h3><p>${p.blurb}</p></div>
        <span class="pt-n">${p.n}</span>`;
      tabs.appendChild(t);
    });
    const panel = document.createElement("div");
    panel.className = "pill-panel on";
    panel.innerHTML = PILLARS[0].render();
    stage.appendChild(panel);

    let current = 0;
    function select(idx) {
      if (idx === current) return;
      current = idx;
      $$(".pill-tab", tabs).forEach((t, i) => t.setAttribute("aria-selected", i === idx ? "true" : "false"));
      panel.classList.remove("on");
      setTimeout(() => {
        panel.innerHTML = PILLARS[idx].render();
        // force reflow then fade in
        void panel.offsetWidth;
        panel.classList.add("on");
      }, 160);
    }
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill-tab");
      if (btn) select(+btn.dataset.idx);
    });
  }

  /* ---- COMPARE table ------------------------------------- */
  const CMP = [
    ["Single unified agent", true, false],
    ["Metrics + traces + logs included", true, "partial"],
    ["Automatic dependency mapping", true, false],
    ["AI plain-language root cause", true, false],
    ["Flat, predictable pricing", true, false],
    ["Per-custom-metric billing", false, true],
    ["5-minute install", true, "partial"]
  ];
  function buildCompare() {
    const body = $("#cmpBody");
    if (!body) return;
    const ck = '<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const xk = '<svg class="xk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const cell = (v) => v === true ? ck : v === "partial" ? '<span class="mono" style="font-size:11px;color:var(--warn)">limited</span>' : xk;
    body.innerHTML = CMP.map(([label, us, them]) => `
      <tr><td class="row-h">${label}</td><td class="us col-us">${cell(us)}</td><td>${cell(them)}</td></tr>
    `).join("");
  }

  /* ---- MTTR demo ----------------------------------------- */
  const MTTR_STEPS = [
    ["00:00", "Anomaly detected", "p99 latency on checkout-api breaks 7-day baseline.", 0],
    ["00:08", "Correlated across signals", "Traces, deploys and logs auto-grouped into INC-4471.", 14],
    ["00:19", "Deploy implicated", "payments-svc v2.31.0 flagged — pool ceiling cut 80→50.", 46],
    ["00:31", "Root cause written", "Plain-language summary + suggested rollback delivered.", 78],
    ["00:38", "Resolved", "One-click rollback shipped. Latency back to baseline.", 100]
  ];
  function buildMTTR() {
    const steps = $("#mttrSteps");
    if (!steps) return;
    steps.innerHTML = MTTR_STEPS.map(([t, h, p]) => `
      <div class="tl-step" data-at="${MTTR_STEPS.find(s=>s[0]===t)[3]}">
        <span class="ts-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
        <div><h4>${h}</h4><p>${p}</p></div>
        <span class="ts-time">${t}</span>
      </div>`).join("");

    const fill = $("#mttrFill"), status = $("#mttrStatus"), replay = $("#mttrReplay");
    const stepEls = $$(".tl-step", steps);
    let timer = null;

    function run() {
      if (timer) { clearInterval(timer); }
      stepEls.forEach(s => s.classList.remove("done"));
      status.innerHTML = '<span class="dot" style="background:var(--warn)"></span> investigating';
      let prog = 0;
      const dur = reduce ? 0 : 3800;
      const startT = performance.now();
      if (reduce) {
        fill.style.right = "0%";
        stepEls.forEach(s => s.classList.add("done"));
        status.innerHTML = '<span class="dot" style="background:var(--healthy)"></span> resolved · 38s';
        return;
      }
      timer = setInterval(() => {
        prog = Math.min(100, ((performance.now() - startT) / dur) * 100);
        fill.style.right = (100 - prog) + "%";
        stepEls.forEach(s => { if (prog >= +s.dataset.at) s.classList.add("done"); });
        if (prog >= 78) status.innerHTML = '<span class="dot" style="background:var(--info)"></span> root cause found';
        if (prog >= 100) {
          status.innerHTML = '<span class="dot" style="background:var(--healthy)"></span> resolved · 38s';
          clearInterval(timer); timer = null;
        }
      }, 40);
    }
    replay && replay.addEventListener("click", run);
    // run once when scrolled into view
    watch($("#mttrSteps").closest(".mttr-demo"), run, true);
  }

  /* ---- INTEGRATIONS -------------------------------------- */
  const INTG = [
    ["AWS", "cloud"], ["GCP", "cloud"], ["Azure", "cloud"], ["Kubernetes", "container"],
    ["Docker", "container"], ["Terraform", "iac"], ["Postgres", "data"], ["Redis", "data"],
    ["Kafka", "data"], ["MongoDB", "data"], ["NGINX", "web"], ["Node.js", "lang"],
    ["Python", "lang"], ["Go", "lang"], ["Java", "lang"], ["Rust", "lang"],
    ["GitHub", "ci"], ["PagerDuty", "alert"], ["Slack", "alert"], ["Elasticsearch", "data"],
    ["RabbitMQ", "data"], ["Envoy", "web"], ["Lambda", "cloud"], ["Vercel", "web"]
  ];
  function glyph(name) {
    // simple deterministic abstract monogram glyph (no brand marks)
    const ch = name[0].toUpperCase();
    const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const shapes = [
      `<rect x="5" y="5" width="14" height="14" rx="3"/>`,
      `<circle cx="12" cy="12" r="8"/>`,
      `<path d="M12 4l8 14H4z"/>`,
      `<rect x="5" y="5" width="14" height="14" rx="7"/>`,
      `<path d="M6 6h12v12H6z" transform="rotate(45 12 12)"/>`
    ];
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      ${shapes[h % shapes.length]}
      <text x="12" y="12" dy=".35em" text-anchor="middle" font-family="var(--font-mono)" font-size="8" fill="currentColor" stroke="none" font-weight="600">${ch}</text>
    </svg>`;
  }
  function buildIntegrations() {
    const wall = $("#intgWall"), cats = $("#intgCats");
    if (!wall) return;
    const CATS = [["all", "All"], ["cloud", "Cloud"], ["container", "Containers"], ["data", "Data stores"], ["lang", "Languages"], ["alert", "Alerting"]];
    function paint(filter) {
      wall.innerHTML = INTG.map(([name, cat]) => {
        const dim = filter !== "all" && filter !== cat;
        return `<div class="intg" style="${dim ? 'opacity:.22;filter:grayscale(1)' : ''}" title="${name}">
          ${glyph(name)}<span class="intg-name">${name}</span>
        </div>`;
      }).join("") +
      `<div class="intg intg-more"><b>700+</b><span style="font-size:10px;font-family:var(--font-mono);color:var(--text-mute-solid)">and counting</span></div>`;
    }
    paint("all");
    if (cats) {
      cats.innerHTML = CATS.map(([id, label], i) =>
        `<button class="intg-cat ${i === 0 ? 'on' : ''}" data-cat="${id}">${label}</button>`).join("");
      cats.addEventListener("click", (e) => {
        const b = e.target.closest(".intg-cat");
        if (!b) return;
        $$(".intg-cat", cats).forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        paint(b.dataset.cat);
      });
    }
  }

  /* ---- PERSONAS ------------------------------------------ */
  const PERSONAS = [
    ["SRE / On-call", "Stop the bleeding faster", "Unified incident view, auto-correlated signals and a root-cause summary waiting when you open the page.", '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>'],
    ["DevOps lead", "Ship without flying blind", "Deploy-aware monitoring ties every regression to the change that caused it. Roll back from the alert.", '<path d="M12 3v18M3 12h18" stroke-linecap="round"/><circle cx="12" cy="12" r="9"/>'],
    ["Eng manager", "Know your reliability posture", "SLOs, error budgets and MTTR trends in one report. Answer \u201chow are we doing?\u201d with numbers.", '<path d="M4 19V5M4 19h16M8 16v-5M13 16V8M18 16v-9" stroke-linecap="round"/>'],
    ["Security / Platform", "Govern every signal", "RBAC, audit logs and data residency on all telemetry. One platform to secure, not five.", '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>']
  ];
  function buildPersonas() {
    const grid = $("#personaGrid");
    if (!grid) return;
    grid.innerHTML = PERSONAS.map(([role, title, body, icon], i) => `
      <div class="persona reveal" data-d="${(i % 4) + 1}">
        <div class="pr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icon}</svg></div>
        <div class="pr-role">${role}</div>
        <h3>${title}</h3>
        <p>${body}</p>
        <a class="pr-link" href="#platform">Explore the workflow <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
      </div>`).join("");
    // re-observe new reveals
    observeReveals();
  }

  /* ---- Scroll reveal ------------------------------------- */
  // Add .in to trigger the CSS transition (real browsers animate nicely).
  // Then GUARANTEE the end-state: this preview environment freezes runtime
  // opacity/transform transitions at their start value, so without this the
  // element would stay at opacity:0 forever. Killing the transition and
  // setting the final values applies them instantly. In a real browser the
  // transition has already completed by then, so this is a no-op there.
  function revealEl(el) {
    el.classList.add("in");
    setTimeout(() => {
      el.style.transition = "none";
      el.style.opacity = "1";
      el.style.transform = "none";
    }, 640);
  }
  function observeReveals() {
    $$(".reveal:not(.in)").forEach(el => watch(el, revealEl, true));
    checkWatchers();
  }

  /* ---- Header stuck -------------------------------------- */
  function headerStuck() {
    const hdr = $("#hdr");
    const onScroll = () => hdr.setAttribute("data-stuck", window.scrollY > 16 ? "1" : "0");
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- KPI counters on view ------------------------------ */
  function countersOnView() {
    $$(".js-count").forEach(el => watch(el, animateCount, true));
  }

  /* ---- keyframe for panel rows --------------------------- */
  // NOTE: keyframe 'from' is kept VISIBLE on purpose. Some embedded preview
  // contexts freeze CSS animations at 0%; if 'from' were opacity:0 the injected
  // panel rows would be stuck invisible. Entrance motion is handled by the
  // section-level .reveal transitions instead (transitions are reliable here).
  const kf = document.createElement("style");
  kf.textContent = "@keyframes monIn{from{opacity:1;transform:none}to{opacity:1;transform:none}}";
  document.head.appendChild(kf);

  /* ---- init ---------------------------------------------- */
  function init() {
    buildTrust();
    buildArea();
    buildPillars();
    buildCompare();
    buildMTTR();
    buildIntegrations();
    buildPersonas();
    countersOnView();
    headerStuck();
    observeReveals();
    window.addEventListener("scroll", onScrollResize, { passive: true });
    window.addEventListener("resize", onScrollResize);
    // a few delayed sweeps catch late layout (fonts, images)
    checkWatchers();
    requestAnimationFrame(checkWatchers);
    requestAnimationFrame(pollLoop);
    setTimeout(checkWatchers, 300);
    setTimeout(checkWatchers, 900);
    // safety: reveal anything still pending after 4s so nothing is ever stuck hidden
    setTimeout(revealAllPending, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // expose headline setter for Tweaks island
  window.__meridian = {
    setHeadline(html) { const h = $("#hero-headline"); if (h) h.innerHTML = html; }
  };
})();
