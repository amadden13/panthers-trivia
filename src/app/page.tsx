"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { chicagoYMD } from "@/lib/time";
import { PLAYERS } from "@/data/players";
import { PUZZLES_SICKO } from "@/data/puzzles_sicko";
import { getDayProgress, upsertDayProgress, type Mode } from "@/lib/storage";
import { createClient } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";

/** ---------- scoring helpers ---------- **/
const BASE_PTS = 1000;

function tierLabel(tier: number): string {
  if (tier === 1) return "Play by Play";
  if (tier === 2) return "Season Leader";
  return "Draft Pick";
}

function eraBonus(season: number): number {
  if (season < 2000) return 300;
  if (season < 2010) return 200;
  if (season < 2020) return 100;
  return 0;
}

function eraDecade(season: number): string {
  if (season < 2000) return "1990s";
  if (season < 2010) return "2000s";
  if (season < 2020) return "2010s";
  return "2020s";
}

function calcScore(timeRemaining: number, season: number): number {
  return Math.round(BASE_PTS * (timeRemaining / 30)) + eraBonus(season);
}


/** ---------- helpers ---------- **/
function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "") // strip trailing "(POS)" added by datalist
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}


type QuestionProgress = { guesses: string[]; completed: boolean; score?: number; timeRemaining?: number; hintUsed?: boolean };

type DayProgressV2 = {
  mode: Mode;
  date: string;
  questions: Record<string, QuestionProgress>;
  cluesUsed?: number;
};

const SICKO_ORDER = ["q1", "q2", "q3", "q4"] as const;

function coerceProgress(mode: Mode, date: string, saved: any | null): DayProgressV2 {
  const base: DayProgressV2 = {
    mode,
    date,
    questions: {},
    cluesUsed: 1,
  };

  if (!saved) return base;

  if (saved.questions && typeof saved.questions === "object") {
    return {
      mode,
      date: saved.date ?? date,
      questions: saved.questions ?? {},
      cluesUsed: typeof saved.cluesUsed === "number" ? saved.cluesUsed : 1,
    };
  }

  return {
    mode,
    date: saved.date ?? date,
    questions: {
      main: {
        guesses: Array.isArray(saved.guesses) ? saved.guesses : [],
        completed: !!saved.completed,
      },
    },
    cluesUsed: typeof saved.cluesUsed === "number" ? saved.cluesUsed : 1,
  };
}

