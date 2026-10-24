import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  accessGrants,
  answers,
  assessmentRuns,
  auditEvents,
  concerns,
  consents,
  customerProfiles,
  jobs,
  mediaAssets,
  mediaFrames,
  memberships,
  observations,
  properties,
  reportVersions,
  users,
  audit,
} from "@mb/db";
import { AREAS, CONCERNS, authorize, answerLabel, getQuestion, labelFor, PROPERTY_TYPES, REGIONS } from "@mb/domain";
import { assessmentResource } from "@mb/pipeline";
import type { ReportContent } from "@mb/reporting";
import { signedMediaUrl } from "@mb/storage";
import { EvidenceWorkspace, type EvFrame, type EvObservation, type EvVideo } from "@/components/admin/EvidenceWorkspace";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PriorityBadge } from "@/components/Guidance";
import { ReportView } from "@/components/ReportView";
import { db, requireStaff } from "@/lib/server";
import { assignStaff, decideGrant, rejectObservation, requestAccess, retryAssessment } from "./actions";

export const metadata: Metadata = { title: "Case workspace" };

const TABS = [
  { id: "evidence", label: "Evidence" },
  { id: "context", label: "Customer context" },
  { id: "report", label: "Report" },
  { id: "runs", label: "Processing & cost" },
  { id: "audit", label: "Audit" },
] as const;

