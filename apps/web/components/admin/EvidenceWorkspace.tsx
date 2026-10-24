"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface EvVideo {
  assetId: string;
  label: string;
  area: string | null;
  url: string | null;
  durationMs: number;
  status: string;
  rejectionReason: string | null;
}
export interface EvFrame {
  id: string;
  assetId: string;
  sourceLabel: string;
  timestampMs: number | null;
  url: string;
  selected: boolean;
  flags: string[];
}
export interface EvObservation {
  id: string;
  frameId: string | null;
  category: string;
  location: string;
  description: string;
  strength: string;
  visibility: string;
  alternatives: string[];
  limitations: string[];
  modelVersion: string;
  status: string;
}

const fmt = (ms: number | null) => (ms == null ? "" : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`);

/**
 * Evidence-first case view: video with a clickable timeline (frames + observation markers),
 * frame grid, and observations with provenance. Clicking any evidence seeks the video.
 */
export function EvidenceWorkspace({
  videos,
  frames,
  observations,
  initialFrameId,
  rejectSlot,
}: {
  videos: EvVideo[];
  frames: EvFrame[];
  observations: EvObservation[];
  initialFrameId?: string;
  rejectSlot?: Record<string, React.ReactNode>;
}) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [activeFrame, setActiveFrame] = useState<string | null>(initialFrameId ?? null);
  const [showAll, setShowAll] = useState(false);
  const frameById = useMemo(() => new Map(frames.map((f) => [f.id, f])), [frames]);
  const obsFrames = useMemo(() => new Set(observations.map((o) => o.frameId)), [observations]);

  function focusFrame(frameId: string) {
    setActiveFrame(frameId);
    const f = frameById.get(frameId);
    if (f && f.timestampMs != null) {
      const v = videoRefs.current[f.assetId];
      if (v) {
        v.currentTime = f.timestampMs / 1000;
        v.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      document.getElementById(`frame-${frameId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  useEffect(() => {
    if (initialFrameId) focusFrame(initialFrameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownFrames = frames.filter((f) => showAll || f.selected || obsFrames.has(f.id));

  return (
    <div className="split">
      <div className="stack sticky-col">
        {videos.map((v) => (
          <div key={v.assetId} className="card stack">
            <div className="spread">
              <strong>
                {v.label}
                {v.area && <span className="muted small"> · {v.area}</span>}
              </strong>
              <span className="small muted">{fmt(v.durationMs)}</span>
            </div>
            {v.url ? (
              <video
                ref={(el) => {
                  videoRefs.current[v.assetId] = el;
                }}
                src={v.url}
                controls
                preload="metadata"
                playsInline
                muted
                style={{ width: "100%", borderRadius: "var(--radius-md)", background: "#000" }}
              />
            ) : (
              <div className="notice notice-neutral small">{v.rejectionReason ?? `Video not available (${v.status}).`}</div>
            )}
            {v.durationMs > 0 && (
              <div>
                <div className="timeline" role="group" aria-label={`${v.label} timeline`}>
                  {frames
                    .filter((f) => f.assetId === v.assetId && f.timestampMs != null && (f.selected || obsFrames.has(f.id)))
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        data-kind={obsFrames.has(f.id) ? "obs" : "frame"}
                        style={{ left: `${(f.timestampMs! / v.durationMs) * 100}%`, outline: activeFrame === f.id ? "2px solid var(--mb-charcoal)" : undefined }}
                        aria-label={`Seek to ${fmt(f.timestampMs)}${obsFrames.has(f.id) ? " (has observations)" : ""}`}
                        title={fmt(f.timestampMs)}
                        onClick={() => focusFrame(f.id)}
                      />
                    ))}
                </div>
                <p className="xs muted" style={{ marginTop: "var(--space-1)" }}>
                  <span style={{ color: "var(--mb-orange)" }}>■</span> frame with observations · <span style={{ color: "var(--mb-teal-700)" }}>■</span> analysed frame
                </p>
              </div>
            )}
          </div>
        ))}
        <div className="card stack">
          <div className="spread">
            <h3 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Frames</h3>
            <label className="consent small">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all {frames.length}
            </label>
          </div>
          <div className="evidence-grid">
            {shownFrames.map((f) => (
              <button key={f.id} id={`frame-${f.id}`} type="button" className="evidence-thumb" aria-pressed={activeFrame === f.id} onClick={() => focusFrame(f.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`${f.sourceLabel} ${fmt(f.timestampMs)}`} loading="lazy" />
                <span className="cap">
                  {f.sourceLabel} {fmt(f.timestampMs)}
                  {f.flags.length > 0 && <span className="muted"> · {f.flags.join(", ")}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ alignSelf: "start" }}>
        <div className="spread" style={{ marginBottom: "var(--space-2)" }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Observations ({observations.length})
          </h3>
          <span className="xs muted">{observations[0]?.modelVersion ?? ""}</span>
        </div>
        {observations.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No visual observations recorded.
          </p>
        ) : (
          <table className="table table-compact table-responsive">
            <thead>
              <tr>
                <th>Source</th>
                <th>What is visible</th>
                <th>Clarity</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((o) => {
                const f = o.frameId ? frameById.get(o.frameId) : undefined;
                const active = !!activeFrame && activeFrame === o.frameId;
                return (
                  <tr key={o.id} style={{ background: active ? "var(--mb-orange-soft)" : undefined, opacity: o.status === "active" ? 1 : 0.55 }}>
                    <td data-label="Source" style={{ whiteSpace: "nowrap" }}>
                      {f ? (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "0 var(--space-2)" }} onClick={() => focusFrame(f.id)}>
                          {f.sourceLabel} {fmt(f.timestampMs)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td data-label="Visible">
                      <span className="chip chip-visual" style={{ marginRight: "var(--space-2)" }}>
                        {o.category.replace(/_/g, " ")}
                      </span>
                      {o.status !== "active" && <span className="badge badge-danger">{o.status.replace(/_/g, " ")}</span>}
                      <div style={{ marginTop: 4 }}>
                        <strong>{o.location}:</strong> {o.description}
                      </div>
                      {(o.alternatives.length > 0 || o.limitations.length > 0 || rejectSlot?.[o.id]) && (
                        <details className="xs" style={{ marginTop: 4 }}>
                          <summary style={{ cursor: "pointer" }} className="muted">
                            Details
                          </summary>
                          {o.alternatives.length > 0 && <div>Alternatives: {o.alternatives.join("; ")}</div>}
                          {o.limitations.length > 0 && <div className="muted">Limitations: {o.limitations.join("; ")}</div>}
                          <div className="muted">Visibility {o.visibility}. Model description, not a diagnosis.</div>
                          {rejectSlot?.[o.id]}
                        </details>
                      )}
                    </td>
                    <td data-label="Clarity">
                      <span className="badge badge-neutral">{o.strength}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
