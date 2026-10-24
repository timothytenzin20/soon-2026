"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Question } from "@mb/domain/questions";

/** All follow-ups (max 4) on one screen. "Not sure" is always an option; skipping is allowed. */
export function QuestionFlow({ id, questions }: { id: string; questions: Question[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const answered = questions.filter((q) => values[q.id] !== undefined).length;

  async function send(finish: boolean) {
    const answers = questions.filter((q) => values[q.id] !== undefined).map((q) => ({ questionId: q.id, value: values[q.id]! }));
    if (!finish && answers.length < questions.filter((q) => !q.optional).length) {
      setError(`Please answer each question. "Not sure" is fine.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assessments/${id}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, finish: true }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save your answers. Please try again.");
    router.push(`/assess/${id}/progress`);
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void send(false);
      }}
    >
      <div className="spread">
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-xl)", margin: 0 }}>
          {questions.length === 1 ? "One quick question" : `${questions.length} quick questions`}
        </h1>
        <span className="small muted">
          {answered} of {questions.length} answered
        </span>
      </div>
      {error && (
        <div className="notice notice-danger small" role="alert">
          {error}
        </div>
      )}
      <div className="q-grid">
        {questions.map((q) => (
          <fieldset key={q.id} className="q-card">
            <legend>{q.text}</legend>
            {q.help && (
              <p className="hint" style={{ marginTop: "calc(-1 * var(--space-2))" }}>
                {q.help}
              </p>
            )}
            <div className="choice-grid">
              {q.options.map((o) => (
                <label key={o.value} className="choice">
                  <input type="radio" name={q.id} checked={values[q.id] === o.value} onChange={() => setValues((v) => ({ ...v, [q.id]: o.value }))} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="cta-bar">
        <div className="row">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void send(true)}>
            Skip
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "See my results"}
          </button>
        </div>
      </div>
    </form>
  );
}
