// frontend/src/components/dashboard/DocumentsPanel.jsx

import {
  useMemo,
  useState,
} from "react";

import {
  formatCurrency,
  formatDate,
  formatFileSize,
  formatLabel,
} from "../../utils/formatters.js";
import { groupByYear } from "../../utils/groupByYear.js";
import {
  DOCUMENT_TYPE_FILTERS,
} from "../../workspace/navigation.js";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import FilterChips from "../layout/FilterChips.jsx";

function documentDate(documentRecord) {
  return (
    documentRecord.metadata?.documentDate ||
    documentRecord.document_date ||
    documentRecord.created_at
  );
}

function documentCompany(documentRecord) {
  return (
    documentRecord.metadata?.contractorOrCompany ||
    documentRecord.contractor_or_company
  );
}

function documentAmount(documentRecord) {
  return (
    documentRecord.metadata?.totalAmount ||
    documentRecord.total_amount
  );
}

function documentTitle(documentRecord) {
  const meta = documentRecord.metadata || {};

  if (meta.title) {
    return meta.title;
  }

  const type = formatLabel(
    documentRecord.document_type || "document"
  );
  const company = documentCompany(documentRecord);

  if (company) {
    return `${type} · ${company}`;
  }

  const fileName = documentRecord.file_name || "Document";
  return fileName
    .replace(/^\d+__/, "")
    .replace(/_/g, " ")
    .replace(/\.pdf$/i, "");
}

function matchesTypeFilter(documentRecord, typeFilter) {
  if (typeFilter === "all") {
    return true;
  }

  return (
    String(documentRecord.document_type || "general") ===
    typeFilter
  );
}

function DocumentCard({
  documentRecord,
  openOriginalDocument,
  onDeleteDocument,
  canDelete,
  pendingDeleteId,
  setPendingDeleteId,
  deletingId,
  confirmDelete,
}) {
  const metadata = documentRecord.metadata || {};
  const amount = documentAmount(documentRecord);
  const company = documentCompany(documentRecord);

  return (
    <article className="record-card document-card">
      <div className="record-card-header">
        <div>
          <span className="record-type">
            {formatLabel(documentRecord.document_type)}
          </span>
          <h4>{documentTitle(documentRecord)}</h4>
        </div>
      </div>

      {documentRecord.summary ? (
        <p className="record-description">
          {documentRecord.summary}
        </p>
      ) : null}

      <div className="document-details">
        {documentDate(documentRecord) ? (
          <div>
            <span>Document date</span>
            <strong>
              {formatDate(documentDate(documentRecord))}
            </strong>
          </div>
        ) : null}

        {company ? (
          <div>
            <span>Company</span>
            <strong>{company}</strong>
          </div>
        ) : null}

        {Number(amount) > 0 ? (
          <div>
            <span>Total amount</span>
            <strong>{formatCurrency(amount)}</strong>
          </div>
        ) : null}

        {metadata.fileSize ? (
          <div>
            <span>File size</span>
            <strong>{formatFileSize(metadata.fileSize)}</strong>
          </div>
        ) : null}
      </div>

      <div className="record-footer document-card-footer">
        <small>
          Uploaded {formatDate(documentRecord.created_at)}
        </small>

        <div className="document-actions">
          {typeof openOriginalDocument === "function" &&
          metadata.s3Key ? (
            <button
              type="button"
              className="document-open-button"
              onClick={() =>
                openOriginalDocument(documentRecord)
              }
            >
              Open original
            </button>
          ) : null}

          {canDelete && onDeleteDocument ? (
            pendingDeleteId === documentRecord.id ? (
              <>
                <button
                  type="button"
                  className="danger-button"
                  disabled={deletingId === documentRecord.id}
                  onClick={() => confirmDelete(documentRecord)}
                >
                  {deletingId === documentRecord.id
                    ? "Deleting…"
                    : "Confirm delete"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPendingDeleteId(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setPendingDeleteId(documentRecord.id)
                }
              >
                Delete
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DocumentsPanel({
  documents,
  openOriginalDocument,
  onDeleteDocument,
  canDelete = true,
}) {
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  async function confirmDelete(documentRecord) {
    if (!onDeleteDocument) {
      return;
    }

    setDeletingId(documentRecord.id);
    setDeleteError("");

    try {
      await onDeleteDocument(documentRecord);
      setPendingDeleteId(null);
    } catch (error) {
      setDeleteError(
        error.response?.data?.error ||
          error.message ||
          "Could not delete this document."
      );
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (documents || []).filter((documentRecord) => {
      if (!matchesTypeFilter(documentRecord, typeFilter)) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = [
        documentTitle(documentRecord),
        documentRecord.file_name,
        documentRecord.summary,
        documentCompany(documentRecord),
        documentRecord.document_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [documents, query, typeFilter]);

  const yearGroups = useMemo(
    () => groupByYear(filtered, documentDate),
    [filtered]
  );

  const typeCounts = useMemo(() => {
    const counts = { all: (documents || []).length };

    for (const filter of DOCUMENT_TYPE_FILTERS) {
      if (filter.id === "all") {
        continue;
      }

      counts[filter.id] = (documents || []).filter((doc) =>
        matchesTypeFilter(doc, filter.id)
      ).length;
    }

    return counts;
  }, [documents]);

  if ((documents || []).length === 0) {
    return (
      <div className="empty-state dashboard-empty">
        <h4>No documents uploaded</h4>
        <p>
          Upload an inspection report, invoice, receipt,
          warranty, equipment manual, or a photo of a nameplate
          to begin building the home&apos;s document history.
        </p>
      </div>
    );
  }

  return (
    <div className="documents-library">
      {deleteError ? (
        <p className="error-message" role="alert">
          {deleteError}
        </p>
      ) : null}

      <input
        type="search"
        className="documents-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search documents..."
        aria-label="Search documents"
      />

      <FilterChips
        ariaLabel="Document types"
        value={typeFilter}
        onChange={setTypeFilter}
        options={DOCUMENT_TYPE_FILTERS.map((filter) => ({
          ...filter,
          count: typeCounts[filter.id],
        }))}
      />

      <CollapsibleSection
        title={`Document Library — ${filtered.length} document${
          filtered.length === 1 ? "" : "s"
        }`}
        defaultOpen
      >
        {yearGroups.length === 0 ? (
          <p className="muted">
            No documents match that search.
          </p>
        ) : (
          <div className="year-stack">
            {yearGroups.map((group, index) => (
              <CollapsibleSection
                key={group.year}
                title={`${group.year} — ${group.items.length} document${
                  group.items.length === 1 ? "" : "s"
                }`}
                defaultOpen={index === 0}
              >
                <div className="record-grid">
                  {group.items.map((documentRecord) => (
                    <DocumentCard
                      key={documentRecord.id}
                      documentRecord={documentRecord}
                      openOriginalDocument={openOriginalDocument}
                      onDeleteDocument={onDeleteDocument}
                      canDelete={canDelete}
                      pendingDeleteId={pendingDeleteId}
                      setPendingDeleteId={setPendingDeleteId}
                      deletingId={deletingId}
                      confirmDelete={confirmDelete}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

export default DocumentsPanel;
