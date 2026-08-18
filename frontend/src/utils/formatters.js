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

export function countLabel(count, singular, plural = `${singular}s`) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Compact current-home line for the workspace header.
 *
 * Example: "Built 1978 · Indianapolis, IN"
 */
export function homeSubtitle(home, profile) {
  const parts = [];
  const year =
    home?.year_built ||
    profile?.yearBuilt ||
    profile?.year_built;

  if (year) {
    parts.push(`Built ${year}`);
  }

  const place = [
    profile?.city,
    profile?.state,
  ]
    .filter(Boolean)
    .join(", ");

  if (place) {
    parts.push(place);
  }

  return parts.join(" · ");
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
 * Short month + day, for the History timeline.
 *
 * Examples: "Aug 4", "Apr 18"
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
 * Homeowner-facing document title. The original file_name stays
 * on the record for provenance and downloads.
 */
export function documentDisplayTitle(documentRecord) {
  if (!documentRecord) {
    return "Untitled document";
  }

  const custom =
    documentRecord.metadata?.displayTitle ||
    documentRecord.display_title ||
    documentRecord.displayTitle;
  const trimmed =
    typeof custom === "string" ? custom.trim() : "";

  return (
    trimmed ||
    documentRecord.file_name ||
    documentRecord.fileName ||
    "Untitled document"
  );
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
