// backend/ai.js

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// This model returns 1536 numbers.
// That matches our CockroachDB VECTOR(1536) column.
const EMBEDDING_MODEL = "text-embedding-3-small";

export async function createEmbedding(text) {
    if (!text || !text.trim()) {
        throw new Error("Cannot create embedding for empty text.");
    }

    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });

    return response.data[0].embedding;
}

// CockroachDB expects the vector as a string like:
// [0.123, -0.456, 0.789]
export function vectorToSql(vector) {
    return `[${vector.join(",")}]`;
}