// frontend/src/components/shared/ProvenanceLine.jsx

import { formatLabel } from "../../utils/formatters.js";

/**
 * Shows where a record came from (document upload).
 */
function ProvenanceLine({
  sourceFileName,
  sourceDocumentType,
  sourceDocumentId,
  evidencePassage,
  evidencePage,
  onOpenDocument,
}) {
  if (
    !sourceFileName &&
    !sourceDocumentId &&
    !evidencePassage
  ) {
    return null;
  }

  const label =
    sourceFileName ||
    "Uploaded document";

  const typeLabel = sourceDocumentType
    ? formatLabel(sourceDocumentType)
    : null;

  return (
    <div className="provenance-line">
      {(sourceFileName || sourceDocumentId) && (
        <p>
          From{" "}
          {sourceDocumentId && onOpenDocument ? (
            <button
              type="button"
              className="provenance-link"
              onClick={() =>
                onOpenDocument(sourceDocumentId)
              }
            >
              {label}
            </button>
          ) : (
            <span>{label}</span>
          )}
          {typeLabel ? ` · ${typeLabel}` : null}
          {evidencePage
            ? ` · p. ${evidencePage}`
            : null}
        </p>
      )}
      {evidencePassage ? (
        <p className="evidence-quote">
          &ldquo;{evidencePassage}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

export default ProvenanceLine;
