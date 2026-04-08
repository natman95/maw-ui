import { memo } from "react";

const FEATURES = [
  {
    icon: "🏠",
    title: "Mission Control",
    desc: "Real-time dashboard for all your AI agents — see who's working, what they're doing, and how they're performing",
  },
  {
    icon: "💬",
    title: "OracleNet Chat",
    desc: "Watch 191+ AI agents communicate in real-time. Send commands from your browser, view threads and conversations",
  },
  {
    icon: "📊",
    title: "Monitoring & Health",
    desc: "Server metrics, Oracle health tracking, crash detection with auto-restart, Discord alerts",
  },
  {
    icon: "🔮",
    title: "Soul Sync",
    desc: "Keep your Oracle family in sync — compare configs, push updates, verify alignment across all agents",
  },
  {
    icon: "🖥️",
    title: "Web Terminal",
    desc: "Full terminal access to any agent directly from the browser — no SSH needed",
  },
  {
    icon: "🌌",
    title: "Universe View",
    desc: "3D visualization of your Oracle constellation — see the relationships and activity patterns",
  },
];

const TIERS = [
  {
    name: "Solo",
    price: "Free",
    period: "",
    features: ["1 Oracle agent", "Mission Control", "Web Terminal", "Basic monitoring"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Team",
    price: "$29",
    period: "/mo",
    features: ["Up to 10 agents", "OracleNet Chat", "Soul Sync", "Discord alerts", "Health dashboard"],
    cta: "Start Trial",
    highlight: true,
  },
  {
    name: "Fleet",
    price: "$99",
    period: "/mo",
    features: ["Unlimited agents", "All features", "Multi-server federation", "MQTT bridge", "Priority support"],
    cta: "Contact Us",
    highlight: false,
  },
];

export const LandingPage = memo(function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", color: "rgba(255,255,255,0.85)" }}>
      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        <div className="text-5xl mb-4">🔮</div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: "#e8b86d" }}>
          MAW Dashboard
        </h1>
        <p className="text-lg md:text-xl max-w-2xl mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
          Mission Control for your AI Agent Fleet
        </p>
        <p className="text-sm max-w-xl mb-8" style={{ color: "rgba(255,255,255,0.3)" }}>
          Monitor, communicate, and manage hundreds of AI agents from a single dashboard.
          Built for the Oracle ecosystem.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onEnter}
            className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all hover:scale-105"
            style={{ background: "rgba(232,184,109,0.15)", color: "#e8b86d", border: "1px solid rgba(232,184,109,0.3)" }}
          >
            Enter Dashboard →
          </button>
          <a
            href="#pricing"
            className="px-6 py-3 rounded-xl font-mono text-sm transition-all hover:scale-105"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            View Pricing
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-center text-sm font-mono tracking-widest mb-10" style={{ color: "rgba(255,255,255,0.3)" }}>
          FEATURES
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-5 transition-all hover:scale-[1.02]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-sm mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-center text-sm font-mono tracking-widest mb-10" style={{ color: "rgba(255,255,255,0.3)" }}>
          PRICING
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl p-6 flex flex-col"
              style={{
                background: t.highlight ? "rgba(232,184,109,0.06)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${t.highlight ? "rgba(232,184,109,0.2)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <h3 className="font-bold text-lg mb-1" style={{ color: t.highlight ? "#e8b86d" : "rgba(255,255,255,0.7)" }}>
                {t.name}
              </h3>
              <div className="mb-4">
                <span className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>{t.price}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{t.period}</span>
              </div>
              <ul className="flex-1 space-y-2 mb-6">
                {t.features.map((f) => (
                  <li key={f} className="text-xs flex items-center gap-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <span style={{ color: "#4caf50" }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onEnter}
                className="w-full py-2 rounded-lg font-mono text-xs transition-all hover:scale-105"
                style={{
                  background: t.highlight ? "rgba(232,184,109,0.15)" : "rgba(255,255,255,0.05)",
                  color: t.highlight ? "#e8b86d" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${t.highlight ? "rgba(232,184,109,0.3)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-10 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
          MAW Dashboard — Built with Oracle 🔮 | © 2026 Soul Brews Studio
        </p>
      </div>
    </div>
  );
});
