"""
gen_patriots.py
============
Generates src/data/puzzles_patriots.ts — all-time Patriots Sicko Mode trivia.

Player matching uses gsis_id (NFL's stable player ID) from PBP _player_id columns,
completely avoiding name-abbreviation collisions (e.g. D.Williams → wrong Williams).

Three question tiers:

  TIER 1 — Play-level (from nfl.load_pbp, all seasons 1999-2025)
    rec_td, rush_td, int, sack, rush_100, rec_100, pick_six, multi_sack,
    ot_td, return_td, fourth_down_td, pass_300, pass_3td, fumble_return_td,
    two_pt, nth_pass_td, playoff_rec_td, playoff_rush_td, playoff_int, playoff_sack

  TIER 2 — Season leaders (from nfl.load_player_stats, seasons 1999-2025)
    rushing yards, receiving yards, passing TDs, passing yards,
    sacks, interceptions, rushing TDs, receptions

  TIER 3 — Draft picks rounds 1-3 (from nfl.load_draft_picks)

Usage:
    python scripts/gen_patriots.py [--days 120] [--start-date 2026-02-20] [--debug]
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
import nflreadpy as nfl

PROJECT_ROOT       = Path(__file__).resolve().parents[1]
PLAYERS_TS         = PROJECT_ROOT / "src" / "data" / "players_patriots.ts"
DEFAULT_OUT        = PROJECT_ROOT / "src" / "data" / "puzzles_patriots.ts"
DEFAULT_OPP_OUT    = PROJECT_ROOT / "src" / "data" / "opponents_patriots.ts"

# ── Team name map ─────────────────────────────────────────────────────────────
TEAM_NAMES = {
    "ARI": "Arizona Cardinals",   "ATL": "Atlanta Falcons",     "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",       "CAR": "Carolina Panthers",   "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",  "CLE": "Cleveland Browns",    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",      "DET": "Detroit Lions",       "GB":  "Green Bay Packers",
    "HOU": "Houston Texans",      "IND": "Indianapolis Colts",  "JAX": "Jacksonville Jaguars",
    "JAC": "Jacksonville Jaguars","KC":  "Kansas City Chiefs",  "LA":  "Los Angeles Rams",
    "LAC": "Los Angeles Chargers","LV":  "Las Vegas Raiders",   "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",   "NE":  "New England Patriots","NO":  "New Orleans Saints",
    "NYG": "New York Giants",     "NYJ": "New York Jets",       "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",    "SF":  "San Francisco 49ers",
    "TB":  "Tampa Bay Buccaneers","TEN": "Tennessee Titans",    "WAS": "Washington Commanders",
    "STL": "St. Louis Rams",      "SD":  "San Diego Chargers",  "OAK": "Oakland Raiders",
}
ORDINALS = {1: "1st", 2: "2nd", 3: "3rd"}
PLAYOFF_ROUNDS = {1: "Wild Card", 2: "Divisional Round", 3: "AFC Championship Game", 4: "Super Bowl"}

def team_name(abbrev: str) -> str:
    return TEAM_NAMES.get(str(abbrev).upper().strip(), str(abbrev))

def ordinal(n: int) -> str:
    return ORDINALS.get(n, f"{n}th")

def playoff_round(week: int) -> str:
    return PLAYOFF_ROUNDS.get(week, f"Playoff Week {week}")

# nflverse playoff week numbers by era
# Pre-2021 (16-game season): 18=Wild Card, 19=Divisional, 20=Conf Champ, 21=Super Bowl
# 2021+   (17-game season): 19=Wild Card, 20=Divisional, 21=Conf Champ, 22=Super Bowl
_PLAYOFF_WEEKS_OLD = {18: "Wild Card", 19: "Divisional Round", 20: "AFC Championship", 21: "Super Bowl"}
_PLAYOFF_WEEKS_NEW = {19: "Wild Card", 20: "Divisional Round", 21: "AFC Championship", 22: "Super Bowl"}

def game_desc(week: int, season_type: str, season: int, opponent: str) -> str:
    """Natural-language game description for question prompts."""
    opp = team_name(opponent)
    if str(season_type) == "POST":
        rounds = _PLAYOFF_WEEKS_NEW if int(season) >= 2021 else _PLAYOFF_WEEKS_OLD
        rnd = rounds.get(int(week), "playoffs")
        return f"the {season} {rnd} against the {opp}"
    else:
        return f"Week {int(week)} of the {season} season against the {opp}"

def isnan(v) -> bool:
    if v is None:
        return True
    try:
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return False

def safe_str(v) -> Optional[str]:
    if isnan(v):
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "na", "") else None


# ── Player databases ──────────────────────────────────────────────────────────

def normalize_name(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\.", "", s)
    s = re.sub(r"[,]", "", s)
    s = re.sub(r"\b(sr|jr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def round_down_yards(yards: int, base: int = 25) -> int:
    """Round yards down to the nearest multiple of base (default 25).
    e.g. 104 → 100, 137 → 125, 213 → 200"""
    return (yards // base) * base


def slugify(name: str) -> str:
    """Convert display name to URL-safe slug: 'Tom Brady' → 'tom-brady'"""
    return re.sub(r"\s+", "-", normalize_name(name))


def load_name_to_id(players_ts_path: Path) -> Dict[str, str]:
    """Full normalized name → player slug (no abbreviations, no collisions)."""
    txt = players_ts_path.read_text(encoding="utf-8")
    pattern = re.compile(r'id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"', re.MULTILINE)
    name_to_id: Dict[str, str] = {}
    for pid, name in pattern.findall(txt):
        name_to_id[normalize_name(name)] = pid
    return name_to_id


def load_id_to_name(players_ts_path: Path) -> Dict[str, str]:
    """player slug → display name."""
    txt = players_ts_path.read_text(encoding="utf-8")
    pattern = re.compile(r'id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"', re.MULTILINE)
    return {pid: name for pid, name in pattern.findall(txt)}


def load_id_to_pos(players_ts_path: Path) -> Dict[str, str]:
    """player slug → position string."""
    lines = players_ts_path.read_text(encoding="utf-8").splitlines()
    id_re  = re.compile(r'id:\s*"([^"]+)"')
    pos_re = re.compile(r'pos:\s*"([^"]+)"')
    result: Dict[str, str] = {}
    for i, line in enumerate(lines):
        id_m = id_re.search(line)
        if id_m:
            for j in range(i, min(i + 8, len(lines))):
                pos_m = pos_re.search(lines[j])
                if pos_m:
                    result[id_m.group(1)] = pos_m.group(1)
                    break
    return result


def apply_position_hints(grouped: List["GroupedCandidate"], id_to_pos: Dict[str, str]) -> None:
    """Rewrite 'Who ...' prompts to 'Which {pos} ...' using the answer player's position."""
    for gc in grouped:
        if gc.answer_pool != "patriots":
            continue  # opponent-pool questions already specify position in prompt
        if not gc.prompt.startswith("Who "):
            continue
        positions = list({id_to_pos.get(pid) for pid in gc.player_ids} - {None})
        if len(positions) != 1:
            continue  # skip if unknown or mixed positions across multi-answer questions
        gc.prompt = f"Which {positions[0]} " + gc.prompt[len("Who "):]


