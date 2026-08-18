// frontend/src/navigation.js
//
// Seven primary HouseIQ pages. Records and Home keep a small
// secondary tab strip so we do not flatten every panel into
// the top-level nav.

export const PRIMARY_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "ask", label: "Ask HouseIQ" },
  { id: "auditor", label: "Memory Auditor" },
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

export const HOME_SUBTABS = [
  { id: "profile", label: "Profile" },
  { id: "passport", label: "Passport" },
  { id: "sharing", label: "Sharing" },
  { id: "homes", label: "Your Homes" },
];

export const RECORD_TAB_IDS = RECORD_TABS.map(
  (tab) => tab.id
);

const RECORD_TAB_SET = new Set(RECORD_TAB_IDS);

/**
 * Maps a leftover dashboard-tab id (issues, documents,
 * profile, …) onto the new section + secondary-tab location.
 */
export function locationForLegacyTab(tabName) {
  if (tabName === "documents") {
    return { section: "documents" };
  }

  if (tabName === "profile") {
    return {
      section: "home",
      homeSubTab: "profile",
    };
  }

  if (RECORD_TAB_SET.has(tabName)) {
    return {
      section: "records",
      tab: tabName,
    };
  }

  return {
    section: "records",
    tab: "issues",
  };
}

export const SUGGESTED_HOME_QUESTIONS = [
  "What should I handle before winter?",
  "What's going on with the HVAC?",
  "When was the roof last inspected?",
  "What warranties are still active?",
];
