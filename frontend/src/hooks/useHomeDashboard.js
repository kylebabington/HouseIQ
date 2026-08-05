// frontend/src/hooks/useHomeDashboard.js

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import api from "../api.js";

import {
  createDocumentsSlice,
  createHomesSlice,
  createHouseAgentSlice,
  createHouseholdMembersSlice,
  createMaintenancePlanSlice,
  createRecordsSlice,
} from "./domains/useHomesState.js";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------
//
// Your Express backend runs locally on port 5000.
//
const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";


// ---------------------------------------------------------
// HOME AND DASHBOARD STATE
// ---------------------------------------------------------
//
// Owns every piece of state scoped to the user's homes:
// the home list, the current selection, the structured
// profile, the dashboard records, document uploads, and
// the manual memory form.
//
function useHomeDashboard({
  isAuthenticated,
  isAuthLoading,
}) {
  const domainSlices = {
    homes: createHomesSlice({ setHomesError: () => {} }),
    records: createRecordsSlice(),
    documents: createDocumentsSlice(),
    agent: createHouseAgentSlice(),
    members: createHouseholdMembersSlice(),
    maintenance: createMaintenancePlanSlice(),
  };

  // -----------------------------------------------------
  // HOME STATE
  // -----------------------------------------------------

  // Every home returned by GET /api/homes
  const [homes, setHomes] = useState([]);

  // The home currently being viewed
  const [selectedHome, setSelectedHome] =
    useState(null);

  // Ref to track the current selected home ID for async operations
  const selectedHomeIdRef = useRef(null);

  // Form for creating a home
  const [homeForm, setHomeForm] = useState({
    name: "",
    yearBuilt: "",
    notes: "",
  });

  // Set when GET /api/homes fails, so the shell can show a
  // real error instead of a silently empty sidebar.
  const [homesError, setHomesError] =
    useState("");

  // Set when the create-home form fails validation or the
  // request itself fails, shown inline instead of alert().
  const [createHomeError, setCreateHomeError] =
    useState("");


  // -----------------------------------------------------
  // DASHBOARD DATA
  // -----------------------------------------------------

  // Problems that HouseIQ is tracking.
  const [issues, setIssues] = useState([]);

  // Multi-step repair or maintenance plans.
  const [projects, setProjects] = useState([]);

  // Appliances, systems, tools, and equipment.
  const [assets, setAssets] = useState([]);

  // Permanent long-term facts about the home.
  const [memories, setMemories] = useState([]);

  // Uploaded inspection reports, invoices, manuals,
  // warranties, receipts, and other documents.
  const [documents, setDocuments] = useState([]);

  // -----------------------------------------------------
  // STRUCTURED HOME PROFILE
  // -----------------------------------------------------
  //
  // The detailed physical profile returned by:
  //
  // GET /api/homes/:homeId/profile
  //
  const [
    homeProfile,
    setHomeProfile,
  ] = useState(null);


  // True while the profile request is running.
  const [
    isLoadingHomeProfile,
    setIsLoadingHomeProfile,
  ] = useState(false);


  // Stores profile-specific loading errors separately from
  // issue, project, asset, memory, and document errors.
  const [
    homeProfileError,
    setHomeProfileError,
  ] = useState("");


  // -----------------------------------------------------
  // DASHBOARD UI STATE
  // -----------------------------------------------------

  // Controls which dashboard tab is visible.
  const [activeTab, setActiveTab] =
    useState("issues");

  // True while dashboard data is loading.
  const [
    isLoadingDashboard,
    setIsLoadingDashboard,
  ] = useState(false);

  // Stores dashboard loading errors.
  const [
    dashboardError,
    setDashboardError,
  ] = useState("");


  // -----------------------------------------------------
  // DOCUMENT UPLOAD STATE
  // -----------------------------------------------------

  // The actual File object selected in the browser.
  //
  // This is not the filename string.
  // It is the browser's representation of the uploaded file.
  const [
    selectedDocumentFile,
    setSelectedDocumentFile,
  ] = useState(null);

  // The category sent to the backend as documentType.
  const [
    selectedDocumentType,
    setSelectedDocumentType,
  ] = useState("inspection");

  // True while the document is uploading and being analyzed.
  const [
    isUploadingDocument,
    setIsUploadingDocument,
  ] = useState(false);

  // Stores a user-friendly upload error.
  const [
    documentUploadError,
    setDocumentUploadError,
  ] = useState("");

  // Stores the complete response from the document upload route.
  //
  // This lets the UI show:
  // - the document summary
  // - what records were created
  // - extracted metadata
  const [
    documentUploadResult,
    setDocumentUploadResult,
  ] = useState(null);

  const [documentOpenError, setDocumentOpenError] =
    useState("");

  const [needsItems, setNeedsItems] = useState([]);
  const [isLoadingNeeds, setIsLoadingNeeds] =
    useState(false);
  const [needsError, setNeedsError] = useState("");

  const [agentRuns, setAgentRuns] = useState([]);
  const [isLoadingAgentRuns, setIsLoadingAgentRuns] =
    useState(false);
  const [agentRunsError, setAgentRunsError] =
    useState("");

  const [proposals, setProposals] = useState({
    memories: [],
    issues: [],
    projects: [],
    assets: [],
    total: 0,
  });
  const [isUpdatingProposal, setIsUpdatingProposal] =
    useState(false);

  const [homeMembers, setHomeMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] =
    useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [onboardingGateDismissed, setOnboardingGateDismissed] =
    useState(false);
  const [highlightRecord, setHighlightRecord] =
    useState(null);

  const [memoryFormError, setMemoryFormError] =
    useState("");


  // -----------------------------------------------------
  // MANUAL MEMORY TESTING STATE
  // -----------------------------------------------------

  const [memoryForm, setMemoryForm] =
    useState({
      title: "",
      category: "general",
      content: "",
    });


  // -----------------------------------------------------
  // LOAD HOMES AFTER AUTHENTICATION
  // -----------------------------------------------------
  //
  // App.jsx registers the shared API client's token provider
  // in an effect declared before this hook's effects run for
  // the first time, so fetchHomes() always has a token.
  //
  // useEffectEvent keeps fetchHomes out of the dependency
  // array without disabling the exhaustive-deps rule.
  //
  const loadHomesWhenAuthenticated =
    useEffectEvent(() => {
      fetchHomes();
    });

  useEffect(() => {
    // Auth0 is still checking whether a session exists.
    if (isAuthLoading) {
      return;
    }

    // Never request private home data for a logged-out user.
    if (!isAuthenticated) {
      return;
    }

    loadHomesWhenAuthenticated();
  }, [
    isAuthLoading,
    isAuthenticated,
  ]);

  // -----------------------------------------------------
  // REFRESH DASHBOARD WHEN HOME CHANGES
  // -----------------------------------------------------
  //
  // Home-scoped UI resets happen in selectHome() when the
  // user (or fetchHomes) picks a home. This effect only
  // loads data for the current selection.
  //
  const loadSelectedHomeData =
    useEffectEvent((homeId) => {
      refreshHomeDashboard(homeId);
      fetchHomeProfile(homeId);
    });

  useEffect(() => {
    selectedHomeIdRef.current = selectedHome?.id ?? null;

    if (!selectedHome?.id) {
      return;
    }

    loadSelectedHomeData(
      selectedHome.id
    );
  }, [selectedHome]);


  // -----------------------------------------------------
  // RESET UI SCOPED TO THE CURRENT HOME
  // -----------------------------------------------------
  //
  // Called from selectHome before changing selectedHome so
  // we do not need synchronous setState inside an effect.
  //
  // Agent state is not reset here. App.jsx remounts
  // AgentPanel with a per-home key instead.
  //
  function resetHomeScopedUi() {
    setDocumentUploadResult(null);
    setDocumentUploadError("");
    setDocumentOpenError("");
    setSelectedDocumentFile(null);

    setHomeProfile(null);
    setHomeProfileError("");

    setNeedsItems([]);
    setNeedsError("");
    setAgentRuns([]);
    setAgentRunsError("");
    setHomeMembers([]);
    setInviteError("");
    setInviteSuccess("");
    setOnboardingGateDismissed(false);
    setHighlightRecord(null);
    setMemoryFormError("");

    // Start each home on its profile / gate.
    setActiveTab("profile");
  }


  // -----------------------------------------------------
  // SELECT A HOME
  // -----------------------------------------------------

  function selectHome(home) {
    if (!home) {
      return;
    }

    if (
      selectedHome?.id === home.id
    ) {
      return;
    }

    resetHomeScopedUi();
    setSelectedHome(home);
  }


  // -----------------------------------------------------
  // FETCH HOMES
  // -----------------------------------------------------

  async function fetchHomes() {
    try {
      setHomesError("");

      // Redeem any pending email invites before listing.
      try {
        await api.post(
          `${API_URL}/homes/members/redeem`
        );
      } catch (redeemError) {
        // Non-fatal: token may lack email claim.
        console.warn(
          "Invite redeem skipped:",
          redeemError?.response?.data?.error ||
            redeemError.message
        );
      }

      const response = await api.get(
        `${API_URL}/homes`
      );

      setHomes(response.data);

      if (
        response.data.length > 0 &&
        !selectedHome
      ) {
        selectHome(response.data[0]);
      }
    } catch (error) {
      console.error(
        "Error fetching homes:",
        error
      );

      setHomesError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        "Could not load your homes."
      );
    }
  }


  // -----------------------------------------------------
  // REFRESH THE COMPLETE DASHBOARD
  // -----------------------------------------------------

  async function refreshHomeDashboard(homeId) {
    if (!homeId) {
      return;
    }

    try {
      setIsLoadingDashboard(true);
      setDashboardError("");
      setIsLoadingNeeds(true);
      setIsLoadingAgentRuns(true);

      const settled = await Promise.allSettled([
        api.get(`${API_URL}/homes/${homeId}/issues`),
        api.get(`${API_URL}/homes/${homeId}/projects`),
        api.get(`${API_URL}/homes/${homeId}/assets`),
        api.get(`${API_URL}/homes/${homeId}/memories`),
        api.get(`${API_URL}/homes/${homeId}/documents`),
        api.get(`${API_URL}/homes/${homeId}/needs`),
        api.get(`${API_URL}/homes/${homeId}/agent-runs`),
        api.get(`${API_URL}/homes/${homeId}/members`),
        api.get(`${API_URL}/homes/${homeId}/proposals`),
      ]);

      const [
        issuesResult,
        projectsResult,
        assetsResult,
        memoriesResult,
        documentsResult,
        needsResult,
        agentRunsResult,
        membersResult,
        proposalsResult,
      ] = settled;

      const sectionErrors = [];

      function applySettled(result, onSuccess, label) {
        if (result.status === "fulfilled") {
          onSuccess(result.value.data);
          return;
        }

        const error = result.reason;
        console.error(`Error loading ${label}:`, error);
        sectionErrors.push(
          error?.response?.data?.details ||
            error?.response?.data?.error ||
            `Could not load ${label}.`
        );
      }

      applySettled(issuesResult, setIssues, "issues");
      applySettled(projectsResult, setProjects, "projects");
      applySettled(assetsResult, setAssets, "assets");
      applySettled(memoriesResult, setMemories, "memories");
      applySettled(documentsResult, setDocuments, "documents");

      if (needsResult.status === "fulfilled") {
        setNeedsItems(needsResult.value.data?.items || []);
        setNeedsError("");
      } else {
        const error = needsResult.reason;
        setNeedsError(
          error?.response?.data?.error ||
            "Could not load priorities."
        );
        console.error("Error loading needs:", error);
      }

      if (agentRunsResult.status === "fulfilled") {
        setAgentRuns(agentRunsResult.value.data || []);
        setAgentRunsError("");
      } else {
        const error = agentRunsResult.reason;
        setAgentRunsError(
          error?.response?.data?.error ||
            "Could not load advice history."
        );
        console.error("Error loading agent runs:", error);
      }

      applySettled(
        membersResult,
        (data) => setHomeMembers(data || []),
        "members"
      );

      if (proposalsResult.status === "fulfilled") {
        setProposals(
          proposalsResult.value.data || {
            memories: [],
            issues: [],
            projects: [],
            assets: [],
            total: 0,
          }
        );
      }

      const coreFailed = [
        issuesResult,
        projectsResult,
        assetsResult,
        memoriesResult,
        documentsResult,
      ].every((result) => result.status === "rejected");

      if (coreFailed) {
        setDashboardError(
          sectionErrors[0] ||
            "Could not load the home dashboard."
        );
      } else if (
        [
          issuesResult,
          projectsResult,
          assetsResult,
          memoriesResult,
          documentsResult,
          membersResult,
        ].some((result) => result.status === "rejected")
      ) {
        setDashboardError(
          "Some dashboard sections could not load. Available data is shown below."
        );
      }
    } catch (error) {
      console.error(
        "Error refreshing dashboard:",
        error
      );

      setDashboardError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        "Could not load the home dashboard."
      );
      setNeedsError(
        error.response?.data?.error ||
        "Could not load priorities."
      );
      setAgentRunsError(
        error.response?.data?.error ||
        "Could not load advice history."
      );
    } finally {
      setIsLoadingDashboard(false);
      setIsLoadingNeeds(false);
      setIsLoadingAgentRuns(false);
    }
  }

  // -----------------------------------------------------
  // FETCH STRUCTURED HOME PROFILE
  // -----------------------------------------------------

  async function fetchHomeProfile(
    homeId
  ) {
    if (!homeId) {
      return;
    }

    try {
      setIsLoadingHomeProfile(true);
      setHomeProfileError("");

      const response =
        await api.get(
          `${API_URL}/homes/${homeId}/profile`
        );

      if (selectedHomeIdRef.current === homeId) {
        setHomeProfile(
          response.data
        );
      }
    } catch (error) {
      console.error(
        "Error fetching home profile:",
        error
      );

      if (selectedHomeIdRef.current === homeId) {
        setHomeProfile(null);

        setHomeProfileError(
          error.response?.data?.error ||
          "Could not load the home profile."
        );
      }
    } finally {
      if (selectedHomeIdRef.current === homeId) {
        setIsLoadingHomeProfile(false);
      }
    }
  }


  // -----------------------------------------------------
  // SAVE STRUCTURED HOME PROFILE
  // -----------------------------------------------------

  async function saveHomeProfile(
    profileUpdates
  ) {
    if (!selectedHome?.id) {
      throw new Error(
        "Select a home before updating its profile."
      );
    }

    const response =
      await api.patch(
        `${API_URL}/homes/${selectedHome.id}/profile`,
        profileUpdates
      );

    const updatedProfile =
      response.data;

    setHomeProfile(
      updatedProfile
    );

    return updatedProfile;
  }


  // -----------------------------------------------------
  // CREATE A HOME
  // -----------------------------------------------------

  async function createHome(event) {
    event.preventDefault();

    setCreateHomeError("");

    if (!homeForm.name.trim()) {
      setCreateHomeError(
        "Enter a name for the home."
      );
      return;
    }

    try {
      const response = await api.post(
        `${API_URL}/homes`,
        {
          name: homeForm.name.trim(),

          yearBuilt:
            homeForm.yearBuilt
              ? Number(
                homeForm.yearBuilt
              )
              : null,

          notes:
            homeForm.notes.trim(),
        }
      );

      const newHome = response.data;

      setHomes((currentHomes) => [
        newHome,
        ...currentHomes,
      ]);

      selectHome(newHome);

      setHomeForm({
        name: "",
        yearBuilt: "",
        notes: "",
      });
    } catch (error) {
      console.error(
        "Error creating home:",
        error
      );

      setCreateHomeError(
        error.response?.data?.error ||
        "Could not create the home."
      );
    }
  }


  // -----------------------------------------------------
  // UPLOAD AND ANALYZE A DOCUMENT
  // -----------------------------------------------------

  async function uploadDocument(event) {
    event.preventDefault();

    if (!selectedHome) {
      setDocumentUploadError(
        "Create or select a home before uploading a document."
      );

      return;
    }

    // The user must choose a file first.
    if (!selectedDocumentFile) {
      setDocumentUploadError(
        "Choose a PDF, text file, or photo before uploading."
      );

      return;
    }

    // The backend accepts PDF, plain text, and common images.
    const allowedMimeTypes = [
      "application/pdf",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedMimeTypes.includes(
        selectedDocumentFile.type
      )
    ) {
      setDocumentUploadError(
        "HouseIQ supports PDF, plain-text, JPEG, PNG, and WebP files."
      );

      return;
    }

    // Match the backend's 10 MB limit.
    const maximumFileSize =
      10 * 1024 * 1024;

    if (
      selectedDocumentFile.size >
      maximumFileSize
    ) {
      setDocumentUploadError(
        "The selected file is larger than 10 MB."
      );

      return;
    }

    try {
      setIsUploadingDocument(true);
      setDocumentUploadError("");
      setDocumentUploadResult(null);

      // FormData is required for file uploads.
      //
      // Normal JSON cannot directly contain a browser File object.
      const formData = new FormData();

      // This field name must exactly match:
      //
      // upload.single("document")
      //
      // in backend/server.js.
      formData.append(
        "document",
        selectedDocumentFile
      );

      // This becomes req.body.documentType on the backend.
      formData.append(
        "documentType",
        selectedDocumentType
      );

      const response = await api.post(
        `${API_URL}/homes/${selectedHome.id}/documents/upload`,
        formData
      );

      // Save the full backend response so the UI can display
      // the summary, metadata, and actions taken.
      setDocumentUploadResult(
        response.data
      );

      if (response.data?.truncated) {
        setDocumentUploadError(
          "Document analyzed, but text was truncated to the first 50,000 characters. Later pages may not be included."
        );
      }

      // Clear the selected file after success.
      setSelectedDocumentFile(null);

      // Reset the physical file input.
      //
      // React state clearing does not always clear the visible
      // filename inside an <input type="file">.
      const fileInput =
        document.getElementById(
          "houseiq-document-input"
        );

      if (fileInput) {
        fileInput.value = "";
      }

      // The document analysis may have created records in
      // multiple dashboard categories.
      await refreshHomeDashboard(
        selectedHome.id
      );

      // Show the user the new document immediately.
      setActiveTab("documents");
    } catch (error) {
      console.error(
        "Document upload failed:",
        error
      );

      setDocumentUploadError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        "HouseIQ could not process the document."
      );
    } finally {
      setIsUploadingDocument(false);
    }
  }

  // -----------------------------------------------------
  // OPEN THE ORIGINAL PRIVATE DOCUMENT
  // -----------------------------------------------------

  async function openOriginalDocument(
    documentRecord
  ) {
    if (!documentRecord?.id) {
      return;
    }

    try {
      const response = await api.get(
        `${API_URL}/documents/${documentRecord.id}/download-url`
      );

      const signedUrl =
        response.data.url;

      if (!signedUrl) {
        throw new Error(
          "The server did not return a document URL."
        );
      }

      // Open the temporary S3 URL in a new browser tab.
      //
      // "noopener,noreferrer" prevents the opened page from
      // receiving access to the original browser window.
      window.open(
        signedUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      console.error(
        "Could not open original document:",
        error
      );

      setDocumentOpenError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        error.message ||
        "The original document could not be opened."
      );
    }
  }

  async function openDocumentById(documentId) {
    const match = documents.find(
      (doc) => doc.id === documentId
    );

    if (match) {
      return openOriginalDocument(match);
    }

    setDocumentOpenError(
      "That source document is no longer available."
    );
  }

  async function deleteDocument(documentRecord) {
    if (!documentRecord?.id) {
      return;
    }

    await api.delete(
      `${API_URL}/documents/${documentRecord.id}`
    );

    if (selectedHome?.id) {
      await refreshHomeDashboard(selectedHome.id);
    }
  }

  async function inviteHomeMember(event) {
    event.preventDefault();

    if (!selectedHome?.id) {
      return;
    }

    setIsInviting(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const response = await api.post(
        `${API_URL}/homes/${selectedHome.id}/members`,
        {
          invitedEmail: inviteEmail.trim(),
          role: inviteRole,
        }
      );

      const tokenHint = response.data?.inviteToken
        ? ` Share token (expires in ${response.data.inviteExpiresInDays || 14} days): ${response.data.inviteToken}`
        : "";

      setInviteSuccess(
        `Invite saved for ${inviteEmail.trim()}.${tokenHint}`
      );
      setInviteEmail("");

      const membersResponse = await api.get(
        `${API_URL}/homes/${selectedHome.id}/members`
      );
      setHomeMembers(membersResponse.data || []);
    } catch (error) {
      setInviteError(
        error.response?.data?.error ||
          "Could not invite this person."
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function removeHomeMember(memberAuth0Id) {
    if (!selectedHome?.id || !memberAuth0Id) {
      return;
    }

    try {
      await api.delete(
        `${API_URL}/homes/${selectedHome.id}/members/${encodeURIComponent(memberAuth0Id)}`
      );

      const membersResponse = await api.get(
        `${API_URL}/homes/${selectedHome.id}/members`
      );
      setHomeMembers(membersResponse.data || []);
    } catch (error) {
      setInviteError(
        error.response?.data?.error ||
          "Could not remove this member."
      );
    }
  }

  async function deleteHome() {
    if (!selectedHome?.id) {
      return;
    }

    await api.delete(
      `${API_URL}/homes/${selectedHome.id}`
    );

    setSelectedHome(null);
    await fetchHomes();
  }


  // -----------------------------------------------------
  // CREATE A MANUAL MEMORY
  // -----------------------------------------------------

  async function createMemory(event) {
    event.preventDefault();

    if (!selectedHome) {
      setMemoryFormError(
        "Create or select a home first."
      );
      return;
    }

    if (!memoryForm.content.trim()) {
      setMemoryFormError(
        "Memory content is required."
      );
      return;
    }

    setMemoryFormError("");

    try {
      await api.post(
        `${API_URL}/homes/${selectedHome.id}/memories`,
        {
          title:
            memoryForm.title.trim(),

          category:
            memoryForm.category,

          content:
            memoryForm.content.trim(),
        }
      );

      setMemoryForm({
        title: "",
        category: "general",
        content: "",
      });

      await refreshHomeDashboard(
        selectedHome.id
      );

      setActiveTab("memories");
    } catch (error) {
      console.error(
        "Error creating memory:",
        error
      );

      setMemoryFormError(
        error.response?.data?.error ||
        "Could not save the memory."
      );
    }
  }


  // -----------------------------------------------------
  // ASK / ONBOARDING GATE HELPERS
  // -----------------------------------------------------

  const onboardingStatus =
    homeProfile?.onboardingStatus ||
    "not_started";

  const askUnlocked = Boolean(
    homeProfile?.propertyType ||
      homeProfile?.heatingType ||
      homeProfile?.coolingType ||
      selectedHome?.year_built ||
      onboardingStatus === "completed"
  );

  const askLockReason = askUnlocked
    ? ""
    : "add property type, heating/cooling, or year built";

  const showOnboardingGate =
    Boolean(selectedHome) &&
    onboardingStatus !== "completed" &&
    !onboardingGateDismissed;

  const isHomeOwner =
    !selectedHome?.member_role ||
    selectedHome.member_role === "owner" ||
    selectedHome.memberRole === "owner";


  // -----------------------------------------------------
  // EVERYTHING THE APP SHELL NEEDS
  // -----------------------------------------------------

  async function acceptProposal(kind, recordId) {
    if (!selectedHome?.id) {
      return;
    }

    try {
      setIsUpdatingProposal(true);
      await api.post(
        `${API_URL}/homes/${selectedHome.id}/proposals/${kind}/${recordId}/accept`
      );
      await refreshHomeDashboard(selectedHome.id);
    } catch (error) {
      console.error("Accept proposal failed:", error);
    } finally {
      setIsUpdatingProposal(false);
    }
  }

  async function rejectProposal(kind, recordId) {
    if (!selectedHome?.id) {
      return;
    }

    try {
      setIsUpdatingProposal(true);
      await api.post(
        `${API_URL}/homes/${selectedHome.id}/proposals/${kind}/${recordId}/reject`
      );
      await refreshHomeDashboard(selectedHome.id);
    } catch (error) {
      console.error("Reject proposal failed:", error);
    } finally {
      setIsUpdatingProposal(false);
    }
  }

  async function acceptAllProposals() {
    if (!selectedHome?.id) {
      return;
    }

    try {
      setIsUpdatingProposal(true);
      await api.post(
        `${API_URL}/homes/${selectedHome.id}/proposals/accept-all`
      );
      await refreshHomeDashboard(selectedHome.id);
    } catch (error) {
      console.error("Accept all proposals failed:", error);
    } finally {
      setIsUpdatingProposal(false);
    }
  }


  // -----------------------------------------------------
  // PUBLIC API
  // -----------------------------------------------------

  return {
    // Homes
    homes,
    homesError,
    selectedHome,
    homeForm,
    setHomeForm,
    selectHome,
    createHome,
    createHomeError,
    deleteHome,
    isHomeOwner,
    fetchHomes,

    // Dashboard records
    issues,
    projects,
    assets,
    memories,
    documents,

    // Structured profile
    homeProfile,
    isLoadingHomeProfile,
    homeProfileError,
    fetchHomeProfile,
    saveHomeProfile,

    // Dashboard UI
    activeTab,
    setActiveTab,
    isLoadingDashboard,
    dashboardError,
    refreshHomeDashboard,
    highlightRecord,
    setHighlightRecord,

    // Needs board
    needsItems,
    isLoadingNeeds,
    needsError,

    // Advice history
    agentRuns,
    isLoadingAgentRuns,
    agentRunsError,

    // Sharing
    homeMembers,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteError,
    inviteSuccess,
    isInviting,
    inviteHomeMember,
    removeHomeMember,

    // Onboarding gate
    showOnboardingGate,
    setOnboardingGateDismissed,
    askUnlocked,
    askLockReason,

    // Document upload
    selectedDocumentFile,
    setSelectedDocumentFile,
    selectedDocumentType,
    setSelectedDocumentType,
    isUploadingDocument,
    documentUploadError,
    setDocumentUploadError,
    documentUploadResult,
    setDocumentUploadResult,
    documentOpenError,
    uploadDocument,
    openOriginalDocument,
    openDocumentById,
    deleteDocument,

    // Manual memory testing
    memoryForm,
    setMemoryForm,
    createMemory,
    memoryFormError,

    domainSlices,
    proposals,
    isUpdatingProposal,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
  };
}


export default useHomeDashboard;
