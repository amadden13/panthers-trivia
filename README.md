# NFL Trivia — Developer Documentation

A daily NFL trivia web app supporting multiple teams. Each team gets its own game page and leaderboard. Built with Next.js, Supabase, and Tailwind CSS.

**Live teams:**
- Panthers — `/panthers` · leaderboard at `/stats`
- Patriots — `/patriots` · leaderboard at `/patriots/stats`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Email | Resend (via Supabase custom SMTP) |
| Local Storage | Browser `localStorage` |

---

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
Create a `.env.local` file in the project root:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
Both values are found in **Supabase Dashboard → Project Settings → API**.

### 3. Run the dev server
```bash
npm run dev
```
App runs at `http://localhost:3000`.

### 4. Access on your phone (local network)
```bash
npm run dev -- --hostname 0.0.0.0
```
Then visit `http://<your-machine-ip>:3000` on your phone (must be on the same Wi-Fi).

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Team select landing page
│   ├── layout.tsx                  # Root layout, fonts, metadata
│   ├── globals.css                 # Global styles + field/ball animations
│   ├── about/
│   │   └── page.tsx                # About page
│   ├── settings/
│   │   └── page.tsx                # Account settings (username, email, password, birthday)
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts            # Supabase PKCE auth code exchange
│   │
│   ├── panthers/
│   │   └── page.tsx                # Panthers game (all game logic)
│   ├── stats/
│   │   └── page.tsx                # Panthers leaderboard
│   │
│   ├── patriots/
│   │   ├── page.tsx                # Patriots game (same engine, NE colors)
│   │   └── stats/
│   │       └── page.tsx            # Patriots leaderboard
│   │
│   └── api/
│       ├── submit-score/
│       │   └── route.ts            # Server-side score validation for Panthers
│       └── submit-score-patriots/
│           └── route.ts            # Server-side score validation for Patriots
│
├── components/
│   ├── Header.tsx                  # Panthers nav bar (accepts `team` prop)
│   ├── AuthModal.tsx               # Login / signup / forgot password modal
│   └── ProfileModal.tsx            # User profile dropdown
│
├── data/
│   ├── players.ts                  # Panthers roster (autocomplete source)
│   ├── opponents.ts                # All-NFL QB list for Panthers opponent questions
│   ├── puzzles_sicko.ts            # Panthers daily puzzles (active)
│   ├── players_patriots.ts         # Patriots roster (autocomplete source)
│   ├── opponents_patriots.ts       # All-NFL QB list for Patriots opponent questions
│   └── puzzles_patriots.ts         # Patriots daily puzzles (active)
│
└── lib/
    ├── supabase.ts                 # Supabase browser client
    ├── storage.ts                  # localStorage read/write helpers (Panthers)
    └── time.ts                     # Date/timezone utilities (chicagoYMD)
```

---

## Supabase Setup

### Database Tables

**`profiles`**
| Column | Type | Notes |
|---|---|---|
| id | uuid | References `auth.users.id` |
| username | text | Unique display name |
| birthdate | date | Optional |
| is_admin | bool | Enables admin date picker in game |

**`scores`**
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | References `auth.users.id` |
| date | text | Format: `YYYY-MM-DD` |
| team | text | `"panthers"` or `"patriots"` — defaults to `"panthers"` |
| total_score | int | Sum of all 5 question scores |
| questions_correct | int | 0–5 |
| question_results | bool[] | Per-question correct/incorrect |
| question_scores | int[] | Per-question point values |
| hint_used | bool | Whether hint was used that day |
| hint_question | text | Which question id the hint was used on |

Unique constraint on `(user_id, date, team)` — one score per user per day per team.

### Required Migration (Patriots support)

If upgrading from a Panthers-only deployment, run this SQL in the Supabase SQL editor:

```sql
-- Add team column (existing rows default to 'panthers')
ALTER TABLE scores ADD COLUMN team text NOT NULL DEFAULT 'panthers';

-- Index for leaderboard queries
CREATE INDEX scores_team_idx ON scores(team);

-- Update unique constraint to allow same user to play both teams on same day
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_user_id_date_key;
ALTER TABLE scores ADD CONSTRAINT scores_user_id_date_team_key
  UNIQUE (user_id, date, team);
