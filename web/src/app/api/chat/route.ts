import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/engine/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }

  try {
    const answer = await answerQuestion(parsed.data.question);
    return NextResponse.json(answer);
  } catch (err) {
    console.error("[api/chat] answerQuestion failed:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}