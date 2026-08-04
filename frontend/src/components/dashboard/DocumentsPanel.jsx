// frontend/src/components/dashboard/DocumentsPanel.jsx

import {
  formatCurrency,
  formatDate,
  formatFileSize,
  formatLabel,
} from "../../utils/formatters.js";

import {
  useState,
} from "react";


function DocumentsPanel({
  documents,
  openOriginalDocument,
  onDeleteDocument,
  canDelete = true,
}) {
  const [deletingId, setDeletingId] =
    useState(null);
  const [pendingDeleteId, setPendingDeleteId] =
    useState(null);
  const [deleteError, setDeleteError] =
    useState("");

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

  if (documents.length === 0) {
    return (
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
    );
  }

  return (
    <div className="record-grid">
      {deleteError ? (
        <p className="error-message" role="alert">
          {deleteError}
        </p>
      ) : null}

      {documents.map((documentRecord) => {
        const metadata =
          documentRecord.metadata || {};

        return (
          <article
            key={documentRecord.id}
            className="record-card document-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    documentRecord.document_type
                  )}
                </span>

                <h4>
                  {documentRecord.file_name ||
                    "Untitled document"}
                </h4>
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
              {metadata.documentDate && (
                <div>
                  <span>
                    Document date
                  </span>

                  <strong>
                    {
                      metadata.documentDate
                    }
                  </strong>
                </div>
              )}

              {metadata
                .contractorOrCompany && (
                  <div>
                    <span>
                      Company
                    </span>

                    <strong>
                      {
                        metadata
                          .contractorOrCompany
                      }
                    </strong>
                  </div>
                )}

              {Number(
                metadata.totalAmount
              ) > 0 && (
                  <div>
                    <span>
                      Total amount
                    </span>

                    <strong>
                      {formatCurrency(
                        metadata.totalAmount
                      )}
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
                {documentRecord.metadata?.s3Key ? (
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
                )}

                {canDelete && onDeleteDocument ? (
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
      })}
    </div>
  );
}


export default DocumentsPanel;
