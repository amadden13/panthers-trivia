import re

# Parse player name -> position from players.ts
players_path = "src/data/players.ts"
player_pos: dict[str, str] = {}

with open(players_path) as f:
    content = f.read()

# Match entries like: name: "Ricky Manning", pos: "CB"
entries = re.findall(r'name:\s*"([^"]+)"[^}]*?pos:\s*"([^"]+)"', content, re.DOTALL)
for name, pos in entries:
    # Strip parenthetical suffixes e.g. "Mike Adams (S)" -> "Mike Adams"
    clean = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()
    player_pos[clean.lower()] = pos

print(f"Loaded {len(player_pos)} players")

# Transform puzzles_sicko.ts
puzzles_path = "src/data/puzzles_sicko.ts"
with open(puzzles_path) as f:
    puzzles = f.read()

pattern = re.compile(
    r'Which QB did ([A-Za-z\'\.\- ]+?) intercept in (Week \d+|the \d{4} [A-Za-z ]+) of the (\d{4} season[^a-z]*)against the ([A-Za-z0-9 ]+?)\?'
)

not_found = []
count = 0

def replace(m):
    global count
    player_name = m.group(1).strip()
    week = m.group(2).strip()
    season_part = m.group(3).strip()  # e.g. "2004 season "
    team = m.group(4).strip()
    pos = player_pos.get(player_name.lower(), "")
    if not pos:
        not_found.append(player_name)
        pos = "DB"  # fallback
    count += 1
    return f"Which {team} QB did {pos} {player_name} intercept in {week} of the {season_part}?"

new_puzzles = pattern.sub(replace, puzzles)

with open(puzzles_path, "w") as f:
    f.write(new_puzzles)

print(f"Updated {count} prompts")
if not_found:
    print(f"Position not found for: {sorted(set(not_found))}")
