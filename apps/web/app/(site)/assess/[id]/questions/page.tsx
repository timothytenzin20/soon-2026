import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOpenQuestions } from "@mb/pipeline";
import { QuestionFlow } from "@/components/QuestionFlow";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "A few questions" };

export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getOpenQuestions(db(), await getPrincipal(), id).catch(() => notFound());
  if (q.status !== "needs_answers" || q.open.length === 0) redirect(`/assess/${id}/progress`);
  return (
    <div className="container" style={{ paddingTop: "var(--space-5)", maxWidth: "60rem" }}>
      <QuestionFlow id={id} questions={q.open} />
    </div>
  );
}
