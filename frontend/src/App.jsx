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
import DocumentUploadPanel from "./components/documents/DocumentUploadPanel.jsx";
import ManualMemoryPanel from "./components/memories/ManualMemoryPanel.jsx";

import HomeProfile from "./components/home-profile/HomeProfile.jsx";
import OnboardingGate from "./components/home-profile/OnboardingGate.jsx";
import ShareHomePanel from "./components/home-profile/ShareHomePanel.jsx";
import PassportPanel from "./components/home-profile/PassportPanel.jsx";
import HomesManager from "./components/home-profile/HomesManager.jsx";
import TimelinePanel from "./components/dashboard/TimelinePanel.jsx";

import IssuesPanel from "./components/dashboard/IssuesPanel.jsx";
import ProjectsPanel from "./components/dashboard/ProjectsPanel.jsx";
import AssetsPanel from "./components/dashboard/AssetsPanel.jsx";
import MemoriesPanel from "./components/dashboard/MemoriesPanel.jsx";
import DocumentsPanel from "./components/dashboard/DocumentsPanel.jsx";
import ProposalsPanel from "./components/dashboard/ProposalsPanel.jsx";
import OverviewPanel from "./components/dashboard/OverviewPanel.jsx";
import PrimaryNav from "./components/layout/PrimaryNav.jsx";
import SubNav from "./components/layout/SubNav.jsx";
import CollapsibleSection from "./components/layout/CollapsibleSection.jsx";

import {
  HOME_SUBTABS,
  RECORD_TABS,
  locationForLegacyTab,
} from "./navigation.js";

