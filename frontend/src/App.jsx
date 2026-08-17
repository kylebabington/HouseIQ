// frontend/src/App.jsx

import {
  useEffect,
  useState,
} from "react";

import {
  useAuth0,
} from "@auth0/auth0-react";

import {
  setAccessTokenProvider,
} from "./api.js";
import api from "./api.js";

import useHomeDashboard from "./hooks/useHomeDashboard.js";

import getAuthScreen from "./components/auth/getAuthScreen.jsx";

import AgentPanel from "./components/agent/AgentPanel.jsx";
import AdviceHistoryPanel from "./components/agent/AdviceHistoryPanel.jsx";
import MemoryAuditorPanel from "./components/agent/MemoryAuditorPanel.jsx";
import DocumentUploadPanel from "./components/documents/DocumentUploadPanel.jsx";
import ManualMemoryPanel from "./components/memories/ManualMemoryPanel.jsx";

import HomeProfile from "./components/home-profile/HomeProfile.jsx";
import OnboardingGate from "./components/home-profile/OnboardingGate.jsx";
import ShareHomePanel from "./components/home-profile/ShareHomePanel.jsx";
import PassportPanel from "./components/home-profile/PassportPanel.jsx";
import TimelinePanel from "./components/dashboard/TimelinePanel.jsx";

