// backend/routes/documents.js

import {
    Router,
} from "express";

import {
    analyzeHomeDocument,
} from "../services/ai/index.js";

import {
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireDocumentOwnership,
    requireDocumentWriteAccess,
    requireHomeAccess,
    requireHomeOwnership,
} from "../middleware/ownership.js";

import {
    uploadRateLimit,
} from "../middleware/rateLimit.js";

import {
    createAssetRecord,
    createIssueRecord,
    createMemoryRecord,
    createProjectRecord,
    extractTextFromUploadedFile,
    MAX_ASSETS_PER_RUN,
    MAX_ISSUES_PER_RUN,
    MAX_MEMORIES_PER_RUN,
    MAX_PROJECTS_PER_RUN,
    normalizeAssetKey,
    prepareMemoryEmbedding,
} from "../services/recordHelpers.js";

import {
    createDocumentDownloadUrl,
    deleteDocumentFromS3,
    uploadDocumentToS3,
} from "../services/s3.js";

import {
    validateUploadMagicBytes,
} from "../lib/fileMagic.js";

import {
    findEvidencePassage,
    splitExtractedTextIntoChunks,
    storeDocumentChunks,
} from "../services/documentChunks.js";

export function createDocumentsRouter(upload) {
    const router = Router();

    // ---------------------------------------------------------
    // GET DOCUMENTS FOR A HOME
    // ---------------------------------------------------------

    router.get(
        "/homes/:homeId/documents",

        // Confirm who is making the request.
        requireAuth,

        // Viewers may list documents; uploads still require member+.
        requireHomeAccess({ minRole: "viewer" }),

        async (req, res) => {
            try {
                // Prefer the home ID already verified by
                // requireHomeOwnership over the raw URL param.
                const homeId =
                    req.authorizedHomeId;

                const result = await pool.query(
                    `
                    SELECT
                        id,
                        home_id,
                        document_type,
                        file_name,
                        source_url,
                        summary,
                        metadata,
                        created_at,
                        updated_at
                    FROM documents
                    WHERE home_id = $1
                    ORDER BY created_at DESC
                    `,
                    [homeId]
                );

                res.json(result.rows);
            } catch (error) {
                console.error(
                    "Error fetching documents:",
                    error
                );

                res.status(500).json({
                    error: "Failed to fetch documents",
                });
            }
        }
    );

    // ---------------------------------------------------------
    // CREATE A TEMPORARY DOCUMENT DOWNLOAD URL
    // ---------------------------------------------------------
    //
    // The original file remains private in Amazon S3.
    //
    // This route:
    //
    // 1. Requires a valid Auth0 access token.
    // 2. Confirms that the document's home belongs to the user.
    // 3. Reads the S3 object key from the verified document.
    // 4. Generates a signed URL that expires after five minutes.
    //
    router.get(
        "/documents/:documentId/download-url",

        // Confirm who is making the request.
        requireAuth,

        // Confirm that the requested document belongs to a home
        // owned by that authenticated user.
        requireDocumentOwnership,

        async (req, res) => {
            try {
                // requireDocumentOwnership already retrieved and
                // authorized this document.
                //
                const document =
                    req.authorizedDocument;

                const metadata =
                    document.metadata || {};

                // -------------------------------------------------
                // GET THE PRIVATE S3 OBJECT KEY
                // -------------------------------------------------

                const s3Key =
                    metadata.s3Key;

                // Older HouseIQ documents may have been created
                // before original-file S3 storage was enabled.
                //
                if (!s3Key) {
                    return res.status(409).json({
                        error:
                            "The original file is not available",

                        details:
                            "This document was created before S3 storage was enabled.",
                    });
                }

                // -------------------------------------------------
                // CREATE A FIVE-MINUTE SIGNED URL
                // -------------------------------------------------

                const signedDownload =
                    await createDocumentDownloadUrl({
                        key:
                            s3Key,

                        originalFileName:
                            document.file_name,

                        expiresInSeconds:
                            300,
                    });

                // -------------------------------------------------
                // RETURN THE TEMPORARY URL
                // -------------------------------------------------

                return res.json({
                    documentId:
                        document.id,

                    fileName:
                        document.file_name,

                    url:
                        signedDownload.url,

                    expiresInSeconds:
                        signedDownload
                            .expiresInSeconds,
                });
            } catch (error) {
                console.error(
                    "Could not create document download URL:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Could not open the original document",
                });
            }
        }
    );

    // ---------------------------------------------------------
    // DELETE A DOCUMENT AND ITS ORIGINAL S3 OBJECT
    // ---------------------------------------------------------
    //
    // Deletion requires:
    //
    // 1. A valid Auth0 access token.
    // 2. Ownership of the document's parent home.
    // 3. Successful removal of the private S3 object when one
    //    exists.
    // 4. Removal of the CockroachDB document record.
    //
    router.delete(
        "/documents/:documentId",

        // Validate the Auth0 access token.
        requireAuth,

        // Delete requires member+ (fail-closed role check).
        requireDocumentWriteAccess,

        async (req, res) => {
            const document =
                req.authorizedDocument;

            let client;

            try {
                const s3Key =
                    document.metadata?.s3Key ||
                    null;

                // -------------------------------------------------
                // DELETE THE COCKROACHDB RECORD FIRST
                // -------------------------------------------------
                //
                // Prefer an orphaned S3 object over a DB row that
                // points at a missing file.
                //

                client =
                    await pool.connect();

                await client.query(
                    "BEGIN"
                );

                const deleteResult =
                    await client.query(
                        `
                        DELETE FROM documents
                        WHERE id = $1
                          AND home_id = $2
                        RETURNING
                            id,
                            file_name
                        `,
                        [
                            document.id,
                            document.home_id,
                        ]
                    );

                if (
                    deleteResult.rows.length === 0
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(404).json({
                        error:
                            "Document not found",
                    });
                }

                await client.query(
                    "COMMIT"
                );

                client.release();
                client = null;

                // -------------------------------------------------
                // THEN REMOVE THE PRIVATE S3 OBJECT
                // -------------------------------------------------

                if (s3Key) {
                    try {
                        await deleteDocumentFromS3({
                            key:
                                s3Key,
                        });
                    } catch (s3Error) {
                        console.error(
                            "Document DB deleted but S3 cleanup failed:",
                            s3Error
                        );
                    }
                }

                const deletedDocument =
                    deleteResult.rows[0];

                return res.json({
                    message:
                        "Document deleted successfully",

                    documentId:
                        deletedDocument.id,

                    fileName:
                        deletedDocument.file_name,
                });
            } catch (error) {
                if (client) {
                    try {
                        await client.query(
                            "ROLLBACK"
                        );
                    } catch (rollbackError) {
                        console.error(
                            "Document deletion rollback failed:",
                            rollbackError
                        );
                    }
                }

                console.error(
                    "Document deletion failed:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Document could not be deleted",
                });
            } finally {
                if (client) {
                    client.release();
                }
            }
        }
    );

    // ---------------------------------------------------------
    // UPLOAD, STORE, AND ANALYZE A HOME DOCUMENT
    // ---------------------------------------------------------
    //
    // This route now performs the complete document workflow:
    //
    // 1. Confirm Auth0 identity and home ownership.
    // 2. Receive the file with Multer.
    // 3. Extract text from the PDF or text file.
    // 4. Analyze the text with HouseIQ.
    // 5. Upload the original file to private Amazon S3.
    // 6. Save the document and AI-created records in CockroachDB.
    // 7. Clean up the S3 file if database processing fails.
    //
    router.post(
        "/homes/:homeId/documents/upload",

        // Confirm who is making the request.
        requireAuth,

        // requireAuth runs first so req.auth.payload.sub is
        // available for uploadRateLimit to key the limit on the
        // authenticated user rather than only their IP address.
        uploadRateLimit,

        // Confirm that this home belongs to that user before
        // accepting and buffering the uploaded file.
        requireHomeOwnership,

        // This field name must match the browser FormData field:
        //
        // formData.append("document", selectedFile)
        //
        upload.single("document"),

        async (req, res) => {
            // Prefer the home ID already verified by
            // requireHomeOwnership over the raw URL param.
            const homeId =
                req.authorizedHomeId;

            const documentType =
                req.body.documentType?.trim() ||
                "general";

            // This will hold a dedicated CockroachDB connection
            // after the transaction begins.
            let client;

            // S3 cannot participate in a CockroachDB transaction.
            //
            // We save the upload result here so that we can delete
            // the S3 object if later database work fails.
            let uploadedS3Object = null;

            try {
                // -------------------------------------------------
                // 1. VALIDATE THE UPLOADED FILE
                // -------------------------------------------------

                if (!req.file) {
                    return res.status(400).json({
                        error:
                            "A document file is required",
                    });
                }

                const magicCheck = validateUploadMagicBytes(
                    req.file.buffer,
                    req.file.mimetype
                );

                if (!magicCheck.ok) {
                    return res.status(400).json({
                        error:
                            "The uploaded file type could not be verified",
                        details: magicCheck.reason,
                    });
                }


                // -------------------------------------------------
                // 2. EXTRACT READABLE TEXT
                // -------------------------------------------------
                //
                // We do this before uploading to S3.
                //
                // If this is a scanned PDF with no readable text,
                // the request fails before we permanently store a file
                // that HouseIQ cannot currently process.
                //
                const extractedText =
                    await extractTextFromUploadedFile(
                        req.file
                    );


                // -------------------------------------------------
                // 3. ANALYZE THE DOCUMENT WITH HOUSEIQ
                // -------------------------------------------------

                const analysis =
                    await analyzeHomeDocument({
                        fileName:
                            req.file.originalname,

                        documentType,

                        extractedText,
                    });

                // Cap side effects the same way /ask does.
                const memoriesToCreate = (
                    analysis.memoriesToCreate || []
                ).slice(0, MAX_MEMORIES_PER_RUN);

                const issuesToCreate = (
                    analysis.issuesToCreate || []
                ).slice(0, MAX_ISSUES_PER_RUN);

                const projectsToCreate = (
                    analysis.projectsToCreate || []
                ).slice(0, MAX_PROJECTS_PER_RUN);

                let assetsToCreate = (
                    analysis.assetsToCreate || []
                ).slice(0, MAX_ASSETS_PER_RUN);

                const existingAssetsResult =
                    await pool.query(
                        `
                        SELECT asset_type, name
                        FROM home_assets
                        WHERE home_id = $1
                        `,
                        [homeId]
                    );

                const existingAssetKeys = new Set(
                    existingAssetsResult.rows.map(
                        (row) =>
                            normalizeAssetKey(
                                row.asset_type,
                                row.name
                            )
                    )
                );

                assetsToCreate =
                    assetsToCreate.filter(
                        (assetInput) => {
                            const key =
                                normalizeAssetKey(
                                    assetInput.assetType,
                                    assetInput.name
                                );

                            if (
                                existingAssetKeys.has(
                                    key
                                )
                            ) {
                                return false;
                            }

                            existingAssetKeys.add(
                                key
                            );
                            return true;
                        }
                    );

                // Embed memories before opening a DB transaction.
                const memoryEmbeddings =
                    await Promise.all(
                        memoriesToCreate.map(
                            async (memoryInput) => {
                                const title =
                                    memoryInput.title?.trim() ||
                                    "Untitled memory";
                                const category =
                                    memoryInput.category?.trim() ||
                                    "general";
                                const content =
                                    memoryInput.content?.trim() ||
                                    "";

                                return prepareMemoryEmbedding({
                                    title,
                                    category,
                                    content,
                                    metadata: {
                                        source:
                                            "document_analysis",
                                        fileName:
                                            req.file
                                                .originalname,
                                    },
                                });
                            }
                        )
                    );


                // -------------------------------------------------
                // 4. UPLOAD THE ORIGINAL FILE TO AMAZON S3
                // -------------------------------------------------

                uploadedS3Object =
                    await uploadDocumentToS3({
                        homeId,

                        originalFileName:
                            req.file.originalname,

                        mimeType:
                            req.file.mimetype,

                        // Multer memory storage places the raw file
                        // bytes inside req.file.buffer.
                        buffer:
                            req.file.buffer,
                    });


                // -------------------------------------------------
                // 5. BEGIN THE COCKROACHDB TRANSACTION
                // -------------------------------------------------

                client =
                    await pool.connect();

                await client.query(
                    "BEGIN"
                );


                // -------------------------------------------------
                // 6. SAVE THE DOCUMENT RECORD
                // -------------------------------------------------

                const documentResult =
                    await client.query(
                        `
                        INSERT INTO documents (
                            home_id,
                            document_type,
                            file_name,
                            source_url,
                            extracted_text,
                            summary,
                            metadata
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7::JSONB
                        )
                        RETURNING *
                        `,
                        [
                            homeId,

                            documentType,

                            // Store the original filename for display.
                            req.file.originalname,

                            // This is a durable internal S3 reference.
                            //
                            // It is not a public browser URL.
                            uploadedS3Object.s3Uri,

                            extractedText,

                            analysis.summary,

                            JSON.stringify({
                                source:
                                    "document_upload",

                                storageProvider:
                                    "aws_s3",

                                s3Bucket:
                                    uploadedS3Object.bucket,

                                s3Key:
                                    uploadedS3Object.key,

                                s3Etag:
                                    uploadedS3Object.etag,

                                mimeType:
                                    req.file.mimetype,

                                fileSize:
                                    req.file.size,

                                documentDate:
                                    analysis.documentDate,

                                contractorOrCompany:
                                    analysis.contractorOrCompany,

                                totalAmount:
                                    analysis.totalAmount,
                            }),
                        ]
                    );

                const document =
                    documentResult.rows[0];

                try {
                    const chunks =
                        splitExtractedTextIntoChunks(
                            extractedText
                        );
                    if (chunks.length > 0) {
                        await storeDocumentChunks({
                            client,
                            documentId: document.id,
                            homeId,
                            chunks,
                        });
                    }
                } catch (chunkError) {
                    console.warn(
                        "Document chunk storage skipped:",
                        chunkError.message
                    );
                }


                // -------------------------------------------------
                // 7. PREPARE RESPONSE COLLECTIONS
                // -------------------------------------------------

                const createdRecords = {
                    memories: [],
                    issues: [],
                    projects: [],
                    assets: [],
                };

                const actionsTaken = [
                    {
                        type:
                            "document_created",

                        recordId:
                            document.id,

                        title:
                            document.file_name ||
                            "Uploaded document",
                    },
                ];


                // -------------------------------------------------
                // 8. CREATE MEMORIES FOUND IN THE DOCUMENT
                // -------------------------------------------------

                for (
                    let memoryIndex = 0;
                    memoryIndex < memoriesToCreate.length;
                    memoryIndex += 1
                ) {
                    const memoryInput =
                        memoriesToCreate[memoryIndex];

                    const memory =
                        await createMemoryRecord({
                            homeId,

                            title:
                                memoryInput.title,

                            category:
                                memoryInput.category,

                            content:
                                memoryInput.content,

                            importance:
                                memoryInput.importance,

                            metadata: {
                                source:
                                    "document_analysis",

                                documentId:
                                    document.id,

                                fileName:
                                    req.file.originalname,

                                s3Key:
                                    uploadedS3Object.key,
                            },

                            embeddingSql:
                                memoryEmbeddings[
                                    memoryIndex
                                ],

                            sourceDocumentId:
                                document.id,

                            verificationStatus:
                                "proposed",

                            evidencePassage:
                                memoryInput.evidencePassage ||
                                findEvidencePassage(
                                    extractedText,
                                    memoryInput.content ||
                                        memoryInput.title ||
                                        ""
                                ).passage,

                            client,
                        });

                    createdRecords.memories.push(
                        memory
                    );

                    actionsTaken.push({
                        type:
                            "memory_created",

                        recordId:
                            memory.id,

                        title:
                            memory.title,
                    });
                }


                // -------------------------------------------------
                // 9. CREATE ISSUES FOUND IN THE DOCUMENT
                // -------------------------------------------------

                for (
                    const issueInput of
                    issuesToCreate
                ) {
                    const issueEvidence =
                        findEvidencePassage(
                            extractedText,
                            issueInput.evidencePassage ||
                                issueInput.title ||
                                issueInput.description ||
                                ""
                        );

                    const issue =
                        await createIssueRecord({
                            homeId,

                            title:
                                issueInput.title,

                            description:
                                issueInput.description,

                            priority:
                                issueInput.priority,

                            category:
                                issueInput.category,

                            suspectedCause:
                                issueInput.suspectedCause,

                            recommendedNextStep:
                                issueInput.recommendedNextStep,

                            sourceDocumentId:
                                document.id,

                            verificationStatus:
                                "proposed",

                            evidencePassage:
                                issueInput.evidencePassage ||
                                issueEvidence.passage,

                            evidencePage:
                                issueEvidence.page,

                            client,
                        });

                    createdRecords.issues.push(
                        issue
                    );

                    actionsTaken.push({
                        type:
                            "issue_created",

                        recordId:
                            issue.id,

                        title:
                            issue.title,
                    });
                }


                // -------------------------------------------------
                // 10. CREATE PROJECTS AND TASKS
                // -------------------------------------------------

                for (
                    const projectInput of
                    projectsToCreate
                ) {
                    const projectEvidence =
                        findEvidencePassage(
                            extractedText,
                            projectInput.evidencePassage ||
                                projectInput.title ||
                                projectInput.description ||
                                ""
                        );

                    const project =
                        await createProjectRecord({
                            homeId,

                            title:
                                projectInput.title,

                            description:
                                projectInput.description,

                            priority:
                                projectInput.priority,

                            estimatedCostLow:
                                projectInput
                                    .estimatedCostLow,

                            estimatedCostHigh:
                                projectInput
                                    .estimatedCostHigh,

                            diyDifficulty:
                                projectInput
                                    .diyDifficulty,

                            safetyNotes:
                                projectInput
                                    .safetyNotes,

                            tasks:
                                projectInput.tasks,

                            sourceDocumentId:
                                document.id,

                            verificationStatus:
                                "proposed",

                            evidencePassage:
                                projectInput.evidencePassage ||
                                projectEvidence.passage,

                            evidencePage:
                                projectEvidence.page,

                            client,
                        });

                    createdRecords.projects.push(
                        project
                    );

                    actionsTaken.push({
                        type:
                            "project_created",

                        recordId:
                            project.id,

                        title:
                            project.title,

                        taskCount:
                            project.tasks.length,
                    });
                }


                // -------------------------------------------------
                // 11. CREATE ASSETS FOUND IN THE DOCUMENT
                // -------------------------------------------------

                for (
                    const assetInput of
                    assetsToCreate
                ) {
                    const assetEvidence =
                        findEvidencePassage(
                            extractedText,
                            assetInput.evidencePassage ||
                                assetInput.name ||
                                ""
                        );

                    const asset =
                        await createAssetRecord({
                            homeId,

                            assetType:
                                assetInput.assetType,

                            name:
                                assetInput.name,

                            brand:
                                assetInput.brand,

                            model:
                                assetInput.model,

                            serialNumber:
                                assetInput.serialNumber,

                            location:
                                assetInput.location,

                            notes:
                                assetInput.notes,

                            installDate:
                                assetInput.installDate ||
                                null,

                            purchaseDate:
                                assetInput.purchaseDate ||
                                null,

                            warrantyExpiration:
                                assetInput.warrantyExpiration ||
                                null,

                            sourceDocumentId:
                                document.id,

                            verificationStatus:
                                "proposed",

                            evidencePassage:
                                assetInput.evidencePassage ||
                                assetEvidence.passage,

                            evidencePage:
                                assetEvidence.page,

                            client,
                        });

                    createdRecords.assets.push(
                        asset
                    );

                    actionsTaken.push({
                        type:
                            "asset_created",

                        recordId:
                            asset.id,

                        title:
                            asset.name,
                    });
                }


                // -------------------------------------------------
                // 12. COMMIT THE DATABASE TRANSACTION
                // -------------------------------------------------

                await client.query(
                    "COMMIT"
                );


                // -------------------------------------------------
                // 13. RETURN THE SUCCESS RESPONSE
                // -------------------------------------------------

                return res.status(201).json({
                    message:
                        analysis.truncated
                            ? "Document stored and analyzed successfully (text was truncated)"
                            : "Document stored and analyzed successfully",

                    truncated:
                        Boolean(analysis.truncated),

                    document: {
                        id:
                            document.id,

                        homeId:
                            document.home_id,

                        documentType:
                            document.document_type,

                        fileName:
                            document.file_name,

                        summary:
                            document.summary,

                        // This is the internal S3 URI.
                        //
                        // The frontend does not open this directly.
                        sourceUrl:
                            document.source_url,

                        metadata:
                            document.metadata,

                        createdAt:
                            document.created_at,
                    },

                    analysis,

                    actionsTaken,

                    createdRecords,

                    proposedForReview: true,
                });
            } catch (error) {
                // -------------------------------------------------
                // 14. ROLL BACK COCKROACHDB
                // -------------------------------------------------

                if (client) {
                    try {
                        await client.query(
                            "ROLLBACK"
                        );
                    } catch (rollbackError) {
                        console.error(
                            "Document database rollback failed:",
                            rollbackError
                        );
                    }
                }


                // -------------------------------------------------
                // 15. CLEAN UP AN ORPHANED S3 FILE
                // -------------------------------------------------
                //
                // Imagine this sequence:
                //
                // 1. S3 upload succeeds.
                // 2. Database insert fails.
                //
                // Without this cleanup, the S3 bucket would contain a
                // file that no database record knows about.
                //
                if (
                    uploadedS3Object?.key
                ) {
                    try {
                        await deleteDocumentFromS3({
                            key:
                                uploadedS3Object.key,
                        });
                    } catch (s3CleanupError) {
                        console.error(
                            "Failed to remove orphaned S3 object:",
                            s3CleanupError
                        );
                    }
                }


                console.error(
                    `Document upload failed [requestId=${req.requestId}]:`,
                    error
                );

                const clientErrorMessages = [
                    "Only PDF",
                    "file is empty",
                    "No readable text",
                    "larger than",
                ];

                const isClientError =
                    clientErrorMessages.some(
                        (message) =>
                            error.message.includes(
                                message
                            )
                    );

                return res
                    .status(
                        isClientError
                            ? 400
                            : 500
                    )
                    .json(
                        isClientError
                            ? {
                                error:
                                    "Document could not be processed",

                                details:
                                    error.message,
                            }
                            : {
                                error:
                                    "Document could not be processed",

                                requestId:
                                    req.requestId,
                            }
                    );
            } finally {
                // Return the connection to the database pool.
                if (client) {
                    client.release();
                }
            }
        }
    );

    return router;
}
