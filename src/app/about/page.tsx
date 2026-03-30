import Link from "next/link";
import Header from "@/components/Header";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent text-zinc-100">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <header className="mb-8">
          <Header activePage="about" />
        </header>

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-black text-white mb-2">About Panthers Trivia</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Panthers Trivia is a daily trivia game for Carolina Panthers fans. Each day brings 4 new questions spanning the team's history — from the franchise's earliest seasons to the present day.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider">How it works</h2>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li className="flex gap-3">
                <span className="text-[#0085CA] font-bold">01</span>
                <span>4 questions per day, released at midnight Eastern time.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#0085CA] font-bold">02</span>
                <span>You have <span className="text-white font-semibold">40 seconds</span> per question — just like the play clock. The faster you answer, the more points you score.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#0085CA] font-bold">03</span>
                <span>One guess per question. No second chances.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#0085CA] font-bold">04</span>
                <span>You can use <span className="text-white font-semibold">1 hint per day</span>, but it cuts that question's score in half.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#0085CA] font-bold">05</span>
                <span>Questions from older eras come with a <span className="font-semibold" style={{ color: "#BFC0BF" }}>era bonus</span> — harder history, bigger reward.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-black text-white uppercase tracking-wider mb-3">Scoring</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Points are based on how quickly you answer. A perfect score on a question is <span className="text-white font-semibold">1000 points</span>. Answer with 1 second left and you'll score far less. Questions from the 1990s, 2000s, and 2010s include an era bonus on top.
            </p>
          </div>

          <div className="text-center pt-2">
            <Link
              href="/"
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
