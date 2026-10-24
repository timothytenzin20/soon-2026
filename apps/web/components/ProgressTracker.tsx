"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface StatusResponse {
  status: string;
  reference: string;
  phase: { step: number; label: string };
  assets: { id: string; kind: string; status: string; rejectionReason: string | null }[];
}

const PHASES = ["Uploaded", "Preparing your media", "Reviewing evidence", "A few questions for you", "Results ready"];

/** Polls the durable server state. Shows real phases only, never a made-up percentage. */
export function ProgressTracker({ id }: { id: string }) {
  const router = useRouter();
  const [s, setS] = useState<StatusResponse | null>(null);
  const [netError, setNetError] = useState(false);
  const delay = useRef(1500);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/assessments/${id}`, { cache: "no-store" });
        if (res.status === 404) {
          setNetError(true);
          return;
        }
        const data = (await res.json()) as StatusResponse;
        setNetError(false);
        setS(data);
        if (data.status === "needs_answers") return router.replace(`/assess/${id}/questions`);
        if (data.status === "ready_preview" || data.status === "inconclusive") return router.replace(`/assess/${id}/results`);
        if (data.status === "failed" || data.status === "draft" || data.status === "uploading") return;
        delay.current = Math.min(delay.current * 1.3, 8000);
      } catch {
        setNetError(true);
      }
      if (!stop) timer = setTimeout(tick, delay.current);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router]);

  const step = s?.phase.step ?? 1;
  const rejected = s?.assets.filter((a) => a.status === "rejected") ?? [];

  return (
    <div className="stack-lg">
      <div>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>We&apos;re working on your screening</h1>
        {s && <p className="muted">Reference {s.reference}</p>}
      </div>
      <div className="card">
        <ol className="phases" aria-live="polite">
          {PHASES.map((label, i) => {
            const n = i + 1;
            const state = s?.status === "failed" ? (n <= 1 ? "done" : "todo") : n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={label} className="phase" data-state={state}>
                <span className="phase-dot" aria-hidden="true">
                  {state === "done" ? "✓" : ""}
                </span>
                <span>
                  {label}
                  {state === "current" && <span className="sr-only"> (in progress)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {rejected.length > 0 && (
        <div className="notice notice-warning">
          <p>
            <strong>Some files couldn&apos;t be used:</strong>
          </p>
          <ul>
            {rejected.map((r) => (
              <li key={r.id}>{r.rejectionReason ?? "This file couldn't be processed."}</li>
            ))}
          </ul>
        </div>
      )}
      {s?.status === "failed" && (
        <div className="notice notice-danger" role="alert">
          <p>
            <strong>We couldn&apos;t finish processing your submission.</strong> This is on our side, not yours. Your submission is saved and our team can retry it.
          </p>
          <p>
            You can call 1-877-566-6653 or <a href="https://www.bustmold.com/">book a virtual inspection with a person</a>.
          </p>
        </div>
      )}
      {(s?.status === "draft" || s?.status === "uploading") && (
        <div className="notice notice-info">
          This screening hasn&apos;t been submitted yet. <Link href={`/assess/new?id=${id}`}>Continue where you left off</Link>.
        </div>
      )}
      {netError && <div className="notice notice-neutral">We&apos;re having trouble checking the status. We&apos;ll keep trying, your submission is safe.</div>}
      <p className="small muted">
        This usually takes a few minutes, depending on video length. You can leave this page and come back from <Link href="/account/assessments">My screenings</Link> on this
        device.
      </p>
    </div>
  );
}
