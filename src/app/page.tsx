"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PLAYERS } from "@/data/players";
import { PUZZLES } from "@/data/puzzles";
import { chicagoYMD } from "@/lib/time";
import { getDayProgress, upsertDayProgress } from "@/lib/storage";
import { PUZZLES_SICKO_2015 } from "@/data/puzzles_sicko_2015";

function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findPuzzle(date: string) {
  return PUZZLES.find((p) => p.date === date) ?? null;
}

export default function HomePage() {
  const today = useMemo(() => chicagoYMD(), []);

  const [mode, setMode] = useState<"normal" | "sicko">("normal");
  const puzzleList = mode === "sicko" ? PUZZLES_SICKO_2015 : PUZZLES;
  const puzzle = useMemo(() => puzzleList.find((p) => p.date === today) ?? null, [puzzleList, today]);
  //
  // const puzzle = useMemo(() => findPuzzle(today), [today]);

  // Guard: puzzle missing
  if (!puzzle) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Panthers Daily</h1>
        <p className="mt-3 text-sm opacity-80">
          No puzzle found for today ({today}). Run <code>npm run gen:puzzles</code> to generate the schedule.
        </p>
      </main>
    );
  }

  const player = PLAYERS.find((x) => x.id === puzzle.playerId);

  // Guard: player missing
  if (!player) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Panthers Daily</h1>
        <p className="mt-3 text-sm opacity-80">
          Puzzle references a missing player: <code>{puzzle.playerId}</code>
        </p>
      </main>
    );
  }

  const maxClues = puzzle.clues.length;

  const [input, setInput] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [cluesUsed, setCluesUsed] = useState(1);
  const [completed, setCompleted] = useState(false as boolean);

  useEffect(() => {
    const saved = getDayProgress(puzzle.date);
    if (saved) {
      setGuesses(saved.guesses);
      setCluesUsed(saved.cluesUsed);
      setCompleted(saved.completed);
    }
  }, [puzzle.date]);

  const visibleClues = puzzle.clues.slice(0, cluesUsed);

  function persist(next: { guesses: string[]; cluesUsed: number; completed: boolean }) {
    upsertDayProgress({
      date: puzzle!.date,
      guesses: next.guesses,
      cluesUsed: next.cluesUsed,
      completed: next.completed,
    });
  }

  function submitGuess() {
    const guess = input.trim();
    if (!guess || completed) return;
  
    const nextGuesses = [...guesses, guess];
    const isCorrect = player && normalizeName(guess) === normalizeName(player.name);
  
    let nextCluesUsed = cluesUsed;
    let nextCompleted: boolean = completed;
  
    if (isCorrect) {
      nextCompleted = true;
      // keep cluesUsed as-is (the number of clues shown when solved)
    } else {
      nextCluesUsed = Math.min(cluesUsed + 1, maxClues);
    }
  
    setGuesses(nextGuesses);
    setCluesUsed(nextCluesUsed);
    setCompleted(nextCompleted);
    setInput("");
  
    persist({
      guesses: nextGuesses,
      cluesUsed: nextCluesUsed,
      completed: nextCompleted,
    });
  }

  async function share() {
    if (!puzzle) return; // Ensure puzzle is not null

    const blocks = Array.from({ length: maxClues }, (_, i) => (i < cluesUsed ? "🟩" : "⬛")).join("");
    const score = completed
      ? `Solved in ${cluesUsed}/${maxClues} clues`
      : `Unsolved (${cluesUsed}/${maxClues} clues shown)`;

    const text = `Panthers Daily ${puzzle.date}\n${blocks}\n${score}\n#KeepPounding`;

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied results to clipboard!");
      }
    } catch {
      // ignore share errors
    }
  }

  

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-200">
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]" />
              PANTHERS DAILY
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              Keep Pounding.
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Guess the Carolina Panthers player. Wrong guesses reveal another clue.
            </p>
          </div>

          <button
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
              mode === "sicko" ? "border-sky-400 bg-sky-500/10 text-sky-200" : "border-slate-700 text-slate-200"
            }`}
            onClick={() => setMode(mode === "normal" ? "sicko" : "normal")}
          >
            {mode === "normal" ? "Normal" : "Sicko (2015)"}
          </button>
  
          <div className="flex items-center gap-3">
            <Link
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:border-sky-500/40 hover:bg-slate-900"
              href="/stats"
            >
              Stats
            </Link>
          </div>
        </header>
  
        {/* Game Card */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-wider text-slate-400">
                TODAY
              </div>
              <div className="text-lg font-semibold">{puzzle.date}</div>
            </div>
  
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
              <div className="text-xs text-slate-400">Clues</div>
              <div className="text-sm font-semibold text-sky-200">
                {cluesUsed}/{maxClues}
              </div>
            </div>
          </div>
  
          {/* Clues */}
          <ol className="mt-5 space-y-2">
            {visibleClues.map((c, idx) => (
              <li
                key={idx}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200"
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/15 text-xs font-bold text-sky-200 ring-1 ring-sky-500/30">
                  {idx + 1}
                </span>
                {c}
              </li>
            ))}
          </ol>
  
          {/* Guess input */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full">
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100 placeholder:text-slate-500 outline-none ring-sky-500/30 focus:border-sky-500/60 focus:ring-4 disabled:opacity-60"
                placeholder={completed ? "Solved!" : "Type a player name…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitGuess();
                }}
                disabled={completed}
                list="players-list"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                Enter
              </div>
            </div>
  
            <datalist id="players-list">
              {PLAYERS.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
  
            <button
              className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_30px_rgba(56,189,248,0.35)] hover:bg-sky-400 disabled:opacity-50"
              onClick={submitGuess}
              disabled={completed}
            >
              Guess
            </button>
          </div>
  
          {/* Result */}
          {completed && (
            <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="text-xs font-semibold tracking-wider text-emerald-200">
                CORRECT
              </div>
              <div className="mt-1 text-lg font-bold text-emerald-100">
                {player.name}
              </div>
              <div className="mt-1 text-sm text-emerald-200/80">
                Solved in {cluesUsed}/{maxClues} clues.
              </div>
            </div>
          )}
  
          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-sky-500/40 hover:bg-slate-950"
              onClick={share}
            >
              Share
            </button>
  
            <button
              className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-2 text-sm font-semibold text-slate-400 disabled:opacity-40"
              disabled={completed}
              onClick={() => {
                setGuesses([]);
                setCluesUsed(1);
                setCompleted(false);
                setInput("");
                persist({ guesses: [], cluesUsed: 1, completed: false });
              }}
            >
              Reset today
            </button>
          </div>
  
          {/* Guesses list */}
          {guesses.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold tracking-wider text-slate-400">
                GUESSES
              </div>
              <ul className="mt-3 space-y-2">
                {guesses.map((g, i) => (
                  <li
                    key={`${g}-${i}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-sm text-slate-200"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
  
        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          Built for Panthers fans • <span className="text-sky-300/80">#KeepPounding</span>
        </footer>
      </div>
    </main>
  );
}