export default async function CaseWorkspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; frame?: string }> }) {
  const p = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const { a, res } = await assessmentResource(db(), p, id).catch(() => notFound());
  if (!authorize(p, "assessment.read_operational", res).allowed) notFound();
  const canRead = authorize(p, "assessment.read", res).allowed;
  const canOverride = authorize(p, "assessment.override", res).allowed;
  const canApprove = authorize(p, "access_grant.approve", res).allowed;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "evidence";

  const [prop] = a.propertyId ? await db().select().from(properties).where(eq(properties.id, a.propertyId)) : [];
  const staffList = canOverride
    ? await db()
        .select({ id: users.id, name: users.displayName, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, a.orgId), inArray(memberships.role, ["staff", "manager", "owner"])))
    : [];
  const grants = await db().select().from(accessGrants).where(eq(accessGrants.assessmentId, a.id)).orderBy(desc(accessGrants.createdAt));
  const myPending = grants.find((g) => g.staffUserId === p.userId && g.status === "requested");
  const pendingForApproval = canApprove ? grants.filter((g) => g.status === "requested" && g.staffUserId !== p.userId) : [];
  const grantUsers = pendingForApproval.length
    ? await db().select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, pendingForApproval.map((g) => g.staffUserId)))
    : [];

  const header = (
    <div className="page-head stack">
      <Link href="/admin/assessments" className="small">
        ← Assessments
      </Link>
      <div className="spread">
        <h1 style={{ fontSize: "var(--text-2xl)", margin: 0 }} className="mono">
          {a.reference}
        </h1>
        <span className="row">
          {a.priority && <PriorityBadge priority={a.priority as "routine"} />}
          <StatusBadge status={a.status} />
        </span>
      </div>
      <dl className="kv small">
        <dt>Property</dt>
        <dd>{prop ? `${labelFor(PROPERTY_TYPES, prop.propertyType)}, ${labelFor(REGIONS, prop.approximateRegion)}` : "-"}</dd>
        <dt>Modality</dt>
        <dd>{a.modality.replace("_", " ")}</dd>
        <dt>Created / submitted</dt>
        <dd>
          {a.createdAt.toLocaleString("en-CA")} / {a.submittedAt?.toLocaleString("en-CA") ?? "-"}
        </dd>
        <dt>Completed</dt>
        <dd>{a.completedAt?.toLocaleString("en-CA") ?? "-"}</dd>
        {a.lastErrorCode && (
          <>
            <dt>Last error</dt>
            <dd className="mono">{a.lastErrorCode}</dd>
          </>
        )}
      </dl>
      {canOverride && (
        <div className="row">
          <form action={assignStaff.bind(null, a.id)} className="row">
            <label htmlFor="assignee" className="small">
              Assigned to
            </label>
            <select id="assignee" name="staffUserId" className="input" style={{ width: "auto", minHeight: 36 }} defaultValue={a.assignedStaffId ?? ""}>
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm">Save</button>
          </form>
          {a.status === "failed" && (
            <form action={retryAssessment.bind(null, a.id)}>
              <button className="btn btn-primary btn-sm">Retry processing</button>
            </form>
          )}
        </div>
      )}
      {pendingForApproval.length > 0 && (
        <div className="notice notice-warning stack">
          <strong>Access requests</strong>
          {pendingForApproval.map((g) => (
            <div key={g.id} className="spread">
              <span className="small">
                {grantUsers.find((u) => u.id === g.staffUserId)?.name ?? "Staff"}: “{g.reason}”
              </span>
              <span className="row">
                <form action={decideGrant.bind(null, a.id, g.id, true)}>
                  <button className="btn btn-secondary btn-sm">Approve 4h</button>
                </form>
                <form action={decideGrant.bind(null, a.id, g.id, false)}>
                  <button className="btn btn-ghost btn-sm">Deny</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!canRead) {
    return (
      <div className="stack-lg">
        {header}
        <div className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Restricted case</h2>
          <p>This case isn&apos;t assigned to you. Customer media and context require a time-limited, manager-approved access grant. Requests and views are audited.</p>
          {myPending ? (
            <div className="notice notice-info">Your request is waiting for a manager.</div>
          ) : (
            <form action={requestAccess.bind(null, a.id)} className="stack">
              <div className="field">
                <label htmlFor="reason">Reason for access</label>
                <textarea id="reason" name="reason" className="input" required minLength={10} maxLength={500} placeholder="e.g. Customer called the support line about this case." />
              </div>
              <button className="btn btn-primary">Request access</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const sub = `staff:${p.userId}`;
  const tabNav = (
    <nav className="tabs" aria-label="Case sections">
      {TABS.filter((t) => t.id !== "audit" || authorize(p, "audit.read").allowed).map((t) => (
        <Link key={t.id} href={`/admin/assessments/${a.id}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );

  let body: React.ReactNode = null;

  if (tab === "evidence") {
    const assets = await db().select().from(mediaAssets).where(eq(mediaAssets.assessmentId, a.id)).orderBy(asc(mediaAssets.createdAt));
    const counters: Record<string, number> = {};
    const labels = new Map<string, string>();
    for (const m of assets) {
      counters[m.kind] = (counters[m.kind] ?? 0) + 1;
      labels.set(m.id, `${m.kind === "video" ? "Video" : "Photo"} ${counters[m.kind]}`);
    }
    const frameRows = assets.length
      ? await db().select().from(mediaFrames).where(inArray(mediaFrames.assetId, assets.map((m) => m.id))).orderBy(asc(mediaFrames.timestampMs))
      : [];
    const obsRows = await db().select().from(observations).where(and(eq(observations.assessmentId, a.id), or(eq(observations.status, "active"), eq(observations.status, "rejected_by_staff"))));
    const videos: EvVideo[] = assets
      .filter((m) => m.kind === "video")
      .map((m) => ({
        assetId: m.id,
        label: labels.get(m.id)!,
        area: m.area ? labelFor(AREAS, m.area) : null,
        url: m.proxyObjectKey ? signedMediaUrl({ key: m.proxyObjectKey, contentType: "video/mp4", sub }, 30 * 60_000) : null,
        durationMs: m.durationMs ?? 0,
        status: m.status,
        rejectionReason: m.rejectionReason,
      }));
    const frames: EvFrame[] = frameRows.map((f) => ({
      id: f.id,
      assetId: f.assetId,
      sourceLabel: labels.get(f.assetId) ?? "Media",
      timestampMs: f.timestampMs,
      url: signedMediaUrl({ key: f.objectKey, contentType: "image/jpeg", sub }, 30 * 60_000),
      selected: f.selected,
      flags: f.qualityFlags,
    }));
    const obs: EvObservation[] = obsRows.map((o) => ({
      id: o.id,
      frameId: o.frameId,
      category: o.category,
      location: o.location,
      description: o.neutralDescription,
      strength: o.strength,
      visibility: o.visibility,
      alternatives: o.alternativeExplanations,
      limitations: o.limitations,
      modelVersion: o.modelVersion,
      status: o.status,
    }));
    const rejectSlot = canOverride
      ? Object.fromEntries(
          obsRows
            .filter((o) => o.status === "active")
            .map((o) => [
              o.id,
              <form key={o.id} action={rejectObservation.bind(null, a.id, o.id)} className="row" style={{ marginTop: "var(--space-2)" }}>
                <input name="reason" className="input" required minLength={5} placeholder="Correction: why is it wrong?" style={{ flex: 1, minHeight: 36 }} />
                <button className="btn btn-danger btn-sm">Mark incorrect</button>
              </form>,
            ]),
        )
      : undefined;
    const photos = assets.filter((m) => m.kind === "image" && m.status !== "ready");
    await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: "media.viewed", resourceType: "assessment", resourceId: a.id, metadata: { frames: frames.length } });
    body = (
      <div className="stack">
        {photos.length > 0 && (
          <div className="notice notice-neutral small">
            {photos.length} photo(s) not usable: {photos.map((m) => m.rejectionReason ?? m.status).join("; ")}
          </div>
        )}
        <EvidenceWorkspace videos={videos} frames={frames} observations={obs} initialFrameId={sp.frame} rejectSlot={rejectSlot} />
      </div>
    );
  }

  if (tab === "context") {
    const cs = await db().select().from(concerns).where(eq(concerns.assessmentId, a.id));
    const ans = await db().select().from(answers).where(eq(answers.assessmentId, a.id)).orderBy(asc(answers.createdAt));
    const cons = await db().select().from(consents).where(eq(consents.assessmentId, a.id));
    const canContact = authorize(p, "client.read_contact", res).allowed;
    const [cust] = canContact ? await db().select().from(customerProfiles).where(eq(customerProfiles.id, a.customerId)) : [];
    body = (
      <div className="dash">
        <section className="panel span-7">
          <h2 className="panel-title">Customer statements (self-reported)</h2>
          <table className="table table-compact">
            <tbody>
              {cs.map((c) => (
                <tr key={c.id}>
                  <th scope="row" style={{ textTransform: "none", letterSpacing: 0, width: "28%" }}>
                    {labelFor(AREAS, c.area)}
                  </th>
                  <td>
                    {c.issueTypes.map((t) => labelFor(CONCERNS, t)).join(", ")}
                    {c.statement && <div className="small muted" style={{ marginTop: 4 }}>&ldquo;{c.statement}&rdquo;</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel span-5">
          <h2 className="panel-title">Contact &amp; consents</h2>
          <table className="table table-compact">
            <tbody>
              <tr>
                <th scope="row">Contact</th>
                <td>{canContact ? (cust?.email ? `${cust.email}${cust.emailVerifiedAt ? " (verified)" : " (unverified)"}` : "Anonymous") : <span className="muted">Restricted</span>}</td>
              </tr>
              {cons.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.kind.replace(/_/g, " ")}</th>
                  <td>
                    <span className={`badge ${c.granted && !c.revokedAt ? "badge-success" : "badge-neutral"}`}>{c.granted && !c.revokedAt ? "granted" : "not granted"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel span-12">
          <h2 className="panel-title">Follow-up answers</h2>
          {ans.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              No answers yet.
            </p>
          ) : (
            <table className="table table-compact table-responsive">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Answer</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {ans.map((x) => {
                  const q = getQuestion(x.questionId);
                  return (
                    <tr key={x.id}>
                      <td data-label="Question">{q?.text ?? x.questionId}</td>
                      <td data-label="Answer">{q ? answerLabel(q, x.value) : JSON.stringify(x.value)}</td>
                      <td data-label="Source">{x.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    );
  }

  if (tab === "report") {
    const versions = await db().select().from(reportVersions).where(eq(reportVersions.assessmentId, a.id)).orderBy(desc(reportVersions.version));
    const latest = versions[0];
    const content = latest?.content as ReportContent | undefined;
    const frameIds = content?.evidenceGallery.map((r) => r.frameId).filter((x): x is string => !!x) ?? [];
    const fr = frameIds.length ? await db().select({ id: mediaFrames.id, key: mediaFrames.objectKey }).from(mediaFrames).where(inArray(mediaFrames.id, frameIds)) : [];
    const urls = Object.fromEntries(fr.map((f) => [f.id, signedMediaUrl({ key: f.key, contentType: "image/jpeg", sub }, 30 * 60_000)]));
    const validation = latest?.validation as { passed: boolean; issues: { code: string; path: string; detail: string }[]; removedObservations?: { id: string; rules: string[] }[]; fallbackUsed?: boolean } | undefined;
    body = !latest ? (
      <p className="muted">No report generated yet.</p>
    ) : (
      <div className="stack">
        <div className="dash">
          <section className="panel span-8">
            <h2 className="panel-title">Validation gate</h2>
            <div className="row">
              {validation?.passed ? <span className="badge badge-success">Passed</span> : <span className="badge badge-danger">Failed</span>}
              {validation?.fallbackUsed && <span className="badge badge-warning">Fallback inconclusive report published</span>}
              {validation?.removedObservations?.length ? <span className="badge badge-warning">{validation.removedObservations.length} observation(s) excluded by policy</span> : null}
              {!validation?.issues?.length && <span className="small muted">No policy or grounding issues.</span>}
            </div>
            {validation?.issues?.length ? (
              <table className="table table-compact xs" style={{ marginTop: "var(--space-2)" }}>
                <tbody>
                  {validation.issues.map((i, k) => (
                    <tr key={k}>
                      <td className="mono">{i.code}</td>
                      <td className="mono">{i.path}</td>
                      <td>{i.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
          <section className="panel span-4">
            <h2 className="panel-title">Versions</h2>
            <table className="table table-compact small">
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.version}</td>
                    <td>{v.outcome}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <ReportView content={content!} frameUrls={urls} frameHref={(r) => `/admin/assessments/${a.id}?tab=evidence&frame=${r.frameId}`} />
      </div>
    );
  }

  if (tab === "runs") {
    const runs = await db().select().from(assessmentRuns).where(eq(assessmentRuns.assessmentId, a.id)).orderBy(desc(assessmentRuns.startedAt));
    const assetIds = (await db().select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.assessmentId, a.id))).map((r) => r.id);
    const allJobs = await db().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(300);
    const caseJobs = allJobs.filter((j) => {
      const pl = j.payload as Record<string, string>;
      return pl.assessmentId === a.id || (pl.assetId && assetIds.includes(pl.assetId));
    });
    const total = runs.reduce((s, r) => s + Number(r.costUsd), 0);
    body = (
      <div className="stack-lg">
        <section className="card stack">
          <div className="spread">
            <h2 style={{ fontSize: "var(--text-xl)", margin: 0 }}>Model runs</h2>
            <span className="small">Total model cost: ${total.toFixed(4)} USD (estimated from token usage)</span>
          </div>
          <table className="table table-responsive">
            <thead>
              <tr>
                <th>Stage</th>
                <th>State</th>
                <th>Model</th>
                <th>Images</th>
                <th>Tokens in/out</th>
                <th>Cost</th>
                <th>Duration</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td data-label="Stage">{r.stage} v{r.version}</td>
                  <td data-label="State">
                    {r.state}
                    {r.errorCode && <span className="mono"> ({r.errorCode})</span>}
                  </td>
                  <td data-label="Model">
                    {r.modelProvider}:{(r.modelConfig as { model?: string })?.model}
                  </td>
                  <td data-label="Images">{r.imageCount}</td>
                  <td data-label="Tokens">
                    {r.inputTokens}/{r.outputTokens}
                  </td>
                  <td data-label="Cost">${Number(r.costUsd).toFixed(4)}</td>
                  <td data-label="Duration">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "-"}</td>
                  <td data-label="Trace" className="mono">
                    {r.traceId?.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Jobs</h2>
          <table className="table table-responsive">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {caseJobs.map((j) => (
                <tr key={j.id}>
                  <td data-label="Type" className="mono">
                    {j.type}
                  </td>
                  <td data-label="Status">{j.status}</td>
                  <td data-label="Attempts">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td data-label="Error" className="small">
                    {j.lastError?.slice(0, 120) ?? "-"}
                  </td>
                  <td data-label="Updated">{j.updatedAt.toLocaleTimeString("en-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    );
  }

  if (tab === "audit" && authorize(p, "audit.read").allowed) {
    const events = await db()
      .select()
      .from(auditEvents)
      .where(or(eq(auditEvents.resourceId, a.id), and(eq(auditEvents.resourceType, "media_asset"), inArray(auditEvents.resourceId, (await db().select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.assessmentId, a.id))).map((r) => r.id).concat(["00000000-0000-0000-0000-000000000000"])))))
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
    body = (
      <section className="card">
        <table className="table table-responsive">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td data-label="When">{e.createdAt.toLocaleString("en-CA")}</td>
                <td data-label="Action" className="mono">
                  {e.action}
                </td>
                <td data-label="Actor">
                  {e.actorType}
                  {e.actorId && <span className="mono xs"> {e.actorId.slice(0, 8)}</span>}
                </td>
                <td data-label="Details" className="mono xs" style={{ wordBreak: "break-word" }}>
                  {JSON.stringify(e.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <div className="stack">
      {header}
      {tabNav}
      {body}
    </div>
  );
}
