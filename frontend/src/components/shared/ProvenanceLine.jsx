// frontend/src/components/shared/ProvenanceLine.jsx

import { formatLabel } from "../../utils/formatters.js";

/**
 * Shows where a record came from. A canonical record can cite
 * several uploaded documents.
 */
function ProvenanceLine({
  sourceFileName,
  sourceDocumentType,
  sourceDocumentId,
  evidencePassage,
  evidencePage,
  evidenceSources,
  onOpenDocument,
}) {
  const sources =
    Array.isArray(evidenceSources) &&
    evidenceSources.length > 0
      ? evidenceSources
      : sourceFileName ||
          sourceDocumentId ||
          evidencePassage
        ? [
            {
              fileName: sourceFileName,
              documentType: sourceDocumentType,
              documentId: sourceDocumentId,
              passage: evidencePassage,
              page: evidencePage,
            },
          ]
        : [];

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="provenance-line">
      {sources.map((source, index) => {
        const label =
          source.fileName ||
          "Uploaded document";
        const typeLabel = source.documentType
          ? formatLabel(source.documentType)
          : null;
        const documentId = source.documentId;
        const key = `${documentId || label}-${index}`;

        return (
          <div key={key}>
            {(source.fileName || documentId) && (
              <p>
                From{" "}
                {documentId && onOpenDocument ? (
                  <button
                    type="button"
                    className="provenance-link"
                    onClick={() =>
                      onOpenDocument(documentId)
                    }
                  >
                    {label}
                  </button>
                ) : (
                  <span>{label}</span>
                )}
                {typeLabel ? ` · ${typeLabel}` : null}
                {source.page
                  ? ` · p. ${source.page}`
                  : null}
              </p>
            )}
            {source.passage ? (
              <p className="evidence-quote">
                &ldquo;{source.passage}&rdquo;
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default ProvenanceLine;
