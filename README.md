# Panthers Trivia — Developer Documentation

A daily Panthers trivia web app built with Next.js, Supabase, and Tailwind CSS.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
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
│   ├── page.tsx              # Main game page (all game logic lives here)
│   ├── layout.tsx            # Root layout, fonts, metadata
│   ├── globals.css           # Global styles
│   ├── api/
│   │   └── submit-score/
│   │       └── route.ts      # Server-side score validation & Supabase write
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts      # Handles Supabase PKCE auth code exchange
│   ├── settings/
│   │   └── page.tsx          # Account settings (username, email, password, birthday)
│   ├── stats/
│   │   └── page.tsx          # Player stats page
│   └── about/
│       └── page.tsx          # About page
├── components/
│   ├── Header.tsx            # Top nav bar
│   ├── AuthModal.tsx         # Login / signup / forgot password modal
│   └── ProfileModal.tsx      # User profile dropdown
├── data/
│   ├── puzzles_sicko.ts      # Daily puzzle definitions (active)
│   ├── puzzles_sicko_2015.ts # Historical puzzle data
│   ├── players.ts            # Player name list for autocomplete
│   └── opponents.ts          # Opponent QB list for autocomplete
└── lib/
    ├── supabase.ts           # Supabase browser client
    ├── storage.ts            # localStorage read/write helpers
    └── time.ts               # Date/timezone utilities
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

**`scores`**
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | References `auth.users.id` |
| date | text | Format: `YYYY-MM-DD` |
| total_score | int | Sum of all 4 question scores |
| questions_correct | int | 0–4 |
| question_results | bool[] | Per-question correct/incorrect |
| question_scores | int[] | Per-question point values |
| hint_used | bool | Whether hint was used |
| hint_question | text | Which question the hint was used on |

Unique constraint on `(user_id, date)` — one score row per user per day.

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

Resend free tier: 3,000 emails/month. Dashboard and logs at resend.com.

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
- **Base points:** 1000
- **Score formula:** `Math.round(1000 * (timeRemaining / 40)) + eraBonus`
- **Era bonus:** pre-2000 = +200pts, 2000s = +100pts, 2010s = +50pts, 2020s = +25pts
- **Hint penalty:** halves the question score
- **Timer:** 40 seconds per question, auto-submits on expiry

### Score Submission (Server-Side Validation)
When all 4 questions are answered and the user is logged in, the client calls **`POST /api/submit-score`** (`src/app/api/submit-score/route.ts`) instead of writing to Supabase directly.

The API route:
1. Verifies the user's session server-side — unauthenticated requests are rejected (401)
2. Receives the raw answers and `timeRemaining` per question (not pre-computed scores)
3. Looks up the correct answers for that date from the server's copy of `puzzles_sicko.ts`
4. Re-runs answer validation and score calculation on the server
5. Clamps `timeRemaining` to `[0, 40]` to prevent inflation
6. Writes the server-computed score to Supabase

This means the client never controls what score gets saved — a user editing localStorage or intercepting the network request cannot inflate their score or mark wrong answers as correct.

Guests (not logged in) can still play normally; `saveScoreToSupabase` exits early if there is no session and the API is never called.

### Progress Storage
Progress is stored in **localStorage** under the key `panthers_daily_v1`. This means progress is per-browser and not tied to a user account. Scores are synced to Supabase (via the server-side API route) only when all 4 questions are answered and the user is logged in.

### Adding New Puzzles
Edit `src/data/puzzles_sicko.ts`. Each puzzle entry needs:
```ts
{
  id: "q1",           // unique id
  date: "2026-04-08", // YYYY-MM-DD, determines which day it appears
  prompt: "Who caught...",
  answers: ["Player Name"],
  answerPool: "players" | "opponents",
  season: 2007,       // used for era bonus
  tier: 1 | 2 | 3,    // difficulty (1 = hardest)
}
```

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run gen:puzzles  # Run puzzle generation script
```

### Puzzle Generation (`scripts/gen_sicko.py`)

The puzzle generator requires Python 3.10+ and a set of data dependencies. A dedicated virtual environment lives at `/Users/andrewmadden/Desktop/Projects/venv` (shared across projects).

**First-time setup** (already done — skip if venv exists):
```bash
/opt/homebrew/bin/python3.11 -m venv /Users/andrewmadden/Desktop/Projects/venv
/Users/andrewmadden/Desktop/Projects/venv/bin/pip install nflreadpy pandas pyarrow
```

**Run the script:**
```bash
/Users/andrewmadden/Desktop/Projects/venv/bin/python3.11 scripts/gen_sicko.py
```

Optional flags:
```
--days 635            # Number of daily puzzles to schedule (default: 635)
--start-date 2026-04-08  # First puzzle date (default: 2026-04-08)
--seed 19951015       # Random seed for reproducibility
--debug               # Verbose output
```

This overwrites `src/data/puzzles_sicko.ts` and `src/data/opponents.ts`. The script covers Panthers seasons **1999–2025** (play-by-play, season leaders, and draft picks).

> **Note:** The system Python at `/usr/bin/python3` is 3.9.6 and will not work. Always use the venv binary above.

---

## Deployment

The app is designed to deploy on **Vercel**:
1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Add your production `/auth/callback` URL to Supabase allowed redirects
5. Deploy
