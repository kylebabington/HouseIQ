// backend/houseAgent.js

import {
    CHAT_MODEL,
    openai,
} from "./embeddings.js";

// ---------------------------------------------------------
// HOUSEIQ AGENT
// ---------------------------------------------------------

// Profile fields that are internal bookkeeping rather than
// physical facts about the home. These are never printed in
// the "known physical facts" context section.
const PROFILE_METADATA_FIELD_PATTERN =
    /^(homeId|metadata|onboarding|profileCreatedAt|profileUpdatedAt)/i;

/**
 * Turns a camelCase profile object (see lib/homeProfile.js)
 * into a readable list of "known physical facts" lines,
 * skipping any field that is null, undefined, or considered
 * bookkeeping metadata rather than a physical fact.
 */
function formatProfileContext(profile) {
    if (!profile || typeof profile !== "object") {
        return "No structured home profile has been recorded yet.";
    }

    const lines = Object.entries(profile)
        .filter(([fieldName, value]) => {
            if (PROFILE_METADATA_FIELD_PATTERN.test(fieldName)) {
                return false;
            }

            return value !== null && value !== undefined && value !== "";
        })
        .map(([fieldName, value]) => `- ${fieldName}: ${value}`);

    if (lines.length === 0) {
        return "No structured home profile facts have been recorded yet.";
    }

    return lines.join("\n");
}

/**
 * Turns the home row (id, name, year_built, notes) into a
 * short readable summary.
 */
function formatHomeContext(home) {
    if (!home) {
        return "No home details are available.";
    }

    const lines = [];

    if (home.name) {
        lines.push(`- Name: ${home.name}`);
    }

    if (home.year_built) {
        lines.push(`- Year built: ${home.year_built}`);
    }

    if (home.notes) {
        lines.push(`- Notes: ${home.notes}`);
    }

    return lines.length > 0
        ? lines.join("\n")
        : "No home details are available.";
}

/**
 * Turns the vector-search memory rows into readable context
 * blocks. This is the same format the agent has always used.
 */
function formatMemoryContext(memories) {
    if (!memories || memories.length === 0) {
        return "No relevant memories were found for this home.";
    }

    return memories
        .map((memory, index) => {
            return `
MEMORY ${index + 1}

ID:
${memory.id}

TITLE:
${memory.title}

CATEGORY:
${memory.category}

CONTENT:
${memory.content}

IMPORTANCE:
${memory.importance}

CREATED:
${memory.created_at}
`;
        })
        .join("\n");
}

/**
 * Turns open home_issues rows into readable context blocks.
 */
function formatIssueContext(issues) {
    if (!issues || issues.length === 0) {
        return "No open issues are on record for this home.";
    }

    return issues
        .map((issue, index) => {
            return `
ISSUE ${index + 1}

ID:
${issue.id}

TITLE:
${issue.title}

STATUS:
${issue.status}

PRIORITY:
${issue.priority}

CATEGORY:
${issue.category}

DESCRIPTION:
${issue.description}
`;
        })
        .join("\n");
}

/**
 * Turns active home_projects rows into readable context
 * blocks.
 */
function formatProjectContext(projects) {
    if (!projects || projects.length === 0) {
        return "No active projects are on record for this home.";
    }

    return projects
        .map((project, index) => {
            return `
PROJECT ${index + 1}

ID:
${project.id}

TITLE:
${project.title}

STATUS:
${project.status}

PRIORITY:
${project.priority}

DESCRIPTION:
${project.description}
`;
        })
        .join("\n");
}

/**
 * Turns home_assets rows into readable context blocks.
 */
function formatAssetContext(assets) {
    if (!assets || assets.length === 0) {
        return "No assets are on record for this home.";
    }

    return assets
        .map((asset, index) => {
            return `
ASSET ${index + 1}

ID:
${asset.id}

NAME:
${asset.name}

TYPE:
${asset.asset_type}

BRAND:
${asset.brand || "unknown"}

MODEL:
${asset.model || "unknown"}

LOCATION:
${asset.location || "unknown"}
`;
        })
        .join("\n");
}

/**
 * Generates a structured HouseIQ agent response.
 *
 * Unlike the old generateHouseAnswer function, this does not return
 * only a string.
 *
 * It returns an object containing:
 *
 * - answer
 * - confidence
 * - needsMoreInfo
 * - clarifyingQuestions
 * - memoriesToCreate
 * - issuesToCreate
 * - projectsToCreate
 * - assetsToCreate
 *
 * The backend can then treat this response like an instruction plan.
 *
 * `context` carries everything HouseIQ is allowed to treat as a known
 * fact about the home:
 *
 * - home: { id, name, year_built, notes }
 * - profile: camelCase home profile object (see lib/homeProfile.js)
 * - memories: relevant long-term memory rows
 * - issues: open home_issues rows
 * - projects: active home_projects rows
 * - assets: home_assets rows
 *
 * For backward compatibility, callers may still pass an array as the
 * second argument. That array is treated as the legacy `memories`
 * list.
 */
