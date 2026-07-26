// frontend/src/App.jsx

import {
  useEffect,
} from "react";

import {
  useAuth0,
} from "@auth0/auth0-react";

import {
  setAccessTokenProvider,
} from "./api.js";

import useHomeDashboard from "./hooks/useHomeDashboard.js";

import getAuthScreen from "./components/auth/getAuthScreen.jsx";

import AgentPanel from "./components/agent/AgentPanel.jsx";
import DocumentUploadPanel from "./components/documents/DocumentUploadPanel.jsx";
import ManualMemoryPanel from "./components/memories/ManualMemoryPanel.jsx";

import HomeProfile from "./components/home-profile/HomeProfile.jsx";

import IssuesPanel from "./components/dashboard/IssuesPanel.jsx";
import ProjectsPanel from "./components/dashboard/ProjectsPanel.jsx";
import AssetsPanel from "./components/dashboard/AssetsPanel.jsx";
import MemoriesPanel from "./components/dashboard/MemoriesPanel.jsx";
import DocumentsPanel from "./components/dashboard/DocumentsPanel.jsx";

import "./index.css";


// ---------------------------------------------------------
// MAIN APP COMPONENT
// ---------------------------------------------------------

function App() {
  // -----------------------------------------------------
  // AUTH0 STATE
  // -----------------------------------------------------

  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    user,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();


  // -----------------------------------------------------
  // CONNECT AUTH0 TO THE SHARED API CLIENT
  // -----------------------------------------------------
  //
  // This effect runs whenever the user's authentication
  // state changes.
  //
  // When the user is logged in, we give api.js access to
  // Auth0's getAccessTokenSilently() function.
  //
  // api.js will call that function before every request.
  //
  useEffect(() => {
    // A logged-out user has no access-token provider.
    if (!isAuthenticated) {
      setAccessTokenProvider(null);
      return;
    }

    // Give the shared Axios client a function that can
    // retrieve a valid access token when needed.
    setAccessTokenProvider(
      async () => {
        const token =
          await getAccessTokenSilently({
            authorizationParams: {
              // This must exactly match the Identifier
              // of the HouseIQ API in Auth0.
              audience:
                import.meta.env
                  .VITE_AUTH0_AUDIENCE,
            },
          });

        return token;
      }
    );

    // Remove the provider when this effect is cleaned up,
    // such as when the user logs out.
    return () => {
      setAccessTokenProvider(null);
    };
  }, [
    isAuthenticated,
    getAccessTokenSilently,
  ]);


  // -----------------------------------------------------
  // HOME AND DASHBOARD STATE
  // -----------------------------------------------------
  //
  // useHomeDashboard is called after the effect above so
  // React runs the token-provider effect first. The shared
  // API client therefore has a token provider before the
  // hook fetches any private home data.
  //
  const {
    homes,
    selectedHome,
    homeForm,
    setHomeForm,
    selectHome,
    createHome,

    issues,
    projects,
    assets,
    memories,
    documents,

    homeProfile,
    isLoadingHomeProfile,
    homeProfileError,
    fetchHomeProfile,
    saveHomeProfile,

    activeTab,
    setActiveTab,
    isLoadingDashboard,
    dashboardError,
    refreshHomeDashboard,

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

    memoryForm,
    setMemoryForm,
    createMemory,
  } = useHomeDashboard({
    isAuthenticated,
    isAuthLoading,
  });


  // -----------------------------------------------------
  // REFRESH RECORDS AFTER AN EDIT OR DELETE
  // -----------------------------------------------------
  //
  // Issues, projects, tasks, assets, and memories panels
  // call this after a PATCH or DELETE succeeds so the
  // dashboard reflects the human's correction immediately.
  //
  async function refreshDashboardForSelectedHome() {
    if (!selectedHome?.id) {
      return;
    }

    await refreshHomeDashboard(
      selectedHome.id
    );
  }


  // -----------------------------------------------------
  // SCROLL TO (AND OPTIONALLY FOCUS) A DEMO SECTION
  // -----------------------------------------------------
  //
  // Used by the compact demo CTA row so a new user can jump
  // straight to "upload a document" or "ask HouseIQ" without
  // hunting for those sections on a long page.
  //
  function scrollToSection(elementId, { focus } = {}) {
    const element =
      document.getElementById(elementId);

    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    if (focus) {
      element.focus({ preventScroll: true });
    }
  }


  // -----------------------------------------------------
  // RENDER STRUCTURED HOME PROFILE
  // -----------------------------------------------------

  function renderHomeProfile() {
    return (
      <HomeProfile
        key={
          selectedHome?.id ||
          "no-home"
        }
        profile={homeProfile}
        isLoading={
          isLoadingHomeProfile
        }
        loadError={
          homeProfileError
        }
        onSave={
          saveHomeProfile
        }
      />
    );
  }


  // -----------------------------------------------------
  // CHOOSE WHICH TAB CONTENT TO DISPLAY
  // -----------------------------------------------------

  function renderActiveTab() {
    switch (activeTab) {
      case "profile":
        return renderHomeProfile();

      case "projects":
        return (
          <ProjectsPanel
            projects={projects}
            homeId={selectedHome?.id}
            onRecordsChanged={
              refreshDashboardForSelectedHome
            }
          />
        );

      case "assets":
        return (
          <AssetsPanel
            assets={assets}
            homeId={selectedHome?.id}
            onRecordsChanged={
              refreshDashboardForSelectedHome
            }
          />
        );

      case "memories":
        return (
          <MemoriesPanel
            memories={memories}
            homeId={selectedHome?.id}
            onRecordsChanged={
              refreshDashboardForSelectedHome
            }
          />
        );

      case "documents":
        return (
          <DocumentsPanel
            documents={documents}
            openOriginalDocument={openOriginalDocument}
          />
        );

      case "issues":
      default:
        return (
          <IssuesPanel
            issues={issues}
            homeId={selectedHome?.id}
            onRecordsChanged={
              refreshDashboardForSelectedHome
            }
          />
        );
    }
  }


  // -----------------------------------------------------
  // AUTHENTICATION SCREENS
  // -----------------------------------------------------
  //
  // Returns null once the user is signed in.
  //
  const authScreen = getAuthScreen({
    isAuthLoading,
    authError,
    isAuthenticated,
    loginWithRedirect,
  });

  if (authScreen) {
    return authScreen;
  }


  // -----------------------------------------------------
  // PAGE
  // -----------------------------------------------------

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            Agentic home memory
          </p>

          <h1>HouseIQ</h1>

          <p className="hero-text">
            Your home remembers everything.
            HouseIQ makes sure you do too.
          </p>
        </div>

        <div className="user-menu">
          {user?.picture && (
            <img
              src={user.picture}
              alt=""
              className="user-avatar"
              referrerPolicy="no-referrer"
            />
          )}

          <div className="user-details">
            <strong>
              {user?.name ||
                user?.nickname ||
                "HouseIQ user"}
            </strong>

            {user?.email && (
              <span>
                {user.email}
              </span>
            )}
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              logout({
                logoutParams: {
                  returnTo:
                    window.location.origin,
                },
              })
            }
          >
            Log out
          </button>
        </div>
      </section>

      <section className="layout">
        {/* -------------------------------------- */}
        {/* HOME SIDEBAR                           */}
        {/* -------------------------------------- */}

        <aside className="panel sidebar">
          <h2>Your Homes</h2>

          <form
            onSubmit={createHome}
            className="stack"
          >
            <input
              value={homeForm.name}
              onChange={(event) =>
                setHomeForm({
                  ...homeForm,
                  name: event.target
                    .value,
                })
              }
              placeholder="Home name, e.g. 1978 Ranch"
            />

            <input
              value={
                homeForm.yearBuilt
              }
              onChange={(event) =>
                setHomeForm({
                  ...homeForm,
                  yearBuilt:
                    event.target
                      .value,
                })
              }
              placeholder="Year built"
              type="number"
            />

            <textarea
              value={homeForm.notes}
              onChange={(event) =>
                setHomeForm({
                  ...homeForm,
                  notes: event.target
                    .value,
                })
              }
              placeholder="General notes about this home"
            />

            <button type="submit">
              Create Home
            </button>
          </form>

          <div className="home-list">
            {homes.map((home) => (
              <button
                key={home.id}
                type="button"
                className={
                  selectedHome?.id ===
                    home.id
                    ? "home-card active"
                    : "home-card"
                }
                onClick={() =>
                  selectHome(home)
                }
              >
                <strong>
                  {home.name}
                </strong>

                {home.year_built && (
                  <span>
                    Built{" "}
                    {
                      home.year_built
                    }
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>


        {/* -------------------------------------- */}
        {/* MAIN CONTENT                           */}
        {/* -------------------------------------- */}

        <section className="panel main-panel">
          {selectedHome ? (
            <>
              <header className="selected-home-header">
                <div>
                  <p className="eyebrow">
                    Current home
                  </p>

                  <h2>
                    {
                      selectedHome.name
                    }
                  </h2>

                  {selectedHome.notes && (
                    <p>
                      {
                        selectedHome.notes
                      }
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    refreshHomeDashboard(
                      selectedHome.id
                    );

                    fetchHomeProfile(
                      selectedHome.id
                    );
                  }}
                  disabled={
                    isLoadingDashboard ||
                    isLoadingHomeProfile
                  }
                >
                  {isLoadingDashboard ||
                    isLoadingHomeProfile
                    ? "Refreshing..."
                    : "Refresh Home"}
                </button>
              </header>


              {/* -------------------------------- */}
              {/* HOUSEIQ CONVERSATION             */}
              {/* -------------------------------- */}

              {/* Always shown once a home is selected — the
                  quickest path to the two actions HouseIQ's demo
                  hinges on: uploading a document and asking a
                  question. */}
              <section className="demo-cta-row">
                <p className="demo-cta-copy">
                  Upload an inspection report,
                  then ask what to do before
                  winter — HouseIQ will use your
                  profile and documents.
                </p>

                <div className="demo-cta-buttons">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      scrollToSection(
                        "houseiq-document-upload-section"
                      )
                    }
                  >
                    Upload a document
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      scrollToSection(
                        "houseiq-agent-textarea",
                        { focus: true }
                      )
                    }
                  >
                    Ask HouseIQ
                  </button>
                </div>
              </section>

              <AgentPanel
                key={
                  selectedHome?.id ||
                  "no-home"
                }
                selectedHome={selectedHome}
                onRecordsChanged={() =>
                  refreshHomeDashboard(
                    selectedHome.id
                  )
                }
                onNavigateTab={setActiveTab}
              />


              {/* -------------------------------- */}
              {/* DOCUMENT UPLOAD                   */}
              {/* -------------------------------- */}

              <DocumentUploadPanel
                selectedDocumentType={
                  selectedDocumentType
                }
                setSelectedDocumentType={
                  setSelectedDocumentType
                }
                selectedDocumentFile={
                  selectedDocumentFile
                }
                setSelectedDocumentFile={
                  setSelectedDocumentFile
                }
                isUploadingDocument={
                  isUploadingDocument
                }
                documentUploadError={
                  documentUploadError
                }
                setDocumentUploadError={
                  setDocumentUploadError
                }
                documentUploadResult={
                  documentUploadResult
                }
                setDocumentUploadResult={
                  setDocumentUploadResult
                }
                uploadDocument={
                  uploadDocument
                }
              />


              {/* -------------------------------- */}
              {/* HOME RECORD DASHBOARD            */}
              {/* -------------------------------- */}

              <section className="dashboard-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      Long-term
                      memory
                    </p>

                    <h3>
                      Home Record
                      Dashboard
                    </h3>
                  </div>
                </div>

                <div className="dashboard-summary">
                  <div>
                    <strong>
                      {issues.length}
                    </strong>

                    <span>Issues</span>
                  </div>

                  <div>
                    <strong>
                      {projects.length}
                    </strong>

                    <span>Projects</span>
                  </div>

                  <div>
                    <strong>
                      {assets.length}
                    </strong>

                    <span>Assets</span>
                  </div>

                  <div>
                    <strong>
                      {memories.length}
                    </strong>

                    <span>Memories</span>
                  </div>

                  <div>
                    <strong>
                      {documents.length}
                    </strong>

                    <span>Documents</span>
                  </div>
                </div>

                <nav
                  className="tab-list"
                  aria-label="Home records"
                >

                  <button
                    type="button"
                    className={
                      activeTab === "profile"
                        ? "dashboard-tab active"
                        : "dashboard-tab"
                    }
                    onClick={() =>
                      setActiveTab(
                        "profile"
                      )
                    }
                  >
                    Profile
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab ===
                        "issues"
                        ? "tab-button active"
                        : "tab-button"
                    }
                    onClick={() =>
                      setActiveTab(
                        "issues"
                      )
                    }
                  >
                    Issues
                    <span>
                      {
                        issues.length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab ===
                        "projects"
                        ? "tab-button active"
                        : "tab-button"
                    }
                    onClick={() =>
                      setActiveTab(
                        "projects"
                      )
                    }
                  >
                    Projects
                    <span>
                      {
                        projects.length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab ===
                        "assets"
                        ? "tab-button active"
                        : "tab-button"
                    }
                    onClick={() =>
                      setActiveTab(
                        "assets"
                      )
                    }
                  >
                    Assets
                    <span>
                      {
                        assets.length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab ===
                        "memories"
                        ? "tab-button active"
                        : "tab-button"
                    }
                    onClick={() =>
                      setActiveTab(
                        "memories"
                      )
                    }
                  >
                    Memories
                    <span>
                      {
                        memories.length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      activeTab === "documents"
                        ? "tab-button active"
                        : "tab-button"
                    }
                    onClick={() =>
                      setActiveTab("documents")
                    }
                  >
                    Documents

                    <span>
                      {documents.length}
                    </span>
                  </button>
                </nav>

                {dashboardError && (
                  <div className="error-message">
                    <strong>
                      Dashboard
                      error
                    </strong>

                    <p>
                      {
                        dashboardError
                      }
                    </p>
                  </div>
                )}

                <div className="tab-content">
                  {isLoadingDashboard ? (
                    <div className="loading-state">
                      Loading home
                      records...
                    </div>
                  ) : (
                    renderActiveTab()
                  )}
                </div>
              </section>


              {/* -------------------------------- */}
              {/* MANUAL TESTING PANEL             */}
              {/* -------------------------------- */}

              {import.meta.env.DEV && (
                <ManualMemoryPanel
                  memoryForm={memoryForm}
                  setMemoryForm={
                    setMemoryForm
                  }
                  createMemory={
                    createMemory
                  }
                />
              )}
            </>
          ) : (
            <div className="empty-state large">
              <h2>
                Create your first
                home
              </h2>

              <p>
                Once a home exists,
                HouseIQ can begin
                remembering repairs,
                systems, projects,
                problems, and
                maintenance history.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
