// frontend/src/hooks/useHomeDashboard.js

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import api from "../api.js";


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
    setSelectedDocumentFile(null);

    setHomeProfile(null);
    setHomeProfileError("");

    // Start each home on its profile.
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

      const response = await api.get(
        `${API_URL}/homes`
      );

      setHomes(response.data);

      // Automatically select the newest home.
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

      // Promise.all runs all five requests at the same time.
      //
      // This is faster than:
      //
      // await issues
      // await projects
      // await assets
      // await memories
      // await documents
      //
      // because the browser does not wait for one request
      // before starting the next.
      const [
        issuesResponse,
        projectsResponse,
        assetsResponse,
        memoriesResponse,
        documentsResponse,
      ] = await Promise.all([
        api.get(
          `${API_URL}/homes/${homeId}/issues`
        ),

        api.get(
          `${API_URL}/homes/${homeId}/projects`
        ),

        api.get(
          `${API_URL}/homes/${homeId}/assets`
        ),

        api.get(
          `${API_URL}/homes/${homeId}/memories`
        ),

        api.get(
          `${API_URL}/homes/${homeId}/documents`
        ),
      ]);

      setIssues(issuesResponse.data);
      setProjects(projectsResponse.data);
      setAssets(assetsResponse.data);
      setMemories(memoriesResponse.data);
      setDocuments(documentsResponse.data);
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
    } finally {
      setIsLoadingDashboard(false);
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

    // A document must belong to a home.
    if (!selectedHome) {
      alert(
        "Create or select a home before uploading a document."
      );

      return;
    }

    // The user must choose a file first.
    if (!selectedDocumentFile) {
      setDocumentUploadError(
        "Choose a PDF or text file before uploading."
      );

      return;
    }

    // The backend currently accepts only PDF and plain text.
    const allowedMimeTypes = [
      "application/pdf",
      "text/plain",
    ];

    if (
      !allowedMimeTypes.includes(
        selectedDocumentFile.type
      )
    ) {
      setDocumentUploadError(
        "HouseIQ currently supports only PDF and plain-text files."
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

      alert(
        error.response?.data?.details ||
        error.response?.data?.error ||
        error.message ||
        "The original document could not be opened."
      );
    }
  }


  // -----------------------------------------------------
  // CREATE A MANUAL MEMORY
  // -----------------------------------------------------

  async function createMemory(event) {
    event.preventDefault();

    if (!selectedHome) {
      alert(
        "Create or select a home first."
      );
      return;
    }

    if (!memoryForm.content.trim()) {
      alert(
        "Memory content is required."
      );
      return;
    }

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

      // Refresh so the new memory appears in the tab.
      await refreshHomeDashboard(
        selectedHome.id
      );

      setActiveTab("memories");
    } catch (error) {
      console.error(
        "Error creating memory:",
        error
      );

      alert(
        error.response?.data?.error ||
        "Could not save the memory."
      );
    }
  }


  // -----------------------------------------------------
  // EVERYTHING THE APP SHELL NEEDS
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
    uploadDocument,
    openOriginalDocument,

    // Manual memory testing
    memoryForm,
    setMemoryForm,
    createMemory,
  };
}


export default useHomeDashboard;
