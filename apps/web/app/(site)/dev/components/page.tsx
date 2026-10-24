import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readFlags } from "@mb/domain";

export const metadata: Metadata = { title: "Component examples" };

/** Living examples of the design primitives (PLAN §3). Dev only. */
export default function Components() {
  if (!readFlags().devLogin) notFound();
  const swatches = ["--mb-orange", "--mb-teal", "--mb-mint", "--mb-charcoal", "--color-info-bg", "--color-success-bg", "--color-warning-bg", "--color-danger-bg"];
  return (
    <div className="container stack-lg" style={{ paddingTop: "var(--space-6)" }}>
      <h1>Design primitives</h1>
      <section className="stack">
        <h2>Colour tokens</h2>
        <div className="row">
          {swatches.map((s) => (
            <div key={s} className="stack" style={{ gap: 4, width: 120 }}>
              <div style={{ height: 48, borderRadius: 8, background: `var(${s})`, border: "1px solid var(--color-border)" }} />
              <span className="mono xs">{s}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2>Buttons</h2>
        <div className="row">
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-secondary">Secondary</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-danger">Danger</button>
          <button className="btn btn-primary" disabled>
            Disabled
          </button>
          <button className="btn btn-secondary btn-sm">Small</button>
        </div>
      </section>
      <section className="stack">
        <h2>Badges, chips, status</h2>
        <div className="row">
          <span className="badge badge-success">Results ready</span>
          <span className="badge badge-info">Processing</span>
          <span className="badge badge-warning">Needs answers</span>
          <span className="badge badge-danger">Failed</span>
          <span className="badge badge-neutral">Draft</span>
          <span className="chip chip-visual">Visual</span>
          <span className="chip chip-customer">You reported</span>
          <span className="chip chip-model">Inference</span>
          <span className="prelim-label">AI-Assisted Preliminary Virtual Screening</span>
        </div>
      </section>
      <section className="stack">
        <h2>Notices</h2>
        <div className="notice notice-info">Info notice</div>
        <div className="notice notice-success">Success notice</div>
        <div className="notice notice-warning">Warning notice, calm, never alarming</div>
        <div className="notice notice-danger">Error notice</div>
      </section>
      <section className="stack">
        <h2>Stepper &amp; phases</h2>
        <ol className="stepper">
          <li data-state="done">
            <span>Step 1</span>
          </li>
          <li data-state="current">
            <span>Step 2</span>
          </li>
          <li data-state="todo">
            <span>Step 3</span>
          </li>
        </ol>
        <ol className="phases card">
          <li className="phase" data-state="done">
            <span className="phase-dot">✓</span>Uploaded
          </li>
          <li className="phase" data-state="current">
            <span className="phase-dot" />
            Reviewing evidence
          </li>
          <li className="phase" data-state="todo">
            <span className="phase-dot" />
            Results ready
          </li>
        </ol>
      </section>
      <section className="stack">
        <h2>Form controls</h2>
        <div className="choice-grid">
          <label className="choice">
            <input type="checkbox" defaultChecked /> Basement
          </label>
          <label className="choice">
            <input type="checkbox" /> Bathroom
          </label>
          <label className="choice">
            <input type="radio" name="x" /> Not sure
          </label>
        </div>
        <div className="field">
          <label htmlFor="ex">Text input</label>
          <input id="ex" className="input" placeholder="Placeholder" />
          <span className="hint">Hint text</span>
        </div>
        <div className="progress" style={{ maxWidth: 320 }}>
          <span style={{ width: "60%" }} />
        </div>
      </section>
    </div>
  );
}
