from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional

import pandas as pd
import nflreadpy as nfl  # pip install nflreadpy


# ---------- Paths ----------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = PROJECT_ROOT / "src" / "data" / "players.ts"
OUT_TS = PROJECT_ROOT / "src" / "data" / "puzzles_sicko_2015.ts"
MISSING_TXT = PROJECT_ROOT / "scripts" / "missing_scorers_2015.txt"
MISSING_STUB_TS = PROJECT_ROOT / "scripts" / "missing_scorers_2015_stub.ts"


# ---------- Team names ----------
TEAM_NAMES = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams",
    "LAC": "Los Angeles Chargers",
    "LV": "Las Vegas Raiders",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots",
    "NO": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers",
    "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
    # legacy aliases (just in case)
    "STL": "St. Louis Rams",
    "SD": "San Diego Chargers",
    "OAK": "Oakland Raiders",
}


def team_name(abbrev: str) -> str:
    a = str(abbrev).upper().strip()
    return TEAM_NAMES.get(a, a)


# ---------- Name mapping ----------
def normalize_name(s: str) -> str:
    s = s.lower()
    s = s.replace(".", "")
    s = re.sub(r"[,]", "", s)
    s = re.sub(r"\b(sr|jr|ii|iii|iv)\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slugify_id(name: str) -> str:
    s = normalize_name(name)
    s = s.replace(" ", "-")
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"\-+", "-", s).strip("-")
    return s


def load_players_map(players_ts_path: Path) -> Dict[str, str]:
    """
    Returns name variants -> player_id, including:
      - full name: "cam newton"
      - abbreviated pbp: "c.newton" and "cnewton"
      - initial + last: "c newton"
    """
    txt = players_ts_path.read_text(encoding="utf-8")
    pattern = re.compile(r'id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"', re.MULTILINE)

    name_to_id: Dict[str, str] = {}

    for pid, name in pattern.findall(txt):
        full_norm = normalize_name(name)  # "cam newton"
        name_to_id[full_norm] = pid

        parts = full_norm.split(" ")
        if len(parts) >= 2:
            first = parts[0]
            last = parts[-1]

            # "c.newton"
            name_to_id[f"{first[0]}.{last}"] = pid
            # "c newton"
            name_to_id[f"{first[0]} {last}"] = pid
            # "cnewton"
            name_to_id[f"{first[0]}{last}"] = pid

    if not name_to_id:
        raise RuntimeError(f"Could not parse any players from {players_ts_path}")

    return name_to_id


def map_player_name_to_id(name: str, name_to_id: Dict[str, str]) -> Optional[str]:
    # Try pbp shorthand first: "c.newton" / "cnewton"
    raw = name.strip().lower().replace(" ", "")
    if raw in name_to_id:
        return name_to_id[raw]

    # Full-name normalized
    n = normalize_name(name)
    if n in name_to_id:
        return name_to_id[n]

    # Fallback: remove single-letter middles
    n2 = re.sub(r"\b[a-z]\b", "", n)
    n2 = re.sub(r"\s+", " ", n2).strip()
    return name_to_id.get(n2)


# ---------- Puzzle writing ----------
def write_ts(var_name: str, puzzles: List[dict], out_path: Path) -> None:
    out = "export type Puzzle = { date: string; playerId: string; clues: string[] };\n"
    out += f"export const {var_name}: Puzzle[] = "
    out += json.dumps(puzzles, indent=2)
    out += ";\n"
    out_path.write_text(out, encoding="utf-8")


def write_missing_reports(missing_counts: pd.Series) -> None:
    if len(missing_counts) == 0:
        if MISSING_TXT.exists():
            MISSING_TXT.unlink()
        if MISSING_STUB_TS.exists():
            MISSING_STUB_TS.unlink()
        return

    MISSING_TXT.write_text(
        "\n".join([f"{name} ({count})" for name, count in missing_counts.head(120).items()]),
        encoding="utf-8",
    )

    stubs = []
    for name in missing_counts.head(120).index.tolist():
        pid = slugify_id(str(name))
        stubs.append(f'  {{ id: "{pid}", name: "{name}", pos: "?", era: "2010s" }},')

    stub_out = (
        "// Paste these into src/data/players.ts (PLAYERS array). Then fill pos/era.\n"
        "export const MISSING_SCORERS_2015 = [\n"
        + "\n".join(stubs)
        + "\n];\n"
    )
    MISSING_STUB_TS.write_text(stub_out, encoding="utf-8")


