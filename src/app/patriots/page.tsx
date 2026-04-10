"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";

import { chicagoYMD } from "@/lib/time";
import { PLAYERS_PATRIOTS } from "@/data/players_patriots";
import { PUZZLES_PATRIOTS } from "@/data/puzzles_patriots";
import { type Mode } from "@/lib/storage";
import { createClient } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";

// Patriots colors
const TEAM_COLOR = "#002244";   // Navy
const TEAM_ACCENT = "#C60C30";  // Red
const TEAM_LIGHT = "#4a6fa5";   // Light navy for hover states

/** ---------- scoring helpers ---------- **/
const BASE_PTS = 100;

function tierLabel(tier: number): string {
  if (tier === 1) return "Play by Play";
  if (tier === 2) return "Season Leader";
  return "Draft Pick";
}

function eraBonus(season: number): number {
  if (season < 2000) return 25;
  if (season < 2010) return 15;
  if (season < 2020) return 5;
  return 0;
}

function eraDecade(season: number): string {
  if (season < 2000) return "1990s";
  if (season < 2010) return "2000s";
  if (season < 2020) return "2010s";
  return "2020s";
}

function calcScore(timeRemaining: number, season: number): number {
  return Math.round(BASE_PTS * (timeRemaining / 40)) + eraBonus(season);
}


/** ---------- PlayClock ---------- **/
const SEG_DIGITS: Record<number, boolean[]> = {
  0: [true,  true,  true,  true,  true,  true,  false],
  1: [false, true,  true,  false, false, false, false],
  2: [true,  true,  false, true,  true,  false, true ],
  3: [true,  true,  true,  true,  false, false, true ],
  4: [false, true,  true,  false, false, true,  true ],
  5: [true,  false, true,  true,  false, true,  true ],
  6: [true,  false, true,  true,  true,  true,  true ],
  7: [true,  true,  true,  false, false, false, false],
  8: [true,  true,  true,  true,  true,  true,  true ],
  9: [true,  true,  true,  true,  false, true,  true ],
};

function SevenSegDigit({ digit, on, off }: { digit: number; on: string; off: string }) {
  const segs = SEG_DIGITS[digit] ?? SEG_DIGITS[8];
  const W = 18, H = 30, T = 3, G = 1.5;
  const hw = W - 2 * (T + G);
  const vh = H / 2 - T - 2 * G;
  const hx = T + G;
  const rects = [
    { x: hx,   y: 0,       w: hw, h: T,  r: 2 },
    { x: W - T, y: T + G,  w: T,  h: vh, r: 2 },
    { x: W - T, y: H/2+G,  w: T,  h: vh, r: 2 },
    { x: hx,   y: H - T,   w: hw, h: T,  r: 2 },
    { x: 0,    y: H/2+G,   w: T,  h: vh, r: 2 },
    { x: 0,    y: T + G,   w: T,  h: vh, r: 2 },
    { x: hx,   y: H/2-T/2, w: hw, h: T,  r: 2 },
  ];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill={segs[i] ? on : off} />
      ))}
    </svg>
  );
}

function PlayClock({ timeRemaining }: { timeRemaining: number }) {
  const urgent = timeRemaining <= 10;
  const onColor  = urgent ? "#ff4400" : "#ffb300";
  const offColor = urgent ? "#200800" : "#1c1000";
  const glow     = urgent ? "#ff440055" : "#ffb30044";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div style={{
        background: "linear-gradient(180deg, #141414 0%, #0a0a0a 100%)",
        border: "3px solid #2a2a2a",
        borderRadius: "6px",
        outline: "1px solid #111",
        padding: "6px 10px",
        display: "flex",
        gap: "3px",
        alignItems: "center",
        boxShadow: `inset 0 2px 8px rgba(0,0,0,0.95), 0 1px 0 #333, 0 0 12px ${glow}`,
        filter: `drop-shadow(0 0 5px ${glow})`,
      }}>
        <SevenSegDigit digit={Math.floor(timeRemaining / 10)} on={onColor} off={offColor} />
        <SevenSegDigit digit={timeRemaining % 10}             on={onColor} off={offColor} />
      </div>
    </div>
  );
}

/** ---------- helpers ---------- **/
function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
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

const SICKO_ORDER = ["q1", "q2", "q3", "q4", "q5"] as const;

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

const LS_DAILY = "patriots_daily_v1";
const LS_TIMER = "patriots_timer_v1";
const LS_USER_ID = "patriots_user_id";
const LS_ADMIN_DATE = "patriots_admin_date_v1";

