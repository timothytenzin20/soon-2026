import Link from "next/link";

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="container stack">
          <p className="eyebrow">Preliminary virtual screening</p>
          <h1>Worried about a musty smell, stains or spots?</h1>
          <p className="lead">
            Record a short walkthrough on your phone or upload a few photos. You&apos;ll get an evidence-linked summary of what&apos;s visible, what still needs checking,
            and practical next steps. 
          </p>
          <div className="row">
            <Link href="/assess/new" className="btn btn-primary">
              Start a screening
            </Link>
            <a href="https://www.bustmold.com/" className="btn btn-secondary" rel="noopener">
              Book a free virtual inspection instead
            </a>
          </div>
          <p className="small muted">Takes about 5 to 10 minutes. No account needed to start.</p>
        </div>
      </section>

      <section className="container stack-lg" style={{ marginTop: "var(--space-6)" }} aria-labelledby="how">
        <div>
          <h2 id="how">How it works</h2>
          <ol className="grid-3" style={{ listStyle: "none", padding: 0 }}>
            <li className="card">
              <h3>1. Tell us what&apos;s going on</h3>
              <p className="muted">Pick the affected areas and what you&apos;ve noticed.</p>
            </li>
            <li className="card">
              <h3>2. Show us</h3>
              <p className="muted">Upload a phone video or photos, or continue with answers only.</p>
            </li>
            <li className="card">
              <h3>3. Answer a few questions</h3>
              <p className="muted">Short follow-ups based on what&apos;s missing. &quot;Not sure&quot; is always fine.</p>
            </li>
          </ol>
        </div>

        <div className="grid-2">
          <div className="card card-tint stack">
            <h2>What you get</h2>
            <ul>
              <li>A plain-language summary linked to the exact frames and answers it&apos;s based on</li>
              <li>What we can&apos;t tell remotely, stated clearly</li>
              <li>Basic safety and moisture guidance, always free</li>
              <li>Whether a professional on-site inspection makes sense</li>
            </ul>
          </div>
          <div className="card stack">
            <h2>What it is not</h2>
            <ul>
              <li>Not a certified mold inspection, no sampling, lab tests, moisture meters or thermal imaging</li>
              <li>It can&apos;t confirm mold, name a species, or see behind walls</li>
              <li>No medical advice or diagnosis</li>
            </ul>
          </div>
        </div>

        <div className="card stack">
          <h2>Your privacy</h2>
          <p>
            Your media is stored privately and is only viewed by automated processing and authorized Mold Busters staff working on your case. We don&apos;t need faces,
            documents or anything personal in frame. You can ask us to delete your submission.
          </p>
          <p className="small muted">Privacy text pending legal review (PIPEDA / Quebec Law 25).</p>
        </div>
      </section>
    </>
  );
}
