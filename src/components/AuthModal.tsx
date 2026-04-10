"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

type Tab = "login" | "signup";

export default function AuthModal({ onClose, teamColor = "#0085CA" }: { onClose: () => void; teamColor?: string }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleForgotPassword() {
    if (!email) { setError("Enter your email above first."); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setForgotSent(true);
  }

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      onClose();
    }
    setLoading(false);
  }

  async function handleSignup() {
    setLoading(true);
    setError(null);

    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      setLoading(false);
      return;
    }

    // Check username availability
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.trim())
      .maybeSingle();

    if (existing) {
      setError("That username is already taken.");
      setLoading(false);
      return;
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });

    if (!signupError && signupData.user && birthdate) {
      await supabase.from("profiles").update({ birthdate }).eq("id", signupData.user.id);
    }
    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    onClose();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        {/* Close */}
        <button
          className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300"
          onClick={onClose}
        >
          ✕
        </button>

        <h2 className="text-lg font-black tracking-tight text-white">
          SICKO <span style={{ color: teamColor }}>TRIVIA</span>
        </h2>
        <p className="mt-1 text-xs text-zinc-400" style={{ textWrap: "balance" }}>Sign in to track your scores and compete on the leaderboard.</p>

        {/* Tabs */}
        <div className="mt-5 flex rounded-xl border border-zinc-700 bg-zinc-950/50 p-1">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                tab === t
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              style={tab === t ? { background: teamColor } : {}}
              onClick={() => { setTab(t); setError(null); }}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
            {tab === "signup" && (
              <>
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#0085CA]/60 focus:ring-2 focus:ring-[#0085CA]/20"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1 px-1">Birthday (optional)</label>
                  <input
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#0085CA]/60 focus:ring-2 focus:ring-[#0085CA]/20"
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                  />
                </div>
              </>
            )}
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#0085CA]/60 focus:ring-2 focus:ring-[#0085CA]/20"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#0085CA]/60 focus:ring-2 focus:ring-[#0085CA]/20"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") tab === "login" ? handleLogin() : handleSignup(); }}
            />

            {tab === "login" && (
              <div className="flex justify-center -mt-1">
                <button
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={() => { setShowForgot(true); setError(null); }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}

            {showForgot && tab === "login" && (
              forgotSent ? (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  Check your email for a password reset link.
                </p>
              ) : (
                <button
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  onClick={handleForgotPassword}
                  disabled={loading}
                >
                  {loading ? "..." : "Send reset link"}
                </button>
              )
            )}

            {!forgotSent && (
              <button
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: teamColor }}
                onClick={tab === "login" ? handleLogin : handleSignup}
                disabled={loading}
              >
                {loading ? "..." : tab === "login" ? "Log in" : "Create account"}
              </button>
            )}
          </div>
      </div>
    </div>
  );
}
