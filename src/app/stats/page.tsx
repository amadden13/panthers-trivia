"use client";

import Link from "next/link";
import { useMemo } from "react";
import { chicagoYMD } from "@/lib/time";
import { getAllProgress, type Mode } from "@/lib/storage";

function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMode(): Mode {
  if (typeof window === "undefined") return "normal";
  const m = localStorage.getItem("panthers_mode_v1");
  return m === "sicko" ? "sicko" : "normal";
}

const SICKO_ORDER = ["q1", "q2", "q3", "q4"] as const;

export default function StatsPage() {
  const today = chicagoYMD();
  const mode = useMemo(() => getMode(), []);
  const progress = getAllProgress(mode);

  // Build lookup
  const byDate = new Map(progress.map((p: any) => [p.date, p]));

  function sickoSolvedCount(p: any): number {
    const qs = p?.questions ?? {};
    return SICKO_ORDER.reduce((acc, id) => acc + (qs?.[id]?.completed ? 1 : 0), 0);
  }

  function isDayComplete(p: any): boolean {
    if (!p) return false;

    // New format: questions object
    if (p?.questions) {
      if (mode === "normal") {
        return !!p.questions?.main?.completed;
      }
      // sicko
      return SICKO_ORDER.every((id) => !!p.questions?.[id]?.completed);
    }

    // Legacy fallback (older normal format)
    return mode === "normal" ? !!p.completed : false;
  }

  function isDayInProgress(p: any): boolean {
    if (!p) return false;

    if (p?.questions) {
      if (mode === "normal") {
        const main = p.questions?.main;
        return !!main && (!main.completed || (main.guesses?.length ?? 0) > 0);
      }
      // sicko: any activity but not fully complete
      const solved = sickoSolvedCount(p);
      const anyGuesses = SICKO_ORDER.some((id) => (p.questions?.[id]?.guesses?.length ?? 0) > 0);
      return (solved > 0 || anyGuesses) && !isDayComplete(p);
    }

    // Legacy fallback
    return mode === "normal" ? (p.guesses?.length ?? 0) > 0 && !p.completed : false;
  }

  // Streak
  let streak = 0;
  let cursor = today;
  while (true) {
    const p = byDate.get(cursor);
    if (isDayComplete(p)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, -i));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Stats ({mode})</h1>
        <Link className="underline opacity-80 hover:opacity-100" href="/">
          Back
        </Link>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="text-sm opacity-80">Current streak</div>
        <div className="text-3xl font-bold">{streak}</div>
        {mode === "sicko" && (
          <div className="mt-2 text-sm opacity-80">
            (A day counts only if all 4 questions are solved)
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="font-semibold">Last 30 days</div>
        <div className="mt-3 space-y-2 text-sm">
          {last30.map((d) => {
            const p: any = byDate.get(d);

            let status = "⬜ not played";

            if (p) {
              if (isDayComplete(p)) {
                if (mode === "normal") {
                  const clues = p.cluesUsed ?? "-";
                  status = `✅ solved (${clues} clues)`;
                } else {
                  status = `✅ solved (4/4)`;
                }
              } else if (isDayInProgress(p)) {
                if (mode === "normal") {
                  const clues = p.cluesUsed ?? "-";
                  status = `🟨 in progress (${clues} clues)`;
                } else {
                  const solved = sickoSolvedCount(p);
                  status = `🟨 in progress (${solved}/4 solved)`;
                }
              } else {
                // Exists but no activity / weird edge
                status = "⬜ not played";
              }
            }

            return (
              <div key={d} className="flex items-center justify-between">
                <span className="opacity-80">{d}</span>
                <span>{status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}