def build_gsis_map(name_to_id: Dict[str, str], debug: bool = False) -> Dict[str, str]:
    """
    gsis_id → player slug, by loading all-time CAR rosters.
    This is the primary lookup used in all PBP builders.
    """
    print("Loading NE rosters to build gsis_id map...")
    try:
        df = nfl.load_rosters(seasons=True).to_pandas()
    except Exception as e:
        print(f"  WARNING: load_rosters failed: {e}", file=sys.stderr)
        return {}

    car = df[df["team"] == "NE"].copy()
    if debug:
        print(f"  roster columns: {car.columns.tolist()}")

    gsis_map: Dict[str, str] = {}
    missing = 0

    for _, row in car.iterrows():
        gsis = safe_str(row.get("gsis_id"))
        name = safe_str(row.get("full_name"))
        if not gsis or not name:
            continue
        slug = name_to_id.get(normalize_name(name))
        if slug:
            gsis_map[gsis] = slug
        else:
            missing += 1

    print(f"  gsis_map: {len(gsis_map)} entries ({missing} roster names not found in players.ts)")
    return gsis_map


def build_nfl_name_map(debug: bool = False) -> Dict[str, str]:
    """gsis_id → full_name for all NFL players (used to resolve opposing QB names)."""
    print("Loading all NFL rosters for opponent name lookup...")
    try:
        df = nfl.load_rosters(seasons=True).to_pandas()
    except Exception as e:
        print(f"  WARNING: load_rosters failed: {e}", file=sys.stderr)
        return {}
    result: Dict[str, str] = {}
    for _, row in df.iterrows():
        gsis = safe_str(row.get("gsis_id"))
        name = safe_str(row.get("full_name"))
        if gsis and name:
            result[gsis] = name
    print(f"  nfl_name_map: {len(result)} entries")
    return result


def build_all_qb_registry(debug: bool = False) -> Dict[str, str]:
    """slug → full_name for every QB in NFL history (used to pad the opponents autocomplete)."""
    print("Building all-time QB registry for autocomplete...")
    try:
        df = nfl.load_rosters(seasons=True).to_pandas()
    except Exception as e:
        print(f"  WARNING: load_rosters failed: {e}", file=sys.stderr)
        return {}
    pos_col = next((c for c in ["position", "pos"] if c in df.columns), None)
    name_col = "full_name" if "full_name" in df.columns else None
    if not pos_col or not name_col:
        return {}
    qbs = df[df[pos_col] == "QB"][name_col].dropna().unique()
    result: Dict[str, str] = {}
    for name in qbs:
        name = safe_str(name)
        if name:
            result[slugify(name)] = name
    print(f"  all-QB registry: {len(result)} unique QBs")
    return result


# ── Candidate model ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Candidate:
    tier: int
    kind: str
    season: int
    prompt: str
    player_id: str  # slug from players.ts or opponents_patriots.ts
    answer_pool: str = "patriots"  # "panthers" or "opponents"


@dataclass
class GroupedCandidate:
    """One unique question prompt with all valid player answers."""
    tier: int
    kind: str
    season: int
    prompt: str
    player_ids: List[str]  # all valid answers (usually 1, sometimes multiple)
    answer_pool: str = "patriots"  # "panthers" or "opponents"

    def day_key(self) -> str:
        return f"{self.kind}|{self.prompt}"


def group_candidates(candidates: List[Candidate]) -> List["GroupedCandidate"]:
    """Merge candidates with identical prompts into multi-answer questions."""
    groups: Dict[str, GroupedCandidate] = {}
    for c in candidates:
        key = c.kind + "|" + c.prompt
        if key not in groups:
            groups[key] = GroupedCandidate(c.tier, c.kind, c.season, c.prompt, [c.player_id], c.answer_pool)
        elif c.player_id not in groups[key].player_ids:
            groups[key].player_ids.append(c.player_id)
    return list(groups.values())


# ── Column finder ─────────────────────────────────────────────────────────────

def col(df: pd.DataFrame, *names) -> Optional[str]:
    for n in names:
        if n in df.columns:
            return n
    return None


def lookup(gsis_map: Dict[str, str], df: pd.DataFrame, id_col: str, row) -> Optional[str]:
    """Look up player slug by gsis_id column, with safe handling."""
    gsis = safe_str(row.get(id_col)) if id_col else None
    if gsis:
        return gsis_map.get(gsis)
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1 — Play-level builders
# ═══════════════════════════════════════════════════════════════════════════════

