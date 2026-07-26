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
