import Link from "next/link";

const TEAM_COLOR = "#002244";
const TEAM_ACCENT = "#C60C30";

export default function PatriotsAboutPage() {
  return (
    <main className="min-h-screen bg-transparent text-zinc-100">
      <div className="mx-auto max-w-2xl p-6">
        <header className="mb-8">
          {/* Logo row */}
          <div className="relative flex items-center justify-center gap-2.5 mb-4">
            <Link href="/patriots" className="flex items-center gap-2.5">
              <span className="text-2xl font-black tracking-tight text-white">SICKO</span>
              <span className="rounded px-2 py-0.5 text-sm font-black tracking-widest text-white" style={{ background: TEAM_COLOR }}>
                TRIVIA
              </span>
            </Link>
          </div>

          {/* Nav bar */}
          <nav className="relative flex items-center border-b border-zinc-800 pb-4 mb-2">
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
              <Link href="/" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                Home
              </Link>
              <Link href="/patriots" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                Patriots
              </Link>
              <Link href="/patriots/stats" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-white">
                Leaderboard
              </Link>
              <Link href="/patriots/about" className="px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 text-white">
                About
              </Link>
            </div>
          </nav>
        </header>

        <div className="space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-black text-white mb-3">About Patriots Trivia</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Think you know Patriots football? Prove it. Every day brings 5 new questions spanning the full history of the New England Patriots — from the Parcells rebuild of the mid-90s to the dynasty years, the six Super Bowl titles, and everything in between.
            </p>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            Compete against fellow Patriots fans daily and climb the all-time leaderboard. Get all 5 right and you&apos;re not just a fan — you&apos;re the ultimate <span className="text-white font-semibold">Patriots Sicko</span>.
          </p>

          <div className="pt-2">
            <Link
              href="/patriots"
              className="inline-block rounded-xl px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: TEAM_ACCENT }}
            >
              Play Today&apos;s Quiz
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
