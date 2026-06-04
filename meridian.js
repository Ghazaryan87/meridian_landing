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
  const BRAND_ICONS = {
    "AWS":           "M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z",
    "GCP":           "M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z",
    "Azure":         "M22.379 23.343a1.62 1.62 0 0 0 1.536-2.14v.002L17.35 1.76A1.62 1.62 0 0 0 15.816.657H8.184A1.62 1.62 0 0 0 6.65 1.76L.086 21.204a1.62 1.62 0 0 0 1.536 2.139h4.741a1.62 1.62 0 0 0 1.535-1.103l.977-2.892 4.947 3.675c.28.208.618.32.966.32m-3.084-12.531 3.624 10.739a.54.54 0 0 1-.51.713v-.001h-.03a.54.54 0 0 1-.322-.106l-9.287-6.9h4.853m6.313 7.006c.116-.326.13-.694.007-1.058L9.79 1.76a1.722 1.722 0 0 0-.007-.02h6.034a.54.54 0 0 1 .512.366l6.562 19.445a.54.54 0 0 1-.338.684",
    "Kubernetes":    "M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 0 1-2.075-2.597l2.578-.437.004.005a.44.44 0 0 1 .484.606zm-.833-2.129a.44.44 0 0 0 .173-.756l.002-.011L7.585 9.7a5.143 5.143 0 0 0-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 0 0 .699-.337l.01-.005.15-2.62a5.144 5.144 0 0 0-3.01 1.442l2.147 1.523.004-.002zm.76 2.75l.723.349.722-.347.18-.78-.5-.623h-.804l-.5.623.179.779zm1.5-3.095a.44.44 0 0 0 .7.336l.008.003 2.134-1.513a5.188 5.188 0 0 0-2.992-1.442l.148 2.615.002.001zm10.876 5.97l-5.773 7.181a1.6 1.6 0 0 1-1.248.594l-9.261.003a1.6 1.6 0 0 1-1.247-.596l-5.776-7.18a1.583 1.583 0 0 1-.307-1.34L2.1 5.573c.108-.47.425-.864.863-1.073L11.305.513a1.606 1.606 0 0 1 1.385 0l8.345 3.985c.438.209.755.604.863 1.073l2.062 8.955c.108.47-.005.963-.308 1.34zm-3.289-2.057c-.042-.01-.103-.026-.145-.034-.174-.033-.315-.025-.479-.038-.35-.037-.638-.067-.895-.148-.105-.04-.18-.165-.216-.216l-.201-.059a6.45 6.45 0 0 0-.105-2.332 6.465 6.465 0 0 0-.936-2.163c.052-.047.15-.133.177-.159.008-.09.001-.183.094-.282.197-.185.444-.338.743-.522.142-.084.273-.137.415-.242.032-.024.076-.062.11-.089.24-.191.295-.52.123-.736-.172-.216-.506-.236-.745-.045-.034.027-.08.062-.111.088-.134.116-.217.23-.33.35-.246.25-.45.458-.673.609-.097.056-.239.037-.303.033l-.19.135a6.545 6.545 0 0 0-4.146-2.003l-.012-.223c-.065-.062-.143-.115-.163-.25-.022-.268.015-.557.057-.905.023-.163.061-.298.068-.475.001-.04-.001-.099-.001-.142 0-.306-.224-.555-.5-.555-.275 0-.499.249-.499.555l.001.014c0 .041-.002.092 0 .128.006.177.044.312.067.475.042.348.078.637.056.906a.545.545 0 0 1-.162.258l-.012.211a6.424 6.424 0 0 0-4.166 2.003 8.373 8.373 0 0 1-.18-.128c-.09.012-.18.04-.297-.029-.223-.15-.427-.358-.673-.608-.113-.12-.195-.234-.329-.349-.03-.026-.077-.062-.111-.088a.594.594 0 0 0-.348-.132.481.481 0 0 0-.398.176c-.172.216-.117.546.123.737l.007.005.104.083c.142.105.272.159.414.242.299.185.546.338.743.522.076.082.09.226.1.288l.16.143a6.462 6.462 0 0 0-1.02 4.506l-.208.06c-.055.072-.133.184-.215.217-.257.081-.546.11-.895.147-.164.014-.305.006-.48.039-.037.007-.09.02-.133.03l-.004.002-.007.002c-.295.071-.484.342-.423.608.061.267.349.429.645.365l.007-.001.01-.003.129-.029c.17-.046.294-.113.448-.172.33-.118.604-.217.87-.256.112-.009.23.069.288.101l.217-.037a6.5 6.5 0 0 0 2.88 3.596l-.09.218c.033.084.069.199.044.282-.097.252-.263.517-.452.813-.091.136-.185.242-.268.399-.02.037-.045.095-.064.134-.128.275-.034.591.213.71.248.12.556-.007.69-.282v-.002c.02-.039.046-.09.062-.127.07-.162.094-.301.144-.458.132-.332.205-.68.387-.897.05-.06.13-.082.215-.105l.113-.205a6.453 6.453 0 0 0 4.609.012l.106.192c.086.028.18.042.256.155.136.232.229.507.342.84.05.156.074.295.145.457.016.037.043.09.062.129.133.276.442.402.69.282.247-.118.341-.435.213-.71-.02-.039-.045-.096-.065-.134-.083-.156-.177-.261-.268-.398-.19-.296-.346-.541-.443-.793-.04-.13.007-.21.038-.294-.018-.022-.059-.144-.083-.202a6.499 6.499 0 0 0 2.88-3.622c.064.01.176.03.213.038.075-.05.144-.114.28-.104.266.039.54.138.87.256.154.06.277.128.448.173.036.01.088.019.13.028l.009.003.007.001c.297.064.584-.098.645-.365.06-.266-.128-.537-.423-.608zM16.4 9.701l-1.95 1.746v.005a.44.44 0 0 0 .173.757l.003.01 2.526.728a5.199 5.199 0 0 0-.108-1.674A5.208 5.208 0 0 0 16.4 9.7zm-4.013 5.325a.437.437 0 0 0-.404-.232.44.44 0 0 0-.372.233h-.002l-1.268 2.292a5.164 5.164 0 0 0 3.326.003l-1.27-2.296h-.01zm1.888-1.293a.44.44 0 0 0-.27.036.44.44 0 0 0-.214.572l-.003.004 1.01 2.438a5.15 5.15 0 0 0 2.081-2.615l-2.6-.44-.004.005z",
    "Docker":        "M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z",
    "Terraform":     "M1.44 0v7.575l6.561 3.79V3.787zm21.12 4.227l-6.561 3.791v7.574l6.56-3.787zM8.72 4.23v7.575l6.561 3.787V8.018zm0 8.405v7.575L15.28 24v-7.578z",
    "Postgres":      "M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-1.0074-.2321-1.6533.3411-2.2935.1312-2.5256-.0191 1.342-2.0482 2.445-4.522 3.0411-6.8297.2714-1.0507.7982-3.5237.1222-4.7316a1.5641 1.5641 0 0 0-.1509-.235C21.6931.9086 19.8007.0248 17.5099.0005c-1.4947-.0158-2.7705.3461-3.1161.4794a9.449 9.449 0 0 0-.5159-.0816 8.044 8.044 0 0 0-1.3114-.1278c-1.1822-.0184-2.2038.2642-3.0498.8406-.8573-.3211-4.7888-1.645-7.2219.0788C.9359 2.1526.3086 3.8733.4302 6.3043c.0409.818.5069 3.334 1.2423 5.7436.4598 1.5065.9387 2.7019 1.4334 3.582.553.9942 1.1259 1.5933 1.7143 1.7895.4474.1491 1.1327.1441 1.8581-.7279.8012-.9635 1.5903-1.8258 1.9446-2.2069.4351.2355.9064.3625 1.39.3772a.0569.0569 0 0 0 .0004.0041 11.0312 11.0312 0 0 0-.2472.3054c-.3389.4302-.4094.5197-1.5002.7443-.3102.064-1.1344.2339-1.1464.8115-.0025.1224.0329.2309.0919.3268.2269.4231.9216.6097 1.015.6331 1.3345.3335 2.5044.092 3.3714-.6787-.017 2.231.0775 4.4174.3454 5.0874.2212.5529.7618 1.9045 2.4692 1.9043.2505 0 .5263-.0291.8296-.0941 1.7819-.3821 2.5557-1.1696 2.855-2.9059.1503-.8707.4016-2.8753.5388-4.1012.0169-.0703.0357-.1207.057-.1362.0007-.0005.0697-.0471.4272.0307a.3673.3673 0 0 0 .0443.0068l.2539.0223.0149.001c.8468.0384 1.9114-.1426 2.5312-.4308.6438-.2988 1.8057-1.0323 1.5951-1.6698z",
    "Redis":         "M22.71 13.145c-1.66 2.092-3.452 4.483-7.038 4.483-3.203 0-4.397-2.825-4.48-5.12.701 1.484 2.073 2.685 4.214 2.63 4.117-.133 6.94-3.852 6.94-7.239 0-4.05-3.022-6.972-8.268-6.972-3.752 0-8.4 1.428-11.455 3.685C2.59 6.937 3.885 9.958 4.35 9.626c2.648-1.904 4.748-3.13 6.784-3.744C8.12 9.244.886 17.05 0 18.425c.1 1.261 1.66 4.648 2.424 4.648.232 0 .431-.133.664-.365a100.49 100.49 0 0 0 5.54-6.765c.222 3.104 1.748 6.898 6.014 6.898 3.819 0 7.604-2.756 9.33-8.965.2-.764-.73-1.361-1.261-.73zm-4.349-5.013c0 1.959-1.926 2.922-3.685 2.922-.941 0-1.664-.247-2.235-.568 1.051-1.592 2.092-3.225 3.21-4.973 1.972.334 2.71 1.43 2.71 2.619z",
    "Kafka":         "M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0-.001-8.216 2.051-4.292 6.573M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.887 9.58 1.553 17.462-.7 14.977-1.82M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892M17.116 17.584c4.503-2.34 2.421-4.589.968-4.285-.355.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.928 4.562 0-.001.07-.062.09-.118M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.888 4.832-.001 6.836-2.274-2.053-3.943-3.858-2.824-5.539 1.644-2.469 6.197-3.665 5.19-7.627M9.734 23.924c4.322.277 10.959-.153 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0-.001.553.457 3.393.639",
    "MongoDB":       "M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.115-.28-.394-.53-.954-.735-1.44-.036.495-.055.685-.523 1.184-.723.566-4.438 3.682-4.74 10.02-.282 5.912 4.27 9.435 4.888 9.884l.07.05A73.49 73.49 0 0111.91 24h.481c.114-1.032.284-2.056.51-3.07.417-.296.604-.463.85-.693a11.342 11.342 0 003.639-8.464c.01-.814-.103-1.662-.197-2.218zm-5.336 8.195s0-8.291.275-8.29c.213 0 .49 10.695.49 10.695-.381-.045-.765-1.76-.765-2.405z",
    "NGINX":         "M12 0L1.605 6v12L12 24l10.395-6V6L12 0zm6 16.59c0 .705-.646 1.29-1.529 1.29-.631 0-1.351-.255-1.801-.81l-6-7.141v6.66c0 .721-.57 1.29-1.274 1.29H7.32c-.721 0-1.29-.6-1.29-1.29V7.41c0-.705.63-1.29 1.5-1.29.646 0 1.38.255 1.83.81l5.97 7.141V7.41c0-.721.6-1.29 1.29-1.29h.075c.72 0 1.29.6 1.29 1.29v9.18H18z",
    "Node.js":       "M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z",
    "Python":        "M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z",
    "Go":            "M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-.771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-.034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z",
    "Java":          "M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0-.001-8.216 2.051-4.292 6.573M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.887 9.58 1.553 17.462-.7 14.977-1.82M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892M17.116 17.584c4.503-2.34 2.421-4.589.968-4.285-.355.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.928 4.562 0-.001.07-.062.09-.118M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.888 4.832-.001 6.836-2.274-2.053-3.943-3.858-2.824-5.539 1.644-2.469 6.197-3.665 5.19-7.627M9.734 23.924c4.322.277 10.959-.153 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0-.001.553.457 3.393.639",
    "Rust":          "M9.71 2.136a1.43 1.43 0 0 0-2.047 0h-.007a1.48 1.48 0 0 0-.421 1.042c0 .41.161.777.422 1.039l.007.007c.257.264.616.426 1.019.426.404 0 .766-.162 1.027-.426l.003-.007c.261-.262.421-.629.421-1.039 0-.408-.159-.777-.421-1.042H9.71zM8.683 22.295c.404 0 .766-.167 1.027-.429l.003-.008c.261-.261.421-.631.421-1.036 0-.41-.159-.778-.421-1.044H9.71a1.42 1.42 0 0 0-1.027-.432 1.4 1.4 0 0 0-1.02.432h-.007c-.26.266-.422.634-.422 1.044 0 .406.161.775.422 1.036l.007.008c.258.262.617.429 1.02.429zm7.89-4.462c.359-.096.683-.33.882-.684l.027-.052a1.47 1.47 0 0 0 .114-1.067 1.454 1.454 0 0 0-.675-.896l-.021-.014a1.425 1.425 0 0 0-1.078-.132c-.36.091-.684.335-.881.686-.2.349-.241.75-.146 1.119.099.363.33.691.675.896h.002c.346.203.737.239 1.101.144zm-6.405-7.342a2.083 2.083 0 0 0-1.485-.627c-.58 0-1.103.242-1.482.627-.378.385-.612.916-.612 1.507s.233 1.124.612 1.514a2.08 2.08 0 0 0 2.967 0c.379-.39.612-.923.612-1.514s-.233-1.122-.612-1.507zm-.835-2.51c.843.141 1.6.552 2.178 1.144h.004c.092.093.182.196.265.299l1.446-.851a3.176 3.176 0 0 1-.047-1.808 3.149 3.149 0 0 1 1.456-1.926l.025-.016a3.062 3.062 0 0 1 2.345-.306c.77.21 1.465.721 1.898 1.482v.002c.431.757.518 1.626.313 2.408a3.145 3.145 0 0 1-1.456 1.928l-.198.118h-.02a3.095 3.095 0 0 1-2.154.201 3.127 3.127 0 0 1-1.514-.944l-1.444.848a4.162 4.162 0 0 1 0 2.879l1.444.846c.413-.47.939-.789 1.514-.944a3.041 3.041 0 0 1 2.371.319l.048.023v.002a3.17 3.17 0 0 1 1.408 1.906 3.215 3.215 0 0 1-.313 2.405l-.026.053-.003-.005a3.147 3.147 0 0 1-1.867 1.436 3.096 3.096 0 0 1-2.371-.318v-.006a3.156 3.156 0 0 1-1.456-1.927 3.175 3.175 0 0 1 .047-1.805l-1.446-.848a3.905 3.905 0 0 1-.265.294l-.004.005a3.938 3.938 0 0 1-2.178 1.138v1.699a3.09 3.09 0 0 1 1.56.862l.002.004c.565.572.914 1.368.914 2.243 0 .873-.35 1.664-.914 2.239l-.002.009a3.1 3.1 0 0 1-2.21.931 3.1 3.1 0 0 1-2.206-.93h-.002v-.009a3.186 3.186 0 0 1-.916-2.239c0-.875.35-1.672.916-2.243v-.004h.002a3.1 3.1 0 0 1 1.558-.862v-1.699a3.926 3.926 0 0 1-2.176-1.138l-.006-.005a4.098 4.098 0 0 1-1.173-2.874c0-1.122.452-2.136 1.173-2.872h.006a3.947 3.947 0 0 1 2.176-1.144V6.289a3.137 3.137 0 0 1-1.558-.864h-.002v-.004a3.192 3.192 0 0 1-.916-2.243c0-.871.35-1.669.916-2.243l.002-.002A3.084 3.084 0 0 1 8.683 0c.861 0 1.641.355 2.21.932v.002h.002c.565.574.914 1.372.914 2.243 0 .876-.35 1.667-.914 2.243l-.002.005a3.142 3.142 0 0 1-1.56.864v1.692zm8.121-1.129l-.012-.019a1.452 1.452 0 0 0-.87-.668 1.43 1.43 0 0 0-1.103.146h.002c-.347.2-.58.529-.677.896-.095.365-.054.768.146 1.119l.007.009c.2.347.519.579.874.673.357.103.755.059 1.098-.144l.019-.009a1.47 1.47 0 0 0 .657-.885 1.493 1.493 0 0 0-.141-1.118",
    "GitHub":        "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    "PagerDuty":     "M16.965 1.18C15.085.164 13.769 0 10.683 0H3.73v14.55h6.926c2.743 0 4.8-.164 6.61-1.37 1.975-1.303 3.004-3.484 3.004-6.007 0-2.716-1.262-4.896-3.305-5.994zm-5.5 10.326h-4.21V3.113l3.977-.027c3.62-.028 5.43 1.234 5.43 4.128 0 3.113-2.248 4.292-5.197 4.292zM3.73 17.61h3.525V24H3.73Z",
    "Slack":         "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
    "Elasticsearch": "M13.394 0C8.683 0 4.609 2.716 2.644 6.667h15.641a4.77 4.77 0 0 0 3.073-1.11c.446-.375.864-.785 1.247-1.243l.001-.002A11.974 11.974 0 0 0 13.394 0zM1.804 8.889a12.009 12.009 0 0 0 0 6.222h14.7a3.111 3.111 0 1 0 0-6.222zm.84 8.444C4.61 21.283 8.684 24 13.395 24c3.701 0 7.011-1.677 9.212-4.312l-.001-.002a9.958 9.958 0 0 0-1.247-1.243 4.77 4.77 0 0 0-3.073-1.11z",
    "RabbitMQ":      "M23.035 9.601h-7.677a.956.956 0 01-.962-.962V.962a.956.956 0 00-.962-.956H10.56a.956.956 0 00-.962.956V8.64a.956.956 0 01-.962.962H5.762a.956.956 0 01-.961-.962V.962A.956.956 0 003.839 0H.959a.956.956 0 00-.956.962v22.076A.956.956 0 00.965 24h22.07a.956.956 0 00.962-.962V10.58a.956.956 0 00-.962-.98zm-3.86 8.152a1.437 1.437 0 01-1.437 1.443h-1.924a1.437 1.437 0 01-1.436-1.443v-1.917a1.437 1.437 0 011.436-1.443h1.924a1.437 1.437 0 011.437 1.443z",
    "Vercel":        "m12 1.608 12 20.784H0Z",
    "Lambda":        "M4.9855 0c-.2941.0031-.5335.2466-.534.5482L4.446 5.456c0 .1451.06.2835.159.3891a.5322.5322 0 0 0 .3806.1562h3.4282l8.197 17.6805a.5365.5365 0 0 0 .4885.3181h5.811c.2969 0 .5426-.2448.5426-.5482V18.544c0-.3035-.2392-.5482-.5425-.5482h-2.0138L12.7394.3153C12.647.124 12.4564 0 12.2452 0h-7.254Zm.5397 1.0907h6.3678l8.16 17.6804a.5365.5365 0 0 0 .4885.3181h1.8178v3.8173H17.437L9.2402 5.226a.536.536 0 0 0-.4885-.318H5.5223Zm2.0137 8.2366c-.2098.0011-.3937.1193-.4857.3096L.6002 23.2133a.5506.5506 0 0 0 .0313.5282.5334.5334 0 0 0 .4544.25h6.169a.5468.5468 0 0 0 .497-.3096l3.38-7.166a.5405.5405 0 0 0-.0029-.4686L8.036 9.637a.5468.5468 0 0 0-.4942-.3096Zm.0057 1.8036 2.488 5.1522-3.1214 6.6206H1.9465Z",
    "Envoy":         "m23.351 7.593-7.068-4.379a1.034 1.034 0 0 0-.84-.117c-.02.01-.052.021-.074.032L8.471 6.105a.695.695 0 0 0-.435.68l.17 7.355c.01.298.191.595.478.765l7.068 4.38c.255.159.574.201.84.116.02-.01.053-.021.074-.032l6.898-2.976a.705.705 0 0 0 .436-.68l-.17-7.355c-.011-.297-.192-.584-.479-.765m-7.185 10.044-6.143-3.805-.149-6.388 5.995-2.583 6.143 3.805.149 6.388zm.011-6.027a.832.832 0 0 0-.414-.67l-5.06-3.135-.159.064.032 1.52 4.007 2.487.095 4.06 1.53.946.086-.032zm-6.058 7.132L5.41 15.83l-.116-4.89 2.146-.924-.042-1.69-3.327 1.435a.611.611 0 0 0-.382.595l.138 5.74c0 .265.16.52.414.67l5.516 3.422c.224.138.5.18.734.106a.15.15 0 0 1 .064-.021l3.252-1.403-1.616-1zm-2.615-6.1-1.52-.947.032 1.446 1.52.946zm2.19 5.059-.032-1.414-1.329-.83c-.021-.01-.042-.031-.053-.042l.032 1.425zm-4.751 1.902-3.476-2.158-.085-3.613 1.7-.734-.031-1.445-2.72 1.17a.527.527 0 0 0-.33.51l.106 4.336c0 .223.138.446.35.574l4.167 2.582a.822.822 0 0 0 .627.096c.021-.01.043-.01.064-.021l2.561-1.106-1.392-.86Z"
  };
  function glyph(name) {
    const p = BRAND_ICONS[name];
    if (p) return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${p}"/></svg>`;
    const ch = name[0].toUpperCase();
    const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const shapes = [
      `<rect x="5" y="5" width="14" height="14" rx="3"/>`,
      `<circle cx="12" cy="12" r="8"/>`,
      `<path d="M12 4l8 14H4z"/>`,
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
