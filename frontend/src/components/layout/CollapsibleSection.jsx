// frontend/src/components/layout/CollapsibleSection.jsx

import {
  useState,
} from "react";

function initialOpen(defaultOpen, openOnMobile) {
  if (typeof window === "undefined") {
    return defaultOpen;
  }

  const narrow = window.matchMedia(
    "(max-width: 820px)"
  ).matches;

  return narrow ? openOnMobile : defaultOpen;
}

/**
 * Large-section accordion. The header is the whole click
 * target and must include a useful summary so it does not
 * need to be opened just to see what it is.
 *
 * Title format: "Thing name — most useful status/summary"
 */
function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  openOnMobile = false,
  forceOpen = false,
  nested = false,
  variant = "block",
  id,
  headerActions,
  children,
}) {
  const [open, setOpen] = useState(() =>
    forceOpen || initialOpen(defaultOpen, openOnMobile)
  );

  const isOpen = forceOpen || open;

  return (
    <section
      id={id}
      className={[
        "collapse-section",
        `collapse-${variant}`,
        nested ? "collapse-nested" : "",
        isOpen ? "open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="collapse-header-row">
        <button
          type="button"
          className="collapse-header"
          aria-expanded={isOpen}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="collapse-chevron" aria-hidden="true">
            {isOpen ? "▼" : "▶"}
          </span>
          <span className="collapse-title">
            <strong>{title}</strong>
            {summary ? (
              <span className="collapse-summary">
                {" "}
                — {summary}
              </span>
            ) : null}
          </span>
        </button>

        {headerActions ? (
          <div
            className="collapse-header-actions"
            onClick={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="collapse-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default CollapsibleSection;
