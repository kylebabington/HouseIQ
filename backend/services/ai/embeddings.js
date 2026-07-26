// backend/embeddings.js

import OpenAI from "openai";

// Create one reusable OpenAI client.
//
// The API key should already exist in backend/.env:
//
// OPENAI_API_KEY="your-key-here"
//
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// ---------------------------------------------------------
// MODEL CONFIGURATION
// ---------------------------------------------------------

// This model converts text into vectors that CockroachDB can compare.
const EMBEDDING_MODEL = "text-embedding-3-small";

// This model handles the actual HouseIQ agent reasoning.
//
// You can override it in .env:
//
// OPENAI_CHAT_MODEL="gpt-4o-mini"
//
export const CHAT_MODEL =
    process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";


// ---------------------------------------------------------
// EMBEDDING HELPERS
// ---------------------------------------------------------

/**
 * Converts text into an embedding vector.
 *
 * HouseIQ uses embeddings to find memories that are semantically
 * related to the user's current message.
 *
 * Example:
 *
 * "The west bedroom window leaks"
 *
 * may match:
 *
 * "Water entered around the upstairs window during heavy rain."
 */
export async function createEmbedding(text) {
    if (typeof text !== "string" || !text.trim()) {
        throw new Error("Cannot create an embedding from empty text");
    }

    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.trim(),
    });

    return response.data[0].embedding;
}


/**
 * Converts a normal JavaScript array into the string format
 * CockroachDB expects for a VECTOR value.
 *
 * JavaScript:
 *
 * [0.123, -0.456, 0.789]
 *
 * CockroachDB:
 *
 * "[0.123,-0.456,0.789]"
 */
export function vectorToSql(vector) {
    if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error("A valid embedding vector is required");
    }

    return `[${vector.join(",")}]`;
}
