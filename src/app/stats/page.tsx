"use client";

import Link from "next/link";
import { chicagoYMD } from "@/lib/time";
import { getAllProgress } from "@/lib/storage";

function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function StatsPage() {
  const today = chicagoYMD();
  const progress = getAllProgress();

  const byDate = new Map(progress.map((p) => [p.date, p]));

  let streak = 0;
  let cursor = today;
  while (true) {
    const p = byDate.get(cursor);
    if (p?.completed) {
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
        <h1 className="text-2xl font-bold">Stats</h1>
        <Link className="underline opacity-80 hover:opacity-100" href="/">
          Back
        </Link>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="text-sm opacity-80">Current streak</div>
        <div className="text-3xl font-bold">{streak}</div>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="font-semibold">Last 30 days</div>
        <div className="mt-3 space-y-2 text-sm">
          {last30.map((d) => {
            const p = byDate.get(d);
            const status = p?.completed
              ? `✅ ${p.cluesUsed} clues`
              : p
              ? `🟨 in progress (${p.cluesUsed} clues)`
              : "⬜ not played";
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