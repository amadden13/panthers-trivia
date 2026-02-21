export type DraftInfo =
  | { udfa: true; year?: number }
  | { udfa?: false; year: number; round: number; pick: number };

export type Player = {
  id: string; // stable id we control
  name: string;
  pos: string; // QB, RB, WR, TE, OT, EDGE, LB, CB, S, K, P, etc.
  era: string;

  // richer hint fields (optional)
  college?: string;
  draft?: DraftInfo;
  jersey?: number[]; // Panthers jersey number(s)
  facts?: string[]; // short, spoiler-safe nuggets
};

export const PLAYERS: Player[] = [
  // Legends / core (rich hints)
  {
    id: "cam-newton",
    name: "Cam Newton",
    pos: "QB",
    era: "2010s",
    college: "Auburn",
    draft: { year: 2011, round: 1, pick: 1 },
    jersey: [1],
    facts: ["NFL MVP (2015)", "Led Panthers to Super Bowl 50 season"],
  }, // PFR has college/draft; widely documented :contentReference[oaicite:0]{index=0}
  {
    id: "luke-kuechly",
    name: "Luke Kuechly",
    pos: "LB",
    era: "2010s",
    college: "Boston College",
    draft: { year: 2012, round: 1, pick: 9 },
    jersey: [59],
    facts: ["NFL Defensive Player of the Year (2013)", "Defensive Rookie of the Year (2012)"],
  }, // :contentReference[oaicite:1]{index=1}
  {
    id: "steve-smith-sr",
    name: "Steve Smith Sr.",
    pos: "WR",
    era: "2000s/2010s",
    college: "Utah",
    draft: { year: 2001, round: 3, pick: 74 },
    jersey: [89],
    facts: ["Triple Crown season (2005)", "Panthers Hall of Honor"],
  }, // :contentReference[oaicite:2]{index=2}
  {
    id: "julius-peppers",
    name: "Julius Peppers",
    pos: "EDGE",
    era: "2000s/2010s",
    college: "North Carolina",
    draft: { year: 2002, round: 1, pick: 2 },
    jersey: [90],
    facts: ["Defensive Rookie of the Year (2002)", "159.5 career sacks"],
  }, // :contentReference[oaicite:3]{index=3}
  {
    id: "greg-olsen",
    name: "Greg Olsen",
    pos: "TE",
    era: "2010s",
    college: "Miami (FL)",
    draft: { year: 2007, round: 1, pick: 31 },
    jersey: [88],
    facts: ["3 straight 1,000-yd seasons (TE)", "Key part of 2015 run"],
  }, // :contentReference[oaicite:4]{index=4}
  {
    id: "christian-mccaffrey",
    name: "Christian McCaffrey",
    pos: "RB",
    era: "2010s/2020s",
    college: "Stanford",
    draft: { year: 2017, round: 1, pick: 8 },
    jersey: [22],
    facts: ["2,000+ scrimmage yards (2019)", "Elite all-purpose back"],
  }, // :contentReference[oaicite:5]{index=5}
  {
    id: "thomas-davis",
    name: "Thomas Davis",
    pos: "LB",
    era: "2000s/2010s",
    college: "Georgia",
    draft: { year: 2005, round: 1, pick: 14 },
    jersey: [58, 47],
    facts: ["Came back from 3 ACL tears", "Walter Payton Man of the Year (2014)"],
  }, // :contentReference[oaicite:6]{index=6}
  {
    id: "jake-delhomme",
    name: "Jake Delhomme",
    pos: "QB",
    era: "2000s",
    college: "Louisiana–Lafayette",
    draft: { udfa: true, year: 1997 },
    jersey: [17],
    facts: ["Led Panthers to Super Bowl XXXVIII", "‘Cardiac Cats’ era QB"],
  }, // :contentReference[oaicite:7]{index=7}

  // You can keep adding the rest of your list here (they can be “basic” for now)
  { id: "muhsin-muhammad", name: "Muhsin Muhammad", pos: "WR", era: "1990s/2000s" },
  { id: "deangelo-williams", name: "DeAngelo Williams", pos: "RB", era: "2000s" },
  { id: "jonathan-stewart", name: "Jonathan Stewart", pos: "RB", era: "2000s/2010s" },
  { id: "ryan-kalil", name: "Ryan Kalil", pos: "C", era: "2000s/2010s" },
  { id: "jordan-gross", name: "Jordan Gross", pos: "OT", era: "2000s/2010s" },
  { id: "josh-norman", name: "Josh Norman", pos: "CB", era: "2010s" },
  { id: "john-kasay", name: "John Kasay", pos: "K", era: "1990s/2000s" },
  { id: "tginn", name: "Ted Ginn", pos: "WR", era: "2010s" },
  { id: "dfunchess", name: "Devin Funchess", pos: "WR", era: "2010s" },
  { id: "cbrown", name: "Corey (Philly) Brown", pos: "WR", era: "2010s" },
  { id: "mtolbert", name: "Mike Tolbert", pos: "RB", era: "2010s" },
  { id: "jcotchery", name: "Jericho Cotchery", pos: "WR", era: "2010s" },
  { id: "edickson", name: "Ed Dickson", pos: "TE", era: "2010s" },
  { id: "fwhittaker", name: "Fozzy Whittaker", pos: "RB", era: "2010s" },
  { id: "cartis-payne", name: "Cameron Artis-Payne", pos: "RB", era: "2010s" },
  { id: "kshort", name: "Kawann Short", pos: "DT", era: "2010s" },
  { id: "kcoleman", name: "Kurt Coleman", pos: "DB", era: "2010s" },
  { id: "kealy", name: "Kony Ealy", pos: "DE", era: "2010s" },
  { id: "maddison", name: "Mario Addison", pos: "DE", era: "2010s" },
  { id: "cjohnson", name: "Charles Johnson", pos: "DE", era: "2010s" },
  { id: "klove", name: "Kyle Love", pos: "DT", era: "2010s" },
  { id: "aklein", name: "A.J. Klein", pos: "LB", era: "2010s" },
  { id: "ctillman", name: "Charles Tillman", pos: "DB", era: "2010s" },
  { id: "tboston", name: "Tre Boston", pos: "DB", era: "2010s" },
  { id: "dedwards", name: "Dwan Edwards", pos: "DT", era: "2010s" },
  { id: "rdelaire", name: "Ryan Delaire", pos: "DE", era: "2010s" },
  { id: "jallen", name: "Jared Allen", pos: "DE", era: "2010s" },
  { id: "cjones", name: "Colin Jones", pos: "DB", era: "2010s" },
  { id: "rmcclain", name: "Robert McClain", pos: "DB", era: "2010s" },
  { id: "cfinnegan", name: "Cortland Finnegan", pos: "DB", era: "2010s" },
  { id: "sthompson", name: "Shaq Thompson", pos: "LB", era: "2010s" },
  { id: "whorton", name: "Wes Horton", pos: "DE", era: "2010s" },
  { id: "slotulelei", name: "Star Lotulelei", pos: "DT", era: "2010s" },
  { id: "bbenwikere", name: "Bene Benwikere", pos: "DB", era: "2010s" },
];