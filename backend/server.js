// backend/server.js

// Loads variables from .env into process.env
import "dotenv/config";

// Express creates our API server
import express from "express";

// CORS allows the frontend to talk to the backend
import cors from "cors";

// pg lets Node connect to PostgreSQL-compatible databases like CockroachDB
import pg from "pg";

// AI functions
import { createEmbedding, vectorToSql, generateHouseAnswer } from "./ai.js";

const { Pool } = pg;

const app = express();

app.use(cors());
app.use(express.json());

// Create one reusable database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false,
    },
});

// Simple health check route
app.get("/", (req, res) => {
    res.json({
        message: "HouseIQ backend is running",
    });
});

// Test database connection
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT now() AS current_time;");

        res.json({
            message: "Connected to CockroachDB Cloud",
            currentTime: result.rows[0].current_time,
        });
    } catch (error) {
        console.error("Database test failed:", error);

        res.status(500).json({
            error: "Database connection failed",
            details: error.message,
        });
    }
});

// Create a new home
app.post("/api/homes", async (req, res) => {
    try {
        const { name, yearBuilt, notes } = req.body;

        if (!name) {
            return res.status(400).json({
                error: "Home name is required",
            });
        }

        const result = await pool.query(
            `
      INSERT INTO homes (name, year_built, notes)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
            [name, yearBuilt || null, notes || ""]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating home:", error);
        res.status(500).json({
            error: "Failed to create home",
        });
    }
});

// Get all homes
app.get("/api/homes", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT *
      FROM homes
      ORDER BY created_at DESC
    `);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching homes:", error);
        res.status(500).json({
            error: "Failed to fetch homes",
        });
    }
});

// Add a memory to a home
app.post("/api/homes/:homeId/memories", async (req, res) => {
    try {
        const { homeId } = req.params;

        const {
            title,
            category,
            content,
            assetId,
            metadata,
            importance,
        } = req.body;

        if (!content) {
            return res.status(400).json({
                error: "Memory content is required",
            });
        }

        // Combine fields so the embedding has more useful context.
        const memoryTextForEmbedding = `
Title: ${title || "Untitled memory"}
Category: ${category || "general"}
Content: ${content}
Metadata: ${JSON.stringify(metadata || {})}
`;

        const embedding = await createEmbedding(memoryTextForEmbedding);
        const embeddingSql = vectorToSql(embedding);

        const result = await pool.query(
            `
      INSERT INTO memories (
        home_id,
        asset_id,
        title,
        category,
        content,
        metadata,
        embedding,
        importance
      )
      VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7::VECTOR(1536), $8)
      RETURNING
        id,
        home_id,
        asset_id,
        title,
        category,
        content,
        metadata,
        importance,
        created_at,
        updated_at
      `,
            [
                homeId,
                assetId || null,
                title || "Untitled memory",
                category || "general",
                content,
                JSON.stringify(metadata || {}),
                embeddingSql,
                importance || 3,
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating memory:", error);

        res.status(500).json({
            error: "Failed to create memory",
            details: error.message,
        });
    }
});

// Get memories for one home
app.get("/api/homes/:homeId/memories", async (req, res) => {
    try {
        const { homeId } = req.params;

        const result = await pool.query(
            `
      SELECT *
      FROM memories
      WHERE home_id = $1
      ORDER BY created_at DESC
      `,
            [homeId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching memories:", error);
        res.status(500).json({
            error: "Failed to fetch memories",
        });
    }
});

// Semantic memory search
app.post("/api/homes/:homeId/memory-search", async (req, res) => {
    try {
        const { homeId } = req.params;
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({
                error: "Search query is required",
            });
        }

        const queryEmbedding = await createEmbedding(query);
        const queryVectorSql = vectorToSql(queryEmbedding);

        const result = await pool.query(
            `
      SELECT
        id,
        title,
        category,
        content,
        metadata,
        importance,
        created_at,

        -- Lower cosine distance means more similar.
        embedding <=> $2::VECTOR(1536) AS similarity_distance

      FROM memories
      WHERE home_id = $1
        AND embedding IS NOT NULL

      ORDER BY embedding <=> $2::VECTOR(1536)

      LIMIT 5
      `,
            [homeId, queryVectorSql]
        );

        res.json({
            query,
            results: result.rows,
        });
    } catch (error) {
        console.error("Memory search failed:", error);

        res.status(500).json({
            error: "Memory search failed",
            details: error.message,
        });
    }
});

// Ask HouseIQ a question using semantic memory retrieval
app.post("/api/homes/:homeId/ask", async (req, res) => {
    try {
        const { homeId } = req.params;
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({
                error: "Question is required",
            });
        }

        const questionEmbedding = await createEmbedding(question);
        const questionVectorSql = vectorToSql(questionEmbedding);

        const memoriesResult = await pool.query(
            `
      SELECT
        id,
        title,
        category,
        content,
        metadata,
        importance,
        created_at,
        embedding <=> $2::VECTOR(1536) AS similarity_distance
      FROM memories
      WHERE home_id = $1
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::VECTOR(1536)
      LIMIT 6
      `,
            [homeId, questionVectorSql]
        );

        const memories = memoriesResult.rows;

        const memoryContext = memories
            .map((memory, index) => {
                return `
Memory ${index + 1}
Title: ${memory.title}
Category: ${memory.category}
Content: ${memory.content}
Importance: ${memory.importance}
Saved: ${memory.created_at}
`;
            })
            .join("\n");

        // Generate a response from the AI
        const answer =
            await generateHouseAnswer(
                question,
                memories
            );

        await pool.query(
            `
      INSERT INTO agent_runs (
        home_id,
        user_question,
        answer,
        status,
        memories_used
      )
      VALUES ($1, $2, $3, $4, $5::JSONB)
      `,
            [
                homeId,
                question,
                answer,
                "completed",
                JSON.stringify(memories.map((memory) => memory.id)),
            ]
        );

        res.json({
            question,
            answer,
            memoriesUsed: memories,
        });
    } catch (error) {
        console.error("Error asking HouseIQ:", error);

        res.status(500).json({
            error: "Failed to answer question",
            details: error.message,
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`HouseIQ backend running on port ${PORT}`);
});