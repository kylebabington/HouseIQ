// frontend/src/hooks/domains/useHomesState.js
// Domain slice helpers — useHomeDashboard remains the orchestrator.

export function createHomesSlice(setters) {
  return {
    resetHomesError: () => setters.setHomesError(""),
  };
}

export function createRecordsSlice() {
  return {
    recordKinds: [
      "issues",
      "projects",
      "assets",
      "memories",
      "documents",
    ],
  };
}

export function createDocumentsSlice() {
  return {
    acceptedUploadTypes: [
      "application/pdf",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
  };
}

export function createHouseAgentSlice() {
  return {
    maxConversationTurns: 3,
  };
}

export function createHouseholdMembersSlice() {
  return {
    roles: ["owner", "member", "viewer"],
  };
}

export function createMaintenancePlanSlice() {
  return {
    timingBuckets: [
      "30_days",
      "90_days",
      "365_days",
      "monitor",
    ],
  };
}