import { formatLabel, homeSubtitle } from "./utils/formatters.js";


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

    activeSection,
    setActiveSection,
    activeTab,
    setActiveTab,
    homeSubTab,
    setHomeSubTab,
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
    renameDocument,

    memoryForm,
    setMemoryForm,
    createMemory,
    memoryFormError,

    proposals,
    isUpdatingProposal,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
    reviewDuplicate,
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
    if (!selectedHome?.id) {
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
  }, [selectedHome?.id]);

  async function refreshDashboardForSelectedHome() {
    if (!selectedHome?.id) {
      return;
    }

    await refreshHomeDashboard(selectedHome.id);
    await refreshTimeline();
  }


  // -----------------------------------------------------
  // PAGE NAVIGATION
  // -----------------------------------------------------
  //
  // Six primary sections behave like pages. Records still
  // uses activeTab; Home uses homeSubTab.
  //
  function applyLocation(location) {
    if (location.section) {
      setActiveSection(location.section);
    }

    if (location.tab) {
      setActiveTab(location.tab);
    }

    if (location.homeSubTab) {
      setHomeSubTab(location.homeSubTab);
    }
  }

  function navigateToTab(tabName) {
    applyLocation(locationForLegacyTab(tabName));
  }

  function navigateToSection(section, options = {}) {
    setActiveSection(section);

    if (section === "home" && options.homeSubTab) {
      setHomeSubTab(options.homeSubTab);
    }

    if (options.focus) {
      window.setTimeout(() => {
        document
          .getElementById("houseiq-agent-textarea")
          ?.focus({ preventScroll: true });
      }, 80);
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

  async function seedIndianapolisRanch() {
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
  }

  function goToYourHomes() {
    navigateToSection("home", { homeSubTab: "homes" });
  }

  function renderHomesManager() {
    return (
      <HomesManager
        homes={homes}
        selectedHome={selectedHome}
        onSelectHome={selectHome}
        homeForm={homeForm}
        setHomeForm={setHomeForm}
        onCreateHome={createHome}
        createHomeError={createHomeError}
        homesError={homesError}
        onDeleteHome={deleteHome}
        isHomeOwner={isHomeOwner}
        onSeedDemo={seedIndianapolisRanch}
        profile={homeProfile}
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
      asset: "assets",
      seasonal: "profile",
    };

    const tab = tabByKind[item.kind] || "issues";
    navigateToTab(tab);
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
              <ManualMemoryPanel
                memoryForm={memoryForm}
                setMemoryForm={setMemoryForm}
                createMemory={createMemory}
                memoryFormError={memoryFormError}
              />
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

  function renderHomeSubTab() {
    switch (homeSubTab) {
      case "passport":
        return (
          <PassportPanel homeId={selectedHome?.id} />
        );

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
        return renderHomesManager();

      case "profile":
      default:
        return renderHomeProfile();
    }
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "ask":
        return null;

      case "documents":
        return (
          <div className="documents-section panel-enter">
            <CollapsibleSection
              title="Upload a Document"
              summary="Inspection, invoice, warranty, or manual"
              defaultOpen
              openOnMobile
            >
            <DocumentUploadPanel
              hideHeading
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
            />
            {documentOpenError ? (
              <p className="error-message" role="alert">
                {documentOpenError}
              </p>
            ) : null}
            </CollapsibleSection>
            <DocumentsPanel
              documents={documents}
              openOriginalDocument={openOriginalDocument}
              onDeleteDocument={deleteDocument}
              onRenameDocument={renameDocument}
              canEdit={
                isHomeOwner ||
                selectedHome?.member_role === "member"
              }
            />
          </div>
        );

      case "records":
        return (
          <section className="dashboard-section panel-enter">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  Long-term memory
                </p>
                <h3>Home records</h3>
              </div>
            </div>

            <SubNav
              label="Home records"
              idPrefix="tab"
              panelId="dashboard-tabpanel"
              activeId={activeTab}
              onSelect={setActiveTab}
              items={RECORD_TABS.map((tab) => ({
                ...tab,
                count: {
                  issues: issues.length,
                  projects: projects.length,
                  assets: assets.length,
                  memories: memories.length,
                }[tab.id],
              }))}
            />

            {dashboardError && (
              <div className="error-message">
                <strong>
                  Dashboard
                  error
                </strong>

                <p>
                  {dashboardError}
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
                renderRecordsTab()
              )}
            </div>
          </section>
        );

      case "history":
        return (
          <div className="panel-enter">
            <TimelinePanel
              events={timelineEvents}
              documents={documents}
              isLoading={isLoadingTimeline}
              error={timelineError}
              onRefresh={refreshTimeline}
            />
          </div>
        );

      case "home":
        return (
          <section className="dashboard-section panel-enter">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  This property
                </p>
                <h3>Home</h3>
              </div>
            </div>

            <SubNav
              label="Home settings"
              idPrefix="home-tab"
              panelId="home-tabpanel"
              activeId={homeSubTab}
              onSelect={setHomeSubTab}
              items={HOME_SUBTABS}
            />

            <div
              key={homeSubTab}
              id="home-tabpanel"
              role="tabpanel"
              aria-labelledby={`home-tab-${homeSubTab}`}
              className="tab-content"
            >
              {renderHomeSubTab()}
            </div>
          </section>
        );

      case "overview":
      default:
        return (
          <OverviewPanel
            counts={{
              issues: issues.length,
              projects: projects.length,
              assets: assets.length,
              memories: memories.length,
              documents: documents.length,
            }}
            needsItems={needsItems}
            isLoadingNeeds={isLoadingNeeds}
            needsError={needsError}
            onSelectNeed={handleSelectNeed}
            recentEvents={timelineEvents.slice(0, 6)}
            proposalsTotal={proposals?.total || 0}
            onNavigate={navigateToSection}
            proposalsSlot={
              (proposals?.total || 0) > 0 ? (
                <ProposalsPanel
                  proposals={proposals}
                  isBusy={isUpdatingProposal}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                  onAcceptAll={acceptAllProposals}
                  onReviewDuplicate={reviewDuplicate}
                  hideHeader
                />
              ) : null
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

      <div className="workspace">
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

            <header className="workspace-homebar">
              <div>
                <h1>{selectedHome.name}</h1>
                {homeSubtitle(selectedHome, homeProfile) ? (
                  <p>
                    {homeSubtitle(
                      selectedHome,
                      homeProfile
                    )}
                  </p>
                ) : null}
                {homeProfile ? (
                  <span
                    className={`onboarding-badge ${ONBOARDING_STATUS_META[
                      homeProfile.onboardingStatus
                    ]?.className ||
                      "onboarding-not_started"}`}
                  >
                    {ONBOARDING_STATUS_META[
                      homeProfile.onboardingStatus
                    ]?.label ||
                      formatLabel(
                        homeProfile.onboardingStatus
                      )}
                  </span>
                ) : null}
              </div>

              <div className="workspace-homebar-actions">
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
                <button
                  type="button"
                  className="secondary-button"
                  onClick={goToYourHomes}
                >
                  Switch home
                </button>
              </div>
            </header>

            <PrimaryNav
              activeSection={activeSection}
              onSelect={setActiveSection}
            />

            <div
              hidden={activeSection !== "ask"}
              className="ask-page panel-enter"
            >
              <AgentPanel
                key={selectedHome?.id || "no-home"}
                selectedHome={selectedHome}
                askLocked={!askUnlocked}
                askLockReason={askLockReason}
                agentRuns={agentRuns}
                onRecordsChanged={() =>
                  refreshHomeDashboard(
                    selectedHome.id
                  )
                }
                onNavigateTab={navigateToTab}
              />
              <AdviceHistoryPanel
                runs={agentRuns}
                isLoading={isLoadingAgentRuns}
                error={agentRunsError}
              />
            </div>

            {activeSection === "ask"
              ? null
              : renderActiveSection()}
          </>
        ) : (
          renderHomesManager()
        )}
      </div>
    </main>
  );
}

export default App;
