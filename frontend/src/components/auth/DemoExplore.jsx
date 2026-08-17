// frontend/src/components/auth/DemoExplore.jsx

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { API_BASE_URL } from "../../api.js";
import {
  formatCurrency,
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";

import AdviceHistoryPanel from "../agent/AdviceHistoryPanel.jsx";
import TimelinePanel from "../dashboard/TimelinePanel.jsx";
import DocumentsPanel from "../dashboard/DocumentsPanel.jsx";
import OverviewPage from "../dashboard/OverviewPage.jsx";
import YourHomesPanel from "../homes/YourHomesPanel.jsx";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import WorkspaceNav from "../layout/WorkspaceNav.jsx";
import ShareHomePanel from "../home-profile/ShareHomePanel.jsx";
import {
  HOME_TABS,
  PRIMARY_SECTIONS,
  RECORD_TABS,
  destinationFromTab,
  homeSubtitle,
} from "../../workspace/navigation.js";

function normalizeQuestion(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function sourceLabel(record) {
  if (!record) {
    return null;
  }

  const source =
    record.source_file_name ||
    record.source_document_type;

  if (!source) {
    return null;
  }

  if (record.evidence_page) {
    return `${source} · p. ${record.evidence_page}`;
  }

  return source;
}

function VerificationBadge({ value }) {
  if (!value) {
    return null;
  }

  return (
    <span className="record-type">
      {formatLabel(value)}
    </span>
  );
}

/**
 * Public read-only explorer for PUBLIC_DEMO_HOME_ID.
 *
 * Important cost boundary:
 * - one GET loads the complete sanitized demo snapshot;
 * - tabs, suggested questions, and answer replay are local state only;
 * - anonymous visitors never call the OpenAI-backed /ask route.
 */
export default function DemoExplore({
  onBack,
  loginWithRedirect,
}) {
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("issues");
  const [activeSection, setActiveSection] = useState("overview");
  const [homeTab, setHomeTab] = useState("profile");
  const [question, setQuestion] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [askMessage, setAskMessage] = useState("");
  const [highlightRecord, setHighlightRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/demo/home`
        );

        if (!response.ok) {
          const body = await response
            .json()
            .catch(() => ({}));

          throw new Error(
            body.error ||
              "Could not load demo home"
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setDemo(data);

          const firstRun =
            data.agentRuns?.[0];

          if (firstRun) {
            setQuestion(
              firstRun.user_question || ""
            );
            setSelectedRunId(firstRun.id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Demo unavailable"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const home = demo?.home;
  const profile = demo?.profile;
  const issues = demo?.issues || [];
  const projects = demo?.projects || [];
  const assets = demo?.assets || [];
  const memories = demo?.memories || [];
  const documents = demo?.documents || [];
  const needs = demo?.needs || [];
  const timeline = demo?.timeline || [];
  const agentRuns = demo?.agentRuns || [];
  const proposals = demo?.proposals || {
    memories: [],
    issues: [],
    projects: [],
    assets: [],
    total: 0,
  };

  const selectedRun = useMemo(
    () =>
      agentRuns.find(
        (run) => run.id === selectedRunId
      ) || null,
    [agentRuns, selectedRunId]
  );

  function selectSavedQuestion(run) {
    setQuestion(run.user_question || "");
    setSelectedRunId(run.id);
    setAskMessage("");
  }

  function handleDemoAsk(event) {
    event.preventDefault();

    const normalized =
      normalizeQuestion(question);

    if (!normalized) {
      setAskMessage(
        "Choose one of the saved demo questions."
      );
      return;
    }

    const exact = agentRuns.find(
      (run) =>
        normalizeQuestion(run.user_question) ===
        normalized
    );

    const close =
      exact ||
      agentRuns.find((run) => {
        const saved = normalizeQuestion(
          run.user_question
        );

        return (
          saved.includes(normalized) ||
          normalized.includes(saved)
        );
      });

    if (!close) {
      setSelectedRunId(null);
      setAskMessage(
        "The public demo only replays saved answers that were already generated from this home's documents. Choose a suggested question below."
      );
      return;
    }

    selectSavedQuestion(close);
  }

  function navigateTo(section, extras = {}) {
    setActiveSection(section);
    if (extras.tab) {
      setActiveTab(extras.tab);
    }
    if (extras.homeTab) {
      setHomeTab(extras.homeTab);
    }
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

    const nextTab = tabByKind[item.kind] || "issues";
    const destination = destinationFromTab(nextTab);
    setActiveSection(destination.section);
    setActiveTab(destination.tab);
    setHighlightRecord({
      kind: item.kind,
      id: item.id,
    });

    window.setTimeout(() => {
      document
        .getElementById(
          `demo-record-${nextTab}-${item.id}`
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 80);
  }

  function renderEvidence(record) {
    const source = sourceLabel(record);

    if (!source && !record?.evidence_passage) {
      return null;
    }

    return (
      <div className="record-detail">
        <strong>
          {source || "Document evidence"}
        </strong>
        {record.evidence_passage ? (
          <span className="evidence-quote">
            &ldquo;{record.evidence_passage}&rdquo;
          </span>
        ) : null}
      </div>
    );
  }

  function renderProfile() {
    return (
      <>
        <section className="panel-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                Property profile
              </p>
              <h3>Home details</h3>
            </div>
          </div>

          <div className="record-grid">
            <article className="record-card">
              <div className="record-card-header">
                <div>
                  <span className="record-type">
                    Property
                  </span>
                  <h4>
                    {home?.name ||
                      "HouseIQ Demo House"}
                  </h4>
                </div>
              </div>

              <div className="record-detail">
                <strong>Built</strong>
                <span>
                  {home?.year_built || "Unknown"}
                </span>
              </div>

              <div className="record-detail">
                <strong>Location</strong>
                <span>
                  {[
                    profile?.city,
                    profile?.state,
                    profile?.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Unknown"}
                </span>
              </div>

              {profile?.propertyType ? (
                <div className="record-detail">
                  <strong>Type</strong>
                  <span>
                    {formatLabel(
                      profile.propertyType
                    )}
                  </span>
                </div>
              ) : null}
            </article>

            <article className="record-card">
              <div className="record-card-header">
                <div>
                  <span className="record-type">
                    Structure
                  </span>
                  <h4>Physical facts</h4>
                </div>
              </div>

              {profile?.squareFeet ? (
                <div className="record-detail">
                  <strong>Square feet</strong>
                  <span>
                    {Number(
                      profile.squareFeet
                    ).toLocaleString()}
                  </span>
                </div>
              ) : null}

              {profile?.bedrooms != null ? (
                <div className="record-detail">
                  <strong>Bedrooms</strong>
                  <span>{profile.bedrooms}</span>
                </div>
              ) : null}

              {profile?.fullBathrooms != null ? (
                <div className="record-detail">
                  <strong>Full baths</strong>
                  <span>
                    {profile.fullBathrooms}
                  </span>
                </div>
              ) : null}

              {profile?.foundationType ? (
                <div className="record-detail">
                  <strong>Foundation</strong>
                  <span>
                    {formatLabel(
                      profile.foundationType
                    )}
                  </span>
                </div>
              ) : null}

              {profile?.roofMaterial ? (
                <div className="record-detail">
                  <strong>Roof</strong>
                  <span>
                    {formatLabel(
                      profile.roofMaterial
                    )}
                  </span>
                </div>
              ) : null}
            </article>
          </div>
        </section>

        <TimelinePanel events={timeline} />
      </>
    );
  }

  function renderIssues() {
    if (issues.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No document-backed issues yet</h4>
          <p>
            Issues extracted from uploaded demo documents
            will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {issues.map((issue) => (
          <article
            key={issue.id}
            id={`demo-record-issues-${issue.id}`}
            className={
              highlightRecord?.id === issue.id
                ? "record-card issue-card record-highlight"
                : "record-card issue-card"
            }
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    issue.category || "issue"
                  )}
                </span>
                <h4>{issue.title}</h4>
              </div>

              <span
                className={`priority-badge priority-${
                  issue.priority || "medium"
                }`}
              >
                {formatLabel(
                  issue.priority || "medium"
                )}
              </span>
            </div>

            <VerificationBadge
              value={issue.verification_status}
            />

            <p className="record-description">
              {issue.description}
            </p>

            {issue.suspected_cause ? (
              <div className="record-detail">
                <strong>Suspected cause</strong>
                <span>
                  {issue.suspected_cause}
                </span>
              </div>
            ) : null}

            {issue.recommended_next_step ? (
              <div className="record-detail">
                <strong>
                  Recommended next step
                </strong>
                <span>
                  {issue.recommended_next_step}
                </span>
              </div>
            ) : null}

            {renderEvidence(issue)}

            <div className="record-footer">
              <label className="status-select-field">
                <span>Status</span>
                <select
                  className={`status-select status-${
                    issue.status || "open"
                  }`}
                  value={issue.status || "open"}
                  disabled
                  readOnly
                >
                  <option value={issue.status || "open"}>
                    {formatLabel(
                      issue.status || "open"
                    )}
                  </option>
                </select>
              </label>
              <small>
                {formatDate(issue.created_at)}
              </small>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderProjects() {
    if (projects.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No document-backed projects yet</h4>
          <p>
            Repair and improvement projects extracted from
            documents will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {projects.map((project) => (
          <article
            key={project.id}
            id={`demo-record-projects-${project.id}`}
            className={
              highlightRecord?.id === project.id
                ? "record-card record-highlight"
                : "record-card"
            }
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  Project
                </span>
                <h4>{project.title}</h4>
              </div>
              <span
                className={`priority-badge priority-${
                  project.priority || "medium"
                }`}
              >
                {formatLabel(
                  project.priority || "medium"
                )}
              </span>
            </div>

            <VerificationBadge
              value={project.verification_status}
            />

            <p className="record-description">
              {project.description}
            </p>

            <div className="record-detail">
              <strong>Status</strong>
              <span>
                {formatLabel(
                  project.status || "planned"
                )}
              </span>
            </div>

            {project.estimated_cost_low != null ||
            project.estimated_cost_high != null ? (
              <div className="record-detail">
                <strong>Estimated cost</strong>
                <span>
                  {project.estimated_cost_low != null
                    ? formatCurrency(
                        project.estimated_cost_low
                      )
                    : "?"}
                  {" – "}
                  {project.estimated_cost_high != null
                    ? formatCurrency(
                        project.estimated_cost_high
                      )
                    : "?"}
                </span>
              </div>
            ) : null}

            {project.tasks?.length > 0 ? (
              <div className="record-detail">
                <strong>Tasks</strong>
                <ol className="timeline-list">
                  {project.tasks.map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      <div>
                        {formatLabel(
                          task.status || "todo"
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {renderEvidence(project)}
          </article>
        ))}
      </div>
    );
  }

  function renderAssets() {
    if (assets.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No document-backed assets yet</h4>
          <p>
            Equipment identified from inspections, invoices,
            warranties, and manuals will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {assets.map((asset) => (
          <article
            key={asset.id}
            id={`demo-record-assets-${asset.id}`}
            className={
              highlightRecord?.id === asset.id
                ? "record-card record-highlight"
                : "record-card"
            }
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    asset.asset_type || "asset"
                  )}
                </span>
                <h4>{asset.name}</h4>
              </div>
            </div>

            <VerificationBadge
              value={asset.verification_status}
            />

            {asset.brand || asset.model ? (
              <div className="record-detail">
                <strong>Equipment</strong>
                <span>
                  {[asset.brand, asset.model]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ) : null}

            {asset.location ? (
              <div className="record-detail">
                <strong>Location</strong>
                <span>{asset.location}</span>
              </div>
            ) : null}

            {asset.install_date ? (
              <div className="record-detail">
                <strong>Installed</strong>
                <span>
                  {formatDate(asset.install_date)}
                </span>
              </div>
            ) : null}

            {asset.warranty_expiration ? (
              <div className="record-detail">
                <strong>Warranty through</strong>
                <span>
                  {formatDate(
                    asset.warranty_expiration
                  )}
                </span>
              </div>
            ) : null}

            {asset.notes ? (
              <p className="record-description">
                {asset.notes}
              </p>
            ) : null}

            {renderEvidence(asset)}
          </article>
        ))}
      </div>
    );
  }

  function renderMemories() {
    if (memories.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No document-backed memories yet</h4>
          <p>
            Long-term facts retained from the demo documents
            will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {memories.map((memory) => (
          <article
            key={memory.id}
            id={`demo-record-memories-${memory.id}`}
            className="record-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    memory.category || "memory"
                  )}
                </span>
                <h4>{memory.title}</h4>
              </div>
            </div>

            <VerificationBadge
              value={memory.verification_status}
            />

            <p className="record-description">
              {memory.content}
            </p>

            {renderEvidence(memory)}
          </article>
        ))}
      </div>
    );
  }

  function renderRecordsTab() {
    switch (activeTab) {
      case "projects":
        return renderProjects();
      case "assets":
        return renderAssets();
      case "memories":
        return renderMemories();
      case "issues":
      default:
        return renderIssues();
    }
  }

  function renderHomeTab() {
    switch (homeTab) {
      case "passport":
        return (
          <p className="muted">
            The printable Home Passport is available after you
            log in. This public demo is read-only.
          </p>
        );
      case "sharing":
        return (
          <ShareHomePanel
            members={[]}
            isOwner={false}
            readOnly
          />
        );
      case "homes":
        return (
          <CollapsibleSection
            title="Your Homes — 1 property"
            defaultOpen
          >
            <YourHomesPanel
              homes={[home]}
              selectedHome={home}
              readOnly
              canCreate={false}
              canDelete={false}
            />
            <p className="muted">
              The public demo cannot create, switch, or delete
              homes.
            </p>
          </CollapsibleSection>
        );
      case "profile":
      default:
        return renderProfile();
    }
  }

  function renderAskPage() {
    return (
      <div className="workspace-page">
        <CollapsibleSection
          title="Ask HouseIQ — Replay a saved answer from this home"
          defaultOpen
          priority
        >
          <section className="agent-section">
            <p>
              These answers were generated previously against
              this demo home. Submitting here performs no
              network request and never calls OpenAI.
            </p>

            <form className="stack" onSubmit={handleDemoAsk}>
              <textarea
                id="houseiq-agent-textarea"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setAskMessage("");
                }}
                placeholder={
                  agentRuns.length > 0
                    ? "Choose a saved question below"
                    : "No saved demo answers yet"
                }
                disabled={agentRuns.length === 0}
              />
              <button
                type="submit"
                disabled={agentRuns.length === 0}
              >
                Ask HouseIQ
              </button>
            </form>

            {agentRuns.length > 0 ? (
              <div className="demo-cta-buttons">
                {agentRuns.slice(0, 6).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className="secondary-button"
                    onClick={() => selectSavedQuestion(run)}
                  >
                    {run.user_question}
                  </button>
                ))}
              </div>
            ) : (
              <p className="status-message">
                No saved answers exist for this home yet. Once
                the document set is uploaded, ask the curated
                demo questions while signed in; those real
                answers will automatically become replayable
                here.
              </p>
            )}

            {askMessage ? (
              <p className="status-message" role="status">
                {askMessage}
              </p>
            ) : null}

            {selectedRun ? (
              <div className="turn-response">
                <div className="turn-response-header">
                  <span className="turn-response-label">
                    HouseIQ
                  </span>
                  <span>
                    {formatLabel(
                      selectedRun.confidence || "medium"
                    )}{" "}
                    confidence
                  </span>
                </div>
                <div className="answer-box">
                  {selectedRun.answer}
                </div>
              </div>
            ) : null}
          </section>
        </CollapsibleSection>

        <CollapsibleSection
          title={
            agentRuns.length
              ? `Agent Run Inspector — ${agentRuns.length} run${
                  agentRuns.length === 1 ? "" : "s"
                }`
              : "Agent Run Inspector — no runs yet"
          }
          defaultOpen={false}
        >
          <AdviceHistoryPanel
            runs={agentRuns}
            isLoading={false}
            error=""
            hideHeader
          />
        </CollapsibleSection>
      </div>
    );
  }

  function renderSection() {
    switch (activeSection) {
      case "ask":
        return renderAskPage();

      case "documents":
        return (
          <div className="workspace-page">
            <CollapsibleSection
              title="Upload a Document — disabled in the public demo"
              defaultOpen={false}
            >
              <p>
                Anonymous visitors cannot add or change
                documents. The configured demo home currently
                contains <strong>{documents.length}</strong>{" "}
                uploaded document
                {documents.length === 1 ? "" : "s"}.
              </p>
            </CollapsibleSection>
            <DocumentsPanel
              documents={documents}
              canDelete={false}
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
              ariaLabel="Demo home records"
              variant="sub"
              counts={{
                issues: issues.length,
                projects: projects.length,
                assets: assets.length,
                memories: memories.length,
              }}
            />
            <div key={activeTab} className="tab-content">
              {renderRecordsTab()}
            </div>
          </div>
        );

      case "history":
        return (
          <CollapsibleSection
            title={
              timeline.length
                ? `Home Timeline — ${timeline.length} recorded event${
                    timeline.length === 1 ? "" : "s"
                  }`
                : "Home Timeline — no events yet"
            }
            defaultOpen
          >
            <TimelinePanel events={timeline} />
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
            needsItems={needs}
            onSelectNeed={handleSelectNeed}
            timelineEvents={timeline}
            proposals={proposals}
            proposalsReadOnly
            showUploadAction={false}
            onNavigate={(section) => navigateTo(section)}
          />
        );
    }
  }

  if (loading) {
    return (
      <main className="auth-page auth-page--landing">
        <section className="auth-card">
          <p>Loading document-backed demo…</p>
        </section>
      </main>
    );
  }

  if (error || !demo || !home) {
    return (
      <main className="auth-page auth-page--landing">
        <section className="auth-card">
          <h1>Demo unavailable</h1>
          <p className="error-message">
            {error ||
              "The demo home could not be loaded."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
          >
            Back
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell demo-explore-page">
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
          <div className="user-details">
            <strong>Read-only demo</strong>
            <span>
              Real document-derived home data
            </span>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
          >
            Back
          </button>

          {typeof loginWithRedirect === "function" ? (
            <button
              type="button"
              onClick={() => loginWithRedirect()}
            >
              Log in
            </button>
          ) : null}
        </div>
      </header>

      <div className="workspace-chrome">
        <header className="workspace-home-banner">
          <div>
            <h1>{home.name}</h1>
            <p className="workspace-home-meta">
              {homeSubtitle(home, profile) ||
                home.notes ||
                "Document-backed demo"}
            </p>
            <span className="onboarding-badge onboarding-completed">
              Read-only demo
            </span>
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
          </div>
        </header>

        <WorkspaceNav
          items={PRIMARY_SECTIONS}
          value={activeSection}
          onChange={(section) => navigateTo(section)}
          ariaLabel="HouseIQ sections"
        />
      </div>

      <div className="workspace">
        <div className="workspace-inner">
          {renderSection()}
        </div>
      </div>
    </main>
  );
}
