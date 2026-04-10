import Link from "next/link";
import Header from "@/components/Header";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent text-zinc-100">
      <div className="mx-auto max-w-2xl p-6">
        <header className="mb-8">
          <Header activePage="about" />
        </header>

        <div className="space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-black text-white mb-3">About Panthers Trivia</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Think you know Panthers football? Prove it. Every day brings 5 new questions spanning the full history of the Carolina Panthers — from the expansion years of the mid-90s to the Super Bowl runs, the dark years, and everything in between.
            </p>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            Compete against fellow Panthers fans daily and climb the all-time leaderboard. Get all 5 right and you're not just a fan — you're the ultimate <span className="text-white font-semibold">Panthers Sicko</span>.
          </p>

          <div className="pt-2">
            <Link
              href="/panthers"
              className="inline-block rounded-xl bg-[#0085CA] px-8 py-3 text-sm font-bold text-white hover:bg-[#0096E0] transition-colors"
            >
              Play Today's Quiz
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
