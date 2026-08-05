// backend/services/equipmentIntelligence.js
// Nameplate / recall helpers that feed the home asset graph.

const CPSC_RECALL_SEARCH =
    "https://www.saferproducts.gov/RestWebServices/Recall";

/**
 * Normalizes brand/model fields from a nameplate extraction.
 */
export function normalizeEquipmentIdentity({
    brand = "",
    model = "",
    serialNumber = "",
}) {
    return {
        brand: String(brand || "").trim(),
        model: String(model || "").trim(),
        serialNumber: String(serialNumber || "").trim(),
    };
}

/**
 * Best-effort CPSC recall lookup by product/brand keywords.
 * Returns an empty list when the network call fails.
 */
export async function lookupCpscRecalls({
    brand,
    model,
    fetchImpl = fetch,
}) {
    const query = [brand, model]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!query) {
        return [];
    }

    try {
        const url =
            `${CPSC_RECALL_SEARCH}?format=json&ProductName=${encodeURIComponent(query)}`;
        const response = await fetchImpl(url, {
            headers: { Accept: "application/json" },
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : [];

        return rows.slice(0, 5).map((row) => ({
            recallNumber: row.RecallNumber || row.RecallID,
            title: row.Title || row.Name || "Recall notice",
            url: row.URL || row.RecallURL || null,
            manufacturer:
                row.Manufacturers?.[0]?.Name ||
                brand ||
                null,
        }));
    } catch (error) {
        console.warn(
            "CPSC recall lookup failed:",
            error.message
        );
        return [];
    }
}

/**
 * Builds recurring maintenance task titles from a simple schedule.
 */
export function buildMaintenanceTasksFromSchedule(
    scheduleMonths = 12,
    assetName = "Equipment"
) {
    const months = Number(scheduleMonths) || 12;
    return [
        `Inspect ${assetName}`,
        `Service ${assetName} (every ${months} months)`,
        `Replace filters / wear parts for ${assetName}`,
    ];
}
