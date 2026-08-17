// frontend/src/utils/formatters.js

// ---------------------------------------------------------
// SMALL DISPLAY HELPERS
// ---------------------------------------------------------

/**
 * Converts database-style text into friendly display text.
 *
 * Examples:
 *
 * "water_intrusion" becomes "Water Intrusion"
 * "home_appliance" becomes "Home Appliance"
 */
export function formatLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}


/**
 * Safely formats a database date.
 */
export function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString();
}

/**
 * Year only, for equipment install dates.
 */
export function formatYear(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }

  const match = String(value).match(/\d{4}/);
  return match ? match[0] : null;
}

/**
 * Month + year, for recent work on the Home Passport.
 */
export function formatMonthYear(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Compact date for timeline and activity rows.
 *
 * Examples:
 *
 * "2021-06-18" becomes "Jun 18"
 * invalid / empty becomes null
 */
export function formatShortDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Count plus a singular/plural noun.
 *
 * Examples:
 *
 * countLabel(1, "task") becomes "1 task"
 * countLabel(3, "event") becomes "3 events"
 */
export function countLabel(count, noun) {
  const number = Number(count) || 0;
  const label = number === 1 ? noun : `${noun}s`;
  return `${number} ${label}`;
}

/**
 * Built year and city/state line under a home name.
 */
export function homeSubtitle(home, profile) {
  const year =
    home?.year_built ||
    profile?.yearBuilt ||
    profile?.year_built;
  const place = [
    profile?.city,
    profile?.state,
  ]
    .filter(Boolean)
    .join(", ");

  const parts = [];

  if (year) {
    parts.push(`Built ${year}`);
  }

  if (place) {
    parts.push(place);
  }

  return parts.join(" · ");
}


/**
 * Formats a cost as US currency.
 *
 * Examples:
 *
 * 250 becomes "$250"
 * null becomes "Not estimated"
 */
export function formatCurrency(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not estimated";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "Not estimated";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}

/**
 * Converts file bytes into a readable size.
 *
 * Examples:
 *
 * 850 becomes "850 B"
 * 24576 becomes "24 KB"
 * 2849012 becomes "2.7 MB"
 */
export function formatFileSize(bytes) {
  const number = Number(bytes);

  if (
    Number.isNaN(number) ||
    number < 0
  ) {
    return "Unknown size";
  }

  if (number < 1024) {
    return `${number} B`;
  }

  if (number < 1024 * 1024) {
    return `${(
      number / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    number /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

export function formatSimilarity(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number.toFixed(2);
}

export function memorySourceLabel(memory) {
  if (!memory || typeof memory !== "object") {
    return "Stored memory";
  }

  const file =
    memory.sourceFileName ||
    memory.source_file_name ||
    "";
  const type =
    memory.sourceDocumentType ||
    memory.source_document_type ||
    "";
  const page =
    memory.evidencePage ||
    memory.evidence_page ||
    null;

  let label =
    file ||
    (type ? formatLabel(type) : "") ||
    "Stored memory";

  if (page) {
    label = `${label} — p. ${page}`;
  }

  return label;
}
