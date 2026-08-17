// backend/tests/ask_trace.test.js

import {
    describe,
    expect,
    test,
} from "vitest";

import {
    buildAskToolTrace,
    cosineSimilarityFromDistance,
    snapshotMemoriesUsed,
} from "../lib/askTrace.js";

describe("ask trace", () => {
    test("converts cosine distance into a similarity score", () => {
        expect(cosineSimilarityFromDistance(0.09)).toBe(0.91);
        expect(cosineSimilarityFromDistance(null)).toBeNull();
    });

    test("builds a judge-visible pipeline from Ask context", () => {
        const trace = buildAskToolTrace({
            memoriesSearched: 8,
            relevantMemories: [
                {
                    id: "m1",
                    title: "Furnace blower motor replaced",
                    similarity_distance: 0.09,
                    source_file_name:
                        "37__2023-02-14_E2023-01_invoice_furnace_blower_motor_replacement.txt",
                    evidence_page: null,
                },
            ],
            profileLoaded: true,
            assetCount: 4,
            issueCount: 2,
            projectCount: 1,
            actionsTaken: [{ type: "memory_created" }],
            memoriesProposed: 1,
            model: "gpt-4o-mini",
            durationMs: 1200,
            status: "completed",
        });

        expect(trace.pipeline).toHaveLength(7);
        expect(trace.pipeline[1].count).toBe(8);
        expect(trace.pipeline[2].count).toBe(1);
        expect(trace.pipeline[5].count).toBe(1);
        expect(trace.model).toBe("gpt-4o-mini");
        expect(
            snapshotMemoriesUsed([
                {
                    id: "m1",
                    title: "Furnace blower motor replaced",
                    similarity_distance: 0.09,
                },
            ])[0].similarity
        ).toBe(0.91);
    });
});
