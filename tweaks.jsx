// tweaks.jsx — Meridian Tweaks island.
// The landing page is vanilla HTML/CSS/JS; this small React island only
// renders the Tweaks panel and applies values to the document root
// (CSS vars + data-attributes) so the whole page reacts.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#34e3b0",
  "theme": "dark",
  "font": "signal",
  "hero": "split",
  "headLead": "See every signal.",
  "headHi": "Solve every incident."
}/*EDITMODE-END*/;

// dark ink for light accents, near-black tinted for all (accents are bright)
function inkFor(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b);
  // bright accents → dark ink; if a darker accent is ever chosen, go light
  return lum > 130 ? "#05130d" : "#ffffff";
}

function applyTweaks(t) {
  const root = document.documentElement;
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent-ink", inkFor(t.accent));
  root.setAttribute("data-theme", t.theme);
  root.setAttribute("data-font", t.font);
  root.setAttribute("data-hero", t.hero);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.theme === "light" ? "#f6f7f9" : "#07090d");
  if (window.__meridian) {
    window.__meridian.setHeadline(
      `${escapeHtml(t.headLead)} <span class="hl">${escapeHtml(t.headHi)}</span>`
    );
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => { applyTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Brand accent" />
      <TweakColor
        label="Accent"
        value={t.accent}
        options={["#34e3b0", "#6b9bff", "#c2f24a", "#ff7a59", "#9b8cff"]}
        onChange={(v) => setTweak("accent", v)}
      />

      <TweakSection label="Theme" />
      <TweakRadio
        label="Mode"
        value={t.theme}
        options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
        onChange={(v) => setTweak("theme", v)}
      />
      <TweakRadio
        label="Type pairing"
        value={t.font}
        options={[
          { value: "signal", label: "Signal" },
          { value: "technical", label: "Technical" },
          { value: "editorial", label: "Editorial" }
        ]}
        onChange={(v) => setTweak("font", v)}
      />

      <TweakSection label="Hero" />
      <TweakRadio
        label="Layout"
        value={t.hero}
        options={[
          { value: "split", label: "Split" },
          { value: "center", label: "Center" },
          { value: "bento", label: "Wide" }
        ]}
        onChange={(v) => setTweak("hero", v)}
      />
      <TweakText
        label="Headline"
        value={t.headLead}
        placeholder="Lead line"
        onChange={(v) => setTweak("headLead", v)}
      />
      <TweakText
        label="Headline accent"
        value={t.headHi}
        placeholder="Highlighted line"
        onChange={(v) => setTweak("headHi", v)}
      />
    </TweaksPanel>
  );
}

// Apply persisted defaults immediately (before panel ever opens).
applyTweaks(TWEAK_DEFAULTS);

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<App />);