```

### Auth Configuration
- **Allowed Redirect URLs** (Dashboard → Auth → URL Configuration):
  - `http://localhost:3000/auth/callback`
  - Your production URL + `/auth/callback` when deployed

### Email (Resend SMTP)
Configured under **Dashboard → Project Settings → Auth → SMTP Settings**:
- **Host:** `smtp.resend.com`
- **Port:** `465`
- **Username:** `resend`
- **Password:** Resend API key
- **Sender:** `onboarding@resend.dev` (or your own domain)

Resend free tier: 3,000 emails/month.

---

## Authentication Flow

### Sign Up
1. User enters username, optional birthday, email, password
2. Username uniqueness checked against `profiles` table
3. `supabase.auth.signUp()` called
4. Birthday saved to `profiles` table

### Login
Standard email + password via `supabase.auth.signInWithPassword()`.

### Forgot Password
1. User enters email, clicks "Send reset link"
2. `supabase.auth.resetPasswordForEmail()` called with `redirectTo: /auth/callback?next=/settings`
3. Resend delivers the email
4. User clicks link → hits `/auth/callback` route
5. Route calls `supabase.auth.exchangeCodeForSession()` (PKCE flow)
6. Redirects to `/settings?recovery=true`
7. Settings page detects `recovery=true` and shows "Set a new password" form
8. `supabase.auth.updateUser({ password })` called to save new password

### Change Password (logged in)
Settings → Password requires the user to enter their **current password** first. The app re-authenticates via `signInWithPassword` to verify it before calling `updateUser`.

---

## Game Logic

### Scoring
- **Base points:** 100 per question
- **Score formula:** `Math.round(100 × (timeRemaining / 40)) + eraBonus`
- **Era bonuses:** pre-2000 = +25 pts, 2000s = +15 pts, 2010s = +5 pts, 2020s = +0 pts
- **Hint penalty:** halves the question score (jersey number hint, 1 per day)
- **Timer:** 40 seconds per question, auto-submits on expiry
- **Max possible score:** 625 pts/day (5 × 125 for a pre-2000 question answered instantly)

### Questions per day
5 questions per day, shuffled from a pool of candidates:
- **Tier 1 (play-level):** Who caught this TD, who recorded this sack/INT, etc.
- **Tier 2 (season leader):** Who led the team in rushing yards in [year]?
- **Tier 3 (draft pick):** Who was selected with pick X in [year]?

~80% of days are pure team-player answers. ~20% of days include one opponent question (e.g. "Which QB did [player] sack?") drawn from the opponents autocomplete list.

### Score Submission (Server-Side Validation)
When all 5 questions are answered and the user is logged in, the client calls the appropriate API route instead of writing to Supabase directly:

| Team | API Route |
|---|---|
| Panthers | `POST /api/submit-score` |
| Patriots | `POST /api/submit-score-patriots` |

Each API route:
1. Verifies the user's session server-side — unauthenticated requests are rejected (401)
2. Receives raw answers and `timeRemaining` per question (never pre-computed scores)
3. Looks up correct answers from the server's copy of the puzzle file
4. Re-runs answer validation and score calculation on the server
5. Clamps `timeRemaining` to `[0, 40]` to prevent inflation
6. Writes the server-computed score to Supabase with the correct `team` value

This means the client never controls what score gets saved.

### Progress Storage

Each team uses its own localStorage namespace so progress never conflicts:

| Team | Key pattern |
|---|---|
| Panthers | `panthers_daily_v1` (via `@/lib/storage`) |
| Panthers timer | `panthers_timer_v1_{date}_{questionId}` |
| Patriots | `patriots_daily_v1_{date}` |
| Patriots timer | `patriots_timer_v1_{date}_{questionId}` |

Scores are synced to Supabase only when all 5 questions are answered and the user is signed in. Guests can play but scores aren't persisted.

### Session Restore
When a logged-in user loads the game after already completing it, the app:
1. Checks local storage first — if answers are there, uses them directly
2. If local storage is empty but Supabase has a score for today, restores a placeholder UI showing which questions were correct/incorrect (actual guesses not re-shown)
3. If local storage has all 5 answers but no Supabase record yet (e.g. submitted offline), syncs to Supabase on load

