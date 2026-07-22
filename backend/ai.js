// backend/ai.js

import OpenAI from "openai";

// Create one reusable OpenAI client.
//
// The API key should already exist in backend/.env:
//
// OPENAI_API_KEY="your-key-here"
//
const openai = new OpenAI({
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
const CHAT_MODEL =
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


// ---------------------------------------------------------
// HOUSEIQ AGENT
// ---------------------------------------------------------

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
 */
export async function generateHouseAgentResponse(
    question,
    memories = []
) {
    if (typeof question !== "string" || !question.trim()) {
        throw new Error("A question is required");
    }

    // Turn the relevant database memories into readable context
    // that the model can use.
    const memoryContext =
        memories.length > 0
            ? memories
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
                .join("\n")
            : "No relevant memories were found for this home.";

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
- Never claim that a detail is known unless it appears in the user's message or the provided home memories.
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

PROJECT RULES

Create a project when:
- the work requires multiple steps
- the user needs an organized repair plan
- the work should be tracked over time
- multiple tasks or inspections are required

Do not create a large project for every minor observation.

ASSET RULES

Create an asset when the user clearly identifies a physical appliance,
system, tool, vehicle-related home equipment, or other physical item,
especially when they provide a name plus brand, model, serial number,
and/or location.

Put that record in assetsToCreate.
Do not use a memory as a substitute for an asset record.
Do not claim an asset already exists unless it appears in the provided
home memories as a prior fact about the same physical item — and even
then, still create an asset if no asset record was created yet and the
user is identifying the item.

Use empty strings for asset details the user did not provide.
Do not invent model numbers, serial numbers, brands, locations, causes,
prices, dates, or completed repairs.
`,
            },

            {
                role: "user",

                content: `
RELEVANT HOME MEMORY

${memoryContext}


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

// ---------------------------------------------------------
// DOCUMENT ANALYSIS
// ---------------------------------------------------------

/**
 * Analyzes text extracted from a home document.
 *
 * This function does not write anything to the database.
 * It only returns a structured plan describing:
 *
 * - the document summary
 * - memories worth saving
 * - issues worth tracking
 * - projects worth creating
 * - assets identified in the document
 *
 * The server is responsible for validating and saving those records.
 */
export async function analyzeHomeDocument({
    fileName,
    documentType,
    extractedText,
}) {
    if (
        typeof extractedText !== "string" ||
        !extractedText.trim()
    ) {
        throw new Error(
            "Document analysis requires extracted text"
        );
    }

    // Avoid sending an unlimited amount of text to the model.
    //
    // This first MVP analyzes up to 50,000 characters.
    // That is enough for many inspection reports, invoices,
    // warranties, and manuals.
    const MAX_DOCUMENT_CHARACTERS = 50000;

    const documentText = extractedText
        .trim()
        .slice(0, MAX_DOCUMENT_CHARACTERS);

    const completion =
        await openai.chat.completions.create({
            model: CHAT_MODEL,

            // Lower temperature gives us more consistent extraction.
            temperature: 0.1,

            response_format: {
                type: "json_schema",

                json_schema: {
                    name: "houseiq_document_analysis",

                    strict: true,

                    schema: {
                        type: "object",

                        additionalProperties: false,

                        properties: {
                            summary: {
                                type: "string",

                                description:
                                    "A concise homeowner-friendly summary of the document.",
                            },

                            documentDate: {
                                type: "string",

                                description:
                                    "The primary date shown in the document, or an empty string if no reliable date is present.",
                            },

                            contractorOrCompany: {
                                type: "string",

                                description:
                                    "The contractor, inspector, manufacturer, vendor, or company named in the document, or an empty string.",
                            },

                            totalAmount: {
                                type: "number",

                                minimum: 0,

                                description:
                                    "The total invoice or purchase amount, or 0 if the document does not provide one.",
                            },

                            memoriesToCreate: {
                                type: "array",

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
                            "summary",
                            "documentDate",
                            "contractorOrCompany",
                            "totalAmount",
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
You are HouseIQ's document-analysis agent.

You analyze documents connected to a home, including:

- home inspection reports
- repair invoices
- receipts
- warranties
- appliance manuals
- contractor estimates
- maintenance reports
- insurance documents
- utility or system records

Your job is to extract reliable facts from the document and decide what HouseIQ should permanently track.

IMPORTANT RULES

- Use only information actually contained in the document.
- Never invent dates, costs, brands, models, serial numbers, locations, diagnoses, or completed work.
- Distinguish between recommended work and work that was actually completed.
- Distinguish between estimates and paid invoices.
- Do not treat every sentence as a permanent memory.
- Do not create duplicate versions of the same fact inside one analysis.
- Create issues for unresolved defects, safety concerns, damage, failures, or repairs that are still recommended.
- Do not create an open issue for something the document clearly says was repaired and completed.
- Create assets when the document clearly identifies appliances, equipment, systems, or tools.
- Create projects only for meaningful multi-step work.
- Use an empty string when an optional text value is unknown.
- Use 0 when a cost is unknown.
- Keep the summary readable for a normal homeowner.
`,
                },

                {
                    role: "user",

                    content: `
FILE NAME

${fileName || "Unknown file"}


DOCUMENT TYPE

${documentType || "general"}


EXTRACTED DOCUMENT TEXT

${documentText}


Analyze this document and return the structured HouseIQ document analysis.
`,
                },
            ],
        });

    const responseText =
        completion.choices[0]?.message?.content;

    if (!responseText) {
        throw new Error(
            "HouseIQ returned an empty document analysis"
        );
    }

    return JSON.parse(responseText);
}