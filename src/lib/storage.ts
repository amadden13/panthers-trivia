export type DayProgress = {
    date: string;           // YYYY-MM-DD
    guesses: string[];
    cluesUsed: number;      // 1..6
    completed: boolean;
    firstSolvedCluesUsed?: number; // NEW
  };
  
  type StoreShape = {
    days: Record<string, DayProgress>;
  };
  
  const KEY = "panthers_daily_v1";
  
  function readStore(): StoreShape {
    if (typeof window === "undefined") return { days: {} };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { days: {} };
      const parsed = JSON.parse(raw) as StoreShape;
      return parsed?.days ? parsed : { days: {} };
    } catch {
      return { days: {} };
    }
  }
  
  function writeStore(store: StoreShape) {
    localStorage.setItem(KEY, JSON.stringify(store));
  }
  
  export function getDayProgress(date: string): DayProgress | null {
    const store = readStore();
    return store.days[date] ?? null;
  }
  
  export function upsertDayProgress(progress: DayProgress) {
    const store = readStore();
    store.days[progress.date] = progress;
    writeStore(store);
  }
  
  export function getAllProgress(): DayProgress[] {
    const store = readStore();
    return Object.values(store.days).sort((a, b) => a.date.localeCompare(b.date));
  }