---

## Multi-Team Architecture

### Adding a New Team

To add another team (e.g. Cowboys), follow this pattern:

1. **Generate roster data:**
   ```bash
   python3.11 scripts/gen_patriots_players.py --help
   # Copy gen_patriots_players.py, change TEAM_FILTER = "DAL"
   ```

2. **Generate puzzles:**
   ```bash
   # Copy gen_patriots.py, change team filter and output file names
   ```

3. **Add data files** to `src/data/`: `players_cowboys.ts`, `opponents_cowboys.ts`, `puzzles_cowboys.ts`

4. **Create game page** at `src/app/cowboys/page.tsx` (copy `patriots/page.tsx`, update colors + imports)

5. **Create leaderboard** at `src/app/cowboys/stats/page.tsx` (copy `patriots/stats/page.tsx`, filter by `team = "cowboys"`)

6. **Add API route** at `src/app/api/submit-score-cowboys/route.ts` (copy patriots version, use cowboys data)

7. **Add to Supabase** — no schema changes needed; the `team` column already supports any string value

8. **Link from the landing page** at `src/app/page.tsx`

### Team Colors Reference

| Team | Primary | Accent |
|---|---|---|
| Panthers | `#0085CA` (blue) | `#BFC0BF` (silver) |
| Patriots | `#002244` (navy) | `#C60C30` (red) |

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Python environment

The data generation scripts require Python 3.11 with `nflreadpy`, `pandas`, and `pyarrow`. A virtual environment lives at `.venv/` inside the project root.

```bash
# Activate the venv (if needed)
source .venv/bin/activate

# Or run directly with the venv binary
.venv/bin/python3.11 scripts/gen_sicko.py
```

---

### Panthers Scripts

#### `scripts/gen_players.py` — Generate `src/data/players.ts`

Pulls all-time CAR rosters from nflreadpy and builds the player autocomplete list.

```bash
python3.11 scripts/gen_players.py
```

Options:
```
--out PATH      Output path (default: src/data/players.ts)
--no-merge      Overwrite entirely (default: merge, preserving hand-crafted entries)
--debug         Print column names and sample rows
```

#### `scripts/gen_sicko.py` — Generate Panthers puzzles

Generates `src/data/puzzles_sicko.ts` and `src/data/opponents.ts` from Panthers play-by-play, season stats, and draft data (seasons 1999–2025).

```bash
python3.11 scripts/gen_sicko.py
```

Options:
```
--days 1100              # Number of days to schedule (default: 1100)
--start-date 2026-04-06  # First puzzle date
--seed 19951015          # Random seed (Panthers founding date)
--pbp-seasons 1999..2025 # Play-by-play seasons to include
--out PATH               # Output path for puzzles
--opp-out PATH           # Output path for opponents
--debug                  # Verbose output
```

---

### Patriots Scripts

#### `scripts/gen_patriots_players.py` — Generate `src/data/players_patriots.ts`

Pulls all-time NE rosters (1995–2025) from nflreadpy.

```bash
python3.11 scripts/gen_patriots_players.py
```

Options:
```
--out PATH    Output path (default: src/data/players_patriots.ts)
--debug       Print column names and sample rows
```

#### `scripts/gen_patriots.py` — Generate Patriots puzzles

Generates `src/data/puzzles_patriots.ts` and `src/data/opponents_patriots.ts` from Patriots play-by-play, season stats, and draft data (seasons 1994–2025).

```bash
python3.11 scripts/gen_patriots.py
```

Options:
```
--days 1100              # Number of days to schedule (default: 1100)
--start-date 2026-04-06  # First puzzle date
--seed 20010202          # Random seed (Patriots' first Super Bowl date)
--pbp-seasons 1994..2025 # Play-by-play seasons to include
--out PATH               # Output path for puzzles
--opp-out PATH           # Output path for opponents
--debug                  # Verbose output
```

---

## Deployment

The app is designed to deploy on **Vercel**:
1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Add your production `/auth/callback` URL to Supabase allowed redirects
5. Deploy

> **Before deploying Patriots support:** run the Supabase migration above and the two Patriots generation scripts so the data files are populated.
