/**
 * Pull a four-digit year out of a date string, timestamp, or
 * filename-style value such as "2014-04-22".
 */
export function yearFromDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date.getFullYear();
  }

  const match = String(value).match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

/**
 * Groups items by year, newest first. Items with no usable date
 * land in an "Unknown" bucket at the end.
 */
export function groupByYear(items, getDate) {
  const groups = new Map();

  for (const item of items || []) {
    const year = yearFromDate(getDate(item)) || "Unknown";

    if (!groups.has(year)) {
      groups.set(year, []);
    }

    groups.get(year).push(item);
  }

  const years = [...groups.keys()].sort((left, right) => {
    if (left === "Unknown") {
      return 1;
    }

    if (right === "Unknown") {
      return -1;
    }

    return right - left;
  });

  return years.map((year) => ({
    year,
    items: groups.get(year),
  }));
}
