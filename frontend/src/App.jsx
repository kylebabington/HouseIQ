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
import AdviceHistoryPanel from "./components/agent/AdviceHistoryPanel.jsx";
import DocumentUploadPanel from "./components/documents/DocumentUploadPanel.jsx";
import ManualMemoryPanel from "./components/memories/ManualMemoryPanel.jsx";

import HomeProfile from "./components/home-profile/HomeProfile.jsx";
import OnboardingGate from "./components/home-profile/OnboardingGate.jsx";
import ShareHomePanel from "./components/home-profile/ShareHomePanel.jsx";

import IssuesPanel from "./components/dashboard/IssuesPanel.jsx";
import ProjectsPanel from "./components/dashboard/ProjectsPanel.jsx";
import AssetsPanel from "./components/dashboard/AssetsPanel.jsx";
import MemoriesPanel from "./components/dashboard/MemoriesPanel.jsx";
import DocumentsPanel from "./components/dashboard/DocumentsPanel.jsx";
import NeedsBoard from "./components/dashboard/NeedsBoard.jsx";

import { formatLabel } from "./utils/formatters.js";


// ---------------------------------------------------------
// ONBOARDING STATUS BADGE COPY
// ---------------------------------------------------------
//
// Shown next to the selected home's name so a homeowner can
// see, without clicking into the Profile tab, whether HouseIQ
// still needs the initial onboarding questions answered.
//
const ONBOARDING_STATUS_META = {
  not_started: {
    className: "onboarding-not_started",
    label: "Onboarding not started",
  },
  in_progress: {
    className: "onboarding-in_progress",
    label: "Onboarding in progress",
  },
  completed: {
    className: "onboarding-completed",
    label: "Onboarding complete",
  },
};


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
    homesError,
    selectedHome,
    homeForm,
    setHomeForm,
    selectHome,
    createHome,
    createHomeError,
    deleteHome,
    isHomeOwner,

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
    highlightRecord,
    setHighlightRecord,

    needsItems,
    isLoadingNeeds,
    needsError,

    agentRuns,
    isLoadingAgentRuns,
    agentRunsError,

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

    showOnboardingGate,
    setOnboardingGateDismissed,
    askUnlocked,
    askLockReason,

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

    memoryForm,
    setMemoryForm,
    createMemory,
    memoryFormError,
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

  function handleSelectNeed(item) {
    const tabByKind = {
      issue: "issues",
      project: "projects",
      lifecycle: "assets",
      seasonal: "profile",
    };

    const tab = tabByKind[item.kind] || "issues";
    setActiveTab(tab);
    setHighlightRecord({
      kind: item.kind,
      id: item.id,
    });

    window.setTimeout(() => {
      const element = document.getElementById(
        `record-${item.kind === "lifecycle" ? "asset" : item.kind}-${item.id}`
      );
      element?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "profile":
        return (
          <>
            {renderHomeProfile()}
            <ShareHomePanel
              members={homeMembers}
              isOwner={isHomeOwner}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              inviteError={inviteError}
              inviteSuccess={inviteSuccess}
              onInvite={inviteHomeMember}
              onRemove={removeHomeMember}
              isBusy={isInviting}
            />
          </>
        );

      case "projects":
        return (
          <ProjectsPanel
            projects={projects}
            homeId={selectedHome?.id}
            onRecordsChanged={
              refreshDashboardForSelectedHome
            }
            highlightId={
              highlightRecord?.kind === "project"
                ? highlightRecord.id
                : null
            }
            onOpenDocument={openDocumentById}
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
            highlightId={
              highlightRecord?.kind === "lifecycle"
                ? highlightRecord.id
                : null
            }
            onOpenDocument={openDocumentById}
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
            onOpenDocument={openDocumentById}
            highlightId={
              highlightRecord?.kind === "memory"
                ? highlightRecord.id
                : null
            }
          />
        );

      case "documents":
        return (
          <DocumentsPanel
            documents={documents}
            openOriginalDocument={openOriginalDocument}
            onDeleteDocument={deleteDocument}
            canDelete={isHomeOwner || selectedHome?.member_role === "member"}
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
            onOpenDocument={openDocumentById}
            highlightId={
              highlightRecord?.kind === "issue"
                ? highlightRecord.id
                : null
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
      {/* -------------------------------------- */}
      {/* COMPACT AUTHENTICATED TOP CHROME       */}
      {/* -------------------------------------- */}
      {/* The full marketing hero only appears on the
          logged-out screens (see AuthScreens.jsx). Once a
          homeowner is signed in, the first viewport should be
          their home workspace, not another pitch for HouseIQ. */}

      <header className="app-topbar">
        <div className="brand-lockup">
          <p className="topbar-eyebrow">
            Agentic home memory
          </p>

          <p className="brand-wordmark">
            HouseIQ
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
      </header>

      <section className="layout">
        {/* -------------------------------------- */}
        {/* HOME SIDEBAR                           */}
        {/* -------------------------------------- */}

        <aside className="panel sidebar">
          <h2>Your Homes</h2>

          {homesError && (
            <div className="error-message">
              <strong>
                Could not load homes
              </strong>

              <p>{homesError}</p>
            </div>
          )}

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

            {createHomeError && (
              <p className="record-inline-error">
                {createHomeError}
              </p>
            )}

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
              {showOnboardingGate ? (
                <OnboardingGate
                  homeId={selectedHome.id}
                  homeProfile={homeProfile}
                  onProfileSaved={async () => {
                    await fetchHomeProfile(
                      selectedHome.id
                    );
                    await refreshHomeDashboard(
                      selectedHome.id
                    );
                  }}
                  onSkip={() =>
                    setOnboardingGateDismissed(true)
                  }
                  askUnlocked={askUnlocked}
                  askLockReason={askLockReason}
                />
              ) : null}

              <header className="selected-home-header">
                <div>
                  <p className="eyebrow">
                    Current home
                  </p>

                  <h1>
                    {
                      selectedHome.name
                    }
                  </h1>

                  {homeProfile && (
                    <span
                      className={`onboarding-badge ${ONBOARDING_STATUS_META[
                        homeProfile.onboardingStatus
                      ]?.className ||
                        "onboarding-not_started"
                        }`}
                    >
                      {ONBOARDING_STATUS_META[
                        homeProfile.onboardingStatus
                      ]?.label ||
                        formatLabel(
                          homeProfile.onboardingStatus
                        )}
                    </span>
                  )}

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

                {isHomeOwner ? (
                  <button
                    type="button"
                    className="secondary-button danger-button"
                    onClick={async () => {
                      try {
                        await deleteHome();
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                  >
                    Delete home
                  </button>
                ) : null}
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
                    disabled={!askUnlocked}
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

              <NeedsBoard
                items={needsItems}
                isLoading={isLoadingNeeds}
                error={needsError}
                onSelectNeed={handleSelectNeed}
              />

              {documentOpenError ? (
                <p className="error-message" role="alert">
                  {documentOpenError}
                </p>
              ) : null}

              <div
                key={
                  selectedHome?.id ||
                  "no-home"
                }
                className="agent-upload-row panel-enter"
              >
                <AgentPanel
                  selectedHome={selectedHome}
                  askLocked={!askUnlocked}
                  askLockReason={askLockReason}
                  onRecordsChanged={() =>
                    refreshHomeDashboard(
                      selectedHome.id
                    )
                  }
                  onNavigateTab={setActiveTab}
                />

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
                  uploadDocument={uploadDocument}
                  onNavigateTab={setActiveTab}
                />
              </div>

              <AdviceHistoryPanel
                runs={agentRuns}
                isLoading={isLoadingAgentRuns}
                error={agentRunsError}
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
                  role="tablist"
                  aria-label="Home records"
                >

                  <button
                    type="button"
                    id="tab-profile"
                    role="tab"
                    aria-selected={
                      activeTab === "profile"
                    }
                    aria-controls="dashboard-tabpanel"
                    className={
                      activeTab === "profile"
                        ? "tab-button active"
                        : "tab-button"
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
                    id="tab-issues"
                    role="tab"
                    aria-selected={
                      activeTab === "issues"
                    }
                    aria-controls="dashboard-tabpanel"
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
                    id="tab-projects"
                    role="tab"
                    aria-selected={
                      activeTab === "projects"
                    }
                    aria-controls="dashboard-tabpanel"
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
                    id="tab-assets"
                    role="tab"
                    aria-selected={
                      activeTab === "assets"
                    }
                    aria-controls="dashboard-tabpanel"
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
                    id="tab-memories"
                    role="tab"
                    aria-selected={
                      activeTab === "memories"
                    }
                    aria-controls="dashboard-tabpanel"
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
                    id="tab-documents"
                    role="tab"
                    aria-selected={
                      activeTab === "documents"
                    }
                    aria-controls="dashboard-tabpanel"
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

                <div
                  key={activeTab}
                  id="dashboard-tabpanel"
                  role="tabpanel"
                  aria-labelledby={`tab-${activeTab}`}
                  className="tab-content"
                >
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
                  memoryFormError={
                    memoryFormError
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
