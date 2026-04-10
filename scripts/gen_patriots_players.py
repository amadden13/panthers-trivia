"""
gen_patriots_players.py
=======================
Generates src/data/players_patriots.ts from nflreadpy roster + player data.

Same pipeline as gen_players.py but filtered to team "NE" (New England Patriots).
Season range: 1995-2025.

Usage:
    python3.11 scripts/gen_patriots_players.py
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path
from typing import Any

import nflreadpy as nfl  # pip install nflreadpy

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = PROJECT_ROOT / "src" / "data" / "players_patriots.ts"

TEAM_FILTER = "NE"

POS_MAP = {
    "QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB",
    "WR": "WR", "TE": "TE",
    "T": "OT", "OT": "OT", "LT": "OT", "RT": "OT",
    "G": "OG", "OG": "OG", "LG": "OG", "RG": "OG",
    "C": "C",
    "DE": "DE", "DT": "DT", "NT": "DT",
    "OLB": "LB", "ILB": "LB", "MLB": "LB", "LB": "LB",
    "CB": "CB", "DB": "DB", "FS": "S", "SS": "S", "S": "S",
    "K": "K", "P": "P", "LS": "LS",
    "EDGE": "EDGE",
}


def isnan(v: Any) -> bool:
    if v is None:
        return True
    try:
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return False


def safe_str(v: Any) -> str | None:
    if isnan(v):
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "na", "") else None


def safe_int(v: Any) -> int | None:
    if isnan(v):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def norm_pos(pos: str | None) -> str:
    if not pos:
        return "?"
    return POS_MAP.get(str(pos).strip().upper(), str(pos).strip().upper())


def era_from_seasons(seasons: list[int]) -> str:
    if not seasons:
        return "Unknown"
    lo, hi = min(seasons), max(seasons)
    def decade(y: int) -> str:
        return f"{(y // 10) * 10}s"
    if decade(lo) == decade(hi):
        return decade(lo)
    return f"{decade(lo)}/{decade(hi)}"


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[''`.,]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def player_key(row: Any, id_col: str | None, name_col: str | None) -> str | None:
    if id_col:
        gsis = safe_str(row.get(id_col) if hasattr(row, "get") else getattr(row, id_col, None))
        if gsis:
            return f"id:{gsis}"
    if name_col:
        name = safe_str(row.get(name_col) if hasattr(row, "get") else getattr(row, name_col, None))
        if name:
            return f"name:{name.lower()}"
    return None


def ingest_rows(df, records: dict, id_col, name_col, pos_col, college_col,
                draft_year_col, draft_round_col, draft_number_col,
                jersey_col, season_col, team_col):
    for row in df.iter_rows(named=True):
        team = safe_str(row.get(team_col)) if team_col else None
        if team_col and team != TEAM_FILTER:
            continue

        # Season filter: 1995+
        if season_col:
            s = safe_int(row.get(season_col))
            if s and s < 1995:
                continue

        key = player_key(row, id_col, name_col)
        if not key:
            continue

        name = safe_str(row.get(name_col)) if name_col else None
        if not name:
            continue

        if key not in records:
            records[key] = {
                "gsis_id": None,
                "name": name,
                "seasons": set(),
                "jerseys": set(),
                "positions": [],
                "season_positions": [],
                "college": None,
                "draft_year": None,
                "draft_round": None,
                "draft_pick": None,
            }

        rec = records[key]

        if len(name) > len(rec["name"]):
            rec["name"] = name

        if id_col and not rec["gsis_id"]:
            rec["gsis_id"] = safe_str(row.get(id_col))

        if season_col:
            s = safe_int(row.get(season_col))
            if s:
                rec["seasons"].add(s)

        if jersey_col:
            j = safe_int(row.get(jersey_col))
            if j:
                rec["jerseys"].add(j)

        if pos_col:
            p = safe_str(row.get(pos_col))
            if p:
                if p not in rec["positions"]:
                    rec["positions"].append(p)
                s = safe_int(row.get(season_col)) if season_col else None
                rec["season_positions"].append((s or 0, p))

        if college_col and not rec["college"]:
            rec["college"] = safe_str(row.get(college_col))

        if draft_year_col and not rec["draft_year"]:
            rec["draft_year"] = safe_int(row.get(draft_year_col))

        if draft_round_col and not rec["draft_round"]:
            rec["draft_round"] = safe_int(row.get(draft_round_col))

        if draft_number_col and not rec["draft_pick"]:
            rec["draft_pick"] = safe_int(row.get(draft_number_col))


def find_col(df, *candidates) -> str | None:
    cols = set(df.columns)
    for c in candidates:
        if c in cols:
            return c
    return None


def load_and_ingest(records: dict, df, label: str, debug: bool = False):
    if debug:
        print(f"\n[{label}] columns: {df.columns}")
        print(df.head(3))

    id_col       = find_col(df, "gsis_id", "player_id")
    name_col     = find_col(df, "full_name", "player_name", "display_name")
    pos_col      = find_col(df, "position", "pos")
    college_col  = find_col(df, "college", "college_name")
    jersey_col   = find_col(df, "jersey_number", "jersey")
    season_col   = find_col(df, "season")
    team_col     = find_col(df, "team", "team_abbr", "current_team_id")
    d_year_col   = find_col(df, "entry_year", "draft_year")
    d_round_col  = find_col(df, "draft_round")
    d_pick_col   = find_col(df, "draft_number", "draft_pick")

    before = len(records)
    ingest_rows(df, records, id_col, name_col, pos_col, college_col,
                d_year_col, d_round_col, d_pick_col,
                jersey_col, season_col, team_col)
    after = len(records)
    print(f"  [{label}] rows={len(df)}, new unique players added: {after - before} (total: {after})")


def build_ts_header() -> str:
    return '''\
export type Player = {
  id: string;
  name: string;
  pos: string;
  era: string;
  college?: string;
  draft?: { udfa?: boolean; year?: number; round?: number; pick?: number };
  jersey?: number[];
  facts?: string[];
};

export const PLAYERS_PATRIOTS: Player[] = [
'''


def player_to_ts(p: dict) -> str:
    lines = ["  {"]
    lines.append(f'    id: "{p["id"]}",')
    lines.append(f'    name: "{p["name"]}",')
    lines.append(f'    pos: "{p["pos"]}",')
    lines.append(f'    era: "{p["era"]}",')
    if p.get("college"):
        lines.append(f'    college: "{p["college"]}",')
    if p.get("draft"):
        d = p["draft"]
        if d.get("udfa"):
            yr = f', year: {d["year"]}' if d.get("year") else ""
            lines.append(f"    draft: {{ udfa: true{yr} }},")
        else:
            lines.append(f'    draft: {{ year: {d["year"]}, round: {d["round"]}, pick: {d["pick"]} }},')
    if p.get("jersey"):
        lines.append(f'    jersey: [{", ".join(str(n) for n in p["jersey"])}],')
    lines.append("  }")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    records: dict[str, dict] = {}

    print("Loading all-time season rosters...")
    try:
        df = nfl.load_rosters(seasons=True)
        load_and_ingest(records, df, "load_rosters(all)", debug=args.debug)
    except Exception as e:
        print(f"  WARNING: load_rosters failed: {e}", file=sys.stderr)

    print("Loading weekly rosters (2002-2024)...")
    try:
        df_weekly = nfl.load_rosters_weekly(seasons=list(range(2002, 2025)))
        load_and_ingest(records, df_weekly, "load_rosters_weekly(2002-2024)", debug=args.debug)
    except Exception as e:
        print(f"  WARNING: load_rosters_weekly failed: {e}", file=sys.stderr)

    print("Loading player registry for enrichment...")
    try:
        df_players = nfl.load_players()
        known_gsis = {rec["gsis_id"] for rec in records.values() if rec.get("gsis_id")}

        id_col     = find_col(df_players, "gsis_id", "player_id")
        d_year     = find_col(df_players, "entry_year", "draft_year")
        d_round    = find_col(df_players, "draft_round")
        d_pick     = find_col(df_players, "draft_number", "draft_pick")
        college_c  = find_col(df_players, "college", "college_name")
        pos_c      = find_col(df_players, "position", "pos")

        enriched = 0
        for row in df_players.iter_rows(named=True):
            gsis = safe_str(row.get(id_col)) if id_col else None
            if not gsis or gsis not in known_gsis:
                continue
            for rec in records.values():
                if rec.get("gsis_id") == gsis:
                    if d_year and not rec["draft_year"]:
                        rec["draft_year"] = safe_int(row.get(d_year))
                    if d_round and not rec["draft_round"]:
                        rec["draft_round"] = safe_int(row.get(d_round))
                    if d_pick and not rec["draft_pick"]:
                        rec["draft_pick"] = safe_int(row.get(d_pick))
                    if college_c and not rec["college"]:
                        rec["college"] = safe_str(row.get(college_c))
                    if pos_c and not rec["positions"]:
                        p = safe_str(row.get(pos_c))
                        if p:
                            rec["positions"].append(p)
                    enriched += 1
                    break
        print(f"  Enriched {enriched} players from player registry.")
    except Exception as e:
        print(f"  WARNING: load_players failed: {e}", file=sys.stderr)

    print(f"\nTotal unique Patriots players: {len(records)}")

    new_players: list[dict] = []
    seen_slugs: set[str] = set()

    for rec in sorted(records.values(), key=lambda r: r["name"]):
        name = rec["name"]
        slug = slugify(name)
        if slug in seen_slugs:
            suffix = (rec.get("gsis_id") or name)[:6].lower().replace(" ", "")
            slug = f"{slug}-{suffix}"
        seen_slugs.add(slug)

        player: dict[str, Any] = {
            "id": slug,
            "name": name,
            "pos": norm_pos(max(rec["season_positions"])[1]) if rec["season_positions"] else norm_pos(rec["positions"][0]) if rec["positions"] else "?",
            "era": era_from_seasons(list(rec["seasons"])),
        }

        if rec.get("college"):
            player["college"] = rec["college"]

        if rec["draft_year"] and rec["draft_round"] and rec["draft_pick"]:
            player["draft"] = {
                "year": rec["draft_year"],
                "round": rec["draft_round"],
                "pick": rec["draft_pick"],
            }
        elif rec["draft_year"]:
            player["draft"] = {"udfa": True, "year": rec["draft_year"]}

        if rec["jerseys"]:
            player["jersey"] = sorted(rec["jerseys"])

        new_players.append(player)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(build_ts_header())
        for i, p in enumerate(new_players):
            comma = "," if i < len(new_players) - 1 else ""
            f.write(player_to_ts(p) + comma + "\n")
        f.write("];\n")

    print(f"✅ Wrote {args.out.relative_to(PROJECT_ROOT)}")
    print(f"   Total Patriots players: {len(new_players)}")


if __name__ == "__main__":
    main()
