// frontend/src/components/dashboard/DocumentsPanel.jsx

import {
  countLabel,
  documentDisplayTitle,
  formatCurrency,
  formatDate,
  formatFileSize,
  formatLabel,
} from "../../utils/formatters.js";
import { groupByYear } from "../../utils/groupByYear.js";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";

import {
  useMemo,
  useState,
} from "react";

const TYPE_FILTERS = [
  { id: "all", label: "All", types: null },
  { id: "inspection", label: "Inspections", types: ["inspection"] },
  { id: "invoice", label: "Invoices", types: ["invoice", "receipt", "estimate"] },
  { id: "manual", label: "Manuals", types: ["manual"] },
  { id: "warranty", label: "Warranties", types: ["warranty"] },
];

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

function DocumentCard({
  documentRecord,
  openOriginalDocument,
  onDeleteDocument,
  onRenameDocument,
  canEdit,
  deletingId,
  pendingDeleteId,
  setPendingDeleteId,
  confirmDelete,
  editingTitleId,
  titleDraft,
  setTitleDraft,
  setEditingTitleId,
  savingTitleId,
  titleError,
  onSaveTitle,
}) {
  const metadata = documentRecord.metadata || {};
  const company = documentCompany(documentRecord);
  const amount = documentAmount(documentRecord);
  const dated = documentDate(documentRecord);
  const displayTitle = documentDisplayTitle(documentRecord);
  const originalName = documentRecord.file_name;
  const isEditingTitle = editingTitleId === documentRecord.id;

  return (
    <article
      className="record-card document-card"
    >
      <div className="record-card-header">
        <div>
          <span className="record-type">
            {formatLabel(
              documentRecord.document_type
            )}
          </span>

          {isEditingTitle ? (
            <form
              className="document-title-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSaveTitle(documentRecord);
              }}
            >
              <input
                type="text"
                value={titleDraft}
                onChange={(event) =>
                  setTitleDraft(event.target.value)
                }
                aria-label="Document title"
                autoFocus
              />
              <button
                type="submit"
                disabled={
                  savingTitleId === documentRecord.id
                }
              >
                {savingTitleId === documentRecord.id
                  ? "Saving…"
                  : "Save"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingTitleId(null)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h4>{displayTitle}</h4>
              {originalName &&
              originalName !== displayTitle ? (
                <p className="document-original-name">
                  Original file: {originalName}
                </p>
              ) : null}
            </>
          )}
          {titleError &&
          editingTitleId === documentRecord.id ? (
            <p className="error-message" role="alert">
              {titleError}
            </p>
          ) : null}
        </div>

        <span className="document-icon">
          DOC
        </span>
      </div>

      {documentRecord.summary ? (
        <p className="record-description">
          {documentRecord.summary}
        </p>
      ) : (
        <p className="empty-state">
          No summary is available.
        </p>
      )}

      <div className="document-details">
        {dated && (
          <div>
            <span>
              Document date
            </span>

            <strong>
              {documentRecord.metadata?.documentDate ||
                formatDate(dated)}
            </strong>
          </div>
        )}

        {company && (
          <div>
            <span>
              Company
            </span>

            <strong>
              {company}
            </strong>
          </div>
        )}

        {Number(amount) > 0 && (
          <div>
            <span>
              Total amount
            </span>

            <strong>
              {formatCurrency(amount)}
            </strong>
          </div>
        )}

        {metadata.fileSize && (
          <div>
            <span>
              File size
            </span>

            <strong>
              {formatFileSize(
                metadata.fileSize
              )}
            </strong>
          </div>
        )}
      </div>

      <div className="record-footer document-card-footer">
        <small>
          Uploaded{" "}
          {formatDate(
            documentRecord.created_at
          )}
        </small>

        <div className="document-actions">
          {typeof openOriginalDocument === "function" ? (
            metadata.s3Key ? (
              <button
                type="button"
                className="document-open-button"
                onClick={() =>
                  openOriginalDocument(
                    documentRecord
                  )
                }
              >
                Open original
              </button>
            ) : (
              <span className="original-unavailable">
                Original unavailable
              </span>
            )
          ) : null}

          {canEdit &&
          onRenameDocument &&
          !isEditingTitle ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setEditingTitleId(documentRecord.id);
                setTitleDraft(displayTitle);
              }}
            >
              Rename
            </button>
          ) : null}

          {canEdit && onDeleteDocument ? (
            pendingDeleteId ===
            documentRecord.id ? (
              <>
                <button
                  type="button"
                  className="danger-button"
                  disabled={
                    deletingId ===
                    documentRecord.id
                  }
                  onClick={() =>
                    confirmDelete(
                      documentRecord
                    )
                  }
                >
                  {deletingId ===
                  documentRecord.id
                    ? "Deleting…"
                    : "Confirm delete"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setPendingDeleteId(null)
                  }
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setPendingDeleteId(
                    documentRecord.id
                  )
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
  onRenameDocument,
  canEdit = true,
}) {
  const [deletingId, setDeletingId] =
    useState(null);
  const [pendingDeleteId, setPendingDeleteId] =
    useState(null);
  const [deleteError, setDeleteError] =
    useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] =
    useState("all");
  const [editingTitleId, setEditingTitleId] =
    useState(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitleId, setSavingTitleId] =
    useState(null);
  const [titleError, setTitleError] = useState("");

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

  async function saveTitle(documentRecord) {
    if (!onRenameDocument) {
      return;
    }

    setSavingTitleId(documentRecord.id);
    setTitleError("");

    try {
      await onRenameDocument(
        documentRecord,
        titleDraft
      );
      setEditingTitleId(null);
    } catch (error) {
      setTitleError(
        error.response?.data?.error ||
          error.message ||
          "Could not rename this document."
      );
    } finally {
      setSavingTitleId(null);
    }
  }

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filter = TYPE_FILTERS.find(
      (item) => item.id === typeFilter
    );

    return documents.filter((documentRecord) => {
      const type =
        documentRecord.document_type || "general";

      if (
        filter?.types &&
        !filter.types.includes(type)
      ) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = [
        documentDisplayTitle(documentRecord),
        documentRecord.file_name,
        documentRecord.summary,
        documentRecord.document_type,
        documentCompany(documentRecord),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [documents, query, typeFilter]);

  const yearGroups = useMemo(
    () => groupByYear(filteredDocuments, documentDate),
    [filteredDocuments]
  );

  return (
    <CollapsibleSection
      title="Document Library"
      summary={countLabel(documents.length, "document")}
      defaultOpen
    >
    <div className="documents-page">
      {documents.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <h4>
            No documents uploaded
          </h4>

          <p>
            Upload an inspection report,
            invoice, receipt, warranty,
            equipment manual, or a photo of
            a nameplate to begin building
            the home&apos;s document history.
          </p>
        </div>
      ) : (
        <>
      {deleteError ? (
        <p className="error-message" role="alert">
          {deleteError}
        </p>
      ) : null}

      <div className="documents-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          placeholder="Search documents..."
          aria-label="Search documents"
        />

        <div
          className="tab-list documents-type-filters"
          role="tablist"
          aria-label="Document types"
        >
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={typeFilter === filter.id}
              className={
                typeFilter === filter.id
                  ? "tab-button active"
                  : "tab-button"
              }
              onClick={() => setTypeFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <h4>No matching documents</h4>
          <p>
            Try a different search or document type.
          </p>
        </div>
      ) : (
        yearGroups.map(([year, yearDocuments]) => (
          <CollapsibleSection
            key={year}
            nested
            variant="row"
            title={String(year)}
            summary={countLabel(yearDocuments.length, "document")}
          >
            <div className="record-grid">
              {yearDocuments.map((documentRecord) => (
                <DocumentCard
                  key={documentRecord.id}
                  documentRecord={documentRecord}
                  openOriginalDocument={
                    openOriginalDocument
                  }
                  onDeleteDocument={onDeleteDocument}
                  onRenameDocument={onRenameDocument}
                  canEdit={canEdit}
                  deletingId={deletingId}
                  pendingDeleteId={pendingDeleteId}
                  setPendingDeleteId={setPendingDeleteId}
                  confirmDelete={confirmDelete}
                  editingTitleId={editingTitleId}
                  titleDraft={titleDraft}
                  setTitleDraft={setTitleDraft}
                  setEditingTitleId={setEditingTitleId}
                  savingTitleId={savingTitleId}
                  titleError={titleError}
                  onSaveTitle={saveTitle}
                />
              ))}
            </div>
          </CollapsibleSection>
        ))
      )}
        </>
      )}
    </div>
    </CollapsibleSection>
  );
}


export default DocumentsPanel;
