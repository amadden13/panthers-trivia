export type Mode = "normal" | "sicko";

export type QuestionProgress = {
  guesses: string[];
  completed: boolean;
  score?: number; // 0–1000, sicko mode only; based on speed: Math.round(1000 * (timeRemaining / 15))
};

export type DayProgress = {
  mode: Mode;
  date: string;
  questions: Record<string, QuestionProgress>; // "main" OR "q1".."q4"
  cluesUsed?: number; // keep for normal only
  firstSolvedCluesUsed?: number;
};

type StoreShape = {
  days: Record<Mode, Record<string, DayProgress>>;
};

const KEY = "panthers_daily_v1";

function emptyStore(): StoreShape {
  return { days: { normal: {}, sicko: {} } };
}

function isMode(x: any): x is Mode {
  return x === "normal" || x === "sicko";
}

function readStore(): StoreShape {
  if (typeof window === "undefined") return emptyStore();

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();

    const parsed = JSON.parse(raw) as any;
    const days = parsed?.days;

    // Back-compat: old format was { days: Record<string, DayProgress> }
    if (days && typeof days === "object" && !days.normal && !days.sicko) {
      // Migrate old progress into "normal" by default
      const migrated: StoreShape = { days: { normal: days ?? {}, sicko: {} } };
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }

    // New format (defensive if keys missing/corrupt)
    const normal =
      days?.normal && typeof days.normal === "object" ? days.normal : {};
    const sicko =
      days?.sicko && typeof days.sicko === "object" ? days.sicko : {};

    return { days: { normal, sicko } };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreShape) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function getDayProgress(mode: Mode, date: string): DayProgress | null {
  const store = readStore();
  if (!isMode(mode)) return null;
  return store.days[mode]?.[date] ?? null;
}

export function upsertDayProgress(progress: DayProgress) {
  const store = readStore();

  // Ensure mode buckets exist even if store was corrupted
  if (!store.days.normal) store.days.normal = {};
  if (!store.days.sicko) store.days.sicko = {};

  store.days[progress.mode][progress.date] = progress;
  writeStore(store);
}

export function getAllProgress(mode: Mode): DayProgress[] {
  const store = readStore();
  if (!isMode(mode)) return [];
  return Object.values(store.days[mode] ?? {}).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}