import { PLAYERS } from "../src/data/players";
import { writeFileSync } from "node:fs";

type Puzzle = {
  date: string;      // YYYY-MM-DD
  playerId: string;
  clues: string[];
};

function ymd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Deterministic PRNG (Mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic shuffle so the schedule is fixed
function shuffledIds(seed: number): string[] {
  const rand = mulberry32(seed);
  const arr = PLAYERS.map((p) => p.id);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDraft(draft?: import("../src/data/players").DraftInfo): string | null {
    if (!draft) return null;
    if ("udfa" in draft && draft.udfa) {
      return `Draft: UDFA${draft.year ? ` (${draft.year})` : ""}`;
    }
    return `Draft: ${draft.year} • Round ${draft.round}, Pick ${draft.pick}`;
  }
  
  function formatJersey(jersey?: number[]): string | null {
    if (!jersey || jersey.length === 0) return null;
    const uniq = Array.from(new Set(jersey));
    return `Jersey: #${uniq.join(" / #")}`;
  }
  
  function pickFact(facts?: string[]): string | null {
    if (!facts || facts.length === 0) return null;
    // pick the first for consistency (or randomize later)
    return `Fun fact: ${facts[0]}`;
  }
  
  function makeClues(playerId: string): string[] {
    const p = PLAYERS.find((x) => x.id === playerId)!;
  
    const clues: (string | null)[] = [
      `Position: ${p.pos}`,
      `Era: ${p.era}`,
      p.college ? `College: ${p.college}` : null,
      formatDraft(p.draft),
      formatJersey(p.jersey),
      pickFact(p.facts),
    ];
  
    // Fallback clues to always reach 6 total
    const [first, ...rest] = p.name.replace(".", "").split(" ");
    const last = rest.length ? rest[rest.length - 1] : "";
    const fallback: string[] = [
      `First name starts with: ${first[0] ?? "?"}`,
      `Last name starts with: ${last[0] ?? "?"}`,
      `Initials: ${first[0] ?? "?"}.${last[0] ?? "?"}.`,
    ];
  
    const final = clues.filter(Boolean) as string[];
    while (final.length < 6 && fallback.length) final.push(fallback.shift()!);
  
    // Keep it capped at 6 clues
    return final.slice(0, 6);
  }

function generateSchedule({
  startDateUTC,
  days,
  seed,
}: {
  startDateUTC: Date;
  days: number;
  seed: number;
}): Puzzle[] {
  const ids = shuffledIds(seed);

  const puzzles: Puzzle[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDateUTC);
    d.setUTCDate(d.getUTCDate() + i);

    const date = ymd(d);
    const playerId = ids[i % ids.length]; // repeat cycle if days > players
    puzzles.push({ date, playerId, clues: makeClues(playerId) });
  }
  return puzzles;
}

// Start schedule on 2026-02-20 (UTC date string; app displays using America/Chicago)
const puzzles = generateSchedule({
  startDateUTC: new Date(Date.UTC(2026, 1, 20)), // months are 0-based; 1 = Feb
  days: 180,
  seed: 13071995, // any fixed seed you like
});

// Write a TS module so imports are easy
const out = `export type Puzzle = { date: string; playerId: string; clues: string[] };\nexport const PUZZLES: Puzzle[] = ${JSON.stringify(
  puzzles,
  null,
  2
)} as const;\n`;

writeFileSync("src/data/puzzles.ts", out, "utf8");
console.log(`Wrote ${puzzles.length} puzzles to src/data/puzzles.ts`);