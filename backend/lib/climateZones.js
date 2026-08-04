// backend/lib/climateZones.js
//
// Coarse US ZIP-prefix → climate band mapping for seasonal
// "what your house needs" hints. Not a live weather API.

const ZIP_PREFIX_BANDS = [
    // Cold / frost-heavy
    { prefixes: ["0", "1", "2"], band: "cold_northeast", frostMonths: [11, 12, 1, 2, 3], heatMonths: [6, 7, 8] },
    { prefixes: ["4", "5"], band: "cold_midwest", frostMonths: [11, 12, 1, 2, 3], heatMonths: [6, 7, 8] },
    { prefixes: ["8", "9"], band: "mountain_west", frostMonths: [10, 11, 12, 1, 2, 3, 4], heatMonths: [6, 7, 8] },
    // Mixed / temperate
    { prefixes: ["3"], band: "southeast", frostMonths: [12, 1, 2], heatMonths: [5, 6, 7, 8, 9] },
    { prefixes: ["6", "7"], band: "south_central", frostMonths: [12, 1], heatMonths: [5, 6, 7, 8, 9] },
];

const MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/**
 * Resolves a coarse climate band from a US postal code.
 */
export function resolveClimateFromPostalCode(postalCode) {
    if (!postalCode || typeof postalCode !== "string") {
        return null;
    }

    const digits = postalCode.replace(/\D/g, "");

    if (digits.length < 1) {
        return null;
    }

    const first = digits[0];

    for (const entry of ZIP_PREFIX_BANDS) {
        if (entry.prefixes.includes(first)) {
            return {
                band: entry.band,
                frostMonths: entry.frostMonths,
                heatMonths: entry.heatMonths,
                postalCode: digits.slice(0, 5),
            };
        }
    }

    return {
        band: "temperate_general",
        frostMonths: [12, 1, 2],
        heatMonths: [6, 7, 8],
        postalCode: digits.slice(0, 5),
    };
}

/**
 * One-line season context for the agent prompt.
 */
export function formatLocalSeasonLine(postalCode, now = new Date()) {
    const climate = resolveClimateFromPostalCode(postalCode);

    if (!climate) {
        return null;
    }

    const month = now.getMonth() + 1;
    const inFrost = climate.frostMonths.includes(month);
    const inHeat = climate.heatMonths.includes(month);

    let seasonHint = "shoulder season";

    if (inFrost) {
        seasonHint = "cold / frost season";
    } else if (inHeat) {
        seasonHint = "peak heat season";
    }

    return `Local season context (ZIP ${climate.postalCode}, band ${climate.band}): ${MONTH_NAMES[month]} is ${seasonHint}. Prefer advice that fits this home's climate and known systems.`;
}

/**
 * Seasonal need reasons for the /needs board.
 */
export function seasonalNeedHints(profile, now = new Date()) {
    const climate = resolveClimateFromPostalCode(
        profile?.postal_code || profile?.postalCode
    );

    if (!climate) {
        return [];
    }

    const month = now.getMonth() + 1;
    const hints = [];

    if (climate.frostMonths.includes(month)) {
        if (profile?.heating_type || profile?.heatingType) {
            hints.push({
                kind: "seasonal",
                id: `seasonal-heat-${climate.band}`,
                title: "Prepare heating for cold weather",
                reason:
                    `Frost-season months for ZIP ${climate.postalCode} include now. Confirm filters, vents, and any open heating issues before deep cold.`,
                priority: "high",
                sourceHints: ["profile", "climate"],
            });
        } else {
            hints.push({
                kind: "seasonal",
                id: `seasonal-winter-${climate.band}`,
                title: "Winterize open exterior work",
                reason:
                    `Cold season is active for ZIP ${climate.postalCode}. Prioritize open roof, plumbing, and exterior issues.`,
                priority: "medium",
                sourceHints: ["climate"],
            });
        }
    }

    if (climate.heatMonths.includes(month)) {
        if (profile?.cooling_type || profile?.coolingType) {
            hints.push({
                kind: "seasonal",
                id: `seasonal-cool-${climate.band}`,
                title: "Service cooling before peak heat",
                reason:
                    `Heat season is active for ZIP ${climate.postalCode}. Check cooling system readiness and open HVAC issues.`,
                priority: "high",
                sourceHints: ["profile", "climate"],
            });
        }
    }

    return hints;
}
