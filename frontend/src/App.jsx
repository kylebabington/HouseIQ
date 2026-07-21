// frontend/src/App.jsx

import { useEffect, useState } from "react";
import axios from "axios";
import "./index.css";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------
//
// Your Express backend runs locally on port 5000.
//
const API_URL = "http://localhost:5000/api";


// ---------------------------------------------------------
// SMALL DISPLAY HELPERS
// ---------------------------------------------------------

/**
 * Converts database-style text into friendly display text.
 *
 * Examples:
 *
 * "water_intrusion" becomes "Water Intrusion"
 * "home_appliance" becomes "Home Appliance"
 */
function formatLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}


/**
 * Safely formats a database date.
 */
function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString();
}


/**
 * Formats a cost as US currency.
 *
 * Examples:
 *
 * 250 becomes "$250"
 * null becomes "Not estimated"
 */
function formatCurrency(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not estimated";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "Not estimated";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}


// ---------------------------------------------------------
// MAIN APP COMPONENT
// ---------------------------------------------------------

function App() {
  // -----------------------------------------------------
  // HOME STATE
  // -----------------------------------------------------

  // Every home returned by GET /api/homes
  const [homes, setHomes] = useState([]);

  // The home currently being viewed
  const [selectedHome, setSelectedHome] =
    useState(null);

  // Form for creating a home
  const [homeForm, setHomeForm] = useState({
    name: "",
    yearBuilt: "",
    notes: "",
  });


  // -----------------------------------------------------
  // DASHBOARD DATA
  // -----------------------------------------------------

  const [issues, setIssues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [memories, setMemories] = useState([]);


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
  // HOUSEIQ AGENT STATE
  // -----------------------------------------------------

  // The natural-language message entered by the user.
  const [question, setQuestion] = useState("");

  // The complete structured response from /ask.
  //
  // This replaces the old:
  //
  // const [answer, setAnswer] = useState("");
  //
  const [
    agentResponse,
    setAgentResponse,
  ] = useState(null);

  const [isAsking, setIsAsking] =
    useState(false);

  const [askError, setAskError] =
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
  // LOAD HOMES ON FIRST RENDER
  // -----------------------------------------------------

  useEffect(() => {
    fetchHomes();
  }, []);


  // -----------------------------------------------------
  // REFRESH DASHBOARD WHEN HOME CHANGES
  // -----------------------------------------------------

  useEffect(() => {
    if (!selectedHome) {
      return;
    }

    // Clear the previous home's AI response.
    setAgentResponse(null);
    setAskError("");

    // Show the Issues tab first for every new home.
    setActiveTab("issues");

    refreshHomeDashboard(selectedHome.id);
  }, [selectedHome]);


  // -----------------------------------------------------
  // FETCH HOMES
  // -----------------------------------------------------

  async function fetchHomes() {
    try {
      const response = await axios.get(
        `${API_URL}/homes`
      );

      setHomes(response.data);

      // Automatically select the newest home.
      if (
        response.data.length > 0 &&
        !selectedHome
      ) {
        setSelectedHome(response.data[0]);
      }
    } catch (error) {
      console.error(
        "Error fetching homes:",
        error
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

      // Promise.all sends all four requests at the same time.
      //
      // This is faster than awaiting each request one by one.
      const [
        issuesResponse,
        projectsResponse,
        assetsResponse,
        memoriesResponse,
      ] = await Promise.all([
        axios.get(
          `${API_URL}/homes/${homeId}/issues`
        ),

        axios.get(
          `${API_URL}/homes/${homeId}/projects`
        ),

        axios.get(
          `${API_URL}/homes/${homeId}/assets`
        ),

        axios.get(
          `${API_URL}/homes/${homeId}/memories`
        ),
      ]);

      setIssues(issuesResponse.data);
      setProjects(projectsResponse.data);
      setAssets(assetsResponse.data);
      setMemories(memoriesResponse.data);
    } catch (error) {
      console.error(
        "Error refreshing dashboard:",
        error
      );

      setDashboardError(
        error.response?.data?.error ||
        "Could not load the home dashboard."
      );
    } finally {
      setIsLoadingDashboard(false);
    }
  }


  // -----------------------------------------------------
  // CREATE A HOME
  // -----------------------------------------------------

  async function createHome(event) {
    event.preventDefault();

    if (!homeForm.name.trim()) {
      alert("Enter a name for the home.");
      return;
    }

    try {
      const response = await axios.post(
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

      setSelectedHome(newHome);

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

      alert(
        error.response?.data?.error ||
        "Could not create the home."
      );
    }
  }


  // -----------------------------------------------------
  // ASK HOUSEIQ
  // -----------------------------------------------------

  async function askHouseIQ(event) {
    event.preventDefault();

    if (!selectedHome) {
      alert(
        "Create or select a home first."
      );
      return;
    }

    if (!question.trim()) {
      alert(
        "Tell HouseIQ something or ask a question."
      );
      return;
    }

    try {
      setIsAsking(true);
      setAskError("");
      setAgentResponse(null);

      const response = await axios.post(
        `${API_URL}/homes/${selectedHome.id}/ask`,
        {
          question: question.trim(),
        }
      );

      // Save the complete response instead of only the answer.
      setAgentResponse(response.data);

      // Clear the input after a successful request.
      setQuestion("");

      // The agent may have created issues, projects,
      // assets, or memories.
      //
      // Refresh all dashboard data so those records appear.
      await refreshHomeDashboard(
        selectedHome.id
      );
    } catch (error) {
      console.error(
        "Error asking HouseIQ:",
        error
      );

      setAskError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        "HouseIQ could not process that request."
      );
    } finally {
      setIsAsking(false);
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
      await axios.post(
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
  // RENDER ISSUE CARDS
  // -----------------------------------------------------

  function renderIssues() {
    if (issues.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No issues recorded</h4>

          <p>
            Tell HouseIQ about a leak,
            malfunction, odor, recurring
            problem, or safety concern.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {issues.map((issue) => (
          <article
            key={issue.id}
            className="record-card issue-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    issue.category
                  )}
                </span>

                <h4>{issue.title}</h4>
              </div>

              <span
                className={`priority-badge priority-${issue.priority}`}
              >
                {formatLabel(
                  issue.priority
                )}
              </span>
            </div>

            <p className="record-description">
              {issue.description}
            </p>

            {issue.suspected_cause && (
              <div className="record-detail">
                <strong>
                  Suspected cause
                </strong>

                <span>
                  {
                    issue.suspected_cause
                  }
                </span>
              </div>
            )}

            {issue.recommended_next_step && (
              <div className="record-detail">
                <strong>
                  Recommended next
                  step
                </strong>

                <span>
                  {
                    issue.recommended_next_step
                  }
                </span>
              </div>
            )}

            <div className="record-footer">
              <span
                className={`status-badge status-${issue.status}`}
              >
                {formatLabel(
                  issue.status
                )}
              </span>

              <small>
                {formatDate(
                  issue.created_at
                )}
              </small>
            </div>
          </article>
        ))}
      </div>
    );
  }


  // -----------------------------------------------------
  // RENDER PROJECT CARDS
  // -----------------------------------------------------

  function renderProjects() {
    if (projects.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No projects planned</h4>

          <p>
            Multi-step repairs and
            maintenance plans created by
            HouseIQ will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {projects.map((project) => (
          <article
            key={project.id}
            className="record-card project-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  Project
                </span>

                <h4>
                  {project.title}
                </h4>
              </div>

              <span
                className={`priority-badge priority-${project.priority}`}
              >
                {formatLabel(
                  project.priority
                )}
              </span>
            </div>

            {project.description && (
              <p className="record-description">
                {
                  project.description
                }
              </p>
            )}

            <div className="project-stats">
              <div>
                <span>
                  Estimated range
                </span>

                <strong>
                  {formatCurrency(
                    project.estimated_cost_low
                  )}
                  {" – "}
                  {formatCurrency(
                    project.estimated_cost_high
                  )}
                </strong>
              </div>

              <div>
                <span>
                  DIY difficulty
                </span>

                <strong>
                  {formatLabel(
                    project.diy_difficulty
                  )}
                </strong>
              </div>
            </div>

            {project.safety_notes && (
              <div className="safety-note">
                <strong>
                  Safety note
                </strong>

                <p>
                  {
                    project.safety_notes
                  }
                </p>
              </div>
            )}

            {project.tasks?.length >
              0 && (
                <div className="task-list">
                  <h5>
                    Project tasks
                  </h5>

                  <ol>
                    {project.tasks.map(
                      (task) => (
                        <li
                          key={
                            task.id
                          }
                        >
                          <span>
                            {
                              task.title
                            }
                          </span>

                          <small>
                            {formatLabel(
                              task.status
                            )}
                          </small>
                        </li>
                      )
                    )}
                  </ol>
                </div>
              )}

            <div className="record-footer">
              <span
                className={`status-badge status-${project.status}`}
              >
                {formatLabel(
                  project.status
                )}
              </span>

              <small>
                {formatDate(
                  project.created_at
                )}
              </small>
            </div>
          </article>
        ))}
      </div>
    );
  }


  // -----------------------------------------------------
  // RENDER ASSET CARDS
  // -----------------------------------------------------

  function renderAssets() {
    if (assets.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No assets recorded</h4>

          <p>
            Tell HouseIQ about appliances,
            HVAC equipment, tools, water
            heaters, electrical panels, or
            other equipment.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="record-card asset-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    asset.asset_type
                  )}
                </span>

                <h4>{asset.name}</h4>
              </div>
            </div>

            <div className="asset-details">
              {asset.brand && (
                <div>
                  <span>Brand</span>
                  <strong>
                    {asset.brand}
                  </strong>
                </div>
              )}

              {asset.model && (
                <div>
                  <span>Model</span>
                  <strong>
                    {asset.model}
                  </strong>
                </div>
              )}

              {asset.serial_number && (
                <div>
                  <span>
                    Serial number
                  </span>

                  <strong>
                    {
                      asset.serial_number
                    }
                  </strong>
                </div>
              )}

              {asset.location && (
                <div>
                  <span>
                    Location
                  </span>

                  <strong>
                    {asset.location}
                  </strong>
                </div>
              )}
            </div>

            {asset.notes && (
              <p className="record-description">
                {asset.notes}
              </p>
            )}

            <div className="record-footer">
              <small>
                Added{" "}
                {formatDate(
                  asset.created_at
                )}
              </small>
            </div>
          </article>
        ))}
      </div>
    );
  }


  // -----------------------------------------------------
  // RENDER MEMORY CARDS
  // -----------------------------------------------------

  function renderMemories() {
    if (memories.length === 0) {
      return (
        <div className="empty-state dashboard-empty">
          <h4>No memories yet</h4>

          <p>
            HouseIQ will save repairs,
            maintenance history, home facts,
            and useful observations here.
          </p>
        </div>
      );
    }

    return (
      <div className="record-grid">
        {memories.map((memory) => (
          <article
            key={memory.id}
            className="record-card memory-card"
          >
            <div className="record-card-header">
              <div>
                <span className="record-type">
                  {formatLabel(
                    memory.category
                  )}
                </span>

                <h4>
                  {memory.title}
                </h4>
              </div>

              <span className="importance-badge">
                Importance{" "}
                {memory.importance}
              </span>
            </div>

            <p className="record-description">
              {memory.content}
            </p>

            <div className="record-footer">
              <small>
                Remembered{" "}
                {formatDate(
                  memory.created_at
                )}
              </small>
            </div>
          </article>
        ))}
      </div>
    );
  }


  // -----------------------------------------------------
  // CHOOSE WHICH TAB CONTENT TO DISPLAY
  // -----------------------------------------------------

  function renderActiveTab() {
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


  // -----------------------------------------------------
  // PAGE
  // -----------------------------------------------------

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">
          Agentic home memory
        </p>

        <h1>HouseIQ</h1>

        <p className="hero-text">
          Your home remembers everything.
          HouseIQ makes sure you do too.
        </p>
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
                  setSelectedHome(
                    home
                  )
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
                  onClick={() =>
                    refreshHomeDashboard(
                      selectedHome.id
                    )
                  }
                  disabled={
                    isLoadingDashboard
                  }
                >
                  {isLoadingDashboard
                    ? "Refreshing..."
                    : "Refresh Records"}
                </button>
              </header>


              {/* -------------------------------- */}
              {/* HOUSEIQ CONVERSATION             */}
              {/* -------------------------------- */}

              <section className="agent-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      Talk naturally
                    </p>

                    <h3>
                      Tell HouseIQ
                      what is happening
                    </h3>
                  </div>

                  <span className="agent-status">
                    Memory agent
                    active
                  </span>
                </div>

                <form
                  onSubmit={
                    askHouseIQ
                  }
                  className="agent-form"
                >
                  <textarea
                    value={question}
                    onChange={(
                      event
                    ) =>
                      setQuestion(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Example: The west bedroom window leaked again during last night's storm. I already sealed the outside trim with silicone. What should I do next?"
                  />

                  <button
                    type="submit"
                    disabled={
                      isAsking
                    }
                  >
                    {isAsking
                      ? "HouseIQ is thinking..."
                      : "Send to HouseIQ"}
                  </button>
                </form>

                {askError && (
                  <div className="error-message">
                    <strong>
                      HouseIQ
                      encountered a
                      problem
                    </strong>

                    <p>
                      {askError}
                    </p>
                  </div>
                )}


                {/* ---------------------------- */}
                {/* STRUCTURED AGENT RESPONSE    */}
                {/* ---------------------------- */}

                {agentResponse && (
                  <div className="agent-response">
                    <div className="agent-response-header">
                      <div>
                        <p className="eyebrow">
                          HouseIQ
                          response
                        </p>

                        <h3>
                          Recommended
                          next step
                        </h3>
                      </div>

                      <span
                        className={`confidence-badge confidence-${agentResponse.confidence}`}
                      >
                        {formatLabel(
                          agentResponse.confidence
                        )}{" "}
                        confidence
                      </span>
                    </div>

                    <div className="answer-box">
                      {
                        agentResponse.answer
                      }
                    </div>

                    {agentResponse
                      .needsMoreInfo &&
                      agentResponse
                        .clarifyingQuestions
                        ?.length >
                      0 && (
                        <section className="clarifying-section">
                          <h4>
                            Questions
                            HouseIQ
                            needs
                            answered
                          </h4>

                          <ol>
                            {agentResponse.clarifyingQuestions.map(
                              (
                                item,
                                index
                              ) => (
                                <li
                                  key={`${item}-${index}`}
                                >
                                  {
                                    item
                                  }
                                </li>
                              )
                            )}
                          </ol>
                        </section>
                      )}

                    <section className="actions-section">
                      <h4>
                        What
                        HouseIQ
                        updated
                      </h4>

                      {agentResponse
                        .actionsTaken
                        ?.length >
                        0 ? (
                        <div className="action-list">
                          {agentResponse.actionsTaken.map(
                            (
                              action,
                              index
                            ) => (
                              <div
                                key={`${action.recordId}-${index}`}
                                className="action-item"
                              >
                                <span className="action-icon">
                                  ✓
                                </span>

                                <div>
                                  <strong>
                                    {formatLabel(
                                      action.type
                                    )}
                                  </strong>

                                  <p>
                                    {
                                      action.title
                                    }
                                  </p>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="empty-state">
                          HouseIQ
                          answered
                          without
                          creating
                          any new
                          records.
                        </p>
                      )}
                    </section>
                  </div>
                )}
              </section>


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
                      {
                        issues.length
                      }
                    </strong>

                    <span>
                      Issues
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        projects.length
                      }
                    </strong>

                    <span>
                      Projects
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        assets.length
                      }
                    </strong>

                    <span>
                      Assets
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        memories.length
                      }
                    </strong>

                    <span>
                      Memories
                    </span>
                  </div>
                </div>

                <nav
                  className="tab-list"
                  aria-label="Home records"
                >
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

              <details className="manual-panel">
                <summary>
                  Manual memory entry
                  for testing
                </summary>

                <form
                  onSubmit={
                    createMemory
                  }
                  className="stack manual-memory-form"
                >
                  <p>
                    This form is
                    useful while
                    developing, but
                    normal users
                    should primarily
                    talk to HouseIQ.
                  </p>

                  <input
                    value={
                      memoryForm.title
                    }
                    onChange={(
                      event
                    ) =>
                      setMemoryForm(
                        {
                          ...memoryForm,
                          title: event
                            .target
                            .value,
                        }
                      )
                    }
                    placeholder="Memory title"
                  />

                  <select
                    value={
                      memoryForm.category
                    }
                    onChange={(
                      event
                    ) =>
                      setMemoryForm(
                        {
                          ...memoryForm,
                          category:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  >
                    <option value="general">
                      General
                    </option>

                    <option value="repair">
                      Repair
                    </option>

                    <option value="maintenance">
                      Maintenance
                    </option>

                    <option value="appliance">
                      Appliance
                    </option>

                    <option value="exterior">
                      Exterior
                    </option>

                    <option value="landscaping">
                      Landscaping
                    </option>

                    <option value="inspection">
                      Inspection
                    </option>
                  </select>

                  <textarea
                    value={
                      memoryForm.content
                    }
                    onChange={(
                      event
                    ) =>
                      setMemoryForm(
                        {
                          ...memoryForm,
                          content:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    placeholder="What should HouseIQ remember?"
                  />

                  <button type="submit">
                    Save Test
                    Memory
                  </button>
                </form>
              </details>
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