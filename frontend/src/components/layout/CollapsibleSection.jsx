import {
  useId,
  useState,
} from "react";

/**
 * Large HouseIQ sections collapse behind a title that already
 * carries the useful summary, e.g.
 * "Needs Attention — 3 urgent · 4 upcoming".
 *
 * Click the entire header. Remember open/closed while this
 * instance stays mounted (i.e. while the user stays on the page).
 */
function CollapsibleSection({
  title,
  defaultOpen = false,
  priority = false,
  children,
  className = "",
  id,
}) {
  const [open, setOpen] = useState(() => {
    if (priority) {
      return defaultOpen;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 700px)").matches
    ) {
      return false;
    }

    return defaultOpen;
  });
  const reactId = useId();
  const bodyId = id ? `${id}-body` : `${reactId}-body`;

  return (
    <section
      className={
        `collapsible-section${open ? " is-open" : ""} ${className}`.trim()
      }
      id={id}
    >
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="collapsible-chevron" aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
        <span className="collapsible-title">
          {title}
        </span>
      </button>

      {open ? (
        <div className="collapsible-body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default CollapsibleSection;
