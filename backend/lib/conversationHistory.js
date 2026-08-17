// backend/lib/conversationHistory.js
//
// Shared helpers for Ask HouseIQ multi-turn conversation.
// The frontend may send recent turns; this file decides how
// much of that history is trusted and when a new message
// should retrieve evidence using the prior turn.

export const MAX_CONVERSATION_HISTORY_TURNS = 6;
export const CONVERSATION_HISTORY_CHAR_LIMIT = 1200;

const FOLLOW_UP_PATTERN =
    /\b(that|this|it|those|these|they|them|there|the cost|how much|why|what about|which one|you said|you mentioned|earlier|above|same|too|also|clarify|explain|more about|and the|go on|continue)\b/i;

/**
 * Validates and normalizes optional conversationHistory into
 * a small array of { role, content } strings.
 *
 * Malformed items are dropped rather than rejected — history
 * is a nice-to-have, not a correctness requirement.
 */
export function sanitizeConversationHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) {
        return [];
    }

    return rawHistory
        .filter(
            (item) =>
                item &&
                typeof item === "object" &&
                (item.role === "user" ||
                    item.role === "assistant") &&
                typeof item.content === "string" &&
                item.content.trim().length > 0
        )
        .slice(0, MAX_CONVERSATION_HISTORY_TURNS * 2)
        .map((item) => ({
            role: item.role,
            content: item.content
                .trim()
                .slice(0, CONVERSATION_HISTORY_CHAR_LIMIT),
        }));
}

/**
 * Short replies and deictic follow-ups ("how much did that
 * cost?") need the previous turn so vector search can find
 * the same documents the last answer used.
 */
export function looksLikeFollowUp(question, conversationHistory) {
    if (
        !Array.isArray(conversationHistory) ||
        conversationHistory.length === 0
    ) {
        return false;
    }

    const trimmed =
        typeof question === "string" ? question.trim() : "";

    if (!trimmed) {
        return false;
    }

    if (trimmed.length <= 100) {
        return true;
    }

    return FOLLOW_UP_PATTERN.test(trimmed);
}

/**
 * Text to embed for memory and document retrieval.
 *
 * Standalone questions stay as-is. Follow-ups prepend the last
 * homeowner question and a slice of HouseIQ's last answer so
 * "that" / "how much" still retrieve the right evidence.
 */
export function buildRetrievalQuery(
    question,
    conversationHistory = []
) {
    const trimmed =
        typeof question === "string" ? question.trim() : "";

    if (!looksLikeFollowUp(trimmed, conversationHistory)) {
        return trimmed;
    }

    const lastUser = [...conversationHistory]
        .reverse()
        .find((item) => item.role === "user");
    const lastAssistant = [...conversationHistory]
        .reverse()
        .find((item) => item.role === "assistant");

    const parts = [];

    if (lastUser?.content) {
        parts.push(lastUser.content);
    }

    if (lastAssistant?.content) {
        parts.push(lastAssistant.content.slice(0, 800));
    }

    parts.push(trimmed);

    return parts.join("\n");
}
