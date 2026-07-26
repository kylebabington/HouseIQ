// frontend/src/components/documents/DocumentUploadPanel.jsx

import {
  formatCurrency,
  formatFileSize,
  formatLabel,
} from "../../utils/formatters.js";


// ---------------------------------------------------------
// DOCUMENT UPLOAD PANEL
// ---------------------------------------------------------
//
// Presentational only. Every piece of upload state and the
// uploadDocument handler live in useHomeDashboard.
//
function DocumentUploadPanel({
  selectedDocumentType,
  setSelectedDocumentType,
  selectedDocumentFile,
  setSelectedDocumentFile,
  isUploadingDocument,
  documentUploadError,
  setDocumentUploadError,
  documentUploadResult,
  setDocumentUploadResult,
  uploadDocument,
}) {
  return (
    <section className="document-upload-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Build home memory automatically
          </p>

          <h3>
            Upload a home document
          </h3>

          <p className="section-description">
            Upload an inspection report,
            invoice, receipt, warranty, or
            manual. HouseIQ will extract the
            useful facts and update the home
            record.
          </p>
        </div>

        <span className="document-support-badge">
          PDF or TXT
        </span>
      </div>

      <form
        onSubmit={uploadDocument}
        className="document-upload-form"
      >
        <div className="document-form-fields">
          <label className="form-field">
            <span>Document type</span>

            <select
              value={selectedDocumentType}
              onChange={(event) =>
                setSelectedDocumentType(
                  event.target.value
                )
              }
              disabled={isUploadingDocument}
            >
              <option value="inspection">
                Inspection report
              </option>

              <option value="invoice">
                Repair invoice
              </option>

              <option value="receipt">
                Receipt
              </option>

              <option value="warranty">
                Warranty
              </option>

              <option value="manual">
                Appliance or equipment manual
              </option>

              <option value="estimate">
                Contractor estimate
              </option>

              <option value="insurance">
                Insurance document
              </option>

              <option value="general">
                Other document
              </option>
            </select>
          </label>

          <label className="form-field file-field">
            <span>Select file</span>

            <input
              id="houseiq-document-input"
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(event) => {
                const file =
                  event.target.files?.[0] ||
                  null;

                setSelectedDocumentFile(file);
                setDocumentUploadError("");
                setDocumentUploadResult(null);
              }}
              disabled={isUploadingDocument}
            />
          </label>
        </div>

        {selectedDocumentFile && (
          <div className="selected-file-preview">
            <div>
              <strong>
                {selectedDocumentFile.name}
              </strong>

              <span>
                {formatFileSize(
                  selectedDocumentFile.size
                )}
              </span>
            </div>

            <button
              type="button"
              className="text-button"
              disabled={isUploadingDocument}
              onClick={() => {
                setSelectedDocumentFile(null);

                const fileInput =
                  document.getElementById(
                    "houseiq-document-input"
                  );

                if (fileInput) {
                  fileInput.value = "";
                }
              }}
            >
              Remove
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={
            isUploadingDocument ||
            !selectedDocumentFile
          }
        >
          {isUploadingDocument
            ? "Uploading and analyzing..."
            : "Upload to HouseIQ"}
        </button>
      </form>

      {isUploadingDocument && (
        <div className="document-processing-state">
          <strong>
            HouseIQ is reading the document
          </strong>

          <p>
            Extracting text, creating a
            summary, and checking for home
            memories, issues, projects, and
            assets.
          </p>
        </div>
      )}

      {documentUploadError && (
        <div className="error-message">
          <strong>
            Document upload failed
          </strong>

          <p>{documentUploadError}</p>
        </div>
      )}

      {documentUploadResult && (
        <div className="document-upload-result">
          <div className="document-result-header">
            <div>
              <p className="eyebrow">
                Analysis complete
              </p>

              <h4>
                {
                  documentUploadResult
                    .document?.fileName
                }
              </h4>
            </div>

            <span className="success-badge">
              Saved
            </span>
          </div>

          <div className="document-summary-box">
            <strong>
              HouseIQ summary
            </strong>

            <p>
              {
                documentUploadResult
                  .document?.summary
              }
            </p>
          </div>

          {documentUploadResult
            .document?.metadata && (
              <div className="document-metadata-grid">
                {documentUploadResult.document
                  .metadata.documentDate && (
                    <div>
                      <span>
                        Document date
                      </span>

                      <strong>
                        {
                          documentUploadResult
                            .document.metadata
                            .documentDate
                        }
                      </strong>
                    </div>
                  )}

                {documentUploadResult.document
                  .metadata
                  .contractorOrCompany && (
                    <div>
                      <span>
                        Company
                      </span>

                      <strong>
                        {
                          documentUploadResult
                            .document.metadata
                            .contractorOrCompany
                        }
                      </strong>
                    </div>
                  )}

                {Number(
                  documentUploadResult.document
                    .metadata.totalAmount
                ) > 0 && (
                    <div>
                      <span>Total amount</span>

                      <strong>
                        {formatCurrency(
                          documentUploadResult
                            .document.metadata
                            .totalAmount
                        )}
                      </strong>
                    </div>
                  )}
              </div>
            )}

          <div className="actions-section">
            <h4>
              What HouseIQ updated
            </h4>

            {documentUploadResult
              .actionsTaken?.length > 0 ? (
              <div className="action-list">
                {documentUploadResult.actionsTaken.map(
                  (action, index) => (
                    <div
                      key={`${action.recordId}-${index}`}
                      className="action-item"
                    >
                      <span className="action-icon">
                        âœ“
                      </span>

                      <div>
                        <strong>
                          {formatLabel(
                            action.type
                          )}
                        </strong>

                        <p>{action.title}</p>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="empty-state">
                The document was saved, but
                HouseIQ did not create any
                additional records.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}


export default DocumentUploadPanel;