def build_rec_td(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_off, "receiver_player_id", "receiver_id")
    if not id_col or "pass_touchdown" not in pbp_off.columns:
        return []
    df = pbp_off[(pbp_off["pass_touchdown"] == 1) & pbp_off[id_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for (week, season_type, defteam, pid), grp in df.groupby(["week", "season_type", "defteam", "_pid"]):
        count = len(grp)
        desc = game_desc(week, season_type, season, defteam)
        if count == 1:
            prompt = f"Who caught a TD pass in {desc}?"
        else:
            prompt = f"Who caught {count} TD passes in {desc}?"
            # Also include in the single-TD pool — catching 2+ TDs means you caught a TD
            out.append(Candidate(1, "rec_td", season, f"Who caught a TD pass in {desc}?", pid))
        out.append(Candidate(1, "rec_td", season, prompt, pid))
    return out


def build_rush_td(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_off, "rusher_player_id", "rusher_id")
    if not id_col or "rush_touchdown" not in pbp_off.columns:
        return []
    df = pbp_off[(pbp_off["rush_touchdown"] == 1) & pbp_off[id_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for (week, season_type, defteam, pid), grp in df.groupby(["week", "season_type", "defteam", "_pid"]):
        count = len(grp)
        desc = game_desc(week, season_type, season, defteam)
        if count == 1:
            prompt = f"Who scored a rushing TD in {desc}?"
        else:
            prompt = f"Who scored {count} rushing TDs in {desc}?"
            # Also include in the single-TD pool — scoring 2+ rushing TDs means you scored a rushing TD
            out.append(Candidate(1, "rush_td", season, f"Who scored a rushing TD in {desc}?", pid))
        out.append(Candidate(1, "rush_td", season, prompt, pid))
    return out


def build_int(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_def, "interception_player_id", "interception_player_id")
    if not id_col or "interception" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["interception"] == 1) & pbp_def[id_col].notna()]
    out = []
    for _, r in df.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "int", season,
            f"Who recorded an interception in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_sack(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_def, "sack_player_id")
    if not id_col or "sack" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["sack"] == 1) & pbp_def[id_col].notna()]
    out = []
    for _, r in df.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "sack", season,
            f"Who recorded a sack in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_sack_target(pbp_def: pd.DataFrame, season: int, gm: Dict, nfl_names: Optional[Dict] = None) -> List[Candidate]:
    """'Who sacked [QB name] in [game]?' — answer is the Panthers player who made the sack."""
    id_col = col(pbp_def, "sack_player_id")
    passer_id_col = col(pbp_def, "passer_player_id")
    passer_name_col = col(pbp_def, "passer_player_name", "passer")
    if not id_col or "sack" not in pbp_def.columns:
        return []
    # Group by passer gsis when available (more reliable than name), else by name
    group_passer_col = passer_id_col if passer_id_col else passer_name_col
    if not group_passer_col:
        return []
    df = pbp_def[(pbp_def["sack"] == 1) & pbp_def[id_col].notna() & pbp_def[group_passer_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for (week, season_type, posteam, passer_key, pid), grp in df.groupby(
        ["week", "season_type", "posteam", group_passer_col, "_pid"]
    ):
        count = len(grp)
        # Resolve display name: prefer full name from nfl_names, fall back to passer_name_col
        passer_display = None
        if nfl_names and passer_id_col:
            passer_display = nfl_names.get(safe_str(passer_key))
        if not passer_display and passer_name_col:
            passer_display = safe_str(grp.iloc[0].get(passer_name_col, ""))
        if not passer_display:
            continue
        desc = game_desc(week, season_type, season, posteam)
        if count == 1:
            prompt = f"Who sacked {passer_display} in {desc}?"
        else:
            prompt = f"Who sacked {passer_display} {count} times in {desc}?"
            # Also include in the single-sack pool — sacking a QB 2+ times means you sacked them
            out.append(Candidate(1, "sack_target", season, f"Who sacked {passer_display} in {desc}?", pid))
        out.append(Candidate(1, "sack_target", season, prompt, pid))
    return out


def build_sack_victim(pbp_def: pd.DataFrame, season: int, gm: Dict, id_to_name: Dict,
                      nfl_names: Dict, opponent_registry: Dict) -> List[Candidate]:
    """'Which QB did [Panthers player] sack in [game]?' — answer is the opposing passer.
    Only generated for 1990s/2000s seasons (pre-2010) where QBs are harder to recall."""
    if season >= 2010:
        return []
    id_col = col(pbp_def, "sack_player_id")
    passer_id_col = col(pbp_def, "passer_player_id")
    passer_name_col = col(pbp_def, "passer_player_name", "passer")
    if not id_col or "sack" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["sack"] == 1) & pbp_def[id_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for _, r in df.iterrows():
        patriots_pid = r["_pid"]
        patriots_name = id_to_name.get(patriots_pid, "a Patriots player")
        # Resolve opposing QB full name
        passer_name = None
        passer_gsis = safe_str(r.get(passer_id_col)) if passer_id_col else None
        if passer_gsis and passer_gsis in nfl_names:
            passer_name = nfl_names[passer_gsis]
        if not passer_name and passer_name_col:
            passer_name = safe_str(r.get(passer_name_col))
        if not passer_name:
            continue
        passer_slug = slugify(passer_name)
        if not passer_slug:
            continue
        opponent_registry[passer_slug] = passer_name
        desc = game_desc(r["week"], r["season_type"], season, r["posteam"])
        out.append(Candidate(1, "sack_victim", season,
            f"Which QB did {patriots_name} sack in {desc}?", passer_slug, "opponents"))
    return out


def build_int_target(pbp_def: pd.DataFrame, season: int, gm: Dict, nfl_names: Optional[Dict] = None) -> List[Candidate]:
    """'Who intercepted [QB name] in [game]?' — answer is the Panthers player who made the INT."""
    id_col = col(pbp_def, "interception_player_id")
    passer_id_col = col(pbp_def, "passer_player_id")
    passer_name_col = col(pbp_def, "passer_player_name", "passer")
    if not id_col or "interception" not in pbp_def.columns:
        return []
    group_passer_col = passer_id_col if passer_id_col else passer_name_col
    if not group_passer_col:
        return []
    df = pbp_def[(pbp_def["interception"] == 1) & pbp_def[id_col].notna() & pbp_def[group_passer_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for (week, season_type, posteam, passer_key, pid), grp in df.groupby(
        ["week", "season_type", "posteam", group_passer_col, "_pid"]
    ):
        count = len(grp)
        passer_display = None
        if nfl_names and passer_id_col:
            passer_display = nfl_names.get(safe_str(passer_key))
        if not passer_display and passer_name_col:
            passer_display = safe_str(grp.iloc[0].get(passer_name_col, ""))
        if not passer_display:
            continue
        desc = game_desc(week, season_type, season, posteam)
        if count == 1:
            prompt = f"Who intercepted {passer_display} in {desc}?"
        else:
            prompt = f"Who intercepted {passer_display} {count} times in {desc}?"
            out.append(Candidate(1, "int_target", season, f"Who intercepted {passer_display} in {desc}?", pid))
        out.append(Candidate(1, "int_target", season, prompt, pid))
    return out


def build_int_victim(pbp_def: pd.DataFrame, season: int, gm: Dict, id_to_name: Dict,
                     nfl_names: Dict, opponent_registry: Dict) -> List[Candidate]:
    """'Which QB did [Panthers player] intercept in [game]?' — answer is the opposing passer.
    Only generated for 1990s/2000s seasons (pre-2010) where QBs are harder to recall."""
    if season >= 2010:
        return []
    id_col = col(pbp_def, "interception_player_id")
    passer_id_col = col(pbp_def, "passer_player_id")
    passer_name_col = col(pbp_def, "passer_player_name", "passer")
    if not id_col or "interception" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["interception"] == 1) & pbp_def[id_col].notna()].copy()
    df["_pid"] = df[id_col].apply(lambda x: gm.get(safe_str(x)))
    df = df[df["_pid"].notna()]
    out = []
    for _, r in df.iterrows():
        patriots_pid = r["_pid"]
        patriots_name = id_to_name.get(patriots_pid, "a Patriots player")
        # Resolve opposing QB full name
        passer_name = None
        passer_gsis = safe_str(r.get(passer_id_col)) if passer_id_col else None
        if passer_gsis and passer_gsis in nfl_names:
            passer_name = nfl_names[passer_gsis]
        if not passer_name and passer_name_col:
            passer_name = safe_str(r.get(passer_name_col))
        if not passer_name:
            continue
        passer_slug = slugify(passer_name)
        if not passer_slug:
            continue
        opponent_registry[passer_slug] = passer_name
        desc = game_desc(r["week"], r["season_type"], season, r["posteam"])
        out.append(Candidate(1, "int_victim", season,
            f"Which QB did {patriots_name} intercept in {desc}?", passer_slug, "opponents"))
    return out


def build_rush_100(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_off, "rusher_player_id", "rusher_id")
    if not id_col or "rushing_yards" not in pbp_off.columns:
        return []
    df = pbp_off[(pbp_off.get("rush_attempt", 0) == 1) & pbp_off[id_col].notna()].copy()
    if df.empty:
        return []
    g = df.groupby(["season_type", "week", "defteam", id_col], as_index=False)["rushing_yards"].sum()
    g = g[g["rushing_yards"] >= 100]
    out = []
    for _, r in g.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "rush_100", season,
            f"Who rushed for {round_down_yards(int(r['rushing_yards']))}+ yards in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_rec_100(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_off, "receiver_player_id", "receiver_id")
    yds_col = col(pbp_off, "receiving_yards", "yards_gained")
    if not id_col or not yds_col:
        return []
    df = pbp_off[pbp_off[id_col].notna()].copy()
    if df.empty:
        return []
    g = df.groupby(["season_type", "week", "defteam", id_col], as_index=False)[yds_col].sum()
    g = g[g[yds_col] >= 100]
    out = []
    for _, r in g.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "rec_100", season,
            f"Who had {round_down_yards(int(r[yds_col]))}+ receiving yards in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_pick_six(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col  = col(pbp_def, "interception_player_id")
    ret_col = col(pbp_def, "return_touchdown", "touchdown")
    if not id_col or not ret_col or "interception" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["interception"] == 1) & (pbp_def[ret_col] == 1) & pbp_def[id_col].notna()]
    out = []
    for _, r in df.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "pick_six", season,
            f"Who returned an interception for a TD in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_multi_sack(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_def, "sack_player_id")
    if not id_col or "sack" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["sack"] == 1) & pbp_def[id_col].notna()].copy()
    if df.empty:
        return []
    g = df.groupby(["season_type", "week", "posteam", id_col], as_index=False)["sack"].sum()
    g = g[g["sack"] >= 2]
    out = []
    for _, r in g.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "multi_sack", season,
            f"Who had {int(r['sack'])} sacks in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_ot_td(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    rush_id = col(pbp_off, "rusher_player_id", "rusher_id")
    rec_id  = col(pbp_off, "receiver_player_id", "receiver_id")
    df = pbp_off[
        (pbp_off.get("qtr", 0) >= 5) &
        ((pbp_off.get("rush_touchdown", 0) == 1) | (pbp_off.get("pass_touchdown", 0) == 1))
    ].copy()
    if df.empty:
        return []
    out = []
    for (st, week), grp in df.groupby(["season_type", "week"]):
        if "game_seconds_remaining" in grp.columns:
            grp = grp.sort_values("game_seconds_remaining", ascending=False)
        r = grp.iloc[0]
        gsis = None
        if r.get("rush_touchdown") == 1 and rush_id:
            gsis = safe_str(r.get(rush_id))
        elif r.get("pass_touchdown") == 1 and rec_id:
            gsis = safe_str(r.get(rec_id))
        if not gsis:
            continue
        pid = gm.get(gsis)
        if not pid:
            continue
        out.append(Candidate(1, "ot_td", season,
            f"Who scored a TD in overtime in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_return_td(pbp_all: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    ret_col  = col(pbp_all, "return_touchdown")
    kick_id  = col(pbp_all, "kickoff_returner_player_id")
    punt_id  = col(pbp_all, "punt_returner_player_id")
    if not ret_col or (not kick_id and not punt_id):
        return []
    df = pbp_all[pbp_all[ret_col] == 1].copy()
    out = []
    for _, r in df.iterrows():
        gsis, ret_type = None, None
        if kick_id and not isnan(r.get(kick_id)):
            gsis, ret_type = safe_str(r[kick_id]), "kickoff"
        elif punt_id and not isnan(r.get(punt_id)):
            gsis, ret_type = safe_str(r[punt_id]), "punt"
        if not gsis:
            continue
        pid = gm.get(gsis)
        if not pid:
            continue
        posteam = str(r.get("posteam", ""))
        defteam = str(r.get("defteam", ""))
        # Returner is always on posteam — require CAR to be the returning team
        if posteam != "NE":
            continue
        opp = defteam
        out.append(Candidate(1, "return_td", season,
            f"Who returned a {ret_type} for a TD in {game_desc(r['week'], r['season_type'], season, opp)}?", pid))
    return out


def build_fourth_down_td(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    rush_id = col(pbp_off, "rusher_player_id", "rusher_id")
    rec_id  = col(pbp_off, "receiver_player_id", "receiver_id")
    df = pbp_off[
        (pbp_off.get("down", 0) == 4) &
        ((pbp_off.get("rush_touchdown", 0) == 1) | (pbp_off.get("pass_touchdown", 0) == 1))
    ].copy()
    out = []
    for _, r in df.iterrows():
        gsis = None
        if r.get("rush_touchdown") == 1 and rush_id:
            gsis = safe_str(r.get(rush_id))
        elif r.get("pass_touchdown") == 1 and rec_id:
            gsis = safe_str(r.get(rec_id))
        if not gsis:
            continue
        pid = gm.get(gsis)
        if not pid:
            continue
        out.append(Candidate(1, "fourth_down_td", season,
            f"Who scored a TD on 4th down in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_pass_300(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col  = col(pbp_off, "passer_player_id", "passer_id")
    yds_col = col(pbp_off, "passing_yards", "yards_gained")
    if not id_col or not yds_col:
        return []
    df = pbp_off[pbp_off[id_col].notna()].copy()
    if df.empty:
        return []
    g = df.groupby(["season_type", "week", "defteam", id_col], as_index=False)[yds_col].sum()
    g = g[g[yds_col] >= 300]
    out = []
    for _, r in g.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "pass_300", season,
            f"Who threw for {round_down_yards(int(r[yds_col]))}+ passing yards in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_pass_3td(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col = col(pbp_off, "passer_player_id", "passer_id")
    if not id_col or "pass_touchdown" not in pbp_off.columns:
        return []
    df = pbp_off[(pbp_off["pass_touchdown"] == 1) & pbp_off[id_col].notna()].copy()
    if df.empty:
        return []
    g = df.groupby(["season_type", "week", "defteam", id_col], as_index=False)["pass_touchdown"].sum()
    g = g[g["pass_touchdown"] >= 3]
    out = []
    for _, r in g.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "pass_3td", season,
            f"Who threw {int(r['pass_touchdown'])} TD passes in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_fumble_return_td(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col       = col(pbp_def, "fumble_recovery_1_player_id")
    team_col     = col(pbp_def, "fumble_recovery_1_team")
    ret_col      = col(pbp_def, "return_touchdown", "touchdown")
    if not id_col or not ret_col:
        return []
    df = pbp_def[(pbp_def.get("fumble_lost", 0) == 1) & (pbp_def[ret_col] == 1) & pbp_def[id_col].notna()].copy()
    if team_col:
        df = df[df[team_col] == "NE"]
    if df.empty:
        return []
    out = []
    for _, r in df.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "fumble_return_td", season,
            f"Who returned a fumble for a TD in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_two_pt(pbp_off: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    if "two_point_attempt" not in pbp_off.columns:
        return []
    result_col = col(pbp_off, "two_point_conv_result")
    rush_id = col(pbp_off, "rusher_player_id", "rusher_id")
    rec_id  = col(pbp_off, "receiver_player_id", "receiver_id")
    df = pbp_off[pbp_off["two_point_attempt"] == 1].copy()
    if result_col:
        df = df[df[result_col] == "success"]
    if df.empty:
        return []
    out = []
    for _, r in df.iterrows():
        gsis = None
        if rec_id and not isnan(r.get(rec_id)):
            gsis = safe_str(r[rec_id])
        elif rush_id and not isnan(r.get(rush_id)):
            gsis = safe_str(r[rush_id])
        if not gsis:
            continue
        pid = gm.get(gsis)
        if not pid:
            continue
        out.append(Candidate(1, "two_pt", season,
            f"Who converted a 2-point conversion in {game_desc(r['week'], r['season_type'], season, r['defteam'])}?", pid))
    return out


def build_nth_pass_td(pbp_off: pd.DataFrame, season: int, gm: Dict, n_values=(2, 3, 4)) -> List[Candidate]:
    rec_id = col(pbp_off, "receiver_player_id", "receiver_id")
    needed = {"pass_touchdown", "game_id", "qtr"}
    if not rec_id or not needed.issubset(set(pbp_off.columns)):
        return []
    # Use name column for passer display in prompt, id for receiver lookup
    passer_col = col(pbp_off, "passer", "passer_player_name")
    df = pbp_off[(pbp_off["pass_touchdown"] == 1) & pbp_off[rec_id].notna()].copy()
    if df.empty:
        return []
    if "game_seconds_remaining" in df.columns:
        df = df.sort_values(["game_id", "game_seconds_remaining"], ascending=[True, False])
    else:
        df = df.sort_values(["game_id", "qtr", "play_id"] if "play_id" in df.columns else ["game_id", "qtr"])
    # Group by game + passer (use passer name for display)
    group_col = passer_col if passer_col else rec_id
    out = []
    for (game_id, passer), grp in df.groupby(["game_id", group_col]):
        grp = grp.reset_index(drop=True)
        for n in n_values:
            if len(grp) < n:
                continue
            row = grp.iloc[n - 1]
            pid = gm.get(safe_str(row[rec_id]))
            if not pid:
                continue
            out.append(Candidate(1, f"nth_pass_td_{n}", season,
                f"Who caught {passer}'s {ordinal(n)} TD pass in {game_desc(row['week'], row['season_type'], season, row['defteam'])}?",
                pid))
    return out


def build_playoff_highlights(pbp_all: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    post = pbp_all[pbp_all["season_type"] == "POST"].copy()
    if post.empty:
        return []
    off = post[post["posteam"] == "NE"].copy()
    def_ = post[post["defteam"] == "NE"].copy()

    rec_id  = col(post, "receiver_player_id", "receiver_id")
    rush_id = col(post, "rusher_player_id", "rusher_id")
    int_id  = col(post, "interception_player_id")
    sack_id = col(post, "sack_player_id")

    out = []

    if rec_id:
        for _, r in off[(off.get("pass_touchdown", 0) == 1) & off[rec_id].notna()].iterrows():
            pid = gm.get(safe_str(r[rec_id]))
            if pid:
                out.append(Candidate(1, "playoff_rec_td", season,
                    f"Who caught a TD pass in {game_desc(r['week'], 'POST', season, r['defteam'])}?", pid))

    if rush_id:
        for _, r in off[(off.get("rush_touchdown", 0) == 1) & off[rush_id].notna()].iterrows():
            pid = gm.get(safe_str(r[rush_id]))
            if pid:
                out.append(Candidate(1, "playoff_rush_td", season,
                    f"Who scored a rushing TD in {game_desc(r['week'], 'POST', season, r['defteam'])}?", pid))

    if int_id:
        for _, r in def_[(def_.get("interception", 0) == 1) & def_[int_id].notna()].iterrows():
            pid = gm.get(safe_str(r[int_id]))
            if pid:
                out.append(Candidate(1, "playoff_int", season,
                    f"Who recorded an interception in {game_desc(r['week'], 'POST', season, r['posteam'])}?", pid))

    if sack_id:
        for _, r in def_[(def_.get("sack", 0) == 1) & def_[sack_id].notna()].iterrows():
            pid = gm.get(safe_str(r[sack_id]))
            if pid:
                out.append(Candidate(1, "playoff_sack", season,
                    f"Who recorded a sack in {game_desc(r['week'], 'POST', season, r['posteam'])}?", pid))

    return out


def build_forced_fumble(pbp_def: pd.DataFrame, season: int, gm: Dict) -> List[Candidate]:
    id_col   = col(pbp_def, "forced_fumble_player_1_player_id")
    team_col = col(pbp_def, "forced_fumble_player_1_team")
    if not id_col or "fumble_forced" not in pbp_def.columns:
        return []
    df = pbp_def[(pbp_def["fumble_forced"] == 1) & pbp_def[id_col].notna()].copy()
    if team_col:
        df = df[df[team_col] == "NE"]
    out = []
    for _, r in df.iterrows():
        pid = gm.get(safe_str(r[id_col]))
        if not pid:
            continue
        out.append(Candidate(1, "forced_fumble", season,
            f"Who forced a fumble in {game_desc(r['week'], r['season_type'], season, r['posteam'])}?", pid))
    return out


def build_pbp_candidates(season: int, gm: Dict, id_to_name: Dict,
                         nfl_names: Dict, opponent_registry: Dict) -> List[Candidate]:
    print(f"  Loading PBP for {season}...")
    try:
        pbp_all = nfl.load_pbp([season]).to_pandas()
    except Exception as e:
        print(f"  WARNING: Could not load PBP for {season}: {e}")
        return []

    pbp_off = pbp_all[pbp_all["posteam"] == "NE"].copy()
    pbp_def = pbp_all[pbp_all["defteam"] == "NE"].copy()

    cands: List[Candidate] = []
    cands += build_rec_td(pbp_off, season, gm)
    cands += build_rush_td(pbp_off, season, gm)
    cands += build_int(pbp_def, season, gm)
    cands += build_int_target(pbp_def, season, gm, nfl_names)
    cands += build_int_victim(pbp_def, season, gm, id_to_name, nfl_names, opponent_registry)
    cands += build_sack(pbp_def, season, gm)
    cands += build_sack_target(pbp_def, season, gm, nfl_names)
    cands += build_sack_victim(pbp_def, season, gm, id_to_name, nfl_names, opponent_registry)
    cands += build_rush_100(pbp_off, season, gm)
    cands += build_rec_100(pbp_off, season, gm)
    cands += build_pick_six(pbp_def, season, gm)
    cands += build_multi_sack(pbp_def, season, gm)
    cands += build_ot_td(pbp_off, season, gm)
    cands += build_return_td(pbp_all, season, gm)
    cands += build_fourth_down_td(pbp_off, season, gm)
    cands += build_pass_300(pbp_off, season, gm)
    cands += build_pass_3td(pbp_off, season, gm)
    cands += build_fumble_return_td(pbp_def, season, gm)
    cands += build_forced_fumble(pbp_def, season, gm)
    cands += build_two_pt(pbp_off, season, gm)
    cands += build_nth_pass_td(pbp_off, season, gm)
    cands += build_playoff_highlights(pbp_all, season, gm)

    print(f"    → {len(cands)} play-level candidates")
    return cands


# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2 — Season stat leaders
# ═══════════════════════════════════════════════════════════════════════════════

def build_season_leader_candidates(seasons: List[int], gm: Dict, debug: bool = False) -> List[Candidate]:
    print("Loading player stats for season leaders...")
    try:
        df = nfl.load_player_stats(seasons=seasons, summary_level="week").to_pandas()
    except Exception as e:
        print(f"  WARNING: load_player_stats failed: {e}")
        return []

    if debug:
        print(f"  player_stats columns: {df.columns.tolist()}")

    team_col = next((c for c in ["team", "recent_team"] if c in df.columns), None)
    id_col   = next((c for c in ["player_id"] if c in df.columns), None)
    if not team_col or not id_col:
        print("  WARNING: missing team or player_id column in player_stats")
        return []

    car = df[df[team_col] == "NE"].copy()
    season_col = "season" if "season" in car.columns else None
    if not season_col:
        return []

    stat_defs = [
        ("rushing_yards",     "season_rush_leader",      100,  "rushing yards"),
        ("receiving_yards",   "season_rec_leader",        100,  "receiving yards"),
        ("passing_tds",       "season_pass_td_leader",      5,  "passing touchdowns"),
        ("passing_yards",     "season_pass_yds_leader",  1000,  "passing yards"),
        ("def_sacks",         "season_sack_leader",         1,  "sacks"),
        ("def_interceptions", "season_int_leader",          1,  "interceptions"),
        ("rushing_tds",       "season_rush_td_leader",      3,  "rushing touchdowns"),
        ("receptions",        "season_receptions_leader",  30,  "receptions"),
    ]

    cands: List[Candidate] = []

    for season in seasons:
        sw = car[car[season_col] == season]
        if sw.empty:
            continue
        by_player = sw.groupby(id_col, as_index=False)

        for stat_col, kind, min_val, label in stat_defs:
            if stat_col not in sw.columns:
                continue
            agg = by_player[stat_col].sum().sort_values(stat_col, ascending=False)
            agg = agg[agg[stat_col] >= min_val]
            if agg.empty:
                continue
            top_gsis = safe_str(agg.iloc[0][id_col])
            if not top_gsis:
                continue
            pid = gm.get(top_gsis)
            if not pid:
                continue
            cands.append(Candidate(2, kind, season,
                f"Who led the Patriots in {label} in {season}?", pid))

    print(f"  → {len(cands)} season-leader candidates across {len(seasons)} seasons")
    return cands


# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3 — Draft picks
# ═══════════════════════════════════════════════════════════════════════════════

def build_draft_candidates(gm: Dict, name_to_id: Dict, debug: bool = False) -> List[Candidate]:
    print("Loading draft picks...")
    try:
        df = nfl.load_draft_picks().to_pandas()
    except Exception as e:
        print(f"  WARNING: load_draft_picks failed: {e}")
        return []

    if debug:
        print(f"  draft_picks columns: {df.columns.tolist()}")

    team_col   = next((c for c in ["team", "pick_team"] if c in df.columns), None)
    name_col   = next((c for c in ["pfr_player_name", "player_name"] if c in df.columns), None)
    gsis_col   = "gsis_id" if "gsis_id" in df.columns else None
    season_col = "season" if "season" in df.columns else None
    round_col  = "round"  if "round"  in df.columns else None
    pick_col   = "pick"   if "pick"   in df.columns else None

    if not all([team_col, season_col, round_col, pick_col]):
        print("  WARNING: missing required columns in draft_picks")
        return []

    # Draft picks data uses "NWE" for New England (PFR abbreviation, differs from nflverse "NE")
    ne_abbrevs = {"NE", "NWE"}
    car = df[df[team_col].isin(ne_abbrevs)].copy()
    cands: List[Candidate] = []

    for _, r in car.iterrows():
        rnd  = int(r[round_col])
        if rnd > 3:
            continue

        # Prefer gsis_id lookup, fall back to full name
        pid = None
        if gsis_col:
            gsis = safe_str(r.get(gsis_col))
            if gsis:
                pid = gm.get(gsis)
        if not pid and name_col:
            name = safe_str(r.get(name_col))
            if name:
                pid = name_to_id.get(normalize_name(name))
        if not pid:
            continue

        season = int(r[season_col])
        pick   = int(r[pick_col])

        if rnd == 1:
            prompt = f"Who did the Patriots select with the {ordinal(pick)} overall pick in the {season} NFL Draft?"
            kind = "draft_pick_r1"
        elif rnd == 2:
            prompt = f"Who did the Patriots select in Round 2, Pick {pick} of the {season} NFL Draft?"
            kind = "draft_pick_r2"
        else:
            prompt = f"Who did the Patriots select in Round 3, Pick {pick} of the {season} NFL Draft?"
            kind = "draft_pick_r3"

        cands.append(Candidate(3, kind, season, prompt, pid))

    print(f"  → {len(cands)} draft pick candidates (rounds 1-3)")
    return cands


# ═══════════════════════════════════════════════════════════════════════════════
# TIER 4 — Jersey number questions
# ═══════════════════════════════════════════════════════════════════════════════

SKIP_POS = {"K", "P", "LS"}

def build_jersey_candidates(gm: Dict, debug: bool = False) -> List[Candidate]:
    print("Loading NE rosters for jersey questions...")
    try:
        df = nfl.load_rosters(seasons=True).to_pandas()
    except Exception as e:
        print(f"  WARNING: load_rosters failed: {e}", file=sys.stderr)
        return []

    car = df[df["team"] == "NE"].copy()
    if debug:
        print(f"  roster columns: {car.columns.tolist()}")

    gsis_col   = "gsis_id"       if "gsis_id"        in car.columns else None
    jersey_col = "jersey_number" if "jersey_number"   in car.columns else None
    season_col = "season"        if "season"          in car.columns else None
    pos_col    = "position"      if "position"        in car.columns else None

    if not gsis_col or not jersey_col or not season_col:
        print("  WARNING: missing required columns for jersey questions")
        return []

    # Drop rows without jersey or gsis
    car = car.dropna(subset=[jersey_col, gsis_col])

    # Filter out special teams
    if pos_col:
        car = car[~car[pos_col].isin(SKIP_POS)]

    cands: List[Candidate] = []

    for (season, jersey), grp in car.groupby([season_col, jersey_col]):
        season = int(season)
        jersey = int(jersey)

        slugs = []
        for _, row in grp.iterrows():
            slug = gm.get(safe_str(row[gsis_col]))
            if slug and slug not in slugs:
                slugs.append(slug)

        if not slugs:
            continue

        prompt = f"Who wore #{jersey} for the Patriots in {season}?"
        for slug in slugs:
            cands.append(Candidate(4, "jersey", season, prompt, slug))

    print(f"  → {len(cands)} jersey candidates")
    return cands


# ═══════════════════════════════════════════════════════════════════════════════
# Scheduling
# ═══════════════════════════════════════════════════════════════════════════════

def schedule_days(candidates: List[GroupedCandidate], start_date: str, num_days: int,
                  seed: int, opponent_rate: float = 0.05) -> List[dict]:
    rnd = random.Random(seed)

    # Split into separate pools so we can control opponent frequency
    opp_pool = [gc for gc in candidates if gc.answer_pool == "opponents"]
    pat_pool = [gc for gc in candidates if gc.answer_pool == "patriots"]
    rnd.shuffle(opp_pool)
    rnd.shuffle(pat_pool)

    used_global: set = set()
    days: List[dict] = []
    start = pd.Timestamp(start_date)

    def pick_one(pool: List[GroupedCandidate], used_players: set) -> Optional[GroupedCandidate]:
        for gc in pool:
            k = gc.day_key()
            if k in used_global or any(pid in used_players for pid in gc.player_ids):
                continue
            used_global.add(k)
            used_players.update(gc.player_ids)
            return gc
        return None

    for d in range(num_days):
        date = (start + pd.Timedelta(days=d)).strftime("%Y-%m-%d")
        picked: List[GroupedCandidate] = []
        used_players: set = set()

        # ~5% of days include one opponent-pool question
        if opp_pool and rnd.random() < opponent_rate:
            gc = pick_one(opp_pool, used_players)
            if gc:
                picked.append(gc)

        # Fill remaining slots from patriots pool
        while len(picked) < 5:
            gc = pick_one(pat_pool, used_players)
            if gc is None:
                break
            picked.append(gc)

        if len(picked) < 5:
            print(f"  WARNING: only {len(picked)} questions for {date}, stopping.")
            break

        rnd.shuffle(picked)
        days.append({"date": date, "questions": [
            {"id": f"q{i+1}", "prompt": gc.prompt, "playerIds": gc.player_ids,
             "answerPool": gc.answer_pool, "tier": gc.tier, "season": gc.season}
            for i, gc in enumerate(picked)
        ]})

    return days


# ═══════════════════════════════════════════════════════════════════════════════
# TS output
# ═══════════════════════════════════════════════════════════════════════════════

TS_HEADER = """\
// Auto-generated by scripts/gen_patriots.py — do not edit by hand.
// All-time Patriots Sicko Mode. Player matching uses gsis_id (no name collisions).

export type SickoQuestion = {
  id: "q1" | "q2" | "q3" | "q4" | "q5";
  prompt: string;
  playerIds: string[];         // all valid answers (usually 1, sometimes multiple for shared plays)
  answerPool: "patriots" | "opponents";  // which autocomplete list to use
  tier: 1 | 2 | 3;            // 1=play-level, 2=season leader, 3=draft pick
  season: number;              // NFL season year, used for era multiplier
};

export type SickoDay = {
  date: string; // YYYY-MM-DD
  questions: SickoQuestion[];
};

"""

def write_opponents_ts(opponent_registry: Dict[str, str], out_path: Path) -> None:
    """Write opponents_patriots.ts with all opposing passers encountered in sack/int victim questions."""
    opponents = sorted(opponent_registry.items(), key=lambda x: x[1])
    entries = [f'  {{ id: "{slug}", name: "{name}" }}' for slug, name in opponents]
    content = (
        "// Auto-generated by scripts/gen_patriots.py — do not edit by hand.\n\n"
        "export type Opponent = { id: string; name: string };\n\n"
        "export const OPPONENTS: Opponent[] = [\n"
        + ",\n".join(entries) + "\n];\n"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")


def write_ts(days: List[dict], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        TS_HEADER + f"export const PUZZLES_PATRIOTS: SickoDay[] = " + json.dumps(days, indent=2) + ";\n",
        encoding="utf-8"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbp-seasons", type=int, nargs="+", default=list(range(1994, 2026)))
    ap.add_argument("--start-date", default="2026-04-06")
    ap.add_argument("--days", type=int, default=1100)
    ap.add_argument("--seed", type=int, default=20010202)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--opp-out", type=Path, default=DEFAULT_OPP_OUT)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if not PLAYERS_TS.exists():
        raise RuntimeError(f"Missing players file: {PLAYERS_TS}")

    # Build lookup tables
    name_to_id = load_name_to_id(PLAYERS_TS)
    print(f"Loaded {len(name_to_id)} name→id mappings from players.ts")

    id_to_pos = load_id_to_pos(PLAYERS_TS)
    print(f"Loaded {len(id_to_pos)} id→pos mappings from players.ts")

    id_to_name = load_id_to_name(PLAYERS_TS)
    print(f"Loaded {len(id_to_name)} id→name mappings from players.ts")

    gm = build_gsis_map(name_to_id, debug=args.debug)
    print(f"gsis_map has {len(gm)} entries\n")

    nfl_names = build_nfl_name_map(debug=args.debug)
    print(f"nfl_name_map has {len(nfl_names)} entries\n")

    opponent_registry: Dict[str, str] = {}  # slug → display name for opposing QBs
    all_candidates: List[Candidate] = []

    # Tier 1
    print(f"── Tier 1: Play-level questions ({len(args.pbp_seasons)} seasons) ──")
    for season in args.pbp_seasons:
        all_candidates += build_pbp_candidates(season, gm, id_to_name, nfl_names, opponent_registry)
    t1 = sum(1 for c in all_candidates if c.tier == 1)
    print(f"Tier 1 total: {t1}\n")

    # Tier 2
    stats_seasons = [s for s in args.pbp_seasons if s >= 1999]
    print(f"── Tier 2: Season leaders ({stats_seasons[0]}–{stats_seasons[-1]}) ──")
    all_candidates += build_season_leader_candidates(stats_seasons, gm, debug=args.debug)
    t2 = sum(1 for c in all_candidates if c.tier == 2)
    print(f"Tier 2 total: {t2}\n")

    # Tier 3
    print("── Tier 3: Draft picks ──")
    all_candidates += build_draft_candidates(gm, name_to_id, debug=args.debug)
    t3 = sum(1 for c in all_candidates if c.tier == 3)
    print(f"Tier 3 total: {t3}\n")


    print(f"Total candidates: {len(all_candidates)}")

    # Group candidates with identical prompts into multi-answer questions
    grouped = group_candidates(all_candidates)
    multi = sum(1 for g in grouped if len(g.player_ids) > 1)
    print(f"Grouped into {len(grouped)} unique questions ({multi} with multiple valid answers)\n")

    apply_position_hints(grouped, id_to_pos)

    print(f"Scheduling {args.days} days from {args.start_date}...")
    # opponent_rate=0.2 → ~20% of days get 1 opponent question → ~5% of all questions
    days = schedule_days(grouped, args.start_date, args.days, args.seed, opponent_rate=0.2)
    print(f"Scheduled {len(days)} days.")

    write_ts(days, args.out)
    print(f"\n✅ Wrote {args.out.relative_to(PROJECT_ROOT)}")

    # Pad the autocomplete with all historical NFL QBs so wrong answers exist
    all_qbs = build_all_qb_registry(debug=args.debug)
    opponent_registry.update({k: v for k, v in all_qbs.items() if k not in opponent_registry})

    opp_out = args.opp_out if hasattr(args, "opp_out") else DEFAULT_OPP_OUT
    write_opponents_ts(opponent_registry, opp_out)
    print(f"✅ Wrote {opp_out.relative_to(PROJECT_ROOT)} ({len(opponent_registry)} opponents)")


if __name__ == "__main__":
    main()
