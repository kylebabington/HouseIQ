// frontend/src/utils/groupByYear.js

import { formatYear } from "./formatters.js";

/**
 * Groups records newest-year-first. `getDate` should return
 * a date-like value; undated items land in "Unknown".
 */
export function groupByYear(items, getDate) {
  const groups = new Map();

  for (const item of items) {
    const year = formatYear(getDate(item)) || "Unknown";
    const existing = groups.get(year);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(year, [item]);
    }
  }

  return [...groups.entries()].sort((a, b) => {
    if (a[0] === "Unknown") {
      return 1;
    }

    if (b[0] === "Unknown") {
      return -1;
    }

    return Number(b[0]) - Number(a[0]);
  });
}
