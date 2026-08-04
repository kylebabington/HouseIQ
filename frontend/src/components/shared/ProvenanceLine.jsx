// frontend/src/components/shared/ProvenanceLine.jsx

import { formatLabel } from "../../utils/formatters.js";

/**
 * Shows where a record came from (document upload).
 */
function ProvenanceLine({
  sourceFileName,
  sourceDocumentType,
  sourceDocumentId,
  onOpenDocument,
}) {
  if (!sourceFileName && !sourceDocumentId) {
    return null;
  }

  const label =
    sourceFileName ||
    "Uploaded document";

  const typeLabel = sourceDocumentType
    ? formatLabel(sourceDocumentType)
    : null;

  return (
    <p className="provenance-line">
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
    </p>
  );
}

export default ProvenanceLine;
