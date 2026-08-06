// backend/lib/assetServiceIntervals.js
//
// Typical service intervals and useful life by asset_type.
// Used by GET /needs and the assets UI — not live OEM data.

const INTERVALS = {
    furnace: { serviceMonths: 12, usefulLifeYears: 18, label: "Furnace" },
    hvac: { serviceMonths: 12, usefulLifeYears: 15, label: "HVAC system" },
    air_conditioner: { serviceMonths: 12, usefulLifeYears: 15, label: "Air conditioner" },
    heat_pump: { serviceMonths: 12, usefulLifeYears: 15, label: "Heat pump" },
    boiler: { serviceMonths: 12, usefulLifeYears: 25, label: "Boiler" },
    water_heater: { serviceMonths: 12, usefulLifeYears: 12, label: "Water heater" },
    roof: { serviceMonths: 24, usefulLifeYears: 25, label: "Roof" },
    dishwasher: { serviceMonths: 24, usefulLifeYears: 10, label: "Dishwasher" },
    refrigerator: { serviceMonths: 24, usefulLifeYears: 13, label: "Refrigerator" },
    washer: { serviceMonths: 24, usefulLifeYears: 11, label: "Washer" },
    dryer: { serviceMonths: 12, usefulLifeYears: 13, label: "Dryer" },
    sump_pump: { serviceMonths: 12, usefulLifeYears: 10, label: "Sump pump" },
    septic: { serviceMonths: 36, usefulLifeYears: 40, label: "Septic system" },
    well_pump: { serviceMonths: 24, usefulLifeYears: 15, label: "Well pump" },
    electrical_panel: { serviceMonths: 60, usefulLifeYears: 40, label: "Electrical panel" },
    chimney: { serviceMonths: 12, usefulLifeYears: 50, label: "Chimney" },
    gutter: { serviceMonths: 12, usefulLifeYears: 20, label: "Gutters" },
};

function normalizeType(assetType) {
    return String(assetType || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

export function getAssetInterval(assetType) {
    const key = normalizeType(assetType);
    return INTERVALS[key] || null;
}

/**
 * Years since last service (preferred), else install/purchase.
 */
export function assetAgeYears(asset, now = new Date()) {
    const serviceRaw =
        asset.last_service_date ||
        asset.lastServiceDate;

    const raw =
        serviceRaw ||
        asset.install_date ||
        asset.installDate ||
        asset.purchase_date ||
        asset.purchaseDate;

    if (!raw) {
        return null;
    }

    const installed = new Date(raw);

    if (Number.isNaN(installed.getTime())) {
        return null;
    }

    const ms = now.getTime() - installed.getTime();
    return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Builds lifecycle need items for assets that are overdue for
 * service or near/past useful life.
 */
export function lifecycleNeedItems(assets, now = new Date()) {
    const items = [];

    for (const asset of assets || []) {
        const interval = getAssetInterval(
            asset.asset_type || asset.assetType
        );

        if (!interval) {
            continue;
        }

        const age = assetAgeYears(asset, now);
        const name =
            asset.name ||
            interval.label;

        if (age != null && age >= interval.usefulLifeYears * 0.85) {
            const rounded = Math.round(age);
            items.push({
                kind: "lifecycle",
                id: asset.id,
                title: `${name}: approaching end of typical life`,
                reason:
                    `About ${rounded} years old; typical useful life is ~${interval.usefulLifeYears} years. Plan inspection or replacement budgeting.`,
                priority:
                    age >= interval.usefulLifeYears
                        ? "high"
                        : "medium",
                sourceHints: ["asset", "lifecycle"],
            });
        } else if (age != null && age * 12 >= interval.serviceMonths) {
            const monthsSince = Math.round(age * 12);
            const usedService =
                asset.last_service_date ||
                asset.lastServiceDate;
            items.push({
                kind: "lifecycle",
                id: asset.id,
                title: `${name}: service attention`,
                reason: usedService
                    ? `Roughly ${monthsSince} months since last service; typical interval is every ${interval.serviceMonths} months.`
                    : `Roughly ${monthsSince} months since install/purchase; typical service interval is every ${interval.serviceMonths} months.`,
                priority: "medium",
                confidence: usedService ? 0.75 : 0.45,
                sourceHints: ["asset", "lifecycle"],
            });
        }
    }

    return items;
}

export function formatAssetAttentionLine(asset, now = new Date()) {
    const interval = getAssetInterval(
        asset.asset_type || asset.assetType
    );

    if (!interval) {
        return null;
    }

    const age = assetAgeYears(asset, now);

    if (age == null) {
        return `Typical service every ${interval.serviceMonths} mo · useful life ~${interval.usefulLifeYears} yr`;
    }

    return `~${Math.round(age)} yr old · service every ${interval.serviceMonths} mo · useful life ~${interval.usefulLifeYears} yr`;
}
