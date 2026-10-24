import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container">
          {/* Text wordmark placeholder: use the official Mold Busters logo once permission/assets are provided. */}
          <Link href="/" className="wordmark" aria-label="Mold Busters home">
            Mold Busters
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link href="/account/assessments">My screenings</Link>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="container small muted stack">
          <p>
            AI-assisted preliminary screenings are not certified mold inspections. No physical testing is performed. For health concerns, consult a health professional.
          </p>
          <p>
            Prefer to talk to a person? Mold Busters also offers <a href="https://www.bustmold.com/" rel="noopener">virtual inspections with a live inspector</a>. Call 1-877-566-6653.
          </p>
          <p className="xs">Prototype build. Content, pricing and policies are pending Mold Busters review.</p>
        </div>
      </footer>
    </>
  );
}
