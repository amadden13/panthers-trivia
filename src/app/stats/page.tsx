"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { chicagoYMD } from "@/lib/time";
import { PUZZLES_SICKO } from "@/data/puzzles_sicko";

type DailyEntry = {
  username: string;
  total_score: number;
  question_results: boolean[];
  hint_used: boolean;
  hint_question: string | null;
};

type AllTimeEntry = {
  username: string;
  total_score: number;
  days_played: number;
  hints_used: number;
  questions_correct: number;
  questions_total: number;
};

export default function LeaderboardPage() {
  const supabase = createClient();
  const today = chicagoYMD();

  const [selectedDate, setSelectedDate] = useState(today);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [allTime, setAllTime] = useState<AllTimeEntry[]>([]);
  const [tab, setTab] = useState<"daily" | "alltime">("daily");
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingAllTime, setLoadingAllTime] = useState(true);
  const [sortKey, setSortKey] = useState<"total_score" | "days_played" | "correctPct" | "hintPct">("total_score");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedAllTime = [...allTime].sort((a, b) => {
    const aVal = sortKey === "correctPct"
      ? (a.questions_total > 0 ? a.questions_correct / a.questions_total : 0)
      : sortKey === "hintPct"
      ? (a.days_played > 0 ? a.hints_used / a.days_played : 0)
      : a[sortKey];
    const bVal = sortKey === "correctPct"
      ? (b.questions_total > 0 ? b.questions_correct / b.questions_total : 0)
      : sortKey === "hintPct"
      ? (b.days_played > 0 ? b.hints_used / b.days_played : 0)
      : b[sortKey];
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  // Reload daily whenever selected date changes
  useEffect(() => {
    async function loadDaily() {
      setLoadingDaily(true);
      const { data: scoreData, error } = await supabase
        .from("scores")
        .select("user_id, total_score, question_results, hint_used, hint_question")
        .eq("date", selectedDate)
        .order("total_score", { ascending: false })
        .limit(25);
      if (error) console.error("Daily fetch error:", error);

      if (scoreData && scoreData.length > 0) {
        const userIds = scoreData.map((r: any) => r.user_id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const profileMap: Record<string, string> = {};
        for (const p of profileData ?? []) {
          profileMap[(p as any).id] = (p as any).username;
        }

        setDaily(
          scoreData.map((row: any) => ({
            username: profileMap[row.user_id] ?? "Anonymous",
            total_score: row.total_score,
            question_results: Array.isArray(row.question_results) ? row.question_results : [false, false, false, false],
            hint_used: row.hint_used,
            hint_question: row.hint_question ?? null,
          }))
        );
      } else {
        setDaily([]);
      }
      setLoadingDaily(false);
    }
    loadDaily();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Load all-time once
  useEffect(() => {
    async function loadAllTime() {
      setLoadingAllTime(true);
      const { data: scoreData } = await supabase
        .from("scores")
        .select("user_id, total_score, questions_correct, hint_used");

      if (scoreData && scoreData.length > 0) {
        const userIds = [...new Set(scoreData.map((r: any) => r.user_id))];
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const profileMap: Record<string, string> = {};
        for (const p of profileData ?? []) {
          profileMap[(p as any).id] = (p as any).username;
        }

        const grouped: Record<string, AllTimeEntry> = {};
        for (const row of scoreData as any[]) {
          const username = profileMap[row.user_id] ?? "Anonymous";
          if (!grouped[username]) {
            grouped[username] = { username, total_score: 0, days_played: 0, hints_used: 0, questions_correct: 0, questions_total: 0 };
          }
          grouped[username].total_score += Number(row.total_score);
          grouped[username].days_played += 1;
          grouped[username].hints_used += row.hint_used ? 1 : 0;
          grouped[username].questions_correct += Number(row.questions_correct ?? 0);
          grouped[username].questions_total += 4;
        }
        setAllTime(
          Object.values(grouped).sort((a, b) => b.total_score - a.total_score).slice(0, 25)
        );
      }
      setLoadingAllTime(false);
    }
    loadAllTime();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function medal(rank: number) {
    if (rank === 0) return "🥇";
    if (rank === 1) return "🥈";
    if (rank === 2) return "🥉";
    return `${rank + 1}`;
  }

  const isPast = selectedDate < today;
  const dayPuzzle = PUZZLES_SICKO.find((d) => d.date === selectedDate);

  const formattedDate = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-black tracking-tight text-white">PANTHERS</span>
            <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-black tracking-widest text-white">
              TRIVIA
            </span>
          </div>
          <Link
            className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 hover:text-white"
            href="/"
          >
            ← Back
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-slate-700 bg-slate-950/50 p-1">
          {(["daily", "alltime"] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === t ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "daily" ? "Daily Sickos" : " All-Time Sickos"}
            </button>
          ))}
        </div>

        {/* Date picker — daily only */}
        {tab === "daily" && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <label className="relative inline-flex items-center gap-2 cursor-pointer group">
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
              <span className="text-xl font-bold text-white group-hover:text-slate-300 transition-colors">
                {formattedDate}
              </span>
              <span className="text-slate-500 text-lg group-hover:text-slate-400 transition-colors">›</span>
            </label>
            {selectedDate !== today && (
              <button
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                onClick={() => setSelectedDate(today)}
              >
                Back to today
              </button>
            )}
          </div>
        )}

        {tab === "daily" ? (
          <>

            {/* Questions — only shown for past dates */}
            {isPast && dayPuzzle && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  That day's questions
                </p>
                <ol className="space-y-2">
                  {dayPuzzle.questions.map((q, i) => (
                    <li key={q.id} className="flex gap-3 text-sm">
                      <span className="shrink-0 text-slate-500">Q{i + 1}</span>
                      <span className="text-slate-300">{q.prompt}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Leaderboard table */}
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              {loadingDaily ? (
                <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
              ) : daily.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">No scores for this date.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500">
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Player</th>
                      <th className="px-4 py-3 text-center font-semibold">Results</th>
                      <th className="px-4 py-3 text-center font-semibold">Hint</th>
                      <th className="px-4 py-3 text-right font-semibold">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-center text-sm w-10">
                          <span className={i < 3 ? "text-base" : "text-slate-500"}>{medal(i)}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-100">{row.username}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="flex items-center justify-center gap-1">
                            {row.question_results.map((correct, qi) => (
                              <span key={qi} className={`text-xs font-bold ${correct ? "text-emerald-400" : "text-rose-400"}`}>
                                {correct ? "✓" : "✗"}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs">
                          {row.hint_used
                            ? <span className="text-amber-400">💡 {row.hint_question ? row.hint_question.toUpperCase() : ""}</span>
                            : <span className="text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sky-400">{row.total_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              {loadingAllTime ? (
                <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
              ) : allTime.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">No scores yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-500">
                      <th className="px-2 py-3 text-left font-semibold">#</th>
                      <th className="px-2 py-3 text-left font-semibold">Player</th>
                      {(["total_score", "correctPct", "hintPct"] as const).map((key) => (
                        <th
                          key={key}
                          className={`px-2 py-3 text-right font-semibold cursor-pointer select-none transition-colors hover:text-slate-200 ${sortKey === key ? "text-white" : "text-slate-500"}`}
                          onClick={() => handleSort(key)}
                        >
                          {key === "hintPct" ? "Hint" : key === "correctPct" ? "Correct" : "Points"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAllTime.map((row, i) => {
                      const correctPct = row.questions_total > 0
                        ? Math.round((row.questions_correct / row.questions_total) * 100)
                        : 0;
                      const hintPct = row.days_played > 0
                        ? Math.round((row.hints_used / row.days_played) * 100)
                        : 0;
                      const maxPts = row.days_played * 4000;
                      return (
                      <tr key={i} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
                        <td className="px-2 py-3 text-center w-8">
                          <span className={i < 3 ? "text-base" : "text-slate-500"}>{medal(i)}</span>
                        </td>
                        <td className="px-2 py-3 font-semibold text-slate-100">{row.username}</td>
                        <td className={`px-2 py-3 text-right font-bold group cursor-default relative ${sortKey === "total_score" ? "text-sky-400" : "text-slate-400"}`}>
                          <span className="group-hover:invisible">{row.total_score.toLocaleString()}</span>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline text-[11px] font-normal text-slate-300 whitespace-nowrap">
                            {row.total_score.toLocaleString()} / {maxPts.toLocaleString()}
                          </span>
                        </td>
                        <td className={`px-2 py-3 text-right group cursor-default relative font-bold ${sortKey === "correctPct" ? "text-sky-400" : "text-slate-400"}`}>
                          <span className="group-hover:invisible">{correctPct}%</span>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline text-[11px] font-normal text-slate-300 whitespace-nowrap">
                            {row.questions_correct} / {row.questions_total}
                          </span>
                        </td>
                        <td className={`px-2 py-3 text-right font-bold group cursor-default relative ${sortKey === "hintPct" ? "text-sky-400" : "text-slate-400"}`}>
                          <span className="group-hover:invisible">{hintPct}%</span>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline text-[11px] font-normal text-slate-300 whitespace-nowrap">
                            {row.hints_used} / {row.days_played}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
