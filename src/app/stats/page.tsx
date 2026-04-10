"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
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
  touchdowns: number;
  field_goals: number;
};

type ProfileCard = {
  username: string;
  birthdate: string | null;
  total_score: number;
  days_played: number;
  hints_used: number;
  questions_correct: number;
  questions_total: number;
  touchdowns: number;
  field_goals: number;
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
  const [profileCard, setProfileCard] = useState<ProfileCard | null>(null);

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

  async function openProfile(username: string) {
    const entry = allTime.find((r) => r.username === username);
    if (!entry) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("birthdate")
      .eq("username", username)
      .maybeSingle();

    setProfileCard({
      username,
      birthdate: (profile as any)?.birthdate ?? null,
      total_score: entry.total_score,
      days_played: entry.days_played,
      hints_used: entry.hints_used,
      questions_correct: entry.questions_correct,
      questions_total: entry.questions_total,
      touchdowns: entry.touchdowns,
      field_goals: entry.field_goals,
    });
  }

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
            grouped[username] = { username, total_score: 0, days_played: 0, hints_used: 0, questions_correct: 0, questions_total: 0, touchdowns: 0, field_goals: 0 };
          }
          const qc = Number(row.questions_correct ?? 0);
          grouped[username].total_score += Number(row.total_score);
          grouped[username].days_played += 1;
          grouped[username].hints_used += row.hint_used ? 1 : 0;
          grouped[username].questions_correct += qc;
          grouped[username].questions_total += 5;
          if (qc === 5) grouped[username].touchdowns += 1;
          if (qc === 4) grouped[username].field_goals += 1;
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
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <div className="mb-8">
          <Header activePage="leaderboard" />
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-zinc-700 bg-zinc-950/50 p-1">
          {(["daily", "alltime"] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === t ? "bg-[#0085CA] text-white" : "text-zinc-400 hover:text-zinc-200"
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
              <span className="text-xl font-bold text-white group-hover:text-zinc-300 transition-colors">
                {formattedDate}
              </span>
              <span className="text-zinc-500 text-lg group-hover:text-zinc-400 transition-colors">›</span>
            </label>
            {selectedDate !== today && (
              <button
                className="text-xs font-semibold text-[#0085CA] hover:text-[#33A0D8] transition-colors"
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
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  That day's questions
                </p>
                <ol className="space-y-2">
                  {dayPuzzle.questions.map((q, i) => (
                    <li key={q.id} className="flex gap-3 text-sm">
                      <span className="shrink-0 text-zinc-500">Q{i + 1}</span>
                      <span className="text-zinc-300">{q.prompt}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Daily leaderboard table */}
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              {loadingDaily ? (
                <div className="py-16 text-center text-sm text-zinc-500">Loading...</div>
              ) : daily.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500">No scores for this date.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] text-zinc-500">
                      <th className="px-2 py-3 text-left font-semibold">#</th>
                      <th className="px-2 py-3 text-left font-semibold">Player</th>
                      <th className="px-2 py-3 text-center font-semibold">Results</th>
                      <th className="px-2 py-3 text-center font-semibold">Hint</th>
                      <th className="px-2 py-3 text-right font-semibold">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-2 py-3 text-center w-8">
                          <span className={i < 3 ? "text-base" : "text-zinc-500"}>{medal(i)}</span>
                        </td>
                        <td className="px-2 py-3 font-semibold text-zinc-100">{row.username}</td>
                        <td className="px-2 py-3 text-center">
                          <span className="flex items-center justify-center gap-0.5">
                            {row.question_results.map((correct, qi) => (
                              <span key={qi} className={`font-bold ${correct ? "text-emerald-400" : "text-rose-400"}`}>
                                {correct ? "✓" : "✗"}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          {row.hint_used
                            ? <span className="text-amber-400">💡 {row.hint_question ? row.hint_question.toUpperCase() : ""}</span>
                            : <span className="text-zinc-600">—</span>
                          }
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-[#0085CA]">{row.total_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              {loadingAllTime ? (
                <div className="py-16 text-center text-sm text-zinc-500">Loading...</div>
              ) : allTime.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500">No scores yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] text-zinc-500">
                      <th className="px-2 py-3 text-left font-semibold">#</th>
                      <th className="px-2 py-3 text-left font-semibold">Player</th>
                      {(["total_score", "correctPct", "days_played"] as const).map((key) => (
                        <th
                          key={key}
                          className={`px-2 py-3 text-right font-semibold cursor-pointer select-none transition-colors hover:text-zinc-200 ${sortKey === key ? "text-white" : "text-zinc-500"}`}
                          onClick={() => handleSort(key)}
                        >
                          {key === "days_played" ? "Days" : key === "correctPct" ? "Correct" : "Points"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAllTime.map((row, i) => {
                      const correctPct = row.questions_total > 0
                        ? Math.round((row.questions_correct / row.questions_total) * 100)
                        : 0;
                      const maxPts = row.days_played * 500;
                      return (
                        <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                          <td className="px-2 py-3 text-center w-8">
                            <span className={i < 3 ? "text-base" : "text-zinc-500"}>{medal(i)}</span>
                          </td>
                          <td className="px-2 py-3">
                            <button
                              className="font-semibold text-zinc-100 hover:text-[#0085CA] transition-colors text-left"
                              onClick={() => openProfile(row.username)}
                            >
                              {row.username}
                            </button>
                          </td>
                          <td className={`px-2 py-3 text-right font-bold group cursor-default relative ${sortKey === "total_score" ? "text-[#0085CA]" : "text-zinc-400"}`}>
                            <span className="group-hover:invisible">{row.total_score.toLocaleString()}</span>
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline text-[11px] font-normal text-zinc-300 whitespace-nowrap">
                              {row.total_score.toLocaleString()} / {maxPts.toLocaleString()}
                            </span>
                          </td>
                          <td className={`px-2 py-3 text-right group cursor-default relative font-bold ${sortKey === "correctPct" ? "text-[#0085CA]" : "text-zinc-400"}`}>
                            <span className="group-hover:invisible">{correctPct}%</span>
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline text-[11px] font-normal text-zinc-300 whitespace-nowrap">
                              {row.questions_correct} / {row.questions_total}
                            </span>
                          </td>
                          <td className={`px-2 py-3 text-right font-bold ${sortKey === "days_played" ? "text-[#0085CA]" : "text-zinc-400"}`}>
                            {row.days_played}
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

      {/* Profile card modal */}
      {profileCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setProfileCard(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <button
              className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300"
              onClick={() => setProfileCard(null)}
            >
              ✕
            </button>

            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Player Profile</p>
              <h3 className="mt-1 text-xl font-black text-white">{profileCard.username}</h3>
              {profileCard.birthdate && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  🎂 {new Date(profileCard.birthdate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Days Played", value: profileCard.days_played },
                { label: "Total Points", value: profileCard.total_score.toLocaleString() },
                {
                  label: "Correct %",
                  value: profileCard.questions_total > 0
                    ? `${Math.round((profileCard.questions_correct / profileCard.questions_total) * 100)}%`
                    : "—"
                },
                {
                  label: "Hint %",
                  value: profileCard.days_played > 0
                    ? `${Math.round((profileCard.hints_used / profileCard.days_played) * 100)}%`
                    : "—"
                },
                { label: "Touchdowns", value: profileCard.touchdowns },
                { label: "Field Goals", value: profileCard.field_goals },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
                  <p className="mt-1 text-lg font-black text-[#0085CA]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