export async function generateHouseAgentResponse(
    question,
    context = {}
) {
    // Legacy callers passed the memories array directly as the second
    // argument. Normalize that into the new context shape so existing
    // call sites keep working.
    if (Array.isArray(context)) {
        return generateHouseAgentResponse(question, {
            memories: context,
        });
    }

    const {
        home = null,
        profile = null,
        memories = [],
        issues = [],
        projects = [],
        assets = [],
    } = context || {};

    if (typeof question !== "string" || !question.trim()) {
        throw new Error("A question is required");
    }

    const homeContext = formatHomeContext(home);
    const profileContext = formatProfileContext(profile);
    const memoryContext = formatMemoryContext(memories);
    const issueContext = formatIssueContext(issues);
    const projectContext = formatProjectContext(projects);
    const assetContext = formatAssetContext(assets);

    const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,

        // Lower temperature makes the agent more consistent and less
        // likely to invent unusual actions.
        temperature: 0.2,

        // Structured Outputs forces the response to match this JSON schema.
        response_format: {
            type: "json_schema",

            json_schema: {
                name: "houseiq_agent_response",

                // Strict means the model must follow the schema exactly.
                strict: true,

                schema: {
                    type: "object",

                    additionalProperties: false,

                    properties: {
                        answer: {
                            type: "string",
                            description:
                                "A practical homeowner-facing response to the user's message.",
                        },

                        confidence: {
                            type: "string",
                            enum: ["low", "medium", "high"],
                            description:
                                "How confident HouseIQ is in its recommendation.",
                        },

                        needsMoreInfo: {
                            type: "boolean",
                            description:
                                "Whether HouseIQ needs more information before making a confident diagnosis or recommendation.",
                        },

                        clarifyingQuestions: {
                            type: "array",
                            description:
                                "Specific follow-up questions that would help HouseIQ understand the situation.",
                            items: {
                                type: "string",
                            },
                        },

                        memoriesToCreate: {
                            type: "array",
                            description:
                                "Permanent facts about the home that should be remembered.",

                            items: {
                                type: "object",

                                additionalProperties: false,

                                properties: {
                                    title: {
                                        type: "string",
                                    },

                                    category: {
                                        type: "string",
                                    },

                                    content: {
                                        type: "string",
                                    },

                                    importance: {
                                        type: "integer",
                                        minimum: 1,
                                        maximum: 5,
                                    },
                                },

                                required: [
                                    "title",
                                    "category",
                                    "content",
                                    "importance",
                                ],
                            },
                        },

                        issuesToCreate: {
                            type: "array",
                            description:
                                "Problems that should be tracked as open home issues.",

                            items: {
                                type: "object",

                                additionalProperties: false,

                                properties: {
                                    title: {
                                        type: "string",
                                    },

                                    description: {
                                        type: "string",
                                    },

                                    priority: {
                                        type: "string",
                                        enum: [
                                            "low",
                                            "medium",
                                            "high",
                                            "urgent",
                                        ],
                                    },

                                    category: {
                                        type: "string",
                                    },

                                    suspectedCause: {
                                        type: "string",
                                    },

                                    recommendedNextStep: {
                                        type: "string",
                                    },
                                },

                                required: [
                                    "title",
                                    "description",
                                    "priority",
                                    "category",
                                    "suspectedCause",
                                    "recommendedNextStep",
                                ],
                            },
                        },

                        projectsToCreate: {
                            type: "array",
                            description:
                                "Repair, maintenance, or diagnostic projects that should be tracked.",

                            items: {
                                type: "object",

                                additionalProperties: false,

                                properties: {
                                    title: {
                                        type: "string",
                                    },

                                    description: {
                                        type: "string",
                                    },

                                    priority: {
                                        type: "string",
                                        enum: [
                                            "low",
                                            "medium",
                                            "high",
                                            "urgent",
                                        ],
                                    },

                                    estimatedCostLow: {
                                        type: "number",
                                        minimum: 0,
                                    },

                                    estimatedCostHigh: {
                                        type: "number",
                                        minimum: 0,
                                    },

                                    diyDifficulty: {
                                        type: "string",
                                        enum: [
                                            "easy",
                                            "moderate",
                                            "difficult",
                                            "professional",
                                            "unknown",
                                        ],
                                    },

                                    safetyNotes: {
                                        type: "string",
                                    },

                                    tasks: {
                                        type: "array",

                                        items: {
                                            type: "string",
                                        },
                                    },
                                },

                                required: [
                                    "title",
                                    "description",
                                    "priority",
                                    "estimatedCostLow",
                                    "estimatedCostHigh",
                                    "diyDifficulty",
                                    "safetyNotes",
                                    "tasks",
                                ],
                            },
                        },

                        assetsToCreate: {
                            type: "array",
                            description:
                                "Appliances, systems, tools, equipment, or other physical home assets explicitly identified by the user.",

                            items: {
                                type: "object",

                                additionalProperties: false,

                                properties: {
                                    assetType: {
                                        type: "string",
                                    },

                                    name: {
                                        type: "string",
                                    },

                                    brand: {
                                        type: "string",
                                    },

                                    model: {
                                        type: "string",
                                    },

                                    serialNumber: {
                                        type: "string",
                                    },

                                    location: {
                                        type: "string",
                                    },

                                    notes: {
                                        type: "string",
                                    },
                                },

                                required: [
                                    "assetType",
                                    "name",
                                    "brand",
                                    "model",
                                    "serialNumber",
                                    "location",
                                    "notes",
                                ],
                            },
                        },
                    },

                    required: [
                        "answer",
                        "confidence",
                        "needsMoreInfo",
                        "clarifyingQuestions",
                        "memoriesToCreate",
                        "issuesToCreate",
                        "projectsToCreate",
                        "assetsToCreate",
                    ],
                },
            },
        },

        messages: [
            {
                role: "system",

                content: `
You are HouseIQ, an agentic home-memory and home-maintenance assistant.

Your job has three possible behaviors:

1. ANSWER
Give the homeowner practical advice.

2. ASK
Ask useful follow-up questions when important information is missing.

3. ACT
Decide whether the user's message contains information that should be saved as:
- a permanent memory
- an issue
- a project
- an asset

HouseIQ should feel like an intelligent record keeper for the entire home.

GENERAL RULES

- Use remembered home information when it is relevant.
- Never claim that a detail is known unless it appears in the user's current
  message OR in the provided home details, home profile, memories, open
  issues, active projects, or assets.
- Prefer citing known physical facts (from the home profile) and open work
  (issues, projects, assets) when they are relevant to the question.
- Prefer linking to or referencing an existing issue, project, or asset
  instead of creating a duplicate record for the same underlying thing.
- Do not create records for casual questions that contain no new home information.
- Do not create duplicate records when the same fact already clearly exists in memory.
- Create a memory for meaningful historical facts about the home.
- Create an issue for unresolved damage, malfunction, risk, leak, odor, failure, or recurring concern.
- Create a project only when there is a meaningful multi-step repair, maintenance, or diagnostic process.
- Create an asset when the user identifies an appliance, system, tool, or piece of equipment with enough detail; do not put that inventory record only in memoriesToCreate.
- It is acceptable to create an issue while also asking clarifying questions.
- Prefer low-cost diagnostic steps before expensive repairs.
- Clearly identify electrical, gas, structural, mold, fire, carbon monoxide, sewage, and other safety concerns.
- Do not give false certainty.
- Keep clarifying questions focused and useful.
- Usually ask no more than five clarifying questions.
- Do not create empty or meaningless records.

MEMORY RULES

A memory should preserve a useful fact, such as:
- a repair that was attempted
- the location of a recurring problem
- when something happened
- a maintenance action
- an installation detail
- a contractor recommendation
- a home-system fact

Do not store an appliance, system, or equipment inventory record as a memory.
Those belong in assetsToCreate.

ISSUE RULES

Create an issue when:
- the problem is unresolved
- the problem may return
- the homeowner should monitor it
- additional diagnosis is needed
- repair work may be necessary

Before creating a new issue, check the provided list of open issues. If the
message is describing the same problem as an existing open issue, reference
that issue in the answer instead of creating a duplicate.

PROJECT RULES

Create a project when:
- the work requires multiple steps
- the user needs an organized repair plan
- the work should be tracked over time
- multiple tasks or inspections are required

Do not create a large project for every minor observation. Before creating a
new project, check the provided list of active projects to avoid duplicating
existing work.

ASSET RULES

Create an asset when the user clearly identifies a physical appliance,
system, tool, vehicle-related home equipment, or other physical item,
especially when they provide a name plus brand, model, serial number,
and/or location.

Put that record in assetsToCreate.
Do not use a memory as a substitute for an asset record.
Before creating a new asset, check the provided list of known assets. Do not
claim an asset already exists unless it appears in the provided home
profile, memories, or asset list as a prior fact about the same physical
item — and even then, still create an asset if no asset record was created
yet and the user is identifying the item.

Use empty strings for asset details the user did not provide.
Do not invent model numbers, serial numbers, brands, locations, causes,
prices, dates, or completed repairs.
`,
            },

            {
                role: "user",

                content: `
HOME DETAILS

${homeContext}


KNOWN PHYSICAL FACTS ABOUT THE HOME (from the home profile)

${profileContext}


RELEVANT HOME MEMORY

${memoryContext}


OPEN ISSUES

${issueContext}


ACTIVE PROJECTS

${projectContext}


KNOWN ASSETS

${assetContext}


CURRENT HOMEOWNER MESSAGE

${question.trim()}


Analyze the homeowner's message.

Return:
- the homeowner-facing answer
- your confidence
- whether more information is needed
- clarifying questions
- records that should be created

Only create records that are justified by the message.
`,
            },
        ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
        throw new Error("HouseIQ returned an empty response");
    }

    // Structured Outputs gives us JSON text matching the schema.
    // We still parse it into a normal JavaScript object.
    const agentResponse = JSON.parse(content);

    return agentResponse;
}