/** ---------- component ---------- **/
export default function PatriotsPage() {
  const supabase = createClient();
  const today = useMemo(() => chicagoYMD(), []);
  const [adminDate, setAdminDate] = useState<string>(() => today);
  const [user, setUser] = useState<{ email?: string; username?: string; isAdmin?: boolean } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadUser(userId: string, email?: string) {
      const storedUserId = localStorage.getItem(LS_USER_ID);
      if (storedUserId && storedUserId !== userId) {
        localStorage.removeItem(LS_DAILY);
      }
      localStorage.setItem(LS_USER_ID, userId);

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
      localStorage.setItem(LS_ADMIN_DATE, adminDate);
    } catch {}
  }, [adminDate]);

  const adminEnabled = !!user?.isAdmin;
  const activeDate = adminEnabled ? adminDate : today;
  const mode: Mode = "sicko";

  const sickoDay = useMemo(() => {
    return (PUZZLES_PATRIOTS as any[]).find((d) => d.date === activeDate) ?? null;
  }, [activeDate]);

  const sickoQuestions = (sickoDay as any)?.questions as
    | Array<{ id: "q1" | "q2" | "q3" | "q4" | "q5"; prompt: string; playerIds?: string[]; playerId?: string; answerPool?: string; tier?: number; season?: number }>
    | undefined;

  const hasDay = !!sickoDay;

  const [input, setInput] = useState<string>("");
  const [sickoProgress, setSickoProgress] = useState<Record<string, QuestionProgress>>({});
  const [hintsRevealed, setHintsRevealed] = useState<Record<string, boolean>>({});
  const [scoreExpanded, setScoreExpanded] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [sickoStarted, setSickoStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(40);
  const [timerKey, setTimerKey] = useState(0);
  const timeRef = useRef(40);
  const activeCardRef = useRef<HTMLLIElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const autoSubmitRef = useRef<() => void>(() => {});

  const sickoCurrentId =
    SICKO_ORDER.find((id) => (sickoProgress[id]?.guesses?.length ?? 0) === 0) ?? "q5";
  const sickoCurrent = sickoQuestions?.find((q) => q.id === sickoCurrentId) ?? null;
  const sickoQp = sickoCurrent
    ? sickoProgress[sickoCurrent.id] ?? { guesses: [], completed: false }
    : { guesses: [], completed: false };

  const sickoOutOfGuesses = mode === "sicko" && sickoQp.guesses.length >= 1;

  const totalScore = SICKO_ORDER.reduce((sum, id) => sum + (sickoProgress[id]?.score ?? 0), 0);
  const allAnswered = SICKO_ORDER.every((id) => (sickoProgress[id]?.guesses.length ?? 0) > 0);
  const completedCount = SICKO_ORDER.filter((id) => sickoProgress[id]?.completed).length;
  const showConfetti = allAnswered && completedCount === 5;

  useEffect(() => {
    if (allAnswered && fieldRef.current) {
      setTimeout(() => fieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [allAnswered]);

  // Map every question id -> all valid answer entries
  const sickoPlayerMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; pos?: string; jersey?: number[] }[]> = {};
    for (const q of sickoQuestions ?? []) {
      const ids = q.playerIds ?? (q.playerId ? [q.playerId] : []);
      const pool = PLAYERS_PATRIOTS;
      map[q.id] = ids.flatMap((id) => {
        const p = pool.find((x) => x.id === id);
        return p ? [p] : [];
      });
    }
    return map;
  }, [sickoQuestions]);

  useEffect(() => {
    if (!showConfetti) return;
    const colors = ["#FF3B30","#FF9500","#FFCC00","#34C759","#007AFF","#5856D6","#FF2D55","#00C7BE","#30D158","#64D2FF","#BF5AF2","#FFD60A"];
    let frame: number;
    const timeout = setTimeout(() => {
      const end = Date.now() + 1000;
      (function burst() {
        confetti({ particleCount: 6, angle: 60,  spread: 55, origin: { x: 0,   y: 0.9 }, colors, startVelocity: 60, scalar: 0.9, gravity: 1.1 });
        confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1,   y: 0.9 }, colors, startVelocity: 60, scalar: 0.9, gravity: 1.1 });
        confetti({ particleCount: 5, angle: 90,  spread: 80, origin: { x: 0.5, y: 1   }, colors, startVelocity: 75, scalar: 0.9, gravity: 1.1 });
        if (Date.now() < end) frame = requestAnimationFrame(burst);
      })();
    }, 1000);
    return () => { clearTimeout(timeout); cancelAnimationFrame(frame); };
  }, [showConfetti]);

  useEffect(() => {
    // Use a namespaced storage key for patriots
    const patriotsKey = `${LS_DAILY}_${activeDate}`;
    let patriotsSaved = null;
    try { patriotsSaved = JSON.parse(localStorage.getItem(patriotsKey) ?? "null"); } catch {}
    const saved = coerceProgress("sicko", activeDate, patriotsSaved);
    const next: Record<string, QuestionProgress> = { ...saved.questions };
    for (const qid of SICKO_ORDER) {
      if (!next[qid]) next[qid] = { guesses: [], completed: false };
    }
    setSickoProgress(next);
    setSickoStarted(SICKO_ORDER.some((qid) => (next[qid]?.guesses.length ?? 0) > 0));
    setHintsRevealed({});
    setInput("");
  }, [activeDate]);

  // Keep autoSubmitRef fresh every render
  autoSubmitRef.current = () => {
    if (!sickoCurrent || (sickoProgress[sickoCurrent.id]?.guesses.length ?? 0) > 0) return;
    const pendingGuess = input.trim();
    if (pendingGuess) {
      submitGuess();
      return;
    }
    const nextQp: QuestionProgress = { guesses: ["(time's up)"], completed: false, score: 0 };
    const nextQuestions = { ...sickoProgress, [sickoCurrent.id]: nextQp };
    setSickoProgress(nextQuestions);
    setInput("");
    localStorage.removeItem(`${LS_TIMER}_${activeDate}_${sickoCurrent.id}`);
    persistSicko(nextQuestions);
    saveScoreToSupabase(nextQuestions);
  };

  // 40-second countdown per question
  useEffect(() => {
    if (!sickoStarted) return;
    const qp = sickoProgress[sickoCurrentId];
    if ((qp?.guesses.length ?? 0) > 0) return;

    const timerKey_str = `${LS_TIMER}_${activeDate}_${sickoCurrentId}`;

    const savedStart = localStorage.getItem(timerKey_str);
    let initial = 40;
    if (savedStart) {
      const elapsed = Math.floor((Date.now() - Number(savedStart)) / 1000);
      initial = Math.max(0, 40 - elapsed);
    } else {
      localStorage.setItem(timerKey_str, String(Date.now()));
    }

    if (initial <= 0) {
      autoSubmitRef.current();
      return;
    }

    setTimeRemaining(initial);
    timeRef.current = initial;

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
    const patriotsKey = `${LS_DAILY}_${activeDate}`;
    try {
      localStorage.setItem(patriotsKey, JSON.stringify({ mode: "sicko", date: activeDate, questions: nextQuestions }));
    } catch {}
  }

  async function saveScoreToSupabase(nextQuestions: Record<string, QuestionProgress>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const allAnswered = SICKO_ORDER.every((id) => (nextQuestions[id]?.guesses.length ?? 0) > 0);
    if (!allAnswered) return;

    const answers = SICKO_ORDER.map((id) => ({
      questionId: id,
      answer: nextQuestions[id]?.guesses[0] ?? "",
      timeRemaining: nextQuestions[id]?.timeRemaining ?? 0,
      hintUsed: !!nextQuestions[id]?.hintUsed,
    }));

    const res = await fetch("/api/submit-score-patriots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: activeDate, answers }),
    });
    if (!res.ok) console.error("Score save error:", await res.text());
  }

  async function syncLocalProgressToSupabase(date: string) {
    const patriotsKey = `${LS_DAILY}_${date}`;
    let existing = null;
    try { existing = JSON.parse(localStorage.getItem(patriotsKey) ?? "null"); } catch {}
    if (!existing) return;

    const allAnswered = SICKO_ORDER.every((id) => (existing.questions?.[id]?.guesses.length ?? 0) > 0);
    if (!allAnswered) return;

    const answers = SICKO_ORDER.map((id) => ({
      questionId: id,
      answer: existing.questions[id]?.guesses[0] ?? "",
      timeRemaining: existing.questions[id]?.timeRemaining ?? 0,
      hintUsed: !!existing.questions[id]?.hintUsed,
    }));

    const res = await fetch("/api/submit-score-patriots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, answers }),
    });
    if (!res.ok) console.error("Score sync error:", await res.text());
  }

  async function restoreProgressFromSupabase(userId: string, date: string) {
    const patriotsKey = `${LS_DAILY}_${date}`;
    let existing = null;
    try { existing = JSON.parse(localStorage.getItem(patriotsKey) ?? "null"); } catch {}

    const hasLocalProgress = existing && SICKO_ORDER.some((id) => (existing.questions?.[id]?.guesses.length ?? 0) > 0);
    const allAnsweredLocally = existing && SICKO_ORDER.every((id) => (existing.questions?.[id]?.guesses.length ?? 0) > 0);

    if (allAnsweredLocally) {
      const hasPlaceholders = SICKO_ORDER.some((id) => existing.questions?.[id]?.guesses?.[0] === "(restored)");
      if (!hasPlaceholders) {
        await syncLocalProgressToSupabase(date);
      }
      return;
    }

    if (hasLocalProgress) return;

    const { data } = await supabase
      .from("scores")
      .select("question_results, question_scores, hint_question, total_score")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("team", "patriots")
      .maybeSingle();

    if (!data) return;

    const rawScores: number[] = data.question_scores ?? [0, 0, 0, 0];
    const allZero = rawScores.every((s: number) => s === 0);
    const results: boolean[] = data.question_results ?? [false, false, false, false];
    const correctCount = results.filter(Boolean).length;

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

    try { localStorage.setItem(patriotsKey, JSON.stringify({ mode: "sicko", date, questions })); } catch {}
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
    localStorage.removeItem(`${LS_TIMER}_${activeDate}_${sickoCurrent.id}`);
    persistSicko(nextQuestions);
    saveScoreToSupabase(nextQuestions);
  }

  async function share() {
    const cells = SICKO_ORDER.map((id) => {
      const qp = sickoProgress[id] ?? { guesses: [], completed: false };
      if (qp.completed) return "🟩";
      if (qp.guesses.length === 0) return "⬛";
      return "🟥";
    }).join(" ");
    const [y, m, d] = activeDate.split("-");
    const formattedDate = `${m}-${d}-${y}`;
    const achievementLine = allAnswered && completedCount === 5
      ? "\nTOUCHDOWN!"
      : allAnswered && completedCount === 4
      ? "\nFIELD GOAL!"
      : "";
    const text = `${formattedDate}\n${cells}${achievementLine}\n${totalScore} pts\n${window.location.origin}\n#PatriotsSicko`;

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard also unavailable
      }
    }
  }

  function resetToday() {
    for (const qid of SICKO_ORDER) {
      localStorage.removeItem(`${LS_TIMER}_${activeDate}_${qid}`);
    }
    const patriotsKey = `${LS_DAILY}_${activeDate}`;
    localStorage.removeItem(patriotsKey);
    const cleared: Record<string, QuestionProgress> = {};
    for (const qid of SICKO_ORDER) {
      cleared[qid] = { guesses: [], completed: false };
    }
    setSickoProgress(cleared);
    setSickoStarted(false);
    setInput("");
    setHintsRevealed({});
    setTimerKey((k) => k + 1);
  }

  if (!hasDay) {
    return (
      <main className="min-h-screen bg-transparent text-zinc-100">
        <div className="mx-auto max-w-2xl p-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Patriots Daily</h1>
            <Link
              className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-600"
              href="/patriots/stats"
            >
              Stats
            </Link>
          </header>
          <p className="mt-6 text-sm text-zinc-300">
            No puzzle found for today (<code>{today}</code>).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-zinc-100">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <header className="mb-2">
          {/* Logo row */}
          <div className="relative flex items-center justify-center gap-2.5 mb-4">
            <Link href="/patriots" className="flex items-center gap-2.5">
              <span className="text-2xl font-black tracking-tight text-white">SICKO</span>
              <span className="rounded px-2 py-0.5 text-sm font-black tracking-widest text-white" style={{ background: TEAM_COLOR }}>
                TRIVIA
              </span>
            </Link>

            {/* Profile icon */}
            <div className="absolute top-0 left-0 z-30">
              <button
                className={`rounded-full p-1 transition-colors hover:bg-zinc-800/60 ${user ? "text-[#C60C30]" : "text-zinc-500 hover:text-zinc-300"}`}
                onClick={() => user ? setShowUserMenu((v) => !v) : setShowAuthModal(true)}
                title={user ? (user.username ?? user.email) : "Sign in"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="9" r="3" />
                  <path d="M5.5 19.5c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" strokeLinecap="round" />
                </svg>
              </button>
              {showUserMenu && user && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute left-0 mt-1 z-20 w-44 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                    <div className="px-4 py-2.5">
                      <p className="text-xs font-semibold text-zinc-100">Hello, {user.username ?? user.email}!</p>
                    </div>
                    <button
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-rose-400 hover:bg-zinc-800 transition-colors border-t border-zinc-800"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem(LS_DAILY);
                        window.location.href = "/patriots";
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Nav bar */}
          <nav className="relative flex items-center border-b border-zinc-800 pb-4 mb-2">
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
              <Link href="/" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                Home
              </Link>
              <Link href="/patriots" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-white">
                Patriots
              </Link>
              {user && (
                <Link href="/patriots/stats" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                  Leaderboard
                </Link>
              )}
              {user && (
                <Link href="/settings?team=patriots" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                  Settings
                </Link>
              )}
            </div>
          </nav>

          {/* Date row */}
          <div className="mt-2 text-center">
            <p className="text-xl font-bold text-white">
              {new Date(today + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Admin controls */}
          {adminEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <span className="text-xs font-medium text-zinc-500">Viewing:</span>
              <input
                type="date"
                value={adminDate}
                onChange={(e) => setAdminDate(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
              />
              <button
                className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                onClick={() => setAdminDate(today)}
              >
                Today
              </button>
              <span className="text-xs font-mono text-zinc-500">{activeDate}</span>
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
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_20px_60px_rgba(0,0,0,0.45)]">

          {!sickoStarted ? (
            /* ── Pre-game intro screen ── */
            <div className="flex flex-col items-center gap-6 text-center">

              <div className="space-y-3 text-sm text-zinc-300 max-w-sm w-full">
                {/* Title */}
                <div className="flex flex-col items-center gap-1">
                  <h2 className="font-black tracking-tight uppercase flex gap-2 justify-center whitespace-nowrap" style={{ fontSize: "clamp(1rem, 5.5vw, 1.875rem)" }}>
                    <span className="text-white">New England</span><span style={{ color: TEAM_ACCENT }}>Patriots</span>
                  </h2>
                  <div className="mt-1 h-px w-16 bg-gradient-to-r from-transparent to-transparent" style={{ backgroundImage: `linear-gradient(to right, transparent, ${TEAM_ACCENT}, transparent)` }} />
                </div>

                {/* Field preview */}
                <div className="relative h-16 w-full overflow-hidden rounded-xl border border-zinc-700">
                  <div className="absolute inset-0 bg-emerald-800" />
                  <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                    <span className="text-[8px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#C0C0C0" }}>New England</span>
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                    <span className="text-[8px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", color: "#C0C0C0" }}>Patriots</span>
                  </div>
                  {[18, 26, 34, 42, 50, 58, 66, 74, 82].map((pos) => (
                    <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                  ))}
                  {([18, 26, 34, 42, 50, 58, 66, 74, 82] as const).map((pos, i) => (
                    <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>
                      {["10", "20", "30", "40", "50", "40", "30", "20", "10"][i]}
                    </div>
                  ))}
                  <div className="absolute top-1/2 left-[10%] -translate-y-1/2 text-sm drop-shadow-lg" style={{ zIndex: 3 }}>🏈</div>
                </div>

                <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900/40 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
                    onClick={() => setInstructionsOpen((v) => !v)}
                  >
                    <span>How to Play</span>
                    <span className="text-zinc-500">{instructionsOpen ? "▲" : "▼"}</span>
                  </button>
                  {instructionsOpen && (
                    <p className="px-4 pb-4 text-sm text-center text-zinc-300" style={{ textWrap: "balance" } as React.CSSProperties}>
                      5 questions stand between you and the endzone. <br /> <span className="font-semibold text-white">40 second play clock</span> per question.
                      <br />The faster you answer, the more points you score.
                      <br /><br />Questions range from the 1995 - 2025 seasons.
                      <br />You will be quizzed on draft picks and season leaders, as well as specific plays.
                      <br /><br />You can use 1 hint per day, but it will cut that question&apos;s score in half so choose wisely. <br />Good luck!
                    </p>
                  )}
                </div>

                {/* Era hints */}
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Today&apos;s eras</p>
                  {sickoQuestions?.map((q, i) => (
                    <div key={q.id} className="flex items-center text-xs">
                      <span className="w-8 text-zinc-400">Q{i + 1}</span>
                      <span className="flex-1 text-zinc-300 font-medium">{eraDecade(q.season ?? 2020)}</span>
                      <span className="w-24 text-right">
                        {eraBonus(q.season ?? 2020) > 0 && (
                          <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: `${TEAM_COLOR}33`, color: TEAM_LIGHT }}>+{eraBonus(q.season ?? 2020)} bonus</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {!user && (
                <div className="w-full max-w-sm rounded-xl border px-4 py-3 text-center" style={{ borderColor: `${TEAM_COLOR}66`, background: `${TEAM_COLOR}22` }}>
                  <p className="text-xs font-semibold text-zinc-300">
                    <button className="font-bold hover:text-white transition-colors" style={{ color: TEAM_ACCENT }} onClick={() => setShowAuthModal(true)}>Sign in or create an account</button>
                    {" "}to register your points and compete on the leaderboard.
                  </p>
                </div>
              )}

              <button
                className="mt-2 rounded-2xl px-10 py-4 text-base font-extrabold tracking-wide text-white shadow-lg active:scale-95 transition-transform"
                style={{ background: TEAM_COLOR, boxShadow: `0 10px 40px ${TEAM_COLOR}80` }}
                onClick={() => setSickoStarted(true)}
              >
                Start
              </button>
            </div>
          ) : (
            <>
              {/* Detect restored session */}
              {(() => {
                const allAnswered = SICKO_ORDER.every((id) => (sickoProgress[id]?.guesses.length ?? 0) > 0);
                const isRestored = allAnswered && SICKO_ORDER.every((id) => {
                  const g = sickoProgress[id]?.guesses[0];
                  return g === "(restored)" || g === "(incorrect)";
                });
                if (!isRestored) return null;

                const correctCount = SICKO_ORDER.filter((id) => sickoProgress[id]?.completed).length;
                const isTouchdown = correctCount === 5;
                const isFieldGoal = correctCount === 4;
                const ballPct = 10 + correctCount * 16;

                return (
                  <div className="mt-5 space-y-4">
                    <div className="relative h-20 overflow-hidden rounded-xl border border-zinc-700">
                      <div className="absolute inset-0 bg-emerald-800" />
                      <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#C0C0C0" }}>New England</span>
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", color: "#C0C0C0" }}>Patriots</span>
                      </div>
                      {[18, 26, 34, 42, 50, 58, 66, 74, 82].map((pos) => (
                        <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                      ))}
                      {([18, 26, 34, 42, 50, 58, 66, 74, 82] as const).map((pos, i) => (
                        <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>{["10", "20", "30", "40", "50", "40", "30", "20", "10"][i]}</div>
                      ))}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-sm drop-shadow-lg" style={{ left: `${ballPct}%`, zIndex: 3 }}>🏈</div>
                      {isTouchdown && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-base font-black italic tracking-widest text-white drop-shadow-lg" style={{ animation: "td-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) 1s both" }}>TOUCHDOWN!</span>
                        </div>
                      )}
                      {isFieldGoal && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-base font-black italic tracking-widest text-white drop-shadow-lg" style={{ animation: "fg-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 1.9s both" }}>FIELD GOAL!</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800">
                      {SICKO_ORDER.map((id, idx) => {
                        const q = sickoQuestions?.find((x) => x.id === id);
                        const qp = sickoProgress[id];
                        return (
                          <div key={id} className="flex items-center gap-3 px-4 py-3">
                            <span className={`text-base ${qp?.completed ? "text-emerald-400" : "text-rose-400"}`}>{qp?.completed ? "✓" : "✗"}</span>
                            <span className="flex-1 text-sm text-zinc-300">{q?.prompt}</span>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-center gap-2 px-4 py-3">
                        <span className="text-sm font-bold text-zinc-300">Total</span>
                        <span className="text-sm font-bold" style={{ color: TEAM_ACCENT }}>{totalScore} pts</span>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <button className="rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90" style={{ background: TEAM_COLOR }} onClick={share}>{copied ? "Copied!" : "Share Results"}</button>
                    </div>
                  </div>
                );
              })()}

              {!SICKO_ORDER.every((id) => { const g = sickoProgress[id]?.guesses[0]; return g === "(restored)" || g === "(incorrect)"; }) && <>
              <datalist id="patriots-players-list">
                {PLAYERS_PATRIOTS.map((p) => (
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

                  const hasActiveQuestion = SICKO_ORDER.some((qid) => {
                    const qpCheck = sickoProgress[qid] ?? { guesses: [], completed: false };
                    return qid === sickoCurrentId && qpCheck.guesses.length === 0;
                  });
                  const isCollapsed = isAnswered && hasActiveQuestion;

                  if (isCollapsed) {
                    return (
                      <li key={id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ring-1" style={{ background: `${TEAM_COLOR}22`, color: TEAM_LIGHT }}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold tracking-wider text-zinc-400">
                          {qp.completed ? "✅ CORRECT" : qp.guesses[0] === "(time's up)" ? "⏰ TIME'S UP" : "❌ INCORRECT"}
                        </span>
                        <span className="ml-auto text-xs font-bold" style={{ color: TEAM_ACCENT }}>{qp.score ?? 0} pts</span>
                      </li>
                    );
                  }

                  return (
                    <li key={id} ref={isActive ? activeCardRef : null} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className={`flex items-center gap-2 justify-center${isLocked ? "" : " flex-col text-center"}`}>
                        {isLocked && (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold ring-1" style={{ background: `${TEAM_COLOR}22`, color: TEAM_LIGHT }}>
                            {idx + 1}
                          </span>
                        )}
                        {!isAnswered && (
                          <span className="text-xs font-semibold tracking-wider text-zinc-400">
                            {isActive ? "YOUR TURN" : "🔒 LOCKED"}
                          </span>
                        )}
                        {isActive && <PlayClock timeRemaining={timeRemaining} />}
                      </div>

                      {!isLocked && (
                        <p className="mt-2 text-sm text-zinc-200 text-center" style={{ textWrap: "balance" } as React.CSSProperties}>{q?.prompt}</p>
                      )}

                      {isAnswered && answerPlayers.length > 0 && (
                        <div className={`mt-3 rounded-xl border p-3 text-center ${
                          qp.completed
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}>
                          {(() => {
                            const isRestored = qp.guesses[0] === "(restored)" || qp.guesses[0] === "(incorrect)";
                            return qp.completed ? (
                              <>
                                <div className="text-xs text-zinc-400">Correct!</div>
                                {!isRestored && <div className="mt-0.5 font-bold text-emerald-100">{qp.guesses[0]}</div>}
                                {isRestored && <div className="mt-0.5 font-bold text-emerald-100">{answerPlayers.map((p) => p.name).join(" · ")}</div>}
                              </>
                            ) : (
                              <>
                                <div className="text-xs text-zinc-400">
                                  {answerPlayers.length === 1 ? "Answer" : "Valid answers"}
                                </div>
                                <div className="mt-0.5 font-bold text-rose-100">
                                  {answerPlayers.map((p) => p.name).join(" · ")}
                                </div>
                                {!isRestored && (
                                  <div className="mt-0.5 text-xs text-zinc-400">
                                    You guessed: {qp.guesses[0] === "(time's up)" ? "⏰ Time's up!" : qp.guesses[0]}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="mt-1 text-xs font-semibold text-zinc-300">
                            {qp.score ?? 0} pts
                          </div>
                        </div>
                      )}

                      {isActive && (() => {
                        const hintRevealed = !!hintsRevealed[id];
                        const hintJerseys = answerPlayers.flatMap((p) => p.jersey ?? []);
                        const hasHint = hintJerseys.length > 0;
                        return (
                        <>
                          {hasHint && (
                            <div className="mt-2 flex justify-center">
                              {!hintRevealed ? (
                                Object.values(hintsRevealed).some(Boolean) ? (
                                  <span className="text-xs text-zinc-600">💡 Hint already used today</span>
                                ) : (
                                  <button
                                    className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:border-amber-600/60 hover:bg-amber-950/50 transition-colors"
                                    onClick={() => setHintsRevealed((prev) => ({ ...prev, [id]: true }))}
                                  >
                                    💡 Use hint (−50% score)
                                  </button>
                                )
                              ) : (
                                <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-1.5">
                                  <span className="text-xs text-amber-400 font-semibold">💡 Hint:</span>
                                  <span className="text-xs text-amber-200">Jersey #{hintJerseys.join(" or #")}</span>
                                  <span className="ml-2 text-xs text-amber-600">−50% score</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-2 flex flex-col gap-2">
                            <div className="relative w-full">
                              <input
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 focus:ring-4 focus:ring-zinc-700/30"
                                placeholder={sickoCurrent?.answerPool === "opponents" ? "Type a QB name…" : "Type a player name…"}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitGuess(); }}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                onFocus={() => { setTimeout(() => { if (activeCardRef.current) { const top = activeCardRef.current.getBoundingClientRect().top + window.scrollY - 16; window.scrollTo({ top, behavior: "smooth" }); } }, 350); }}
                                list="patriots-players-list"
                                autoFocus
                              />
                              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                                Enter
                              </div>
                            </div>
                            <button
                              className="w-full rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg"
                              style={{ background: TEAM_COLOR }}
                              onClick={submitGuess}
                            >
                              Guess
                            </button>
                          </div>
                        </>
                        );
                      })()}
                    </li>
                  );
                })}
              </ol>

              {/* Score breakdown */}
              {allAnswered && (
                <div ref={scoreRef} className="mt-6 rounded-2xl border border-zinc-700 bg-zinc-950/50 p-4">
                  <button
                    className="w-full flex flex-col items-center gap-1"
                    onClick={() => setScoreExpanded((v) => !v)}
                  >
                    <span className="text-xs font-semibold tracking-wider text-zinc-400">SCORE</span>
                    <span className="text-2xl font-black" style={{ color: TEAM_ACCENT }}>
                      {totalScore.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      {scoreExpanded ? "HIDE DETAILS ▲" : "SCORE DETAILS ▼"}
                    </span>
                  </button>
                  {scoreExpanded && <div className="mt-3 space-y-2">
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
                        <div key={id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-zinc-500 text-xs">Q{idx + 1}</span>
                              <span className={`shrink-0 font-semibold ${qp?.completed ? "text-emerald-400" : "text-rose-400"}`}>
                                {qp?.completed ? "✓" : isTimesUp ? "⏰" : "✗"}
                              </span>
                              <span className="truncate text-xs text-zinc-400">{q?.prompt}</span>
                            </div>
                            <span className={`shrink-0 font-bold ${qp?.completed ? "text-[#C60C30]" : "text-zinc-500"}`}>
                              {qp?.completed ? `+${qp.score}` : "0 pts"}
                            </span>
                          </div>
                          {qp?.completed && (
                            <div className="mt-2 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-zinc-300">
                                <span className="text-blue-300">{BASE_PTS}</span>
                                <span className="text-zinc-500">×</span>
                                <span className="text-emerald-300">({timeLeft ?? "?"}s/40s)</span>
                                {bonus > 0 && (
                                  <>
                                    <span className="text-zinc-500">+</span>
                                    <span style={{ color: "#BFC0BF" }}>{bonus}</span>
                                  </>
                                )}
                                {hintUsed && (
                                  <>
                                    <span className="text-zinc-500">→</span>
                                    <span className="text-amber-400">{rawScore}</span>
                                    <span className="text-zinc-500">÷ 2</span>
                                  </>
                                )}
                                <span className="text-zinc-500">=</span>
                                <span className="font-bold text-yellow-300">{qp.score}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 text-xs text-zinc-500">
                                <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-blue-400">{tierLabel(tier)}</span>
                                <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-emerald-400">{timeLeft ?? "?"}s remaining</span>
                                {bonus > 0 && (
                                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.5" style={{ color: "#BFC0BF" }}>
                                    {season < 2000 ? "1990s" : season < 2010 ? "2000s" : "2010s"} Bonus
                                  </span>
                                )}
                                {hintUsed && (
                                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-amber-400">💡 Hint used</span>
                                )}
                              </div>
                            </div>
                          )}
                          {!qp?.completed && isTimesUp && (
                            <p className="mt-1.5 text-xs text-zinc-500">Ran out of time — correct answer: {(sickoPlayerMap[id] ?? []).map(p => p.name).join(" · ")}</p>
                          )}
                          {!qp?.completed && !isTimesUp && qp?.guesses[0] && (
                            <p className="mt-1.5 text-xs text-zinc-500">You guessed: {qp.guesses[0]} — correct: {(sickoPlayerMap[id] ?? []).map(p => p.name).join(" · ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              )}

              {/* Football field progress */}
              {(() => {
                const correctCount = SICKO_ORDER.filter((id) => sickoProgress[id]?.completed).length;
                const isTouchdown = allAnswered && correctCount === 5;
                const isFieldGoal = allAnswered && correctCount === 4;
                const ballPct = 10 + correctCount * 16;
                return (
                  <div ref={fieldRef} className="mt-5">
                    <div className="relative h-20 overflow-hidden rounded-xl border border-zinc-700">
                      <div className="absolute inset-0 bg-emerald-800" />
                      <div className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#C0C0C0" }}>New England</span>
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/40 flex items-center justify-center" style={{ background: TEAM_COLOR }}>
                        <span className="text-[9px] font-black italic tracking-widest uppercase" style={{ writingMode: "vertical-rl", color: "#C0C0C0" }}>Patriots</span>
                      </div>
                      {[18, 26, 34, 42, 50, 58, 66, 74, 82].map((pos) => (
                        <div key={pos} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pos}%` }} />
                      ))}
                      {([18, 26, 34, 42, 50, 58, 66, 74, 82] as const).map((pos, i) => (
                        <div key={pos} className="absolute bottom-1 text-[8px] font-bold text-white/50 -translate-x-1/2" style={{ left: `${pos}%` }}>{["10", "20", "30", "40", "50", "40", "30", "20", "10"][i]}</div>
                      ))}
                      {correctCount > 0 && !isTouchdown && !isFieldGoal && (
                        <div className="absolute pointer-events-none transition-all duration-700 ease-out flex items-center" style={{ top: "50%", left: "10%", right: `calc(${100 - ballPct}% + 14px)`, transform: "translateY(-50%)", zIndex: 2 }}>
                          <div style={{ flex: 1, height: "5px", borderRadius: "3px 0 0 3px", background: `linear-gradient(to right, #001122, ${TEAM_COLOR})`, boxShadow: `0 0 10px ${TEAM_COLOR}88` }} />
                          <svg width="18" height="22" viewBox="0 0 18 22" style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${TEAM_COLOR}88)` }}>
                            <polygon points="0,2 18,11 0,20" fill={TEAM_COLOR} />
                          </svg>
                        </div>
                      )}
                      {isFieldGoal && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 80" preserveAspectRatio="none" style={{ zIndex: 4 }}>
                          <defs>
                            <clipPath id="fg-trail-clip-ne">
                              <rect x="74" y="0" height="80" style={{ width: 0, animation: "fg-clip-grow 1.1s ease-in 1.15s both" } as React.CSSProperties} />
                            </clipPath>
                          </defs>
                          <path d="M 74 40 Q 88 15 100 40" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="1.5 2.5" strokeLinecap="round" opacity="0.6" clipPath="url(#fg-trail-clip-ne)" />
                        </svg>
                      )}
                      {isFieldGoal ? (
                        <div className="absolute text-sm drop-shadow-lg" style={{ top: "50%", left: `${ballPct}%`, zIndex: 3, animation: "fg-follow 1.1s ease-in 1.15s both" }}>🏈</div>
                      ) : (
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-sm transition-all duration-700 ease-out drop-shadow-lg" style={{ left: `${ballPct}%`, zIndex: 3 }}>🏈</div>
                      )}
                      {isTouchdown && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                          <span className="text-base font-black italic tracking-widest text-white drop-shadow-lg" style={{ animation: "td-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) 1s both" }}>TOUCHDOWN!</span>
                        </div>
                      )}
                      {isFieldGoal && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                          <span className="text-base font-black italic tracking-widest text-white drop-shadow-lg" style={{ animation: "fg-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 1.9s both" }}>FIELD GOAL!</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="mt-6 flex justify-center">
                <button
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: TEAM_COLOR }}
                  onClick={share}
                >
                  {copied ? "Copied!" : "Share Results"}
                </button>
              </div>
            </>}
            </>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-zinc-500">
          #PatriotsSicko
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

    </main>
  );
}
