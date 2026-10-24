"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AREAS, CONCERNS, PROPERTY_TYPES, REGIONS } from "@mb/domain/enums";

/**
 * Media-first intake: the customer adds video/photos first, uploads and the AI review run in
 * the background, and the details form is filled in meanwhile. Submitting then usually goes
 * straight to the follow-up questions or results.
 */

type Step = 1 | 2 | 3;
const STEPS = ["Show us", "What's going on", "About the property"];
const CHUNK = 4 * 1024 * 1024;

type UploadState = "queued" | "uploading" | "paused" | "error" | "done" | "cancelled";
interface UploadItem {
  key: string;
  file: File;
  area: string;
  state: UploadState;
  sent: number;
  error?: string;
  assetId?: string;
}

interface ServerStatus {
  status: string;
  assets: { id: string; status: string; rejectionReason: string | null }[];
  review: "none" | "running" | "done" | "failed";
}

function mimeFor(f: File): string {
  if (f.type) return f.type === "image/heif" ? "image/heic" : f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ({ heic: "image/heic", heif: "image/heic", mov: "video/quicktime", mp4: "video/mp4", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}
const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, { ...init, headers: { ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function IntakeWizard({ resumeId, devSample = false }: { resumeId?: string; devSample?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [areas, setAreas] = useState<string[]>([]);
  const [concerns, setConcerns] = useState<string[]>([]);
  const [statement, setStatement] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [region, setRegion] = useState("");
  const [consentAi, setConsentAi] = useState(!!resumeId);
  const [consentStore, setConsentStore] = useState(!!resumeId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitWhenReady, setSubmitWhenReady] = useState(false);
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(resumeId ?? null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const draftPromise = useRef<Promise<string | null> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), [step]);

  const update = useCallback((key: string, patch: Partial<UploadItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x))), []);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const consented = consentAi && consentStore;

  /** Create the draft once (consent only) so uploads can begin immediately. */
  async function ensureDraft(): Promise<string | null> {
    if (assessmentId) return assessmentId;
    if (!draftPromise.current) {
      draftPromise.current = (async () => {
        const r = await api<{ id: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ draft: true, consentAiProcessing: true, consentMediaStorage: true }) });
        if (!r.ok) {
          draftPromise.current = null;
          setError(r.data.error ?? "Couldn't start the screening. Please try again.");
          return null;
        }
        setAssessmentId(r.data.id);
        window.history.replaceState(null, "", `/assess/new?id=${r.data.id}`);
        return r.data.id;
      })();
    }
    return draftPromise.current;
  }

  async function addFiles(list: FileList | null) {
    // Copy first: a FileList is live and empties when the input is reset.
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    if (!consented) return setError("Please tick both boxes above so we can store and review your media.");
    setError(null);
    const id = await ensureDraft();
    if (!id) return;
    const added = files.map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file, area: "", state: "queued" as UploadState, sent: 0 }));
    setItems((xs) => [...xs, ...added.filter((a) => !xs.some((x) => x.key === a.key))]);
  }

  async function upload(item: UploadItem) {
    if (!assessmentId) return;
    const ctrl = new AbortController();
    controllers.current.set(item.key, ctrl);
    update(item.key, { state: "uploading", error: undefined });
    try {
      const init = await api<{ sessionId: string; receivedBytes: number }>(`/api/assessments/${assessmentId}/uploads`, {
        method: "POST",
        body: JSON.stringify({ fingerprint: item.key, mime: mimeFor(item.file), size: item.file.size, area: item.area || undefined }),
        signal: ctrl.signal,
      });
      if (!init.ok) throw new Error(init.data.error ?? "Upload couldn't start");
      let offset = init.data.receivedBytes;
      update(item.key, { sent: offset });
      let failures = 0;
      while (offset < item.file.size) {
        const blob = item.file.slice(offset, offset + CHUNK);
        try {
          const res = await fetch(`/api/uploads/${init.data.sessionId}?offset=${offset}`, { method: "PUT", body: blob, signal: ctrl.signal, headers: { "Content-Type": "application/octet-stream" } });
          const body = (await res.json().catch(() => ({}))) as { receivedBytes?: number; error?: string };
          if (res.status === 409 && typeof body.receivedBytes === "number") offset = body.receivedBytes;
          else if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
          else offset = body.receivedBytes ?? offset + blob.size;
          failures = 0;
          update(item.key, { sent: offset });
        } catch (e) {
          if (ctrl.signal.aborted) throw e;
          if (++failures > 4) throw e;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** failures)); // network blip: back off and resume
        }
      }
      const done = await api<{ assetId: string }>(`/api/uploads/${init.data.sessionId}/complete`, { method: "POST", signal: ctrl.signal });
      if (!done.ok) throw new Error(done.data.error ?? "Couldn't finish the upload");
      update(item.key, { state: "done", assetId: done.data.assetId });
    } catch (e) {
      if (ctrl.signal.aborted) update(item.key, { state: "paused" });
      else update(item.key, { state: "error", error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      controllers.current.delete(item.key);
    }
  }

  // Upload queued files one at a time (keeps mobile connections stable), whatever step is showing.
  useEffect(() => {
    if (items.some((i) => i.state === "uploading")) return;
    const nextItem = items.find((i) => i.state === "queued");
    if (nextItem) void upload(nextItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, assessmentId]);

  async function remove(item: UploadItem) {
    controllers.current.get(item.key)?.abort();
    if (item.assetId) await api(`/api/media-assets/${item.assetId}`, { method: "DELETE" });
    setItems((xs) => xs.filter((x) => x.key !== item.key));
  }

  // Background status: media preparation and the early AI review.
  const doneCount = items.filter((i) => i.state === "done").length;
  const uploading = items.some((i) => i.state === "uploading" || i.state === "queued");
  const serverFiles = server?.assets.length ?? 0;
  useEffect(() => {
    if (!assessmentId || (doneCount === 0 && serverFiles === 0 && !resumeId)) return;
    let stop = false;
    const tick = async () => {
      const r = await api<ServerStatus>(`/api/assessments/${assessmentId}`);
      if (!stop && r.ok) setServer(r.data);
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [assessmentId, doneCount, serverFiles, resumeId]);

  const preparing = server?.assets.some((a) => ["quarantined", "validated", "processing", "uploading"].includes(a.status)) ?? false;
  const rejected = server?.assets.filter((a) => a.status === "rejected") ?? [];
  const totalBytes = items.reduce((s, i) => s + i.file.size, 0);
  const sentBytes = items.reduce((s, i) => s + i.sent, 0);
  const bg: { label: string; tone: "work" | "ok" | "warn" } | null =
    items.length === 0 && serverFiles === 0
      ? null
      : uploading
        ? { label: `Uploading ${totalBytes ? Math.round((sentBytes / totalBytes) * 100) : 0}% (you can keep going)`, tone: "work" }
        : preparing
          ? { label: "Preparing your media...", tone: "work" }
          : server?.review === "done"
            ? { label: "Media reviewed. Results will be quick.", tone: "ok" }
            : server?.review === "failed"
              ? { label: "Media ready. We'll finish the review when you submit.", tone: "warn" }
              : { label: "Reviewing your media with AI...", tone: "work" };

  function next1() {
    if (!consented) return setError("Please tick both boxes so we can store and review your submission.");
    setError(null);
    void ensureDraft().then((id) => id && setStep(2));
  }

  function next2() {
    if (!areas.length) return setError("Choose at least one area.");
    if (!concerns.length) return setError("Choose at least one thing you've noticed.");
    setError(null);
    setStep(3);
  }

  async function submit() {
    if (!propertyType || !region) return setError("Choose the property type and region.");
    const id = await ensureDraft();
    if (!id) return;
    setError(null);
    setBusy(true);
    const details = await api(`/api/assessments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ areas, concerns, statement: statement || undefined, propertyType, region }),
    });
    if (!details.ok) {
      setBusy(false);
      return setError(details.data.error ?? "Couldn't save your details. Please try again.");
    }
    if (items.some((i) => i.state === "uploading" || i.state === "queued")) {
      setSubmitWhenReady(true); // finish once the last upload completes
      return;
    }
    await finalSubmit(id);
  }

  async function finalSubmit(id: string) {
    const r = await api(`/api/assessments/${id}/submit`, { method: "POST" });
    if (!r.ok) {
      setBusy(false);
      setSubmitWhenReady(false);
      return setError(r.data.error ?? "Couldn't submit. Please try again.");
    }
    router.push(`/assess/${id}/progress`);
  }

  useEffect(() => {
    if (submitWhenReady && assessmentId && !uploading) void finalSubmit(assessmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitWhenReady, uploading, assessmentId]);

  /** Dev only: same media-first flow with the configured sample video. */
  async function runSample() {
    const sample = {
      areas: ["laundry", "basement"],
      concerns: ["musty_odor", "visible_spots"],
      statement: "Musty smell in the laundry area and basement that doesn't go away after cleaning. Dark spots near the washer, dryer and vents.",
      propertyType: "apartment",
      region: "QC",
    };
    setError(null);
    setBusy(true);
    setConsentAi(true);
    setConsentStore(true);
    try {
      setSampleStatus("Creating the screening...");
      const created = await api<{ id: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ draft: true, consentAiProcessing: true, consentMediaStorage: true }) });
      if (!created.ok) throw new Error(created.data.error ?? "Couldn't create the screening");
      const id = created.data.id;
      setAssessmentId(id);
      setSampleStatus("Uploading the sample video...");
      const media = await api("/api/dev/sample-media", { method: "POST", body: JSON.stringify({ assessmentId: id, area: "laundry" }) });
      if (!media.ok) throw new Error(media.data.error ?? "Couldn't attach the sample video");
      setSampleStatus("Filling in details...");
      setAreas(sample.areas);
      setConcerns(sample.concerns);
      setStatement(sample.statement);
      setPropertyType(sample.propertyType);
      setRegion(sample.region);
      const det = await api(`/api/assessments/${id}`, { method: "PATCH", body: JSON.stringify(sample) });
      if (!det.ok) throw new Error(det.data.error ?? "Couldn't save details");
      setSampleStatus("Submitting...");
      const sub = await api(`/api/assessments/${id}/submit`, { method: "POST" });
      if (!sub.ok) throw new Error(sub.data.error ?? "Couldn't submit");
      router.push(`/assess/${id}/progress`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample test failed");
      setSampleStatus(null);
      setBusy(false);
    }
  }

  const statusBar = bg && step > 1 && (
    <div className={`bg-status bg-status-${bg.tone}`} role="status" aria-live="polite">
      <span className="bg-dot" aria-hidden="true" />
      {bg.label}
    </div>
  );

  return (
    <div className="container narrow" style={{ paddingTop: "var(--space-5)" }}>
      {devSample && step === 1 && !assessmentId && (
        <div className="panel spread" style={{ marginBottom: "var(--space-4)", borderStyle: "dashed" }}>
          <div>
            <strong className="small">Developer: sample test</strong>
            <div className="xs muted">{sampleStatus ?? "Laundry area + basement, musty smell + spots, sample walkthrough video. Fills the form and submits."}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void runSample()} disabled={busy}>
            {busy ? "Running..." : "Run sample test"}
          </button>
        </div>
      )}

      <ol className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i + 1 < step ? "done" : i + 1 === step ? "current" : "todo"} aria-current={i + 1 === step ? "step" : undefined}>
            <span>
              Step {i + 1}: {label}
            </span>
          </li>
        ))}
      </ol>

      {statusBar}

      {error && (
        <div className="notice notice-danger" role="alert" style={{ marginBottom: "var(--space-4)" }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="stack-lg">
          <div>
            <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-2xl)" }}>
              Show us
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Add a short video or a few photos. We start reviewing them while you answer a few quick details.
            </p>
          </div>

          {!resumeId && (
            <fieldset className="panel stack">
              <legend className="sr-only">Consent</legend>
              <label className="consent">
                <input type="checkbox" checked={consentAi} onChange={(e) => setConsentAi(e.target.checked)} />
                <span>
                  I agree that my photos, video and answers are processed by automated tools, including AI models from third-party providers, to prepare a preliminary
                  screening.
                </span>
              </label>
              <label className="consent">
                <input type="checkbox" checked={consentStore} onChange={(e) => setConsentStore(e.target.checked)} />
                <span>I agree that Mold Busters stores my submission privately so I and authorized staff can review it. I can ask for it to be deleted.</span>
              </label>
              <p className="xs muted" style={{ margin: 0 }}>
                Consent wording is a draft pending legal review. Audio is never transcribed without separate consent.
              </p>
            </fieldset>
          )}

          <div
            className="dropzone"
            data-active={dragActive}
            aria-disabled={!consented}
            style={{ opacity: consented ? 1 : 0.6 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void addFiles(e.dataTransfer.files);
            }}
          >
            <p style={{ fontWeight: 600 }}>Add a video or photos</p>
            <label className="btn btn-primary" htmlFor="files" aria-disabled={!consented}>
              Choose files
            </label>
            <input
              id="files"
              type="file"
              className="sr-only"
              multiple
              disabled={!consented}
              accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/heic,image/heif,image/webp"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="small muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              {consented ? "Videos up to 10 minutes · JPG, PNG, HEIC, MP4, MOV · up to 12 files" : "Tick both boxes above to add files."}
            </p>
          </div>

          <details className="panel">
            <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: "var(--target-min)", display: "flex", alignItems: "center" }}>Recording tips</summary>
            <ul className="compact-list" style={{ marginTop: "var(--space-2)" }}>
              <li>Start wide to show the room, then move in slowly on each spot.</li>
              <li>Turn on lights and avoid pointing at bright windows.</li>
              <li>Hold each close-up still for 2 to 3 seconds.</li>
              <li>Keep faces, documents and mail out of frame.</li>
            </ul>
          </details>

          {(items.length > 0 || serverFiles > 0) && (
            <ul className="file-list" aria-label="Your files">
              {items.length === 0 && serverFiles > 0 && <li className="file-item small">{serverFiles} file(s) already uploaded for this screening.</li>}
              {items.map((it) => {
                const pct = Math.round((it.sent / Math.max(1, it.file.size)) * 100);
                return (
                  <li key={it.key} className="file-item">
                    <div className="spread">
                      <strong className="small" style={{ wordBreak: "break-all" }}>
                        {it.file.name}
                      </strong>
                      <span className="small muted">{fmtMB(it.file.size)}</span>
                    </div>
                    <div className="progress" role="progressbar" aria-label={`Upload ${it.file.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <div className="spread">
                      <span className="small" aria-live="polite">
                        {it.state === "done" && "Uploaded ✓"}
                        {it.state === "uploading" && `Uploading... ${fmtMB(it.sent)} of ${fmtMB(it.file.size)}`}
                        {it.state === "queued" && "Waiting..."}
                        {it.state === "paused" && "Paused"}
                        {it.state === "error" && <span className="field-error">{it.error}</span>}
                      </span>
                      <span className="row">
                        {(it.state === "error" || it.state === "paused") && (
                          <button className="btn btn-secondary btn-sm" onClick={() => update(it.key, { state: "queued" })}>
                            Resume
                          </button>
                        )}
                        {it.state === "uploading" && (
                          <button className="btn btn-ghost btn-sm" onClick={() => controllers.current.get(it.key)?.abort()}>
                            Pause
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => void remove(it)} aria-label={`Remove ${it.file.name}`}>
                          Remove
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {rejected.length > 0 && (
            <div className="notice notice-warning small">
              {rejected.length} file(s) couldn&apos;t be used: {rejected.map((r) => r.rejectionReason ?? "unsupported").join("; ")}
            </div>
          )}

          <div className="cta-bar">
            <div className="row">
              <span className="small muted">{items.length || serverFiles ? "Uploads continue while you fill in details." : "No media? You can continue with answers only."}</span>
              <button className="btn btn-primary" onClick={next1} disabled={!consented}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <form
          className="stack-lg"
          onSubmit={(e) => {
            e.preventDefault();
            next2();
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-2xl)" }}>
            What&apos;s going on?
          </h1>
          <fieldset>
            <legend>Which areas are affected?</legend>
            <div className="choice-grid">
              {AREAS.map((a) => (
                <label key={a.id} className="choice">
                  <input type="checkbox" checked={areas.includes(a.id)} onChange={() => toggle(areas, setAreas, a.id)} />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>What have you noticed?</legend>
            <div className="choice-grid">
              {CONCERNS.map((c) => (
                <label key={c.id} className="choice">
                  <input type="checkbox" checked={concerns.includes(c.id)} onChange={() => toggle(concerns, setConcerns, c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="statement">
              Anything else? <span className="hint">(optional)</span>
            </label>
            <textarea id="statement" className="input" maxLength={1500} value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. The smell is strongest after the dryer runs." />
            <span className="hint">Please don&apos;t include names, phone numbers or your address.</span>
          </div>
          <div className="cta-bar">
            <div className="row">
              <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn btn-primary" type="submit">
                Continue
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 3 && (
        <form
          className="stack-lg"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-2xl)" }}>
            About the property
          </h1>
          <fieldset>
            <legend>Property type</legend>
            <div className="choice-grid">
              {PROPERTY_TYPES.map((p) => (
                <label key={p.id} className="choice">
                  <input type="radio" name="ptype" checked={propertyType === p.id} onChange={() => setPropertyType(p.id)} />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Where is it?</legend>
            <p className="hint">Just the region. We don&apos;t need your address.</p>
            <div className="choice-grid">
              {REGIONS.map((r) => (
                <label key={r.id} className="choice">
                  <input type="radio" name="region" checked={region === r.id} onChange={() => setRegion(r.id)} />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cta-bar">
            <div className="row">
              <button className="btn btn-ghost" type="button" onClick={() => setStep(2)} disabled={busy}>
                Back
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {submitWhenReady ? "Finishing upload..." : busy ? "Submitting..." : "Get my results"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