/** ---------- component ---------- **/
export default function HomePage() {
  const supabase = createClient();
  const today = useMemo(() => chicagoYMD(), []);
  const [adminDate, setAdminDate] = useState<string>(() => today);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<{ email?: string; username?: string; isAdmin?: boolean } | null>(null);

  useEffect(() => {
    async function loadUser(userId: string, email?: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", userId)
        .maybeSingle();
      setUser({ email, username: profile?.username, isAdmin: profile?.is_admin ?? false });
      await restoreProgressFromSupabase(userId, chicagoYMD());
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUser(session.user.id, session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        loadUser(session.user.id, session.user.email);
      } else {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("panthers_admin_date_v1", adminDate);
    } catch {}
  }, [adminDate]);

  const adminEnabled = !!user?.isAdmin;
  const activeDate = adminEnabled ? adminDate : today;
  const mode: Mode = "sicko";

  const sickoDay = useMemo(() => {
    return (PUZZLES_SICKO as any[]).find((d) => d.date === activeDate) ?? null;
  }, [activeDate]);

  const sickoQuestions = (sickoDay as any)?.questions as
    | Array<{ id: "q1" | "q2" | "q3" | "q4"; prompt: string; playerIds?: string[]; playerId?: string; tier?: number; season?: number }>
    | undefined;

  const hasDay = !!sickoDay;

  const [input, setInput] = useState<string>("");
  const [sickoProgress, setSickoProgress] = useState<Record<string, QuestionProgress>>({});
  const [hintsRevealed, setHintsRevealed] = useState<Record<string, boolean>>({});
  const [sickoStarted, setSickoStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [timerKey, setTimerKey] = useState(0);
  const timeRef = useRef(30);
  const autoSubmitRef = useRef<() => void>(() => {});

  const sickoCurrentId =
    SICKO_ORDER.find((id) => (sickoProgress[id]?.guesses?.length ?? 0) === 0) ?? "q4";
  const sickoCurrent = sickoQuestions?.find((q) => q.id === sickoCurrentId) ?? null;
  const sickoQp = sickoCurrent
    ? sickoProgress[sickoCurrent.id] ?? { guesses: [], completed: false }
    : { guesses: [], completed: false };

  const sickoOutOfGuesses = mode === "sicko" && sickoQp.guesses.length >= 1;

  const totalScore = SICKO_ORDER.reduce((sum, id) => sum + (sickoProgress[id]?.score ?? 0), 0);

  const maxScore = sickoQuestions ? 4 * BASE_PTS : null;

  // Map every question id -> all valid answer Players (usually 1, sometimes multiple)
  const sickoPlayerMap = useMemo(() => {
    const map: Record<string, (typeof PLAYERS[number])[]> = {};
    for (const q of sickoQuestions ?? []) {
      const ids = q.playerIds ?? (q.playerId ? [q.playerId] : []);
      map[q.id] = ids.flatMap((id) => {
        const p = PLAYERS.find((x) => x.id === id);
        return p ? [p] : [];
      });
    }
    return map;
  }, [sickoQuestions]);

  useEffect(() => {
    const savedAny = getDayProgress("sicko", activeDate) as any;
    const saved = coerceProgress("sicko", activeDate, savedAny);
    const next: Record<string, QuestionProgress> = { ...saved.questions };
    for (const qid of SICKO_ORDER) {
      if (!next[qid]) next[qid] = { guesses: [], completed: false };
    }
    setSickoProgress(next);
    setSickoStarted(SICKO_ORDER.some((qid) => (next[qid]?.guesses.length ?? 0) > 0));
    setHintsRevealed({});
    setInput("");
  }, [activeDate]);

  // Keep autoSubmitRef fresh every render so the interval always uses current state
  autoSubmitRef.current = () => {
    if (!sickoCurrent || (sickoProgress[sickoCurrent.id]?.guesses.length ?? 0) > 0) return;
    // If the user has typed something, submit it rather than counting as time's up
    const pendingGuess = input.trim();
    if (pendingGuess) {
      submitGuess();
      return;
    }
    const nextQp: QuestionProgress = { guesses: ["(time's up)"], completed: false, score: 0 };
    const nextQuestions = { ...sickoProgress, [sickoCurrent.id]: nextQp };
    setSickoProgress(nextQuestions);
    setInput("");
    upsertDayProgress({ mode: "sicko", date: activeDate, questions: nextQuestions } as any);
    saveScoreToSupabase(nextQuestions);
  };

  // 30-second countdown per question
  useEffect(() => {
    if (!sickoStarted) return;
    const qp = sickoProgress[sickoCurrentId];
    if ((qp?.guesses.length ?? 0) > 0) return; // already answered

    setTimeRemaining(30);
    timeRef.current = 30;

    const intervalId = setInterval(() => {
      timeRef.current -= 1;
      setTimeRemaining(timeRef.current);
      if (timeRef.current <= 0) {
        clearInterval(intervalId);
        autoSubmitRef.current();
      }
    }, 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sickoCurrentId, mode, activeDate, timerKey, sickoStarted]);

  function persistSicko(nextQuestions: Record<string, QuestionProgress>) {
    upsertDayProgress({
      mode: "sicko",
      date: activeDate,
      questions: nextQuestions,
    } as any);
  }

  async function saveScoreToSupabase(nextQuestions: Record<string, QuestionProgress>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const allAnswered = SICKO_ORDER.every((id) => (nextQuestions[id]?.guesses.length ?? 0) > 0);
    if (!allAnswered) return;

    const total = SICKO_ORDER.reduce((sum, id) => sum + (nextQuestions[id]?.score ?? 0), 0);
    const results = SICKO_ORDER.map((id) => !!nextQuestions[id]?.completed);
    const scores = SICKO_ORDER.map((id) => nextQuestions[id]?.score ?? 0);
    const correct = results.filter(Boolean).length;
    const hintQuestion = SICKO_ORDER.find((id) => nextQuestions[id]?.hintUsed) ?? null;
    const hintUsed = !!hintQuestion;

    const { error } = await supabase.from("scores").upsert({
      user_id: session.user.id,
      date: activeDate,
      total_score: total,
      questions_correct: correct,
      question_results: results,
      question_scores: scores,
      hint_used: hintUsed,
      hint_question: hintQuestion,
    }, { onConflict: "user_id,date" });
    if (error) console.error("Score save error:", error);
  }

  async function restoreProgressFromSupabase(userId: string, date: string) {
    const existing = getDayProgress("sicko", date) as any;
    if (existing && SICKO_ORDER.some((id) => (existing.questions?.[id]?.guesses.length ?? 0) > 0)) return;

    const { data } = await supabase
      .from("scores")
      .select("question_results, question_scores, hint_question, total_score")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (!data) return;

    const rawScores: number[] = data.question_scores ?? [0, 0, 0, 0];
    const allZero = rawScores.every((s: number) => s === 0);
    const results: boolean[] = data.question_results ?? [false, false, false, false];
    const correctCount = results.filter(Boolean).length;

    // Fall back to distributing total_score evenly if per-question scores weren't saved
    let resolvedScores = rawScores;
    if (allZero && data.total_score > 0 && correctCount > 0) {
      const perQ = Math.round(data.total_score / correctCount);
      resolvedScores = results.map((correct: boolean) => correct ? perQ : 0);
    }

    const questions: Record<string, QuestionProgress> = {};
    SICKO_ORDER.forEach((id, i) => {
      const completed = results[i] ?? false;
      const score = resolvedScores[i] ?? 0;
      const hintUsed = data.hint_question === id;
      questions[id] = { guesses: [completed ? "(restored)" : "(incorrect)"], completed, score, hintUsed };
    });

    upsertDayProgress({ mode: "sicko", date, questions } as any);
    setSickoProgress(questions);
    setSickoStarted(true);
  }

  function submitGuess() {
    const guess = input.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!guess) return;
    if (sickoOutOfGuesses) return;

    const validPlayers = sickoCurrent ? (sickoPlayerMap[sickoCurrent.id] ?? []) : [];
    if (!sickoCurrent || validPlayers.length === 0) return;

    const isCorrect = validPlayers.some((p) => normalizeName(guess) === normalizeName(p.name));
    const season = sickoCurrent.season ?? 2020;
    const hintUsed = !!hintsRevealed[sickoCurrent.id];
    const rawScore = isCorrect ? calcScore(timeRemaining, season) : 0;
    const score = hintUsed ? Math.floor(rawScore / 2) : rawScore;

    const nextQp: QuestionProgress = {
      guesses: [guess],
      completed: isCorrect,
      score,
      timeRemaining: isCorrect ? timeRemaining : undefined,
      hintUsed,
    };

    const nextQuestions = {
      ...sickoProgress,
      [sickoCurrent.id]: nextQp,
    };

    setSickoProgress(nextQuestions);
    setInput("");
    persistSicko(nextQuestions);
    saveScoreToSupabase(nextQuestions);
  }

  async function share() {
    try {
      const cells = SICKO_ORDER.map((id) => {
        const qp = sickoProgress[id] ?? { guesses: [], completed: false };
        if (qp.completed) return "🟩";
        if (qp.guesses.length === 0) return "⬛";
        return "🟥";
      }).join(" ");
      const text = `#PanthersTriviaSicko\n${activeDate}\n${cells}\n${totalScore} pts`;

      if ((navigator as any).share) {
        await (navigator as any).share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied results to clipboard!");
      }
    } catch {
      // ignore
    }
  }


  function resetToday() {
    const cleared: Record<string, QuestionProgress> = {};
    for (const qid of SICKO_ORDER) {
      cleared[qid] = { guesses: [], completed: false };
    }
    setSickoProgress(cleared);
    setSickoStarted(false);
    setInput("");
    setHintsRevealed({});
    setTimerKey((k) => k + 1);
    persistSicko(cleared);
  }

  if (!hasDay) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
        <div className="mx-auto max-w-2xl p-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Panthers Daily</h1>
            <Link
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:border-sky-500/40 hover:bg-slate-900"
              href="/stats"
            >
              Stats
            </Link>
          </header>
          <p className="mt-6 text-sm text-slate-300">
            No puzzle found for today (<code>{today}</code>).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <header className="mb-8">
          {/* Top nav row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-black tracking-tight text-white">PANTHERS</span>
              <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-black tracking-widest text-white">
                TRIVIA
              </span>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 hover:text-white active:scale-95"
                    href="/stats"
                  >
                    Leaderboard
                  </Link>
                  <div className="relative">
                    <button
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:border-slate-600 hover:bg-slate-800 transition-colors active:scale-95"
                      onClick={() => setShowUserMenu((v) => !v)}
                    >
                      {user.username ?? user.email} ▾
                    </button>
                    {showUserMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                        <div className="absolute right-0 mt-1 z-20 w-36 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                          <button
                            className="w-full px-4 py-2.5 text-left text-xs font-semibold text-rose-400 hover:bg-slate-800 transition-colors"
                            onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem("panthers_daily_v1"); window.location.reload(); }}
                          >
                            Sign out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  className="rounded-lg border border-sky-700/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:border-sky-600/60 hover:bg-sky-500/20 transition-colors"
                  onClick={() => setShowAuthModal(true)}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>

          {/* Date + subtitle row */}
          <div className="mt-5 border-t border-slate-800/60 pt-4">
            <p className="text-xs font-semibold tracking-[0.15em] text-slate-500 uppercase">
              {new Date(today + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              4 questions per day · 1 guess per question · Answer to unlock the next.
            </p>
          </div>

          {/* Admin controls (collapsed by default) */}
          {adminEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">Viewing:</span>
              <input
                type="date"
                value={adminDate}
                onChange={(e) => setAdminDate(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              />
              <button
                className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:border-slate-600"
                onClick={() => setAdminDate(today)}
              >
                Today
              </button>
              <span className="text-xs font-mono text-slate-500">{activeDate}</span>
              <button
                className="ml-auto rounded border border-rose-800/60 bg-rose-950/40 px-2 py-1 text-xs text-rose-400 hover:border-rose-600/60"
                onClick={resetToday}
              >
                Erase answers
              </button>
            </div>
          )}
        </header>

        {/* Game Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_20px_60px_rgba(0,0,0,0.45)]">

          {/* Body */}
          {!sickoStarted ? (
            /* ── Pre-game intro screen ── */
            <div className="mt-6 flex flex-col items-center gap-6 text-center">
              {/* Field preview */}
              <div className="relative h-16 w-full overflow-hidden rounded-xl border border-slate-700">
                <div className="absolute inset-0 bg-emerald-800" />
                {/* Left endzone */}
                <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center" style={{ background: "#101820" }}>
                  <span className="text-[8px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#0085CA" }}>Carolina</span>
                </div>
                {/* Right endzone */}
                <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center bg-[#101820]">
                  <span className="text-[8px] font-black italic tracking-widest uppercase text-[#0085CA]" style={{ writingMode: "vertical-rl" }}>Panthers</span>
                </div>
                {/* Yard lines */}
                {[30, 50, 70].map((pos) => (
                  <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                ))}
                {/* Yard markers on the field */}
                {([30, 50, 70] as const).map((pos, i) => (
                  <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>
                    {["25", "50", "25"][i]}
                  </div>
                ))}
                {/* Football */}
                <div className="absolute top-1/2 left-[10%] -translate-y-1/2 text-2xl drop-shadow-lg" style={{ zIndex: 3 }}>🏈</div>
              </div>

              <div className="space-y-3 text-sm text-slate-300 max-w-sm">
                {/* <p className="text-base font-semibold text-slate-100">
                  Drive the football into the endzone for a <span className="text-yellow-300 font-bold">TOUCHDOWN</span>.
                </p> */}

                {/* Title */}                                                                                                                                           
              <div className="flex flex-col items-center gap-1">                                                                                                      
                <p className="text-xs font-bold tracking-[0.25em] text-slate-500 uppercase">Panthers Trivia</p>                                                
                  <h2 className="text-3xl font-black tracking-tight text-white uppercase">                                                                              
                    Sicko <span className="text-sky-400">Mode</span>                                                                                             
                  </h2>                                                                                                                                          
                <div className="mt-1 h-px w-16 bg-gradient-to-r from-transparent via-sky-500 to-transparent" />                                                
              </div>    

                <p>
                  4 questions stand between you and the endzone. 

                  <br></br><br></br>You have <span className="font-semibold text-white">30 seconds</span> per question — one guess only.
                  The faster you answer, the more points you score.
                  <br></br><br></br>Each question can range from "easy" to "sicko" difficulty, and you won't know which one you're getting until the timer has already started.
                  <br></br><br></br>You can use 1 hint per day, but it will cut that question's score in half. Choose wisely and good luck!
                </p>
                {/* Era hints */}
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Today's eras</p>
                  {sickoQuestions?.map((q, i) => (
                    <div key={q.id} className="flex items-center text-xs">
                      <span className="w-8 text-slate-400">Q{i + 1}</span>
                      <span className="flex-1 text-slate-300 font-medium">{eraDecade(q.season ?? 2020)}</span>
                      <span className="w-24 text-right">
                        {eraBonus(q.season ?? 2020) > 0 ? (
                          <span className="rounded bg-purple-900/40 px-1.5 py-0.5 text-purple-300 font-semibold">+{eraBonus(q.season ?? 2020)} bonus</span>
                        ) : (
                          <span className="text-slate-600">no bonus</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="mt-2 rounded-2xl bg-sky-500 px-10 py-4 text-base font-extrabold tracking-wide text-slate-950 shadow-[0_10px_40px_rgba(56,189,248,0.5)] hover:bg-sky-400 active:scale-95 transition-transform"
                onClick={() => setSickoStarted(true)}
              >
                ▶ Start
              </button>
            </div>
          ) : (
            <>
              {/* Football field progress */}
              {/* Detect restored session — all guesses are placeholders */}
              {(() => {
                const allAnswered = SICKO_ORDER.every((id) => (sickoProgress[id]?.guesses.length ?? 0) > 0);
                const isRestored = allAnswered && SICKO_ORDER.every((id) => {
                  const g = sickoProgress[id]?.guesses[0];
                  return g === "(restored)" || g === "(incorrect)";
                });
                if (!isRestored) return null;

                const correctCount = SICKO_ORDER.filter((id) => sickoProgress[id]?.completed).length;
                const isTouchdown = correctCount === 4;
                const ballPct = 10 + correctCount * 20;

                return (
                  <div className="mt-5 space-y-4">
                    {/* Field */}
                    <div className="relative h-20 overflow-hidden rounded-xl border border-slate-700">
                      <div className="absolute inset-0 bg-emerald-800" />
                      <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center" style={{ background: "#101820" }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#0085CA" }}>Carolina</span>
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center bg-[#101820]">
                        <span className="text-[9px] font-black italic tracking-widest uppercase text-[#0085CA]" style={{ writingMode: "vertical-rl" }}>Panthers</span>
                      </div>
                      {[30, 50, 70].map((pos) => (
                        <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                      ))}
                      {([30, 50, 70] as const).map((pos, i) => (
                        <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>{["25", "50", "25"][i]}</div>
                      ))}
                      {correctCount > 0 && !isTouchdown && (
                        <>
                          <div className="absolute pointer-events-none" style={{ top: "50%", left: "10%", right: `calc(${100 - ballPct}% + 26px)`, height: "4px", transform: "translateY(-50%)", background: "#0085CA", zIndex: 2 }} />
                          <div className="absolute pointer-events-none" style={{ top: "50%", left: `calc(${ballPct}% - 26px)`, transform: "translateY(-50%)", width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "14px solid #0085CA", zIndex: 2 }} />
                        </>
                      )}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-2xl drop-shadow-lg" style={{ left: `${ballPct}%`, zIndex: 3 }}>🏈</div>
                      {isTouchdown && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-base font-black italic tracking-widest text-yellow-300 drop-shadow-lg" style={{ animation: "td-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>TOUCHDOWN!</span>
                        </div>
                      )}
                    </div>

                    {/* Question summary */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800">
                      {SICKO_ORDER.map((id, idx) => {
                        const q = sickoQuestions?.find((x) => x.id === id);
                        const qp = sickoProgress[id];
                        return (
                          <div key={id} className="flex items-center gap-3 px-4 py-3">
                            <span className={`text-base ${qp?.completed ? "text-emerald-400" : "text-rose-400"}`}>{qp?.completed ? "✓" : "✗"}</span>
                            <span className="flex-1 text-sm text-slate-300">{q?.prompt}</span>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-center gap-2 px-4 py-3">
                        <span className="text-sm font-bold text-slate-300">Total</span>
                        <span className="text-sm font-bold text-sky-400">{totalScore} pts</span>
                      </div>
                    </div>

                    {/* Share */}
                    <div className="flex justify-center">
                      <button className="rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90" style={{ background: "#0085CA" }} onClick={share}>Share Results</button>
                    </div>
                  </div>
                );
              })()}
              {/* Only render the full game UI if NOT restored */}
              {!SICKO_ORDER.every((id) => { const g = sickoProgress[id]?.guesses[0]; return g === "(restored)" || g === "(incorrect)"; }) && <>
              {(() => {
                const correctCount = SICKO_ORDER.filter((id) => sickoProgress[id]?.completed).length;
                const isTouchdown = correctCount === 4;
                // Ball x-position as % of container: starts at left goal line (10%), moves 20% per correct answer, TD at 90%
                const ballPct = 10 + correctCount * 20;
                return (
                  <div className="mt-5">
                    <div className="relative h-20 overflow-hidden rounded-xl border border-slate-700">
                      {/* Field */}
                      <div className="absolute inset-0 bg-emerald-800" />

                      {/* Left endzone */}
                      <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center"
                           style={{ background: "#101820" }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase"
                              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#0085CA" }}>
                          Carolina
                        </span>
                      </div>

                      {/* Right endzone */}
                      <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center bg-[#101820]">
                        <span className="text-[9px] font-black italic tracking-widest uppercase text-[#0085CA]"
                              style={{ writingMode: "vertical-rl" }}>
                          Panthers
                        </span>
                      </div>

                      {/* Yard lines */}
                      {[30, 50, 70].map((pos) => (
                        <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                      ))}

                      {/* Yard markers on the field */}
                      {([30, 50, 70] as const).map((pos, i) => (
                        <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>
                          {["25", "50", "25"][i]}
                        </div>
                      ))}

                      {/* Hash marks */}
                      {[20, 40, 60, 80].map((pos) => (
                        <div key={pos} className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-white/20" style={{ left: `${pos}%` }} />
                      ))}

                      {/* Panthers blue arrow: left endzone → back of football */}
                      {correctCount > 0 && !isTouchdown && (
                        <>
                          {/* Shaft */}
                          <div
                            className="absolute pointer-events-none transition-all duration-700 ease-out"
                            style={{
                              top: "50%",
                              left: "10%",
                              right: `calc(${100 - ballPct}% + 26px)`,
                              height: "4px",
                              transform: "translateY(-50%)",
                              background: "#0085CA",
                              zIndex: 2,
                            }}
                          />
                          {/* Arrowhead (right-pointing triangle) */}
                          <div
                            className="absolute pointer-events-none transition-all duration-700 ease-out"
                            style={{
                              top: "50%",
                              left: `calc(${ballPct}% - 26px)`,
                              transform: "translateY(-50%)",
                              width: 0,
                              height: 0,
                              borderTop: "8px solid transparent",
                              borderBottom: "8px solid transparent",
                              borderLeft: "14px solid #0085CA",
                              zIndex: 2,
                            }}
                          />
                        </>
                      )}

                      {/* Football — above arrow */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-2xl transition-all duration-700 ease-out drop-shadow-lg"
                        style={{ left: `${ballPct}%`, zIndex: 3 }}
                      >
                        🏈
                      </div>

                      {/* Touchdown celebration */}
                      {isTouchdown && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                          <span
                            className="text-base font-black italic tracking-widest text-yellow-300 drop-shadow-lg"
                            style={{ animation: "td-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
                          >
                            TOUCHDOWN!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Sicko: one card per question, answered ones stay visible */}
              <datalist id="players-list">
                {PLAYERS.map((p) => (
                  <option key={p.id} value={`${p.name} (${p.pos})`} />
                ))}
              </datalist>

              <ol className="mt-5 space-y-3">
                {SICKO_ORDER.map((id, idx) => {
                  const q = sickoQuestions?.find((x) => x.id === id);
                  const qp = sickoProgress[id] ?? { guesses: [], completed: false };
                  const answerPlayers = sickoPlayerMap[id] ?? [];
                  const isAnswered = qp.guesses.length > 0;
                  const isActive = id === sickoCurrentId && !isAnswered;
                  const isLocked = !isAnswered && !isActive;

                  return (
                    <li key={id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      {/* Question header */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/15 text-xs font-bold text-sky-200 ring-1 ring-sky-500/30">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold tracking-wider text-slate-400">
                          {isAnswered
                            ? qp.completed ? "✅ CORRECT" : qp.guesses[0] === "(time's up)" ? "⏰ TIME'S UP" : "❌ INCORRECT"
                            : isActive ? "YOUR TURN" : "🔒 LOCKED"}
                        </span>
                      </div>

                      {/* Prompt — show for answered and active, hide for locked */}
                      {!isLocked && (
                        <p className="mt-2 text-sm text-slate-200">{q?.prompt}</p>
                      )}

                      {/* Answered: show result */}
                      {isAnswered && answerPlayers.length > 0 && (
                        <div className={`mt-3 rounded-xl border p-3 ${
                          qp.completed
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}>
                          {(() => {
                            const isRestored = qp.guesses[0] === "(restored)" || qp.guesses[0] === "(incorrect)";
                            return qp.completed ? (
                              <>
                                <div className="text-xs text-slate-400">Correct!</div>
                                {!isRestored && <div className="mt-0.5 font-bold text-emerald-100">{qp.guesses[0]}</div>}
                                {isRestored && <div className="mt-0.5 font-bold text-emerald-100">{answerPlayers.map((p) => p.name).join(" · ")}</div>}
                              </>
                            ) : (
                              <>
                                <div className="text-xs text-slate-400">
                                  {answerPlayers.length === 1 ? "Answer" : "Valid answers"}
                                </div>
                                <div className="mt-0.5 font-bold text-rose-100">
                                  {answerPlayers.map((p) => p.name).join(" · ")}
                                </div>
                                {!isRestored && (
                                  <div className="mt-0.5 text-xs text-slate-400">
                                    You guessed: {qp.guesses[0] === "(time's up)" ? "⏰ Time's up!" : qp.guesses[0]}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="mt-1 text-xs font-semibold text-slate-300">
                            {qp.score ?? 0} pts
                          </div>
                        </div>
                      )}

                      {/* Active: show timer bar + input */}
                      {isActive && (() => {
                        const hintRevealed = !!hintsRevealed[id];
                        const hintJerseys = answerPlayers.flatMap((p) => p.jersey ?? []);
                        const hasHint = hintJerseys.length > 0;
                        return (
                        <>
                          {/* Countdown bar */}
                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-xs text-slate-400">Time remaining</span>
                              <span className={`text-xs font-bold tabular-nums ${
                                timeRemaining > 10 ? "text-emerald-400" :
                                timeRemaining > 5  ? "text-amber-400"   : "text-rose-400"
                              }`}>{timeRemaining}s</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                                  timeRemaining > 10 ? "bg-emerald-500" :
                                  timeRemaining > 5  ? "bg-amber-500"   : "bg-rose-500"
                                }`}
                                style={{ width: `${(timeRemaining / 30) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Hint */}
                          {hasHint && (
                            <div className="mt-2">
                              {!hintRevealed ? (
                                Object.values(hintsRevealed).some(Boolean) ? (
                                  <span className="text-xs text-slate-600">💡 Hint already used today</span>
                                ) : (
                                <button
                                  className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:border-amber-600/60 hover:bg-amber-950/50 transition-colors"
                                  onClick={() => setHintsRevealed((prev) => ({ ...prev, [id]: true }))}
                                >
                                  💡 Use hint (−50% score)
                                </button>
                                )
                              ) : (
                                <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-1.5">
                                  <span className="text-xs text-amber-400 font-semibold">💡 Hint:</span>
                                  <span className="text-xs text-amber-200">
                                    Jersey #{hintJerseys.join(" or #")}
                                  </span>
                                  <span className="ml-auto text-xs text-amber-600">−50% score</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <div className="relative w-full">
                              <input
                                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none ring-sky-500/30 focus:border-sky-500/60 focus:ring-4"
                                placeholder="Type a player name…"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitGuess(); }}
                                list="players-list"
                                autoFocus
                              />
                              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                                Enter
                              </div>
                            </div>
                            <button
                              className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.35)] hover:bg-sky-400"
                              onClick={submitGuess}
                            >
                              Guess
                            </button>
                          </div>
                        </>
                        );
                      })()}

                      {/* Locked: placeholder */}
                      {isLocked && (
                        <p className="mt-2 text-xs text-slate-500">Answer the previous question to unlock.</p>
                      )}
                    </li>
                  );
                })}
              </ol>

              {/* Score breakdown — shown once all 4 questions are answered */}
              {SICKO_ORDER.every((id) => (sickoProgress[id]?.guesses.length ?? 0) > 0) && (
                <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                  <div className="text-xs font-semibold tracking-wider text-slate-400 mb-3">SCORE BREAKDOWN</div>
                  <div className="space-y-2">
                    {SICKO_ORDER.map((id, idx) => {
                      const qp = sickoProgress[id];
                      const q = sickoQuestions?.find((x) => x.id === id);
                      const isTimesUp = qp?.guesses[0] === "(time's up)";
                      const tier = q?.tier ?? 2;
                      const season = q?.season ?? 2020;
                      const bonus = qp?.completed ? eraBonus(season) : 0;
                      const timeLeft = qp?.timeRemaining ?? null;
                      const hintUsed = !!qp?.hintUsed;
                      const rawScore = qp?.completed ? Math.round(BASE_PTS * ((timeLeft ?? 0) / 30)) + bonus : 0;
                      return (
                        <div key={id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-slate-500 text-xs">Q{idx + 1}</span>
                              <span className={`shrink-0 font-semibold ${qp?.completed ? "text-emerald-400" : "text-rose-400"}`}>
                                {qp?.completed ? "✓" : isTimesUp ? "⏰" : "✗"}
                              </span>
                              <span className="truncate text-xs text-slate-400">{q?.prompt}</span>
                            </div>
                            <span className={`shrink-0 font-bold ${qp?.completed ? "text-sky-400" : "text-slate-500"}`}>
                              {qp?.completed ? `+${qp.score}` : "0 pts"}
                            </span>
                          </div>
                          {qp?.completed && (
                            <div className="mt-2 space-y-1.5">
                              {/* Equation row */}
                              <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-slate-300">
                                <span className="text-sky-300">{BASE_PTS}</span>
                                <span className="text-slate-500">×</span>
                                <span className="text-emerald-300">({timeLeft ?? "?"}s/30s)</span>
                                {bonus > 0 && (
                                  <>
                                    <span className="text-slate-500">+</span>
                                    <span className="text-purple-300">{bonus}</span>
                                  </>
                                )}
                                {hintUsed && (
                                  <>
                                    <span className="text-slate-500">→</span>
                                    <span className="text-amber-400">{rawScore}</span>
                                    <span className="text-slate-500">÷ 2</span>
                                  </>
                                )}
                                <span className="text-slate-500">=</span>
                                <span className="font-bold text-yellow-300">{qp.score}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                                <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-sky-400">{tierLabel(tier)}</span>
                                <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-emerald-400">{timeLeft ?? "?"}s remaining</span>
                                {bonus > 0 && (
                                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-purple-400">
                                    {season < 2000 ? "1990s" : season < 2010 ? "2000s" : "2010s"} Bonus
                                  </span>
                                )}
                                {hintUsed && (
                                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-amber-400">💡 Hint used</span>
                                )}
                              </div>
                            </div>
                          )}
                          {!qp?.completed && isTimesUp && (
                            <p className="mt-1.5 text-xs text-slate-500">Ran out of time — correct answer: {(sickoPlayerMap[id] ?? []).map(p => p.name).join(" · ")}</p>
                          )}
                          {!qp?.completed && !isTimesUp && qp?.guesses[0] && (
                            <p className="mt-1.5 text-xs text-slate-500">You guessed: {qp.guesses[0]} — correct: {(sickoPlayerMap[id] ?? []).map(p => p.name).join(" · ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 border-t border-slate-700 pt-4 flex justify-between items-baseline">
                    <span className="text-base font-bold text-slate-300">Total</span>
                    <span className="text-2xl font-black text-sky-400">
                      {totalScore.toLocaleString()}
                      {maxScore != null && <span className="text-sm font-normal text-slate-500"> / {maxScore}</span>}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex justify-center">
                <button
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: "#0085CA" }}
                  onClick={share}
                >
                  Share Results
                </button>
              </div>
            </>}
            </>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          #PanthersTriviaSickoMode
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </main>
  );
}