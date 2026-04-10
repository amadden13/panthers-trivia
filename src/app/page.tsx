import Link from "next/link";

const teams = [
  {
    href: "/panthers",
    name: "Carolina Panthers",
    abbr: "CAR",
    primary: "#0085CA",
    secondary: "#000000",
    available: true,
  },
  {
    href: "/patriots",
    name: "New England Patriots",
    abbr: "NE",
    primary: "#002244",
    secondary: "#C60C30",
    available: false,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight text-white mb-1">
            SICKO <span className="rounded bg-zinc-600 px-2 py-0.5 text-2xl font-black tracking-widest text-white">TRIVIA</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-3">Pick your team.</p>
        </div>

        <div className="space-y-3">
          {teams.map((team) => (
            <Link
              key={team.href}
              href={team.href}
              className={`flex items-center gap-4 rounded-2xl border p-4 transition-all ${
                team.available
                  ? "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500 hover:bg-zinc-800/60"
                  : "border-zinc-800 bg-zinc-900/30 cursor-not-allowed opacity-50 pointer-events-none"
              }`}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ background: team.primary }}
              >
                {team.abbr}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{team.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {team.available ? "Play today's quiz →" : "Coming soon"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
