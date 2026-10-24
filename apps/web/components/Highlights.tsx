import type { Highlight } from "@mb/reporting";
import { Meter } from "./Guidance";

const CATEGORY_LABEL: Record<string, string> = {
  discoloration: "Discoloration",
  staining: "Staining",
  moisture_indicator: "Possible moisture sign",
  material_damage: "Material damage",
  ventilation_component: "Vent / duct surface",
  plumbing_component: "Plumbing surface",
};

function fmt(ms: number | null) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return ` at ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A captured frame with the approximate area the model pointed to. The box is drawn
 * over the image (never baked in) and labelled as approximate. Captions describe
 * what is visible; they never claim the material is mold.
 */
export function HighlightFigure({ h, url, href }: { h: Highlight; url: string | undefined; href?: string }) {
  const title = `${CATEGORY_LABEL[h.category] ?? h.category}: ${h.location}`;
  const img = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${title}. ${h.sourceLabel}${fmt(h.timestampMs)}`} loading="eager" decoding="async" />
  ) : (
    <div className="hl-missing">Image unavailable</div>
  );
  return (
    <figure className="hl-card">
      <div className="hl-frame">
        {href ? <a href={href}>{img}</a> : img}
        {url && h.region && (
          <span
            className="hl-box"
            aria-hidden="true"
            style={{ left: `${h.region.x * 100}%`, top: `${h.region.y * 100}%`, width: `${h.region.width * 100}%`, height: `${h.region.height * 100}%` }}
          >
            <span className="hl-tag">approx. area</span>
          </span>
        )}
      </div>
      <figcaption>
        <div className="spread" style={{ gap: "var(--space-2)" }}>
          <strong className="small">{title}</strong>
          <Meter strength={h.strength} />
        </div>
        <div className="xs muted">
          {h.area} · {h.sourceLabel}
          {fmt(h.timestampMs)}
        </div>
        <p className="xs" style={{ margin: "var(--space-1) 0 0" }}>
          {h.description}
        </p>
      </figcaption>
    </figure>
  );
}

export function HighlightGrid({ items, urls, hrefFor }: { items: Highlight[]; urls: Record<string, string>; hrefFor?: (h: Highlight) => string }) {
  if (items.length === 0) return <p className="small muted">No frames showed a clear visible feature.</p>;
  return (
    <div className="hl-grid">
      {items.map((h) => (
        <HighlightFigure key={h.observationId} h={h} url={urls[h.frameId]} href={hrefFor?.(h)} />
      ))}
    </div>
  );
}
