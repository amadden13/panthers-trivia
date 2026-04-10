import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PUZZLES_SICKO } from "@/data/puzzles_sicko";
import { PLAYERS } from "@/data/players";
import { OPPONENTS } from "@/data/opponents";

const BASE_PTS = 100;

function eraBonus(season: number): number {
  if (season < 2000) return 25;
  if (season < 2010) return 15;
  if (season < 2020) return 5;
  return 0;
}

function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type AnswerInput = {
  questionId: string;
  answer: string;
  timeRemaining: number;
  hintUsed: boolean;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { date, answers }: { date: string; answers: AnswerInput[] } = body;

  if (!date || !Array.isArray(answers) || answers.length !== 5) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const dayPuzzle = (PUZZLES_SICKO as any[]).find((d: any) => d.date === date);
  if (!dayPuzzle) {
    return NextResponse.json({ error: "No puzzle for this date" }, { status: 404 });
  }

  const questions: Array<{
    id: string;
    playerIds?: string[];
    playerId?: string;
    answerPool?: string;
    season?: number;
  }> = dayPuzzle.questions;

  const questionResults: boolean[] = [];
  const questionScores: number[] = [];
  let hintQuestion: string | null = null;

  for (const ans of answers) {
    const q = questions.find((x) => x.id === ans.questionId);
    if (!q) {
      console.log(`[submit-score] No question found for id: ${ans.questionId}`);
      questionResults.push(false);
      questionScores.push(0);
      continue;
    }

    const ids = q.playerIds ?? (q.playerId ? [q.playerId] : []);
    const pool = q.answerPool === "opponents" ? OPPONENTS : PLAYERS;
    const validPlayers = ids.flatMap((id) => {
      const p = pool.find((x) => x.id === id);
      return p ? [p] : [];
    });

    const isCorrect = validPlayers.some(
      (p) => normalizeName(ans.answer) === normalizeName(p.name)
    );

    const season = q.season ?? 2020;
    const clampedTime = Math.max(0, Math.min(40, ans.timeRemaining));
    const rawScore = isCorrect
      ? Math.round(BASE_PTS * (clampedTime / 40)) + eraBonus(season)
      : 0;
    const score = ans.hintUsed ? Math.floor(rawScore / 2) : rawScore;

    if (ans.hintUsed && !hintQuestion) {
      hintQuestion = ans.questionId;
    }

    questionResults.push(isCorrect);
    questionScores.push(score);
  }

  const totalScore = questionScores.reduce((a, b) => a + b, 0);
  const questionsCorrect = questionResults.filter(Boolean).length;
  const hintUsed = hintQuestion !== null;

  const { error } = await supabase.from("scores").upsert(
    {
      user_id: user.id,
      date,
      total_score: totalScore,
      questions_correct: questionsCorrect,
      question_results: questionResults,
      question_scores: questionScores,
      hint_used: hintUsed,
      hint_question: hintQuestion,
    },
    { onConflict: "user_id,date" }
  );

  if (error) {
    console.error("Score save error:", error);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    results: questionResults,
    scores: questionScores,
    totalScore,
    questionsCorrect,
  });
}
