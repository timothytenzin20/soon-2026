const MAP: Record<string, [string, string]> = {
  draft: ["badge-neutral", "Draft"],
  uploading: ["badge-neutral", "Uploading"],
  queued: ["badge-info", "Queued"],
  processing: ["badge-info", "Processing"],
  needs_answers: ["badge-warning", "Needs answers"],
  ready_preview: ["badge-success", "Results ready"],
  inconclusive: ["badge-warning", "Inconclusive"],
  failed: ["badge-danger", "Failed"],
  published: ["badge-success", "Published"],
  validated: ["badge-info", "Validated"],
  superseded: ["badge-neutral", "Superseded"],
  rejected: ["badge-danger", "Rejected"],
  ready: ["badge-success", "Ready"],
  quarantined: ["badge-neutral", "Quarantined"],
};

export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = MAP[status] ?? ["badge-neutral", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
