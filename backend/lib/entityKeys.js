// backend/lib/entityKeys.js
//
// Deterministic identity helpers for entity resolution.
// These do not call the model. They turn titles, asset fields,
// and demo filenames into comparable keys so HouseIQ can attach
// a second invoice to the same roof instead of creating a twin.

const STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "for",
    "to",
    "in",
    "on",
    "at",
    "with",
    "from",
    "by",
    "after",
    "full",
    "home",
    "house",
    "demo",
    "fictitious",
]);

export function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function tokenize(value) {
    const tokens = normalizeText(value)
        .split(" ")
        .filter(
            (token) =>
                token.length > 2 &&
                !STOP_WORDS.has(token)
        );

    return [...new Set(tokens)];
}

export function jaccard(left, right) {
    const a = new Set(tokenize(left));
    const b = new Set(tokenize(right));

    if (a.size === 0 || b.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const token of a) {
        if (b.has(token)) {
            overlap += 1;
        }
    }

    return overlap / (a.size + b.size - overlap);
}

export function extractEventId(value) {
    const match = String(value || "").match(
        /E\d{4}-\d{2}/i
    );
    return match ? match[0].toUpperCase() : null;
}

export function extractYear(value) {
    const match = String(value || "").match(
        /\b(19|20)\d{2}\b/
    );
    return match ? match[0] : null;
}

/**
 * More-specific systems win. Garage-roof leaks and chimney
 * leaks must not collapse into the later full roof replacement.
 */
export function extractSystemKey(value) {
    const text = normalizeText(value);

    if (!text) {
        return null;
    }

    if (text.includes("chimney")) {
        return "chimney";
    }

    if (
        text.includes("garage") &&
        (text.includes("roof") || text.includes("leak"))
    ) {
        return "garage_roof";
    }

    if (
        text.includes("sump") ||
        text.includes("water intrusion") ||
        (text.includes("basement") &&
            (text.includes("water") ||
                text.includes("flood")))
    ) {
        return "basement_water";
    }

    if (
        text.includes("water heater") ||
        text.includes("waterheater")
    ) {
        return "water_heater";
    }

    if (
        text.includes("furnace") ||
        text.includes("forced air")
    ) {
        return "furnace";
    }

    if (
        text.includes("air conditioner") ||
        text.includes("capacitor") ||
        text.includes("refrigerant") ||
        text.includes("condenser") ||
        text.includes("outdoor unit") ||
        /\bac\b/.test(text)
    ) {
        return "ac";
    }

    if (
        text.includes("sewer") ||
        text.includes("septic")
    ) {
        return "sewer";
    }

    if (text.includes("roof")) {
        return "roof";
    }

    return null;
}

/**
 * Quotes, permits, invoices, and warranties for the same
 * replacement belong together. A leak investigation does not.
 */
export function extractWorkFamily(value) {
    const text = normalizeText(value);

    if (
        /replac|install|quote|estimate|proposal|permit|warranty|bid/.test(
            text
        )
    ) {
        return "replacement";
    }

    if (
        /leak|investigat|repair|flashing|patch/.test(
            text
        )
    ) {
        return "repair";
    }

    if (
        /inspect|assess|condition|pre purchase|prepurchase/.test(
            text
        )
    ) {
        return "inspection";
    }

    if (
        /service|capacitor|refrigerant|tune/.test(
            text
        )
    ) {
        return "service";
    }

    return null;
}

export function recordTitle(row) {
    if (!row || typeof row !== "object") {
        return "";
    }

    return (
        row.title ||
        row.name ||
        ""
    );
}

export function recordTextBlob(row) {
    if (!row || typeof row !== "object") {
        return "";
    }

    return [
        row.title,
        row.name,
        row.asset_type || row.assetType,
        row.brand,
        row.model,
        row.category,
        row.description,
        row.content,
        row.notes,
        row.file_name || row.fileName,
    ]
        .filter(Boolean)
        .join(" ");
}

export function assetIdentityKey(row) {
    const serial = normalizeText(
        row?.serial_number ||
        row?.serialNumber
    );
    if (serial) {
        return `serial::${serial}`;
    }

    const brand = normalizeText(row?.brand);
    const model = normalizeText(row?.model);
    if (brand && model) {
        return `model::${brand}::${model}`;
    }

    const type = normalizeText(
        row?.asset_type || row?.assetType
    );
    const name = normalizeText(row?.name || row?.title);
    if (type && name) {
        return `name::${type}::${name}`;
    }

    return null;
}

export function classifyMatchScore(score) {
    if (score >= 0.78) {
        return "exact";
    }

    if (score >= 0.55) {
        return "likely";
    }

    if (score >= 0.4) {
        return "questionable";
    }

    return "none";
}
