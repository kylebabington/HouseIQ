// backend/ai.js
//
// Compatibility barrel — prefer importing from the focused modules
// directly in new code:
//
// - ./embeddings.js
// - ./houseAgent.js
// - ./documentAnalysis.js
//

export {
    CHAT_MODEL,
    createEmbedding,
    openai,
    vectorToSql,
} from "./embeddings.js";

export {
    generateHouseAgentResponse,
} from "./houseAgent.js";

export {
    analyzeHomeDocument,
} from "./documentAnalysis.js";
