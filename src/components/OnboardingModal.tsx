import { memo, useState } from "react";
import { apiUrl } from "../lib/api";

interface Trial {
  id: string;
  email: string;
  tier: string;
  status: string;
  createdAt: number;
  expiresAt: number;
}

export const OnboardingModal = memo(function OnboardingModal({ onClose, onEnter }: { onClose: () => void; onEnter: () => void }) {
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("solo");
  const [loading, setLoading] = useState(false);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.includes("@") || email.length < 5) {
      setError("Please enter a valid email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/onboarding/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tier }),
      });
      const data = await res.json();
      if (data.ok) {
        setTrial(data.trial);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#12121a", border: "1px solid rgba(255,255,255,0.08)" }}>
        {trial ? (
          // Success state
          <div className="text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "#e8b86d" }}>Trial Active!</h2>
            <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
              {Math.ceil((trial.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))} days remaining
            </p>
            <div className="rounded-xl p-4 mb-4 text-left" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[10px] font-mono mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>TRIAL DETAILS</div>
              <div className="space-y-1 text-xs font-mono">
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>ID:</span> <span style={{ color: "#64b5f6" }}>{trial.id.slice(0, 8)}...</span></div>
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Email:</span> <span style={{ color: "rgba(255,255,255,0.7)" }}>{trial.email}</span></div>
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Tier:</span> <span style={{ color: "#e8b86d" }}>{trial.tier}</span></div>
              </div>
            </div>
            <button
              onClick={onEnter}
              className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all hover:scale-105"
              style={{ background: "rgba(232,184,109,0.15)", color: "#e8b86d", border: "1px solid rgba(232,184,109,0.3)" }}
            >
              Enter Dashboard →
            </button>
          </div>
        ) : (
          // Sign-up form
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: "#e8b86d" }}>Start Free Trial</h2>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg">✕</button>
            </div>
            <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
              14 days free. No credit card required.
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="your@email.com"
              className="w-full mb-3 px-4 py-3 rounded-xl text-sm font-mono outline-none"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}
              autoFocus
            />

            <div className="flex gap-2 mb-4">
              {["solo", "team", "fleet"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className="flex-1 py-2 rounded-lg text-xs font-mono capitalize transition-all"
                  style={{
                    background: tier === t ? "rgba(232,184,109,0.12)" : "rgba(255,255,255,0.03)",
                    color: tier === t ? "#e8b86d" : "rgba(255,255,255,0.3)",
                    border: `1px solid ${tier === t ? "rgba(232,184,109,0.2)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {error && <p className="text-xs mb-3" style={{ color: "#ef4444" }}>{error}</p>}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all hover:scale-105"
              style={{ background: "rgba(232,184,109,0.15)", color: "#e8b86d", border: "1px solid rgba(232,184,109,0.3)" }}
            >
              {loading ? "..." : "Start Trial"}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
