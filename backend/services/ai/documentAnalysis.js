// backend/documentAnalysis.js

import {
    CHAT_MODEL,
    openai,
} from "./embeddings.js";

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