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
  formatYear,
  homeSubtitle,
} from "../../utils/formatters.js";

import AdviceHistoryPanel from "../agent/AdviceHistoryPanel.jsx";
import DocumentsPanel from "../dashboard/DocumentsPanel.jsx";
import OverviewPanel from "../dashboard/OverviewPanel.jsx";
import TimelinePanel from "../dashboard/TimelinePanel.jsx";
import HomesManager from "../home-profile/HomesManager.jsx";
import PrimaryNav from "../layout/PrimaryNav.jsx";
import SubNav from "../layout/SubNav.jsx";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import {
  HOME_SUBTABS,
  RECORD_TABS,
  locationForLegacyTab,
} from "../../navigation.js";

function normalizeQuestion(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function overlapScore(query, text) {
  const tokens = normalizeQuestion(query)
    .split(" ")
    .filter((token) => token.length > 3);
  const haystack = new Set(
    normalizeQuestion(text)
      .split(" ")
      .filter((token) => token.length > 3)
  );

  let hits = 0;

  for (const token of tokens) {
    if (haystack.has(token)) {
      hits += 1;
    }
  }

  return hits;
}

function matchDemoRun(query, runs, lastTurn) {
  const normalized = normalizeQuestion(query);

  if (!normalized) {
    return null;
  }

  const exact = runs.find(
    (run) =>
      normalizeQuestion(run.user_question) === normalized
  );

  if (exact) {
    return exact;
  }

  const close = runs.find((run) => {
    const saved = normalizeQuestion(run.user_question);

    return (
      saved.includes(normalized) ||
      normalized.includes(saved)
    );
  });

  if (close) {
    return close;
  }

  if (!lastTurn) {
    return null;
  }

  const contextQuery = `${lastTurn.question} ${lastTurn.answer} ${query}`;
  let best = null;
  let bestScore = 1;

  for (const run of runs) {
    if (run.id === lastTurn.id) {
      continue;
    }

    const score = overlapScore(
      contextQuery,
      `${run.user_question} ${run.answer}`
    );

    if (score > bestScore) {
      best = run;
      bestScore = score;
    }
  }

  return best;
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
  const [activeSection, setActiveSection] =
    useState("overview");
  const [activeTab, setActiveTab] = useState("issues");
  const [homeSubTab, setHomeSubTab] = useState("profile");
  const [question, setQuestion] = useState("");
  const [demoTurns, setDemoTurns] = useState([]);
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
  const documents = useMemo(
    () => demo?.documents || [],
    [demo?.documents]
  );
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

  const documentTypeSummary = useMemo(() => {
    const counts = new Map();

    for (const document of documents) {
      const key =
        document.document_type || "general";

      counts.set(
        key,
        (counts.get(key) || 0) + 1
      );
    }

    return [...counts.entries()]
      .map(
        ([type, count]) =>
          `${count} ${formatLabel(type)}`
      )
      .join(" · ");
  }, [documents]);

  function appendDemoTurn(run) {
    setDemoTurns((previous) => {
      if (previous.some((turn) => turn.id === run.id)) {
        return previous;
      }

      return [
        ...previous,
        {
          id: run.id,
          question: run.user_question || "",
          answer: run.answer,
          confidence: run.confidence,
          citations: run.citations || [],
        },
      ];
    });
    setQuestion("");
    setAskMessage("");
  }

  function selectSavedQuestion(run) {
    appendDemoTurn(run);
  }

  function handleDemoAsk(event) {
    event.preventDefault();

    const lastTurn = demoTurns[demoTurns.length - 1];
    const match = matchDemoRun(
      question,
      agentRuns,
      lastTurn
    );

    if (!normalizeQuestion(question)) {
      setAskMessage(
        "Ask a follow-up, or choose one of the saved demo questions."
      );
      return;
    }

    if (!match) {
      setAskMessage(
        lastTurn
          ? "This public demo only replays saved answers. Try asking about the answer above using one of the suggested questions, or log in for a live conversation."
          : "The public demo only replays saved answers that were already generated from this home's documents. Choose a suggested question below."
      );
      return;
    }

    appendDemoTurn(match);
  }

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

    if (options.focus) {
      window.setTimeout(() => {
        document
          .getElementById("houseiq-agent-textarea")
          ?.focus({ preventScroll: true });
      }, 80);
    }
  }

  function handleSelectNeed(item) {
    const tabByKind = {
      issue: "issues",
      project: "projects",
      lifecycle: "assets",
      asset: "assets",
    };

    const nextTab =
      tabByKind[item.kind] || "issues";

    navigateToTab(nextTab);
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
      <div className="record-stack">
        {issues.map((issue) => (
          <CollapsibleSection
            key={issue.id}
            id={`demo-record-issues-${issue.id}`}
            variant="row"
            title={issue.title}
            summary={`${formatLabel(issue.priority || "medium")} priority · ${formatLabel(issue.status || "open")}`}
            defaultOpen={highlightRecord?.id === issue.id}
          >

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
          </CollapsibleSection>
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
      <div className="record-stack">
        {projects.map((project) => (
          <CollapsibleSection
            key={project.id}
            id={`demo-record-projects-${project.id}`}
            variant="row"
            title={project.title}
            summary={formatLabel(project.status || "planned")}
            defaultOpen={highlightRecord?.id === project.id}
          >

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
          </CollapsibleSection>
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
      <div className="record-stack">
        {assets.map((asset) => (
          <CollapsibleSection
            key={asset.id}
            id={`demo-record-assets-${asset.id}`}
            variant="row"
            title={asset.name}
            summary={[
              asset.brand,
              formatYear(asset.install_date)
                ? `installed ${formatYear(asset.install_date)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || formatLabel(asset.asset_type || "asset")}
            defaultOpen={highlightRecord?.id === asset.id}
          >

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
          </CollapsibleSection>
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
      <div className="record-stack">
        {memories.map((memory) => (
          <CollapsibleSection
            key={memory.id}
            id={`demo-record-memories-${memory.id}`}
            variant="row"
            title={memory.title}
            summary={formatLabel(memory.category || "memory")}
          >

            <VerificationBadge
              value={memory.verification_status}
            />

            <p className="record-description">
              {memory.content}
            </p>

            {renderEvidence(memory)}
          </CollapsibleSection>
        ))}
      </div>
    );
  }

  function renderDocuments() {
    return (
      <DocumentsPanel
        documents={documents}
        canEdit={false}
      />
    );
  }

  function renderAsk() {
    const remainingDemoRuns = agentRuns.filter(
      (run) =>
        !demoTurns.some((turn) => turn.id === run.id)
    );

    return (
      <div className="ask-page">
        <CollapsibleSection
          title="Ask HouseIQ"
          summary="Ask about repairs, systems, or documents"
          defaultOpen
          openOnMobile
        >
          <p>
            These answers were generated previously against
            this demo home. You can ask a suggested question,
            then follow up using other saved answers. This
            replay never calls OpenAI.
          </p>

          {demoTurns.length > 0 ? (
            <div className="agent-chat-toolbar">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setDemoTurns([]);
                  setQuestion("");
                  setAskMessage("");
                }}
              >
                New chat
              </button>
            </div>
          ) : (
            <p className="agent-conversation-intro">
              Start with a suggested question, then ask
              about that answer.
            </p>
          )}

          {agentRuns.length > 0 && demoTurns.length === 0 ? (
            <div className="suggested-questions">
              <h4>Suggested questions</h4>
              <div className="demo-cta-buttons">
                {agentRuns
                  .slice(0, 6)
                  .map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        selectSavedQuestion(run)
                      }
                    >
                      {run.user_question}
                    </button>
                  ))}
              </div>
            </div>
          ) : agentRuns.length === 0 ? (
            <p className="status-message">
              No saved answers exist for this home yet. Once
              the document set is uploaded, ask the curated
              demo questions while signed in; those real
              answers will automatically become replayable
              here.
            </p>
          ) : null}

          {demoTurns.length > 0 ? (
            <div className="turn-list">
              {demoTurns.map((turn) => (
                <div
                  key={turn.id}
                  className="turn-item"
                >
                  <div className="turn-question">
                    <span className="turn-question-label">
                      You
                    </span>
                    <p>{turn.question}</p>
                  </div>
                  <div className="turn-response">
                    <div className="turn-response-header">
                      <span className="turn-response-label">
                        HouseIQ
                      </span>
                      <span>
                        {formatLabel(
                          turn.confidence || "medium"
                        )} confidence
                      </span>
                    </div>
                    <div className="answer-box">
                      {turn.answer}
                    </div>
                    {turn.citations?.length > 0 ? (
                      <section className="clarifying-section">
                        <h4>Sources / Evidence</h4>
                        <ul className="timeline-list">
                          {turn.citations.map(
                            (citation) => (
                              <li
                                key={
                                  citation.id ||
                                  citation.title
                                }
                              >
                                <strong>
                                  {citation.title ||
                                    "Source"}
                                </strong>
                                {citation.passage ? (
                                  <p className="evidence-quote">
                                    &ldquo;{citation.passage}&rdquo;
                                  </p>
                                ) : null}
                              </li>
                            )
                          )}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {remainingDemoRuns.length > 0 &&
          demoTurns.length > 0 ? (
            <div className="suggested-questions">
              <h4>Ask another saved question</h4>
              <div className="demo-cta-buttons">
                {remainingDemoRuns
                  .slice(0, 4)
                  .map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        selectSavedQuestion(run)
                      }
                    >
                      {run.user_question}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {askMessage ? (
            <p
              className="status-message"
              role="status"
            >
              {askMessage}
            </p>
          ) : null}

          <form
            className={
              demoTurns.length > 0
                ? "agent-form agent-form-follow-up"
                : "stack"
            }
            onSubmit={handleDemoAsk}
          >
            <textarea
              id="houseiq-agent-textarea"
              value={question}
              onChange={(event) => {
                setQuestion(
                  event.target.value
                );
                setAskMessage("");
              }}
              placeholder={
                agentRuns.length === 0
                  ? "No saved demo answers yet"
                  : demoTurns.length > 0
                    ? "Ask a follow-up about that answer…"
                    : "Ask a question about your home..."
              }
              disabled={agentRuns.length === 0}
            />

            <button
              type="submit"
              disabled={agentRuns.length === 0}
            >
              {demoTurns.length > 0
                ? "Send"
                : "Ask HouseIQ"}
            </button>
          </form>
        </CollapsibleSection>

        <AdviceHistoryPanel
          runs={agentRuns}
          isLoading={false}
          error=""
        />
      </div>
    );
  }

  function renderPassport() {
    return (
      <section className="panel-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Shareable snapshot</p>
            <h3>Home Passport</h3>
          </div>
        </div>
        <p>
          The public demo shows the same Home layout, but
          generating and printing a Passport requires a
          signed-in account.
        </p>
        {renderProfile()}
      </section>
    );
  }

  function renderSharing() {
    return (
      <section className="panel-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Household</p>
            <h3>Sharing</h3>
          </div>
        </div>
        <p>
          Owners, household members, permissions, and
          invitations are disabled in the public demo.
          Log in to share this home.
        </p>
      </section>
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

  function renderActiveSection() {
    switch (activeSection) {
      case "ask":
        return renderAsk();

      case "documents":
        return (
          <div className="documents-section">
            <CollapsibleSection
              title="Upload a Document"
              summary="Disabled in the public demo"
              defaultOpen
              openOnMobile
            >
              <p>
                This demo home currently contains
                <strong> {documents.length} </strong>
                uploaded document
                {documents.length === 1 ? "" : "s"}.
                Anonymous visitors cannot add or change them.
              </p>
              {documentTypeSummary ? (
                <p className="muted">
                  {documentTypeSummary}
                </p>
              ) : null}
            </CollapsibleSection>
            {renderDocuments()}
          </div>
        );

      case "records":
        return (
          <section className="dashboard-section">
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
              idPrefix="demo-tab"
              panelId="demo-dashboard-tabpanel"
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

            <div
              key={activeTab}
              id="demo-dashboard-tabpanel"
              role="tabpanel"
              aria-labelledby={`demo-tab-${activeTab}`}
              className="tab-content"
            >
              {renderRecordsTab()}
            </div>
          </section>
        );

      case "history":
        return (
          <TimelinePanel
            events={timeline}
            documents={documents}
          />
        );

      case "home":
        return (
          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">This property</p>
                <h3>Home</h3>
              </div>
            </div>

            <SubNav
              label="Home settings"
              idPrefix="demo-home-tab"
              panelId="demo-home-tabpanel"
              activeId={homeSubTab}
              onSelect={setHomeSubTab}
              items={HOME_SUBTABS}
            />

            <div
              key={homeSubTab}
              id="demo-home-tabpanel"
              role="tabpanel"
              aria-labelledby={`demo-home-tab-${homeSubTab}`}
              className="tab-content"
            >
              {homeSubTab === "passport"
                ? renderPassport()
                : homeSubTab === "sharing"
                  ? renderSharing()
                  : homeSubTab === "homes"
                    ? (
                      <HomesManager
                        homes={[home]}
                        selectedHome={home}
                        readOnly
                        profile={profile}
                      />
                    )
                    : renderProfile()}
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
            needsItems={needs}
            onSelectNeed={handleSelectNeed}
            recentEvents={timeline.slice(0, 6)}
            proposalsTotal={proposals.total || 0}
            onNavigate={navigateToSection}
            readOnly
            proposalsSlot={
              proposals.total > 0 ? (
                <p className="muted">
                  Proposals are visible here but cannot be
                  accepted from the public demo.
                </p>
              ) : null
            }
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

      <div className="workspace">
        <header className="workspace-homebar">
          <div>
            <h1>{home.name}</h1>
            {homeSubtitle(home, profile) ? (
              <p>{homeSubtitle(home, profile)}</p>
            ) : null}
            <span className="onboarding-badge onboarding-completed">
              Document-backed demo
            </span>
          </div>

          <div className="workspace-homebar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setActiveSection("home");
                setHomeSubTab("homes");
              }}
            >
              Switch home
            </button>
          </div>
        </header>

        <p className="workspace-note">
          This public demo uses the same workspace as the
          signed-in app. Upload, editing, and live Ask are
          disabled.
        </p>

        <PrimaryNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          idPrefix="demo-page"
        />

        {renderActiveSection()}
      </div>
    </main>
  );
}
