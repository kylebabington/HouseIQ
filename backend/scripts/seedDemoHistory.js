// backend/scripts/seedDemoHistory.js
//
// Upload the Indianapolis 15-year batch to PUBLIC_DEMO_HOME_ID
// in CSV order, then accept proposed records so Ask context is
// accepted. Requires a running API and an owner token.
//
//   cd backend && npm run demo:seed-history
//
// Auth: HOUSEIQ_ACCESS_TOKEN, or AUTH0_TEST_* password grant
// matching the owner of PUBLIC_DEMO_HOME_ID.

import "dotenv/config";

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../db/pool.js";
import { JUDGE_ASK_QUESTION } from "../lib/judgeDemo.js";
import { reconcileHomeRecords } from "../services/entityResolution.js";
import { runReadOnlyAsk } from "../services/ai/runReadOnlyAsk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BATCH_DIR = path.join(
    REPO_ROOT,
    "DOCS",
    "HouseIQ_Starter_Upload_Batch_36"
);
const CSV_PATH = path.join(
    BATCH_DIR,
    "starter_upload_batch_36.csv"
);

function fail(message) {
    console.error(`demo:seed-history failed: ${message}`);
    process.exit(1);
}

function parseCsv(text) {
    const lines = String(text)
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        fail("CSV has no data rows");
    }

    const headers = lines[0].split(",").map((value) =>
        value.trim()
    );

    return lines.slice(1).map((line) => {
        const cols = line.split(",");
        const row = {};

        headers.forEach((header, index) => {
            row[header] = (cols[index] || "").trim();
        });

        return row;
    }).sort(
        (left, right) =>
            Number(left.upload_order) -
            Number(right.upload_order)
    );
}

function mimeForFile(fileName) {
    if (/\.pdf$/i.test(fileName)) {
        return "application/pdf";
    }

    if (/\.txt$/i.test(fileName)) {
        return "text/plain";
    }

    fail(`Unsupported file type: ${fileName}`);
}

function batchFileNames(row) {
    const baseName = path.basename(row.filename);
    const padded = String(row.upload_order).padStart(2, "0");
    return {
        baseName,
        prefixedName: `${padded}__${baseName}`,
    };
}

function resolveBatchFile(row) {
    const { baseName, prefixedName } = batchFileNames(row);
    const candidates = [
        path.join(BATCH_DIR, prefixedName),
        path.join(BATCH_DIR, row.filename),
        path.join(BATCH_DIR, baseName),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return {
                absPath: candidate,
                fileName: path.basename(candidate),
            };
        }
    }

    fail(`Missing batch file for ${row.filename}`);
}

function apiRoot() {
    const raw = (
        process.env.HOUSEIQ_API_URL ||
        "http://localhost:5000"
    ).replace(/\/$/, "");

    if (raw.endsWith("/api")) {
        return raw;
    }

    return `${raw}/api`;
}

function auth0Domain() {
    const raw = (
        process.env.AUTH0_TEST_DOMAIN ||
        process.env.AUTH0_DOMAIN ||
        ""
    ).trim();

    return raw
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "");
}

