"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Header from "@/components/Header";

type Section = "username" | "email" | "password" | "birthday";

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [section, setSection] = useState<Section | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bdMonth, setBdMonth] = useState("");
  const [bdDay, setBdDay] = useState("");
  const [bdYear, setBdYear] = useState("");

  const [currentUsername, setCurrentUsername] = useState("");
  const [currentBirthdate, setCurrentBirthdate] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push("/"); return; }
      setEmail(session.user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, birthdate")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile) {
        setCurrentUsername((profile as any).username ?? "");
        setUsername((profile as any).username ?? "");
        setCurrentBirthdate((profile as any).birthdate ?? null);
        if ((profile as any).birthdate) {
          const [y, m, d] = ((profile as any).birthdate as string).split("-");
          setBdYear(y); setBdMonth(m); setBdDay(d);
        }
      }
    }
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() { setError(null); setSuccess(null); }

  async function saveUsername() {
    setLoading(true); reset();
    if (username.trim().length < 3) { setError("Username must be at least 3 characters."); setLoading(false); return; }
    if (username.trim() === currentUsername) { setError("That's already your username."); setLoading(false); return; }
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username.trim()).maybeSingle();
    if (existing) { setError("That username is already taken."); setLoading(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("profiles").update({ username: username.trim() }).eq("id", session!.user.id);
    if (err) { setError(err.message); } else { setCurrentUsername(username.trim()); setSuccess("Username updated!"); }
    setLoading(false);
  }

  async function saveEmail() {
    setLoading(true); reset();
    const { error: err } = await supabase.auth.updateUser({ email });
    if (err) { setError(err.message); } else { setSuccess("Check your new email for a confirmation link."); }
    setLoading(false);
  }

  async function savePassword() {
    setLoading(true); reset();
    if (password.length < 6) { setError("Password must be at least 6 characters."); setLoading(false); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); setLoading(false); return; }
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); } else { setSuccess("Password updated!"); setPassword(""); setConfirmPassword(""); }
    setLoading(false);
  }

  async function saveBirthday() {
    setLoading(true); reset();
    const composed = bdYear && bdMonth && bdDay
      ? `${bdYear}-${bdMonth.padStart(2, "0")}-${bdDay.padStart(2, "0")}`
      : null;
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("profiles").update({ birthdate: composed }).eq("id", session!.user.id);
    if (err) { setError(err.message); } else { setCurrentBirthdate(composed); setSuccess("Birthday saved!"); }
    setLoading(false);
  }

  const sections: { key: Section; label: string; description: string }[] = [
    { key: "username", label: "Username", description: currentUsername },
    { key: "email", label: "Email", description: email },
    { key: "password", label: "Password", description: "••••••••" },
    { key: "birthday", label: "Birthday", description: currentBirthdate
        ? new Date(currentBirthdate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "Not set" },
  ];

  const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[#0085CA]/60 focus:ring-2 focus:ring-[#0085CA]/20";

  return (
    <main className="min-h-screen bg-transparent text-zinc-100">
      <div className="mx-auto max-w-2xl p-6">
        <header className="mb-8">
          <Header activePage="settings" />
        </header>

        <div className="max-w-sm mx-auto">
          {section && (
            <button
              className="mb-4 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => { setSection(null); reset(); }}
            >
              ← Back
            </button>
          )}
          <h1 className="text-xl font-black text-white mb-6">
            {section ? sections.find(s => s.key === section)?.label : "Account Settings"}
          </h1>

          {!section ? (
            <div className="space-y-2">
              {sections.map(({ key, label, description }) => (
                <button
                  key={key}
                  className="w-full flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors"
                  onClick={() => { setSection(key); reset(); }}
                >
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">{label}</p>
                    <p className="text-sm font-semibold text-zinc-100 mt-0.5">{description}</p>
                  </div>
                  <span className="text-zinc-500 text-lg">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {section === "username" && (
                <input className={inputClass} placeholder="New username" value={username} onChange={(e) => setUsername(e.target.value)} />
              )}
              {section === "email" && (
                <input className={inputClass} type="email" placeholder="New email" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
              {section === "password" && (
                <>
                  <input className={inputClass} type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <input className={inputClass} type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </>
              )}
              {section === "birthday" && (() => {
                const daysInMonth = bdMonth && bdYear ? new Date(Number(bdYear), Number(bdMonth), 0).getDate() : 31;
                if (bdDay && Number(bdDay) > daysInMonth) setBdDay(String(daysInMonth).padStart(2, "0"));
                const selectClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-2 py-2.5 text-sm text-zinc-100 outline-none focus:border-[#0085CA]/60";
                return (
                  <div className="grid grid-cols-3 gap-2">
                    <select className={selectClass} value={bdMonth} onChange={(e) => setBdMonth(e.target.value)}>
                      <option value="">Month</option>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, "0")}>{m.slice(0, 3)}</option>
                      ))}
                    </select>
                    <select className={selectClass} value={bdDay} onChange={(e) => setBdDay(e.target.value)}>
                      <option value="">Day</option>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                      ))}
                    </select>
                    <select className={selectClass} value={bdYear} onChange={(e) => setBdYear(e.target.value)}>
                      <option value="">Year</option>
                      {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
              {success && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{success}</p>}

              <button
                className="w-full rounded-xl bg-[#0085CA] py-2.5 text-sm font-bold text-white hover:bg-[#0096E0] disabled:opacity-50 transition-colors"
                disabled={loading}
                onClick={section === "username" ? saveUsername : section === "email" ? saveEmail : section === "password" ? savePassword : saveBirthday}
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
