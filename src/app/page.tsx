import Link from "next/link";

const teams = [
  { href: "/panthers", name: "Carolina Panthers",       abbr: "CAR", primary: "#0085CA", available: true  },
  { href: "/patriots", name: "New England Patriots",    abbr: "NE",  primary: "#002244", available: true  },
  { href: "#",         name: "Arizona Cardinals",       abbr: "ARI", primary: "#97233F", available: false },
  { href: "#",         name: "Atlanta Falcons",         abbr: "ATL", primary: "#A71930", available: false },
  { href: "#",         name: "Baltimore Ravens",        abbr: "BAL", primary: "#241773", available: false },
  { href: "#",         name: "Buffalo Bills",           abbr: "BUF", primary: "#00338D", available: false },
  { href: "#",         name: "Chicago Bears",           abbr: "CHI", primary: "#0B162A", available: false },
  { href: "#",         name: "Cincinnati Bengals",      abbr: "CIN", primary: "#FB4F14", available: false },
  { href: "#",         name: "Cleveland Browns",        abbr: "CLE", primary: "#FF3C00", available: false },
  { href: "#",         name: "Dallas Cowboys",          abbr: "DAL", primary: "#003594", available: false },
  { href: "#",         name: "Denver Broncos",          abbr: "DEN", primary: "#FB4F14", available: false },
  { href: "#",         name: "Detroit Lions",           abbr: "DET", primary: "#0076B6", available: false },
  { href: "#",         name: "Green Bay Packers",       abbr: "GB",  primary: "#203731", available: false },
  { href: "#",         name: "Houston Texans",          abbr: "HOU", primary: "#03202F", available: false },
  { href: "#",         name: "Indianapolis Colts",      abbr: "IND", primary: "#002C5F", available: false },
  { href: "#",         name: "Jacksonville Jaguars",    abbr: "JAX", primary: "#006778", available: false },
  { href: "#",         name: "Kansas City Chiefs",      abbr: "KC",  primary: "#E31837", available: false },
  { href: "#",         name: "Las Vegas Raiders",       abbr: "LV",  primary: "#000000", available: false },
  { href: "#",         name: "Los Angeles Chargers",    abbr: "LAC", primary: "#0080C6", available: false },
  { href: "#",         name: "Los Angeles Rams",        abbr: "LAR", primary: "#003594", available: false },
  { href: "#",         name: "Miami Dolphins",          abbr: "MIA", primary: "#008E97", available: false },
  { href: "#",         name: "Minnesota Vikings",       abbr: "MIN", primary: "#4F2683", available: false },
  { href: "#",         name: "New Orleans Saints",      abbr: "NO",  primary: "#9F8958", available: false },
  { href: "#",         name: "New York Giants",         abbr: "NYG", primary: "#0B2265", available: false },
  { href: "#",         name: "New York Jets",           abbr: "NYJ", primary: "#125740", available: false },
  { href: "#",         name: "Philadelphia Eagles",     abbr: "PHI", primary: "#004C54", available: false },
  { href: "#",         name: "Pittsburgh Steelers",     abbr: "PIT", primary: "#101820", available: false },
  { href: "#",         name: "San Francisco 49ers",     abbr: "SF",  primary: "#AA0000", available: false },
  { href: "#",         name: "Seattle Seahawks",        abbr: "SEA", primary: "#002244", available: false },
  { href: "#",         name: "Tampa Bay Buccaneers",    abbr: "TB",  primary: "#D50A0A", available: false },
  { href: "#",         name: "Tennessee Titans",        abbr: "TEN", primary: "#0C2340", available: false },
  { href: "#",         name: "Washington Commanders",   abbr: "WSH", primary: "#5A1414", available: false },
].sort((a, b) => a.name.localeCompare(b.name));

export default function HomePage() {
  return (
    <main className="min-h-screen p-6 flex flex-col items-center">
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
              key={team.abbr}
              href={team.href}
              className={`flex items-center gap-4 rounded-2xl border p-4 transition-all ${
                team.available
                  ? "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500 hover:bg-zinc-800/60"
                  : "border-zinc-800 bg-zinc-900/30 opacity-40 pointer-events-none"
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
