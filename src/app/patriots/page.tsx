import Link from "next/link";

export default function PatriotsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <p className="text-5xl mb-6">🏈</p>
        <h1 className="text-2xl font-black text-white mb-2">Patriots Sicko</h1>
        <p className="text-zinc-400 text-sm mb-8">Coming soon. Think you know Patriots history?</p>
        <Link
          href="/panthers"
          className="text-xs font-semibold text-[#0085CA] hover:text-[#33A0D8] transition-colors"
        >
          ← Play Panthers Sicko
        </Link>
      </div>
    </main>
  );
}
