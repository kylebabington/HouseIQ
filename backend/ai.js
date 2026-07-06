// backend/ai.js

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// -------------------------------
// Embedding Model
// -------------------------------
//
// This converts text into numbers.
//
// Example:
// "window leaks during rain"
//
// becomes:
//
// [0.023, -0.018, 0.421...]
//
// CockroachDB can compare these.
//
const EMBEDDING_MODEL = "text-embedding-3-small";


// Model used for actually talking
const CHAT_MODEL =
    process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";



// CREATE MEMORY EMBEDDING
export async function createEmbedding(text) {

    if (!text.trim()) {
        throw new Error(
            "Cannot embed empty text"
        );
    }


    const response =
        await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text,
        });


    return response.data[0].embedding;
}



// Converts JS array into Cockroach VECTOR format
export function vectorToSql(vector) {

    return `[${vector.join(",")}]`;

}





// ------------------------------------
// HOUSEIQ AGENT BRAIN
// ------------------------------------

export async function generateHouseAnswer(
    question,
    memories
) {


    const memoryContext =
        memories.map((memory) => {

            return `
TITLE:
${memory.title}

CATEGORY:
${memory.category}

MEMORY:
${memory.content}
`;

        }).join("\n");




    const completion =
        await openai.chat.completions.create({

            model: CHAT_MODEL,

            temperature: 0.3,

            messages: [

                {
                    role: "system",

                    content: `
You are HouseIQ.

You are an expert home maintenance assistant.

You have long-term memory about this specific house.

Rules:

- Use remembered information first.
- Never pretend to know something not stored.
- Explain like talking to a homeowner.
- Give practical repair advice.
- Mention what past memories influenced your answer.
- Prioritize cheap fixes before expensive ones.
`
                },


                {
                    role: "user",

                    content: `

HOME MEMORY:

${memoryContext}


QUESTION:

${question}


Give the homeowner your recommendation.
`
                }

            ]

        });



    return (
        completion
            .choices[0]
            .message
            .content
    );
}