import IssuesPanel from "./components/dashboard/IssuesPanel.jsx";
import ProjectsPanel from "./components/dashboard/ProjectsPanel.jsx";
import AssetsPanel from "./components/dashboard/AssetsPanel.jsx";
import MemoriesPanel from "./components/dashboard/MemoriesPanel.jsx";
import DocumentsPanel from "./components/dashboard/DocumentsPanel.jsx";
import OverviewPage from "./components/dashboard/OverviewPage.jsx";
import YourHomesPanel from "./components/homes/YourHomesPanel.jsx";
import CollapsibleSection from "./components/layout/CollapsibleSection.jsx";
import WorkspaceNav from "./components/layout/WorkspaceNav.jsx";
import {
  HOME_TABS,
  PRIMARY_SECTIONS,
  RECORD_TABS,
  destinationFromTab,
  homeSubtitle,
} from "./workspace/navigation.js";

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
    fetchHomes,

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
    activeSection,
    setActiveSection,
    homeTab,
    setHomeTab,
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

    proposals,
    isUpdatingProposal,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
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
  const [timelineEvents, setTimelineEvents] =
    useState([]);
  const [timelineError, setTimelineError] =
    useState("");
  const [isLoadingTimeline, setIsLoadingTimeline] =
    useState(false);

  async function refreshTimeline() {
    if (!selectedHome?.id) {
      return;
    }

    try {
      setIsLoadingTimeline(true);
      setTimelineError("");
      const response = await api.get(
        `/homes/${selectedHome.id}/timeline`
      );
      setTimelineEvents(response.data?.events || []);
    } catch (error) {
      setTimelineError(
        error.response?.data?.error ||
          "Could not load timeline"
      );
    } finally {
      setIsLoadingTimeline(false);
    }
  }

  useEffect(() => {
    if (!(
      selectedHome?.id &&
      (activeSection === "history" ||
        activeSection === "overview")
    )) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoadingTimeline(true);
        setTimelineError("");
        const response = await api.get(
          `/homes/${selectedHome.id}/timeline`
        );
        if (!cancelled) {
          setTimelineEvents(response.data?.events || []);
        }
      } catch (error) {
        if (!cancelled) {
          setTimelineError(
            error.response?.data?.error ||
              "Could not load timeline"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTimeline(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedHome?.id, activeSection]);

  async function refreshDashboardForSelectedHome() {
    if (!selectedHome?.id) {
      return;
    }

    await refreshHomeDashboard(selectedHome.id);
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

  function navigateTo(section, extras = {}) {
    setActiveSection(section);

    if (extras.tab) {
      setActiveTab(extras.tab);
    }

    if (extras.homeTab) {
      setHomeTab(extras.homeTab);
    }
  }

  function navigateFromLegacyTab(tabName) {
    const destination = destinationFromTab(tabName);
    setActiveSection(destination.section);
    setActiveTab(destination.tab);
    setHomeTab(destination.homeTab);
  }

  function handleSelectNeed(item) {
    if (item.kind === "seasonal") {
      navigateTo("history");
      return;
    }

    const tabByKind = {
      issue: "issues",
      project: "projects",
      lifecycle: "assets",
      asset: "assets",
    };

    navigateFromLegacyTab(tabByKind[item.kind] || "issues");
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

  function renderRecordsTab() {
    switch (activeTab) {
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
          <>
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
            {import.meta.env.DEV ? (
              <CollapsibleSection
                title="Add a memory — manual testing"
                defaultOpen={false}
              >
                <ManualMemoryPanel
                  memoryForm={memoryForm}
                  setMemoryForm={setMemoryForm}
                  createMemory={createMemory}
                  memoryFormError={memoryFormError}
                />
              </CollapsibleSection>
            ) : null}
          </>
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

  function renderYourHomes() {
    return (
      <CollapsibleSection
        title={`Your Homes — ${homes.length} propert${
          homes.length === 1 ? "y" : "ies"
        }`}
        defaultOpen
      >
        <YourHomesPanel
          homes={homes}
          selectedHome={selectedHome}
          homesError={homesError}
          homeForm={homeForm}
          setHomeForm={setHomeForm}
          onSelectHome={selectHome}
          onCreateHome={createHome}
          createHomeError={createHomeError}
          onDeleteHome={deleteHome}
          canCreate
          canDelete={isHomeOwner}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={async () => {
            try {
              const response = await api.post(
                "/demo/seed-indianapolis-ranch"
              );
              await fetchHomes();
              if (response.data?.home) {
                selectHome(response.data.home);
              }
            } catch (error) {
              console.error("Demo seed failed:", error);
              window.alert(
                error.response?.data?.error ||
                  "Could not seed demo home"
              );
            }
          }}
        >
          Seed Indianapolis Ranch
        </button>
      </CollapsibleSection>
    );
  }

  function renderHomeTab() {
    switch (homeTab) {
      case "passport":
        return <PassportPanel homeId={selectedHome?.id} />;

      case "sharing":
        return (
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
        );

      case "homes":
        return renderYourHomes();

      case "profile":
      default:
        return renderHomeProfile();
    }
  }

  function renderSection() {
    switch (activeSection) {
      case "ask":
        return (
          <div className="workspace-page">
      <CollapsibleSection
        title="Ask HouseIQ — Ask about repairs, systems, or documents"
        defaultOpen
        priority
      >
              <AgentPanel
                selectedHome={selectedHome}
                askLocked={!askUnlocked}
                askLockReason={askLockReason}
                hideHeader
                onRecordsChanged={() =>
                  refreshHomeDashboard(selectedHome.id)
                }
                onNavigateTab={navigateFromLegacyTab}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title={
                agentRuns?.length
                  ? `Agent Run Inspector — ${agentRuns.length} run${
                      agentRuns.length === 1 ? "" : "s"
                    }`
                  : "Agent Run Inspector — no runs yet"
              }
              defaultOpen={false}
            >
              <AdviceHistoryPanel
                runs={agentRuns}
                isLoading={isLoadingAgentRuns}
                error={agentRunsError}
                hideHeader
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Memory Auditor — CockroachDB Cloud MCP"
              defaultOpen={false}
            >
              <MemoryAuditorPanel selectedHome={selectedHome} />
            </CollapsibleSection>
          </div>
        );

      case "documents":
        return (
          <div className="workspace-page">
            {documentOpenError ? (
              <p className="error-message" role="alert">
                {documentOpenError}
              </p>
            ) : null}
            <CollapsibleSection
              title="Upload a Document — Inspection, invoice, warranty, or manual"
              defaultOpen
              priority
            >
              <DocumentUploadPanel
                selectedDocumentType={selectedDocumentType}
                setSelectedDocumentType={setSelectedDocumentType}
                selectedDocumentFile={selectedDocumentFile}
                setSelectedDocumentFile={setSelectedDocumentFile}
                isUploadingDocument={isUploadingDocument}
                documentUploadError={documentUploadError}
                setDocumentUploadError={setDocumentUploadError}
                documentUploadResult={documentUploadResult}
                setDocumentUploadResult={setDocumentUploadResult}
                uploadDocument={uploadDocument}
                hideHeader
              />
            </CollapsibleSection>
            <DocumentsPanel
              documents={documents}
              openOriginalDocument={openOriginalDocument}
              onDeleteDocument={deleteDocument}
              canDelete={
                isHomeOwner ||
                selectedHome?.member_role === "member"
              }
            />
          </div>
        );

      case "records":
        return (
          <div className="workspace-page">
            <WorkspaceNav
              items={RECORD_TABS}
              value={
                RECORD_TABS.some((tab) => tab.id === activeTab)
                  ? activeTab
                  : "issues"
              }
              onChange={setActiveTab}
              ariaLabel="Home records"
              variant="sub"
              counts={{
                issues: issues.length,
                projects: projects.length,
                assets: assets.length,
                memories: memories.length,
              }}
            />
            {dashboardError ? (
              <div className="error-message">
                <strong>Dashboard error</strong>
                <p>{dashboardError}</p>
              </div>
            ) : null}
            <div
              key={activeTab}
              className="tab-content"
            >
              {isLoadingDashboard ? (
                <div className="loading-state">
                  Loading home records...
                </div>
              ) : (
                renderRecordsTab()
              )}
            </div>
          </div>
        );

      case "history":
        return (
          <CollapsibleSection
            title={
              timelineEvents.length
                ? `Home Timeline — ${timelineEvents.length} recorded event${
                    timelineEvents.length === 1 ? "" : "s"
                  }`
                : "Home Timeline — no events yet"
            }
            defaultOpen
          >
            <TimelinePanel
              events={timelineEvents}
              isLoading={isLoadingTimeline}
              error={timelineError}
              onRefresh={refreshTimeline}
            />
          </CollapsibleSection>
        );

      case "home":
        return (
          <div className="workspace-page">
            <WorkspaceNav
              items={HOME_TABS}
              value={homeTab}
              onChange={setHomeTab}
              ariaLabel="Home settings"
              variant="sub"
            />
            <div key={homeTab} className="tab-content">
              {renderHomeTab()}
            </div>
          </div>
        );

      case "overview":
      default:
        return (
          <OverviewPage
            needsItems={needsItems}
            isLoadingNeeds={isLoadingNeeds}
            needsError={needsError}
            onSelectNeed={handleSelectNeed}
            timelineEvents={timelineEvents}
            proposals={proposals}
            isUpdatingProposal={isUpdatingProposal}
            onAcceptProposal={acceptProposal}
            onRejectProposal={rejectProposal}
            onAcceptAllProposals={acceptAllProposals}
            onNavigate={(section) => {
              if (section === "documents") {
                navigateTo("documents");
                return;
              }
              navigateTo(section);
            }}
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

      <div className="workspace-chrome">
        {selectedHome ? (
          <header className="workspace-home-banner">
            <div>
              <h1>{selectedHome.name}</h1>
              <p className="workspace-home-meta">
                {homeSubtitle(selectedHome, homeProfile) ||
                  selectedHome.notes ||
                  "Current home"}
              </p>
              {homeProfile ? (
                <span
                  className={`onboarding-badge ${
                    ONBOARDING_STATUS_META[
                      homeProfile.onboardingStatus
                    ]?.className || "onboarding-not_started"
                  }`}
                >
                  {ONBOARDING_STATUS_META[
                    homeProfile.onboardingStatus
                  ]?.label ||
                    formatLabel(homeProfile.onboardingStatus)}
                </span>
              ) : null}
            </div>

            <div className="workspace-home-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  navigateTo("home", { homeTab: "homes" })
                }
              >
                Switch home
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  refreshHomeDashboard(selectedHome.id);
                  fetchHomeProfile(selectedHome.id);
                }}
                disabled={
                  isLoadingDashboard || isLoadingHomeProfile
                }
              >
                {isLoadingDashboard || isLoadingHomeProfile
                  ? "Refreshing..."
                  : "Refresh Home"}
              </button>
            </div>
          </header>
        ) : (
          <header className="workspace-home-banner">
            <div>
              <h1>Your homes</h1>
              <p className="workspace-home-meta">
                Create or select a home to open the workspace.
              </p>
            </div>
          </header>
        )}

        <WorkspaceNav
          items={PRIMARY_SECTIONS}
          value={activeSection}
          onChange={(section) => {
            if (!selectedHome && section !== "home") {
              navigateTo("home", { homeTab: "homes" });
              return;
            }
            navigateTo(section);
          }}
          ariaLabel="HouseIQ sections"
        />
      </div>

      <div className="workspace">
        <div className="workspace-inner">
          {selectedHome ? (
            <>
              {showOnboardingGate ? (
                <OnboardingGate
                  homeId={selectedHome.id}
                  homeProfile={homeProfile}
                  onProfileSaved={async () => {
                    await fetchHomeProfile(selectedHome.id);
                    await refreshHomeDashboard(selectedHome.id);
                  }}
                  onSkip={() => setOnboardingGateDismissed(true)}
                  askUnlocked={askUnlocked}
                  askLockReason={askLockReason}
                />
              ) : null}
              {renderSection()}
            </>
          ) : (
            renderYourHomes()
          )}
        </div>
      </div>
    </main>
  );
}

export default App;
