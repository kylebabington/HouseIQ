// Primary HouseIQ workspace navigation.
//
// Six top-level pages, with Records and Home keeping small
// secondary tabs. Do not add more top-level destinations.

export const PRIMARY_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "ask", label: "Ask HouseIQ" },
  { id: "documents", label: "Documents" },
  { id: "records", label: "Records" },
  { id: "history", label: "History" },
  { id: "home", label: "Home" },
];

export const RECORD_TABS = [
  { id: "issues", label: "Issues" },
  { id: "projects", label: "Projects" },
  { id: "assets", label: "Assets" },
  { id: "memories", label: "Memories" },
];

export const HOME_TABS = [
  { id: "profile", label: "Profile" },
  { id: "passport", label: "Passport" },
  { id: "sharing", label: "Sharing" },
  { id: "homes", label: "Your Homes" },
];

export const DOCUMENT_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "inspection", label: "Inspections" },
  { id: "invoice", label: "Invoices" },
  { id: "manual", label: "Manuals" },
  { id: "warranty", label: "Warranties" },
];

/**
 * Maps a legacy dashboard tab (or agent action tab) onto the
 * six-page workspace.
 */
export function destinationFromTab(tabName) {
  if (tabName === "documents") {
    return { section: "documents", tab: "issues", homeTab: "profile" };
  }

  if (tabName === "profile") {
    return { section: "home", tab: "issues", homeTab: "profile" };
  }

  if (RECORD_TABS.some((tab) => tab.id === tabName)) {
    return { section: "records", tab: tabName, homeTab: "profile" };
  }

  return { section: "overview", tab: "issues", homeTab: "profile" };
}

export { homeSubtitle } from "../utils/formatters.js";
