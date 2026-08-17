// backend/services/documentChunks.js

import {
    createEmbedding,
    vectorToSql,
} from "./ai/embeddings.js";

import { pool } from "../db/pool.js";

// Cosine-distance cutoff for Ask retrieval. Uploaded demo PDFs start
// with a long "FICTITIOUS HOUSEIQ DEMO DOCUMENT" banner, which inflates
// distance versus a short homeowner question. 0.75 still drops unrelated
// noise while keeping invoice/warranty matches (typically ~0.55–0.65).
export const MAX_DOCUMENT_CHUNK_DISTANCE = 0.75;
export const MAX_DOCUMENT_CHUNKS = 6;
export const DOCUMENT_CHUNK_PROMPT_CHARS = 1500;
export const DOCUMENT_CHUNK_CITATION_CHARS = 220;

/**
 * Split extracted text into page-ish chunks.
 * Form-feed (\f) marks page breaks when present.
 */
export function splitExtractedTextIntoChunks(
    text,
    { maxChars = 3500 } = {}
) {
    if (typeof text !== "string" || !text.trim()) {
        return [];
    }

    const pages = text.includes("\f")
        ? text.split("\f")
        : [text];

    const chunks = [];
    let globalOffset = 0;
    let chunkIndex = 0;

    pages.forEach((pageText, pageIndex) => {
        let remaining = pageText;
        let localOffset = 0;

        while (remaining.length > 0) {
            let slice = remaining.slice(0, maxChars);

            if (remaining.length > maxChars) {
                const breakAt = Math.max(
                    slice.lastIndexOf("\n\n"),
                    slice.lastIndexOf("\n"),
                    slice.lastIndexOf(" ")
                );
                if (breakAt > maxChars * 0.5) {
                    slice = slice.slice(0, breakAt);
                }
            }

            const content = slice.trim();
            if (content) {
                chunks.push({
                    page_number: pageIndex + 1,
                    chunk_index: chunkIndex,
                    content,
                    char_offset: globalOffset + localOffset,
                });
                chunkIndex += 1;
            }

            remaining = remaining.slice(slice.length);
            localOffset += slice.length;
        }

        globalOffset += pageText.length + 1;
    });

    return chunks;
}

export async function storeDocumentChunks({
    client,
    documentId,
    homeId,
    chunks,
    embedLimit = 8,
}) {
    const stored = [];

    for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        let embeddingSql = null;

        if (index < embedLimit) {
            try {
                const embedding = await createEmbedding(
                    chunk.content.slice(0, 2000)
                );
                embeddingSql = vectorToSql(embedding);
            } catch (error) {
                console.warn(
                    "Chunk embedding skipped:",
                    error.message
                );
            }
        }

        const result = await client.query(
            `
            INSERT INTO document_chunks (
                document_id,
                home_id,
                page_number,
                chunk_index,
                content,
                char_offset,
                embedding
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                ${embeddingSql ? "$7::VECTOR(1536)" : "NULL"}
            )
            RETURNING id, page_number, chunk_index
            `,
            embeddingSql
                ? [
                    documentId,
                    homeId,
                    chunk.page_number,
                    chunk.chunk_index,
                    chunk.content,
                    chunk.char_offset,
                    embeddingSql,
                ]
                : [
                    documentId,
                    homeId,
                    chunk.page_number,
                    chunk.chunk_index,
                    chunk.content,
                    chunk.char_offset,
                ]
        );

        stored.push(result.rows[0]);
    }

    return stored;
}

function isWithinDistance(row, maxDistance) {
    if (
        row.similarity_distance === null ||
        row.similarity_distance === undefined
    ) {
        return true;
    }

    const distance = Number(row.similarity_distance);

    return (
        Number.isFinite(distance) &&
        distance <= maxDistance
    );
}

function collapseWhitespace(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function stripDemoBanner(value) {
    return String(value || "").replace(
        /^FICTITIOUS HOUSEIQ DEMO DOCUMENT[^\n]*/i,
        ""
    );
}

/**
 * Semantic search over stored document_chunks for this home.
 *
 * Ask already embeds the homeowner's question; this compares that
 * vector to chunk embeddings so invoice dates, contractors, and
 * prices can reach the agent even when they were never promoted
 * into memories.
 */
export async function searchRelevantDocumentChunks({
    homeId,
    questionVectorSql,
    limit = MAX_DOCUMENT_CHUNKS,
    maxDistance = MAX_DOCUMENT_CHUNK_DISTANCE,
    db = pool,
} = {}) {
    if (!homeId || !questionVectorSql) {
        return [];
    }

    const result = await db.query(
        `
        SELECT
            document_chunks.id,
            document_chunks.document_id,
            document_chunks.page_number,
            document_chunks.chunk_index,
            document_chunks.content,
            documents.file_name,
            documents.document_type,
            documents.summary,
            document_chunks.embedding <=> $2::VECTOR(1536)
                AS similarity_distance
        FROM document_chunks
        INNER JOIN documents
            ON documents.id = document_chunks.document_id
           AND documents.home_id = document_chunks.home_id
        WHERE document_chunks.home_id = $1
          AND document_chunks.embedding IS NOT NULL
        ORDER BY
            document_chunks.embedding <=> $2::VECTOR(1536)
        LIMIT 8
        `,
        [homeId, questionVectorSql]
    );

    return result.rows
        .filter((row) => isWithinDistance(row, maxDistance))
        .slice(0, limit)
        .map((row) => ({
            ...row,
            content: collapseWhitespace(
                stripDemoBanner(row.content)
            ).slice(0, DOCUMENT_CHUNK_PROMPT_CHARS),
        }));
}

export function formatDocumentChunkCitation(chunk) {
    const passage = collapseWhitespace(chunk.content).slice(
        0,
        DOCUMENT_CHUNK_CITATION_CHARS
    );

    return {
        id: chunk.id,
        title:
            chunk.file_name ||
            chunk.document_type ||
            "Uploaded document",
        passage: passage || null,
        page: chunk.page_number || null,
        sourceDocumentId: chunk.document_id || null,
    };
}

/**
 * Find a short supporting passage for a query snippet.
 */
export function findEvidencePassage(text, querySnippet) {
    if (
        typeof text !== "string" ||
        typeof querySnippet !== "string" ||
        !querySnippet.trim()
    ) {
        return { passage: null, page: null };
    }

    const needle = querySnippet.trim().slice(0, 120);
    const lower = text.toLowerCase();
    const index = lower.indexOf(needle.toLowerCase());

    if (index === -1) {
        // Try first significant token
        const token = needle.split(/\s+/).find(
            (part) => part.length > 4
        );
        if (!token) {
            return { passage: null, page: null };
        }
        const tokenIndex = lower.indexOf(
            token.toLowerCase()
        );
        if (tokenIndex === -1) {
            return { passage: null, page: null };
        }
        const start = Math.max(0, tokenIndex - 40);
        const passage = text
            .slice(start, start + 180)
            .replace(/\s+/g, " ")
            .trim();
        const page =
            text.slice(0, tokenIndex).split("\f").length;
        return { passage, page };
    }

    const start = Math.max(0, index - 40);
    const passage = text
        .slice(start, start + 220)
        .replace(/\s+/g, " ")
        .trim();
    const page = text.slice(0, index).split("\f").length;

    return { passage, page };
}
