// backend/lib/climateZones.js
//
// Climate localization for seasonal maintenance hints.
// Prefer US state → IECC-like band; fall back to ZIP when state
// is unknown. Not a live weather API.

const MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const BANDS = {
    cold: {
        frostMonths: [11, 12, 1, 2, 3],
        heatMonths: [6, 7, 8],
    },
    mixed_humid: {
        frostMonths: [12, 1, 2],
        heatMonths: [6, 7, 8, 9],
    },
    hot_humid: {
        frostMonths: [1],
        heatMonths: [5, 6, 7, 8, 9],
    },
    hot_dry: {
        frostMonths: [],
        heatMonths: [5, 6, 7, 8, 9],
    },
    mixed_dry: {
        frostMonths: [12, 1, 2],
        heatMonths: [6, 7, 8],
    },
    marine: {
        frostMonths: [12, 1, 2],
        heatMonths: [7, 8],
    },
};

const STATE_BANDS = {
    AK: "cold", ME: "cold", NH: "cold", VT: "cold",
    NY: "cold", MI: "cold", WI: "cold", MN: "cold",
    ND: "cold", SD: "cold", MT: "cold", WY: "cold",
    ID: "cold", CO: "cold", UT: "cold",
    MA: "mixed_humid", CT: "mixed_humid", RI: "mixed_humid",
    PA: "mixed_humid", NJ: "mixed_humid", OH: "mixed_humid",
    IN: "mixed_humid", IL: "mixed_humid", IA: "mixed_humid",
    MO: "mixed_humid", KY: "mixed_humid", WV: "mixed_humid",
    VA: "mixed_humid", MD: "mixed_humid", DE: "mixed_humid",
    NC: "mixed_humid", TN: "mixed_humid",
    SC: "hot_humid", GA: "hot_humid", FL: "hot_humid",
    AL: "hot_humid", MS: "hot_humid", LA: "hot_humid",
    AR: "hot_humid", TX: "hot_humid", HI: "hot_humid",
    AZ: "hot_dry", NV: "hot_dry", NM: "hot_dry",
    CA: "mixed_dry", OR: "marine", WA: "marine",
    OK: "mixed_humid", KS: "mixed_humid", NE: "cold",
};

// ZIP first-digit fallback when state is missing (coarse).
const ZIP_PREFIX_FALLBACK = {
    "0": "cold",
    "1": "cold",
    "2": "mixed_humid",
    "3": "hot_humid",
    "4": "cold",
    "5": "cold",
    "6": "mixed_humid",
    "7": "hot_humid",
    "8": "mixed_dry",
    "9": "mixed_dry",
};

function bandDefinition(band) {
    return BANDS[band] || BANDS.mixed_humid;
}

/**
 * Resolves climate from state (preferred) and/or postal code.
 */
export function resolveClimate({
    state,
    postalCode,
} = {}) {
    const normalizedState =
        typeof state === "string"
            ? state.trim().toUpperCase().slice(0, 2)
            : "";

    const digits =
        typeof postalCode === "string"
            ? postalCode.replace(/\D/g, "")
            : "";

    let band = null;
    let source = null;

    if (normalizedState && STATE_BANDS[normalizedState]) {
        band = STATE_BANDS[normalizedState];
        source = "state";
    } else if (digits.length >= 1) {
        band = ZIP_PREFIX_FALLBACK[digits[0]] || "mixed_humid";
        source = "zip_prefix";
    } else {
        return null;
    }

    const definition = bandDefinition(band);

    return {
        band,
        source,
        frostMonths: definition.frostMonths,
        heatMonths: definition.heatMonths,
        state: normalizedState || null,
        postalCode: digits.slice(0, 5) || null,
    };
}

/** @deprecated Prefer resolveClimate({ state, postalCode }) */
export function resolveClimateFromPostalCode(postalCode) {
    return resolveClimate({ postalCode });
}

/**
 * One-line season context for the agent prompt.
 */
export function formatLocalSeasonLine(
    postalCodeOrOptions,
    now = new Date()
) {
    const climate =
        typeof postalCodeOrOptions === "string" ||
        postalCodeOrOptions == null
            ? resolveClimate({
                postalCode: postalCodeOrOptions,
            })
            : resolveClimate(postalCodeOrOptions);

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

    const where =
        climate.state ||
        climate.postalCode ||
        "unknown location";

    return `Local season context (${where}, band ${climate.band} via ${climate.source}): ${MONTH_NAMES[month]} is ${seasonHint}. Prefer advice that fits this home's climate and known systems.`;
}

/**
 * Seasonal maintenance hint strings for the needs board.
 */
export function seasonalNeedHints(
    postalCodeOrOptions,
    now = new Date()
) {
    const climate =
        typeof postalCodeOrOptions === "string" ||
        postalCodeOrOptions == null
            ? resolveClimate({
                postalCode: postalCodeOrOptions,
            })
            : resolveClimate(postalCodeOrOptions);

    if (!climate) {
        return [];
    }

    const month = now.getMonth() + 1;
    const hints = [];

    if (climate.frostMonths.includes(month)) {
        hints.push({
            id: "seasonal-freeze",
            title: "Protect pipes and outdoor spigots from freeze",
            priority: "high",
            reason:
                "Local climate is in frost season — winterize exposed plumbing.",
            timingBucket: "30_days",
        });
        hints.push({
            id: "seasonal-heating",
            title: "Confirm heating system is serviced",
            priority: "medium",
            reason:
                "Cold-season demand is high; service overdue systems before peak cold.",
            timingBucket: "30_days",
        });
    }

    if (climate.heatMonths.includes(month)) {
        hints.push({
            id: "seasonal-cooling",
            title: "Check cooling and attic ventilation",
            priority: "medium",
            reason:
                "Peak heat season — clogged filters and poor airflow raise failure risk.",
            timingBucket: "90_days",
        });
    }

    if ([3, 4, 9, 10].includes(month)) {
        hints.push({
            id: "seasonal-gutters",
            title: "Clear gutters and downspouts",
            priority: "medium",
            reason:
                "Shoulder season is ideal for drainage maintenance before storms.",
            timingBucket: "90_days",
        });
    }

    return hints;
}
