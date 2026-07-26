// frontend/src/components/dashboard/DocumentsPanel.jsx

import {
  formatCurrency,
  formatDate,
  formatFileSize,
  formatLabel,
} from "../../utils/formatters.js";


function DocumentsPanel({ documents, openOriginalDocument }) {
  if (documents.length === 0) {
    return (
      <div className="empty-state dashboard-empty">
        <h4>
          No documents uploaded
        </h4>

        <p>
          Upload an inspection report,
          invoice, receipt, warranty, or
          equipment manual to begin
          building the home's document
          history.
        </p>
      </div>
    );
  }

  return (
    <div className="record-grid">
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
            </div>
          </article>
        );
      })}
    </div>
  );
}


export default DocumentsPanel;
