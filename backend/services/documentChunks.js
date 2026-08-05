// backend/services/documentChunks.js

import {
    createEmbedding,
    vectorToSql,
} from "./ai/index.js";

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
