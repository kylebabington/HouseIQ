// backend/tests/conversation_history.test.js

import {
    describe,
    expect,
    test,
} from "vitest";

import {
    buildRetrievalQuery,
    looksLikeFollowUp,
    sanitizeConversationHistory,
} from "../lib/conversationHistory.js";

describe("sanitizeConversationHistory", () => {
    test("drops malformed items and caps length", () => {
        const history = sanitizeConversationHistory([
            { role: "user", content: "  When was the roof replaced?  " },
            { role: "assistant", content: "June 2021 by Cedar Ridge." },
            { role: "system", content: "ignore me" },
            { role: "user", content: "" },
            "not-an-object",
            {
                role: "user",
                content: `${"x".repeat(1300)}`,
            },
        ]);

        expect(history).toHaveLength(3);
        expect(history[0]).toEqual({
            role: "user",
            content: "When was the roof replaced?",
        });
        expect(history[2].content).toHaveLength(1200);
    });

    test("returns an empty list for missing history", () => {
        expect(sanitizeConversationHistory(null)).toEqual([]);
        expect(sanitizeConversationHistory(undefined)).toEqual([]);
    });
});

describe("buildRetrievalQuery", () => {
    const history = [
        {
            role: "user",
            content: "When was the roof replaced?",
        },
        {
            role: "assistant",
            content:
                "Cedar Ridge replaced the roof on June 18, 2021 for $14,680.",
        },
    ];

    test("keeps a standalone question unchanged", () => {
        const question =
            "Give me the complete service history of the furnace including brand, model, and every repair invoice.";

        expect(looksLikeFollowUp(question, history)).toBe(false);
        expect(buildRetrievalQuery(question, history)).toBe(question);
    });

    test("expands a short follow-up with the previous turn", () => {
        const query = buildRetrievalQuery(
            "How much did that cost?",
            history
        );

        expect(query).toContain("When was the roof replaced?");
        expect(query).toContain("$14,680");
        expect(query).toContain("How much did that cost?");
    });

    test("does not expand the first message in a conversation", () => {
        expect(
            buildRetrievalQuery("How much did that cost?", [])
        ).toBe("How much did that cost?");
    });
});