async function fetchAccessToken() {
    if (process.env.HOUSEIQ_ACCESS_TOKEN?.trim()) {
        return process.env.HOUSEIQ_ACCESS_TOKEN.trim();
    }

    const domain = auth0Domain();
    const clientId = (
        process.env.AUTH0_TEST_CLIENT_ID || ""
    ).trim();
    const clientSecret = (
        process.env.AUTH0_TEST_CLIENT_SECRET || ""
    ).trim();
    const username = (
        process.env.AUTH0_TEST_USERNAME ||
        process.env.AUTH0_TEST_USER_A_USERNAME ||
        ""
    ).trim();
    const password = (
        process.env.AUTH0_TEST_PASSWORD ||
        process.env.AUTH0_TEST_USER_A_PASSWORD ||
        ""
    ).trim();
    const audience = (
        process.env.AUTH0_TEST_AUDIENCE ||
        process.env.AUTH0_AUDIENCE ||
        ""
    ).trim();
    const realm =
        process.env.AUTH0_TEST_REALM?.trim() ||
        "Username-Password-Authentication";

    if (
        !domain ||
        !clientId ||
        !clientSecret ||
        !username ||
        !password ||
        !audience
    ) {
        fail(
            "Set HOUSEIQ_ACCESS_TOKEN or AUTH0_TEST_CLIENT_ID, AUTH0_TEST_CLIENT_SECRET, AUTH0_TEST_USERNAME, AUTH0_TEST_PASSWORD (owner of PUBLIC_DEMO_HOME_ID)"
        );
    }

    const response = await fetch(
        `https://${domain}/oauth/token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                grant_type:
                    "http://auth0.com/oauth/grant-type/password-realm",
                username,
                password,
                client_id: clientId,
                client_secret: clientSecret,
                audience,
                realm,
                scope: "openid profile email",
            }),
        }
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.access_token) {
        fail(
            `Auth0 token request failed (${response.status})`
        );
    }

    return body.access_token;
}

function seedHeaders(token, extra = {}) {
    const headers = {
        Authorization: `Bearer ${token}`,
        ...extra,
    };

    const seedToken = (
        process.env.DEMO_SEED_TOKEN || ""
    ).trim();

    if (seedToken) {
        headers["X-HouseIQ-Seed-Token"] = seedToken;
    }

    return headers;
}

async function apiJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));

    return { response, body };
}

function assetBlob(asset) {
    return [
        asset.name,
        asset.asset_type,
        asset.brand,
        asset.model,
        asset.notes,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function isFurnaceAsset(asset) {
    const blob = assetBlob(asset);
    return (
        blob.includes("furnace") ||
        blob.includes("forced air")
    );
}

function isAcAsset(asset) {
    const blob = assetBlob(asset);
    return (
        blob.includes("air conditioner") ||
        blob.includes("condenser") ||
        blob.includes("capacitor") ||
        blob.includes("refrigerant") ||
        /\bac\b/.test(blob)
    );
}

function printAssetSummary(assets) {
    const furnaces = assets.filter(isFurnaceAsset);
    const acs = assets.filter(
        (asset) => isAcAsset(asset) && !isFurnaceAsset(asset)
    );

    console.log(`Accepted assets: ${assets.length} total`);
    console.log(`  furnaces: ${furnaces.length}`);
    for (const asset of furnaces) {
        console.log(
            `    - ${asset.name} (${asset.asset_type || "unknown"}) ${asset.install_date || ""}`
        );
    }
    console.log(`  air conditioners: ${acs.length}`);
    for (const asset of acs) {
        console.log(
            `    - ${asset.name} (${asset.asset_type || "unknown"}) ${asset.install_date || ""}`
        );
    }

    return { furnaces, acs };
}

const homeId = (process.env.PUBLIC_DEMO_HOME_ID || "").trim();

if (!homeId) {
    fail("Set PUBLIC_DEMO_HOME_ID in backend/.env");
}

const skipAsk = process.argv.includes("--skip-ask");
const checkOnly = process.argv.includes("--check-only");
const token = checkOnly ? null : await fetchAccessToken();
const root = apiRoot();

const csvText = await readFile(CSV_PATH, "utf8");
const rows = parseCsv(csvText);

console.log(`Demo home: ${homeId}`);
console.log(`API: ${root}`);
console.log(`Batch rows: ${rows.length}`);

if (!checkOnly) {
    const listResult = await apiJson(
        `${root}/homes/${homeId}/documents`,
        { headers: seedHeaders(token) }
    );

    if (!listResult.response.ok) {
        fail(
            `Could not list documents (${listResult.response.status}): ${listResult.body.error || "unknown error"}`
        );
    }

    const existingNames = new Set(
        (listResult.body || []).map((doc) => doc.file_name)
    );

    for (const row of rows) {
        const { baseName, prefixedName } = batchFileNames(row);
        const { absPath, fileName } = resolveBatchFile(row);

        if (
            existingNames.has(fileName) ||
            existingNames.has(baseName) ||
            existingNames.has(prefixedName)
        ) {
            console.log(
                `[${row.upload_order}] skip existing ${fileName}`
            );
            continue;
        }

        const bytes = await readFile(absPath);
        const form = new FormData();
        form.append(
            "document",
            new File([bytes], fileName, {
                type: mimeForFile(fileName),
            })
        );
        form.append(
            "documentType",
            row.upload_document_type || "general"
        );

        console.log(
            `[${row.upload_order}] upload ${fileName} as ${row.upload_document_type}`
        );

        const uploadResponse = await fetch(
            `${root}/homes/${homeId}/documents/upload`,
            {
                method: "POST",
                headers: seedHeaders(token),
                body: form,
            }
        );

        const uploadBody = await uploadResponse
            .json()
            .catch(() => ({}));

        if (!uploadResponse.ok) {
            fail(
                `Upload failed for ${fileName} (${uploadResponse.status}): ${uploadBody.error || uploadBody.details || "unknown error"}`
            );
        }

        existingNames.add(fileName);

        const acceptResult = await apiJson(
            `${root}/homes/${homeId}/proposals/accept-all`,
            {
                method: "POST",
                headers: seedHeaders(token, {
                    "Content-Type": "application/json",
                }),
                body: "{}",
            }
        );

        if (!acceptResult.response.ok) {
            fail(
                `Accept-all failed after ${fileName} (${acceptResult.response.status})`
            );
        }

        const accepted = acceptResult.body.accepted || {};
        console.log(
            `    accepted memories=${accepted.memory || 0} issues=${accepted.issue || 0} projects=${accepted.project || 0} assets=${accepted.asset || 0}`
        );
    }
}

console.log("Reconciling duplicate records...");
const reconcileSummary = await reconcileHomeRecords(homeId);
console.log(
    `  scanned=${reconcileSummary.scanned} linked=${reconcileSummary.linked} flagged=${reconcileSummary.flagged}`
);

const assetsResult = await pool.query(
    `
    SELECT
        id,
        name,
        asset_type,
        brand,
        model,
        notes,
        install_date,
        last_service_date,
        verification_status
    FROM home_assets
    WHERE home_id = $1
      AND COALESCE(verification_status, 'accepted') = 'accepted'
      AND merged_into_id IS NULL
    ORDER BY created_at
    `,
    [homeId]
);

const { furnaces, acs } = printAssetSummary(
    assetsResult.rows
);

if (furnaces.length !== 1 || acs.length !== 1) {
    console.error(
        "Expected exactly one furnace and one AC after seeding. Inspect entity matching before demoing to judges."
    );
}

if (!skipAsk && !checkOnly) {
    console.log(`Ask: ${JUDGE_ASK_QUESTION}`);

    const askResult = await runReadOnlyAsk({
        homeId,
        question: JUDGE_ASK_QUESTION,
    });

    const years = new Set();
    for (const memory of askResult.memoriesUsed || []) {
        const source =
            memory.sourceFileName ||
            memory.source_file_name ||
            memory.title ||
            "";
        const match = source.match(/\b(20\d{2})\b/);
        if (match) {
            years.add(match[1]);
        }
        console.log(
            `  memory: ${memory.title || "(untitled)"} · ${source || "no source"}`
        );
    }

    console.log(
        `Context: ${JSON.stringify(askResult.contextUsed?.counts || {})}`
    );

    console.log(
        `Vector years in Why HouseIQ knows this: ${[...years].sort().join(", ") || "(none in filenames)"}`
    );
    console.log(`via: ${askResult.via}`);
    console.log(
        `Answer preview: ${String(askResult.answer || "").slice(0, 280)}`
    );
}

await pool.end();

if (furnaces.length !== 1 || acs.length !== 1) {
    process.exit(2);
}

console.log("Demo history seed complete.");
