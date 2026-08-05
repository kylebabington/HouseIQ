// backend/server.js

// Loads variables from .env into process.env
import "dotenv/config";

// randomUUID generates a unique ID for every request, so a
// single interaction can be traced across logs and error
// responses even when several requests are in flight at once.
import { randomUUID } from "crypto";

// Express creates our API server
import express from "express";

// CORS allows the frontend to talk to the backend
import cors from "cors";

// Multer handles uploaded files sent as multipart/form-data.
import multer from "multer";

import {
    UnauthorizedError,
} from "express-oauth2-jwt-bearer";

import { createAgentRouter } from "./routes/agent.js";
import { createDemoRouter } from "./routes/demo.js";
import { createDocumentsRouter } from "./routes/documents.js";
import { createEquipmentRouter } from "./routes/equipment.js";
import { createHomeResourcesRouter } from "./routes/homeResources.js";
import { createHomesRouter } from "./routes/homes.js";
import { createMaintenanceRouter } from "./routes/maintenance.js";
import { createNeedsRouter } from "./routes/needs.js";
import { createPassportRouter } from "./routes/passport.js";
import { createProfileRouter } from "./routes/profile.js";
import { createProposalsRouter } from "./routes/proposals.js";
import { createRecordsRouter } from "./routes/records.js";

const app = express();

// ---------------------------------------------------------
// REQUEST ID
// ---------------------------------------------------------
//
// Every request gets a unique ID that is echoed back in the
// X-Request-Id response header and attached to req.requestId so
// route handlers can include it in error logs. This makes it
// possible to correlate a specific failed response with the
// matching server log line.
app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
});

app.use(
    cors({
        // Only allow requests from the HouseIQ frontend.
        origin:
            process.env.FRONTEND_URL ||
            "http://localhost:5173",

        // These are the HTTP methods currently used by HouseIQ.
        methods: [
            "GET",
            "POST",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],

        // Authenticated API calls require Authorization.
        allowedHeaders: [
            "Content-Type",
            "Authorization",
        ],
    })
);

app.use(express.json());

// ---------------------------------------------------------
// FILE UPLOAD CONFIGURATION
// ---------------------------------------------------------

// memoryStorage keeps the uploaded file in RAM temporarily.
//
// That means:
// - no temporary files are written to your computer
// - req.file.buffer contains the file bytes
// - the file disappears when the request finishes
//
// This is appropriate for the MVP, but not permanent storage.
const uploadStorage = multer.memoryStorage();

const upload = multer({
    storage: uploadStorage,

    limits: {
        // Reject files larger than 10 MB.
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
            "application/pdf",
            "text/plain",
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return callback(
                new Error(
                    "Only PDF and plain-text files are currently supported"
                )
            );
        }

        callback(null, true);
    },
});

// ---------------------------------------------------------
// SIMPLE HEALTH CHECK
// ---------------------------------------------------------
//
// This route is public.
//
// It lets us confirm that the Express server is running
// without requiring an Auth0 access token.
//
app.get("/", (req, res) => {
    res.json({
        message:
            "HouseIQ backend is running",
    });
});

app.use(
    "/api",
    createHomesRouter()
);

app.use(
    "/api",
    createProfileRouter()
);

app.use(
    "/api",
    createHomeResourcesRouter()
);

app.use(
    "/api",
    createRecordsRouter()
);

app.use(
    "/api",
    createDocumentsRouter(upload)
);

app.use(
    "/api",
    createAgentRouter()
);

app.use(
    "/api",
    createNeedsRouter()
);

app.use(
    "/api",
    createProposalsRouter()
);

app.use(
    "/api",
    createMaintenanceRouter()
);

app.use(
    "/api",
    createDemoRouter()
);

app.use(
    "/api",
    createPassportRouter()
);

app.use(
    "/api",
    createEquipmentRouter()
);

// ---------------------------------------------------------
// GLOBAL ERROR HANDLER
// ---------------------------------------------------------
//
// Express sends errors from Multer and other middleware here.
//
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (
            error.code ===
            "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                error:
                    "The uploaded file is too large",

                details:
                    "The maximum supported file size is 10 MB.",
            });
        }

        return res.status(400).json({
            error:
                "The file upload could not be processed",
        });
    }

    if (
        error?.message?.includes(
            "Only PDF and plain-text"
        )
    ) {
        return res.status(400).json({
            error:
                "Unsupported document type",

            details:
                "Only PDF and plain-text (.txt) documents are supported.",
        });
    }

    // Auth0 middleware throws UnauthorizedError (and subclasses)
    // when the Bearer token is missing or invalid.
    if (error instanceof UnauthorizedError) {
        if (error.headers) {
            res.set(error.headers);
        }

        return res.status(
            error.status ||
            error.statusCode ||
            401
        ).json({
            error:
                "Authentication required",
        });
    }

    console.error(
        `Unhandled server error [requestId=${req.requestId}]:`,
        error
    );

    return res.status(500).json({
        error:
            "An unexpected server error occurred",
        requestId:
            req.requestId,
    });
});

// Export the Express application so automated tests can send
// requests through it without starting a permanent network server.
export { app };


// Only start the real HTTP server outside the test environment.
//
// During a Vitest run, Supertest imports `app` and creates its own
// temporary connection. Calling app.listen() here during tests would
// create an unnecessary open server and could prevent Vitest from
// exiting cleanly.
if (process.env.NODE_ENV !== "test") {
    const PORT =
        process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log(
            `HouseIQ backend running on port ${PORT}`
        );
    });
}