// backend/lib/askTrace.js
//
// Structured Ask-run trace for the Agent Run Inspector.
// Counts and memory snapshots are computed in the route, never
// trusted from the model.

export function cosineSimilarityFromDistance(distance) {
    if (
        distance === null ||
        distance === undefined ||
        distance === ""
    ) {
        return null;
    }

    const value = Number(distance);

    if (!Number.isFinite(value)) {
        return null;
    }

    return Math.round((1 - value) * 100) / 100;
}

export function snapshotMemoriesUsed(memories = []) {
    return memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        category: memory.category,
        similarity: cosineSimilarityFromDistance(
            memory.similarity_distance
        ),
        sourceDocumentId:
            memory.source_document_id ||
            memory.sourceDocumentId ||
            null,
        sourceFileName:
            memory.source_file_name ||
            memory.sourceFileName ||
            null,
        sourceDocumentType:
            memory.source_document_type ||
            memory.sourceDocumentType ||
            null,
        evidencePage:
            memory.evidence_page ||
            memory.evidencePage ||
            null,
        evidencePassage:
            memory.evidence_passage ||
            memory.evidencePassage ||
            null,
    }));
}

export function buildAskToolTrace({
    memoriesSearched = 0,
    relevantMemories = [],
    profileLoaded = false,
    assetCount = 0,
    issueCount = 0,
    projectCount = 0,
    actionsTaken = [],
    memoriesProposed = 0,
    model = null,
    durationMs = null,
    status = "completed",
    error = null,
} = {}) {
    const retrieved = snapshotMemoriesUsed(relevantMemories);
    const actionCount = Array.isArray(actionsTaken)
        ? actionsTaken.length
        : 0;

    return {
        pipeline: [
            {
                step: "embed",
                label: "Embedding generated",
            },
            {
                step: "search",
                label: `${memoriesSearched} memories searched`,
                count: memoriesSearched,
            },
            {
                step: "retrieve",
                label:
                    `${retrieved.length} relevant memories retrieved`,
                count: retrieved.length,
                memories: retrieved,
            },
            {
                step: "context",
                label:
                    "Home profile + assets + issues loaded",
                profileLoaded,
                assets: assetCount,
                issues: issueCount,
                projects: projectCount,
            },
            {
                step: "respond",
                label: "Agent response",
                model,
            },
            {
                step: "actions",
                label:
                    `${actionCount} proposed action${actionCount === 1 ? "" : "s"}`,
                count: actionCount,
            },
            {
                step: "memories_proposed",
                label:
                    `${memoriesProposed} new memory proposed`,
                count: memoriesProposed,
            },
        ],
        model,
        durationMs,
        status,
        error,
    };
}