# ---------- Prompt system ----------
@dataclass(frozen=True)
class PromptSpec:
    key: str
    label: str
    side: str  # "offense" | "defense"
    builder: Callable[[pd.DataFrame], pd.DataFrame]


def _base_cols(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize output columns for all prompt builders:
      season_type, week, qtr, opp, answer_name, play_type, prompt
    """
    needed = ["season_type", "week", "qtr", "opp", "answer_name", "play_type", "prompt"]
    for c in needed:
        if c not in df.columns:
            df[c] = None
    return df[needed].copy()


# ----- OFFENSE: TD receiving / rushing (play-level) -----
def build_rec_td(pbp_off: pd.DataFrame) -> pd.DataFrame:
    df = pbp_off[(pbp_off["pass_touchdown"] == 1) & pbp_off["receiver"].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    df["answer_name"] = df["receiver"].astype(str)  # shorthand like C.Newton / T.Ginn
    df["opp"] = df["defteam"].astype(str)
    df["play_type"] = "rec_td"
    df["prompt"] = df.apply(
        lambda r: f"Receiver who caught a TD pass vs {team_name(r['opp'])} in Q{int(r['qtr'])}, Week {int(r['week'])} ({r['season_type']}), 2015",
        axis=1,
    )
    return _base_cols(df)


def build_rush_td(pbp_off: pd.DataFrame) -> pd.DataFrame:
    df = pbp_off[(pbp_off["rush_touchdown"] == 1) & pbp_off["rusher"].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    df["answer_name"] = df["rusher"].astype(str)
    df["opp"] = df["defteam"].astype(str)
    df["play_type"] = "rush_td"
    df["prompt"] = df.apply(
        lambda r: f"Rusher who scored a rushing TD vs {team_name(r['opp'])} in Q{int(r['qtr'])}, Week {int(r['week'])} ({r['season_type']}), 2015",
        axis=1,
    )
    return _base_cols(df)


# ----- OFFENSE: 100+ rush yards (aggregate) -----
def build_rush_100(pbp_off: pd.DataFrame) -> pd.DataFrame:
    df = pbp_off[(pbp_off["rush_attempt"] == 1) & pbp_off["rusher"].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    g = (
        df.groupby(["season_type", "week", "defteam", "rusher"], as_index=False)["rushing_yards"]
        .sum()
        .rename(columns={"defteam": "opp", "rusher": "answer_name", "rushing_yards": "rush_yds"})
    )
    g = g[g["rush_yds"] >= 100].copy()
    if len(g) == 0:
        return _base_cols(g)

    g["qtr"] = 0
    g["play_type"] = "rush_100"
    g["prompt"] = g.apply(
        lambda r: f"Who rushed for 100+ yards ({int(r['rush_yds'])}) vs {team_name(r['opp'])} in Week {int(r['week'])} ({r['season_type']}), 2015?",
        axis=1,
    )
    return _base_cols(g)


# ----- DEFENSE: interceptions (play-level) -----
def build_int(pbp_def: pd.DataFrame) -> pd.DataFrame:
    # Some pbp exports include interception_player_name; fallback to generic shorthand 'interception_player_name' if present
    name_col = None
    for c in ["interception_player_name", "interceptor", "interception_player"]:
        if c in pbp_def.columns:
            name_col = c
            break
    if name_col is None or "interception" not in pbp_def.columns:
        return _base_cols(pbp_def.iloc[0:0].copy())

    df = pbp_def[(pbp_def["interception"] == 1) & pbp_def[name_col].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    df["answer_name"] = df[name_col].astype(str)
    df["opp"] = df["posteam"].astype(str)  # opponent is offense on the play
    df["play_type"] = "int"
    df["prompt"] = df.apply(
        lambda r: f"Who recorded an interception vs {team_name(r['opp'])} in Q{int(r['qtr'])}, Week {int(r['week'])} ({r['season_type']}), 2015?",
        axis=1,
    )
    return _base_cols(df)


# ----- DEFENSE: sacks (play-level) -----
def build_sack(pbp_def: pd.DataFrame) -> pd.DataFrame:
    name_col = None
    for c in ["sack_player_name", "sacker_player_name", "sack_player"]:
        if c in pbp_def.columns:
            name_col = c
            break
    flag_col = "sack" if "sack" in pbp_def.columns else None
    if name_col is None or flag_col is None:
        return _base_cols(pbp_def.iloc[0:0].copy())

    df = pbp_def[((pbp_def[flag_col] == 1) | (pbp_def[flag_col] is True)) & pbp_def[name_col].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    df["answer_name"] = df[name_col].astype(str)
    df["opp"] = df["posteam"].astype(str)
    df["play_type"] = "sack"
    df["prompt"] = df.apply(
        lambda r: f"Who recorded a sack vs {team_name(r['opp'])} in Q{int(r['qtr'])}, Week {int(r['week'])} ({r['season_type']}), 2015?",
        axis=1,
    )
    return _base_cols(df)


# ----- DEFENSE: forced fumbles (play-level) -----
def build_forced_fumble(pbp_def: pd.DataFrame) -> pd.DataFrame:
    flag_col = None
    for c in ["fumble_forced", "forced_fumble"]:
        if c in pbp_def.columns:
            flag_col = c
            break

    name_col = None
    for c in ["forced_fumble_player_name", "fumble_forced_player_name"]:
        if c in pbp_def.columns:
            name_col = c
            break

    if flag_col is None or name_col is None:
        return _base_cols(pbp_def.iloc[0:0].copy())

    df = pbp_def[((pbp_def[flag_col] == 1) | (pbp_def[flag_col] is True)) & pbp_def[name_col].notna()].copy()
    if len(df) == 0:
        return _base_cols(df)

    df["answer_name"] = df[name_col].astype(str)
    df["opp"] = df["posteam"].astype(str)
    df["play_type"] = "ff"
    df["prompt"] = df.apply(
        lambda r: f"Who forced a fumble vs {team_name(r['opp'])} in Q{int(r['qtr'])}, Week {int(r['week'])} ({r['season_type']}), 2015?",
        axis=1,
    )
    return _base_cols(df)


PROMPTS: List[PromptSpec] = [
    PromptSpec("rec_td", "Receiving TD (play)", "offense", build_rec_td),
    PromptSpec("rush_td", "Rushing TD (play)", "offense", build_rush_td),
    PromptSpec("rush_100", "100+ rushing yards (game)", "offense", build_rush_100),
    PromptSpec("int", "Interception (play)", "defense", build_int),
    PromptSpec("sack", "Sack (play)", "defense", build_sack),
    PromptSpec("ff", "Forced fumble (play)", "defense", build_forced_fumble),
]


# ---------- Scheduling + sampling ----------
def choose_rows_balanced(df: pd.DataFrame, per_type: int, seed: int) -> pd.DataFrame:
    """
    Keep a balanced mix by sampling up to per_type rows from each play_type.
    Deterministic sampling using seed.
    """
    if len(df) == 0:
        return df

    out = []
    for play_type, grp in df.groupby("play_type"):
        # deterministic shuffle
        g = grp.sample(frac=1, random_state=seed).head(per_type)
        out.append(g)

    chosen = pd.concat(out, ignore_index=True) if out else df.iloc[0:0].copy()

    # De-dupe: don't repeat same (type, week, opp, answer)
    chosen["dedupe_key"] = (
        chosen["play_type"].astype(str)
        + "|"
        + chosen["season_type"].astype(str)
        + "|"
        + chosen["week"].astype(str)
        + "|"
        + chosen["opp"].astype(str)
        + "|"
        + chosen["answer_name"].astype(str)
    )
    chosen = chosen.drop_duplicates("dedupe_key").drop(columns=["dedupe_key"])

    # Sort into a stable order: REG first then week then quarter then type
    chosen["season_rank"] = chosen["season_type"].map({"REG": 0, "WC": 1, "DIV": 2, "CON": 3, "SB": 4}).fillna(9)
    chosen = chosen.sort_values(["season_rank", "week", "qtr", "play_type"], ascending=True).drop(columns=["season_rank"])

    return chosen.reset_index(drop=True)


def build_schedule(df: pd.DataFrame, start_date: str) -> List[dict]:
    start = pd.Timestamp(start_date)
    puzzles: List[dict] = []

    for i, row in df.iterrows():
        date = (start + pd.Timedelta(days=int(i))).strftime("%Y-%m-%d")
        clues = [
            row["prompt"],
            f"Opponent: {team_name(row['opp'])}",
            f"Week: {int(row['week'])}",
            f"Quarter: Q{int(row['qtr'])}" if int(row["qtr"]) > 0 else "Quarter: (game total)",
            f"Season type: {row['season_type']}",
        ]
        puzzles.append({"date": date, "playerId": row["playerId"], "clues": clues})

    return puzzles


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2015)
    ap.add_argument("--start-date", type=str, default="2026-02-20")  # schedule start
    ap.add_argument("--per-type", type=int, default=60)  # max prompts per category
    ap.add_argument("--seed", type=int, default=20150207)  # deterministic shuffle
    args = ap.parse_args()

    if not PLAYERS_TS.exists():
        raise RuntimeError(f"Missing players file: {PLAYERS_TS}")

    name_to_id = load_players_map(PLAYERS_TS)

    pbp_all = nfl.load_pbp([args.season]).to_pandas()
    print("Rows loaded:", len(pbp_all))

    # offense: CAR is posteam
    pbp_off = pbp_all[pbp_all["posteam"] == "CAR"].copy()

    # defense: CAR is defteam
    pbp_def = pbp_all[pbp_all["defteam"] == "CAR"].copy()

    # Build all prompt candidates
    frames = []
    for spec in PROMPTS:
        try:
            base = pbp_off if spec.side == "offense" else pbp_def
            f = spec.builder(base)
            if len(f) > 0:
                frames.append(f)
            print(f"{spec.key}: {len(f)} candidates")
        except Exception as e:
            print(f"{spec.key}: ERROR -> {e}")

    all_events = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(
        columns=["season_type", "week", "qtr", "opp", "answer_name", "play_type", "prompt"]
    )

    print("Total candidates:", len(all_events))
    if len(all_events) == 0:
        write_ts("PUZZLES_SICKO_2015", [], OUT_TS)
        print(f"✅ Wrote 0 sicko puzzles to {OUT_TS.relative_to(PROJECT_ROOT)} (no candidates)")
        return

    # Map answer_name -> playerId
    all_events["playerId"] = all_events["answer_name"].astype(str).apply(lambda n: map_player_name_to_id(n, name_to_id))

    # Missing report
    missing_counts = all_events[all_events["playerId"].isna()]["answer_name"].value_counts()
    write_missing_reports(missing_counts)

    if len(missing_counts) > 0:
        print(f"⚠️ Missing scorers not in PLAYERS list. See: {MISSING_TXT.relative_to(PROJECT_ROOT)}")
        print(f"   Paste-ready stubs: {MISSING_STUB_TS.relative_to(PROJECT_ROOT)}")

    mapped = all_events[all_events["playerId"].notna()].copy()
    print("Mapped candidates:", len(mapped))

    if len(mapped) == 0:
        write_ts("PUZZLES_SICKO_2015", [], OUT_TS)
        print(f"✅ Wrote 0 sicko puzzles to {OUT_TS.relative_to(PROJECT_ROOT)} (no candidates matched PLAYERS yet)")
        return

    chosen = choose_rows_balanced(mapped, per_type=args.per_type, seed=args.seed)
    puzzles = build_schedule(chosen, start_date=args.start_date)
    write_ts("PUZZLES_SICKO_2015", puzzles, OUT_TS)
    print(f"✅ Wrote {len(puzzles)} sicko puzzles to {OUT_TS.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()