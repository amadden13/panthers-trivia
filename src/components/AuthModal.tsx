"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

type Tab = "login" | "signup";

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
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
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* Close */}
        <button
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-300"
          onClick={onClose}
        >
          ✕
        </button>

        <h2 className="text-lg font-black tracking-tight text-white">
          Panthers <span className="text-sky-400">Trivia</span>
        </h2>
        <p className="mt-1 text-xs text-slate-400">Sign in to track your scores and compete on the leaderboard.</p>

        {/* Tabs */}
        <div className="mt-5 flex rounded-xl border border-slate-700 bg-slate-950/50 p-1">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                tab === t
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={() => { setTab(t); setError(null); }}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
            {tab === "signup" && (
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") tab === "login" ? handleLogin() : handleSignup(); }}
            />

            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}

            <button
              className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors"
              onClick={tab === "login" ? handleLogin : handleSignup}
              disabled={loading}
            >
              {loading ? "..." : tab === "login" ? "Log in" : "Create account"}
            </button>
          </div>
      </div>
    </div>
  );
}
