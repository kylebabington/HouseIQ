// backend/s3.js

import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";

import {
    getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import {
    randomUUID,
} from "node:crypto";


// ---------------------------------------------------------
// ENVIRONMENT CONFIGURATION
// ---------------------------------------------------------

// These values come from backend/.env.
//
// Example:
//
// AWS_REGION="us-east-2"
// AWS_S3_BUCKET_NAME="houseiq-kyle-documents-dev-7264"
//
const AWS_REGION =
    process.env.AWS_REGION;

const AWS_S3_BUCKET_NAME =
    process.env.AWS_S3_BUCKET_NAME;


/**
 * Checks that all required S3 settings exist.
 *
 * This runs when the server starts.
 *
 * A clear startup error is much easier to understand than
 * an AWS request failing later with missing configuration.
 */
function validateS3Configuration() {
    if (!AWS_REGION) {
        throw new Error(
            "AWS_REGION is required for S3 storage"
        );
    }

    if (!AWS_S3_BUCKET_NAME) {
        throw new Error(
            "AWS_S3_BUCKET_NAME is required for S3 storage"
        );
    }
}


// Validate before creating the client.
validateS3Configuration();


// ---------------------------------------------------------
// S3 CLIENT
// ---------------------------------------------------------

/**
 * This is the reusable connection object for Amazon S3.
 *
 * We provide only the region.
 *
 * We do not put credentials directly in this file.
 * The AWS SDK automatically reads the standard credentials
 * from the environment.
 */
const s3Client =
    new S3Client({
        region:
            AWS_REGION,
    });


// ---------------------------------------------------------
// SAFE FILE NAMES
// ---------------------------------------------------------

/**
 * Converts a user-provided filename into a safer value
 * for an S3 object key.
 *
 * Example:
 *
 * "My Inspection Report (FINAL).pdf"
 *
 * becomes:
 *
 * "my-inspection-report-final.pdf"
 */
function sanitizeFileName(fileName) {
    const fallbackName =
        "uploaded-document";

    if (
        typeof fileName !== "string" ||
        !fileName.trim()
    ) {
        return fallbackName;
    }

    const sanitized =
        fileName
            .trim()

            // Use lowercase for consistency.
            .toLowerCase()

            // Turn whitespace into hyphens.
            .replace(/\s+/g, "-")

            // Remove characters outside this safe set.
            .replace(/[^a-z0-9._-]/g, "")

            // Change repeated hyphens into one hyphen.
            .replace(/-+/g, "-")

            // Remove punctuation from the beginning and end.
            .replace(
                /^[-._]+|[-._]+$/g,
                ""
            );

    return (
        sanitized ||
        fallbackName
    );
}


// ---------------------------------------------------------
// OBJECT KEY CREATION
// ---------------------------------------------------------

/**
 * Creates the internal S3 object key.
 *
 * An S3 object key works somewhat like a file path.
 *
 * Example:
 *
 * homes/
 *   HOME-UUID/
 *     documents/
 *       FILE-UUID-inspection-report.pdf
 */
export function createDocumentS3Key({
    homeId,
    originalFileName,
}) {
    if (!homeId) {
        throw new Error(
            "homeId is required to create an S3 key"
        );
    }

    const safeFileName =
        sanitizeFileName(
            originalFileName
        );

    const uniqueFileId =
        randomUUID();

    return [
        "homes",
        homeId,
        "documents",
        `${uniqueFileId}-${safeFileName}`,
    ].join("/");
}


// ---------------------------------------------------------
// UPLOAD A DOCUMENT
// ---------------------------------------------------------

/**
 * Uploads the original document to the private S3 bucket.
 *
 * `buffer` contains the raw file bytes provided by Multer.
 */
export async function uploadDocumentToS3({
    homeId,
    originalFileName,
    mimeType,
    buffer,
}) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error(
            "A valid file buffer is required for S3 upload"
        );
    }

    if (buffer.length === 0) {
        throw new Error(
            "Cannot upload an empty file to S3"
        );
    }

    const key =
        createDocumentS3Key({
            homeId,
            originalFileName,
        });

    const command =
        new PutObjectCommand({
            Bucket:
                AWS_S3_BUCKET_NAME,

            Key:
                key,

            Body:
                buffer,

            ContentType:
                mimeType ||
                "application/octet-stream",

            Metadata: {
                homeid:
                    String(homeId),

                originalfilename:
                    String(
                        originalFileName ||
                        "uploaded-document"
                    ),
            },
        });

    const response =
        await s3Client.send(
            command
        );

    return {
        bucket:
            AWS_S3_BUCKET_NAME,

        key,

        // This is a durable internal storage reference.
        //
        // It is not a public browser URL.
        s3Uri:
            `s3://${AWS_S3_BUCKET_NAME}/${key}`,

        etag:
            response.ETag ||
            null,
    };
}


// ---------------------------------------------------------
// DELETE A DOCUMENT
// ---------------------------------------------------------

/**
 * Deletes an object from S3.
 *
 * This is used for:
 *
 * - removing a document intentionally
 * - cleanup when database processing fails
 */
export async function deleteDocumentFromS3({
    key,
}) {
    if (!key) {
        return;
    }

    const command =
        new DeleteObjectCommand({
            Bucket:
                AWS_S3_BUCKET_NAME,

            Key:
                key,
        });

    await s3Client.send(
        command
    );
}


// ---------------------------------------------------------
// CREATE A TEMPORARY DOWNLOAD URL
// ---------------------------------------------------------

/**
 * Generates a temporary URL for opening a private document.
 *
 * Default lifetime:
 *
 * 300 seconds = 5 minutes
 */
export async function createDocumentDownloadUrl({
    key,
    originalFileName,
    expiresInSeconds = 300,
}) {
    if (!key) {
        throw new Error(
            "An S3 object key is required"
        );
    }

    // Keep the expiration between one and fifteen minutes.
    const safeExpiration =
        Math.min(
            Math.max(
                Number(
                    expiresInSeconds
                ) || 300,

                60
            ),

            900
        );

    // Remove quotes from the filename because it will be
    // inserted into an HTTP response header.
    const safeDownloadName =
        String(
            originalFileName ||
            "houseiq-document"
        ).replaceAll(
            '"',
            ""
        );

    const command =
        new GetObjectCommand({
            Bucket:
                AWS_S3_BUCKET_NAME,

            Key:
                key,

            ResponseContentDisposition:
                `inline; filename="${safeDownloadName}"`,
        });

    const url =
        await getSignedUrl(
            s3Client,
            command,
            {
                expiresIn:
                    safeExpiration,
            }
        );

    return {
        url,

        expiresInSeconds:
            safeExpiration,
    };
}