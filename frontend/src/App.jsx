// frontend/src/App.jsx

import { useEffect, useState } from "react";
import axios from "axios";
import "./index.css";

// This is the backend URL.
// Your Express server is running on port 5000.
const API_URL = "http://localhost:5000/api";

function App() {
  // Stores all homes from the database
  const [homes, setHomes] = useState([]);

  // Stores the currently selected home
  const [selectedHome, setSelectedHome] = useState(null);

  // Stores memories for the selected home
  const [memories, setMemories] = useState([]);

  // Stores issues the AI creates or tracks
  const [issues, setIssues] = useState([]);

  // Stores bigger repair or maintenance projects
  const [projects, setProjects] = useState([]);

  // Stores appliances, tools, HVAC systems, equipment, etc.
  const [assets, setAssets] = useState([]);

  // Controls which dashboard tab is currently visible
  const [activeTab, setActiveTab] = useState("issues");

  // Stores the full structured agent response
  const [agentResponse, setAgentResponse] = useState(null);

  // Form state for creating a new home
  const [homeForm, setHomeForm] = useState({
    name: "",
    yearBuilt: "",
    notes: "",
  });

  // Form state for adding a memory
  const [memoryForm, setMemoryForm] = useState({
    title: "",
    category: "general",
    content: "",
  });

  // Question state for Ask HouseIQ
  const [question, setQuestion] = useState("");

  // Loading states
  const [isAsking, setIsAsking] = useState(false);

  // Load homes when the app first opens
  useEffect(() => {
    fetchHomes();
  }, []);

  // Load memories whenever selectedHome changes
  useEffect(() => {
    if (selectedHome) {
      refreshHomeDashboard(selectedHome.id);
      setAgentResponse(null);
    }
  }, [selectedHome]);

  async function fetchHomes() {
    try {
      const response = await axios.get(`${API_URL}/homes`);
      setHomes(response.data);

      // Auto-select the newest home if one exists
      if (response.data.length > 0 && !selectedHome) {
        setSelectedHome(response.data[0]);
      }
    } catch (error) {
      console.error("Error fetching homes:", error);
    }
  }

  async function fetchMemories(homeId) {
    try {
      const response = await axios.get(`${API_URL}/homes/${homeId}/memories`);
      setMemories(response.data);
    } catch (error) {
      console.error("Error fetching memories:", error);
    }
  }

  async function fetchIssues(homeId) {
    try {
      const response = await axios.get(`${API_URL}/homes/${homeId}/issues`);
      setIssues(response.data);
    } catch (error) {
      console.error("Error fetching issues:", error);
      setIssues([]);
    }
  }

  async function fetchProjects(homeId) {
    try {
      const response = await axios.get(`${API_URL}/homes/${homeId}/projects`);
      setProjects(response.data);
    } catch (error) {
      console.error("Error fetching projects:", error);
      setProjects([]);
    }
  }

  async function fetchAssets(homeId) {
    try {
      const response = await axios.get(`${API_URL}/homes/${homeId}/assets`);
      setAssets(response.data);
    } catch (error) {
      console.error("Error fetching assets:", error);
      setAssets([]);
    }
  }

  async function refreshHomeDashboard(homeId) {
    await Promise.all([
      fetchMemories(homeId),
      fetchIssues(homeId),
      fetchProjects(homeId),
      fetchAssets(homeId),
    ]);
  }

  async function createHome(event) {
    event.preventDefault();

    try {
      const response = await axios.post(`${API_URL}/homes`, {
        name: homeForm.name,
        yearBuilt: homeForm.yearBuilt ? Number(homeForm.yearBuilt) : null,
        notes: homeForm.notes,
      });

      const newHome = response.data;

      setHomes([newHome, ...homes]);
      setSelectedHome(newHome);

      setHomeForm({
        name: "",
        yearBuilt: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error creating home:", error);
      alert("Could not create home. Check your backend terminal.");
    }
  }

  async function createMemory(event) {
    event.preventDefault();

    if (!selectedHome) {
      alert("Create or select a home first.");
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/homes/${selectedHome.id}/memories`,
        {
          title: memoryForm.title,
          category: memoryForm.category,
          content: memoryForm.content,
        }
      );

      const newMemory = response.data;

      setMemories([newMemory, ...memories]);

      setMemoryForm({
        title: "",
        category: "general",
        content: "",
      });
    } catch (error) {
      console.error("Error creating memory:", error);
      alert("Could not add memory. Check your backend terminal.");
    }
  }

  async function askHouseIQ(event) {
    event.preventDefault();

    if (!selectedHome) {
      alert("Create or select a home first.");
      return;
    }

    if (!question.trim()) {
      alert("Ask a question first.");
      return;
    }

    try {
      setIsAsking(true);
      setAgentResponse(null);

      const response = await axios.post(
        `${API_URL}/homes/${selectedHome.id}/ask`,
        {
          question,
        }
      );

      const data = response.data;

      let displayAnswer = data.answer;

      if (
        data.clarifyingQuestions &&
        data.clarifyingQuestions.length > 0
      ) {
        displayAnswer += "\n\nQuestions I need answered:\n";

        data.clarifyingQuestions.forEach((question, index) => {
          displayAnswer += `\n${index + 1}. ${question}`;
        });
      }

      if (
        data.actionsTaken &&
        data.actionsTaken.length > 0
      ) {
        displayAnswer += "\n\nWhat I updated:\n";

        data.actionsTaken.forEach((action) => {
          displayAnswer += `\n- ${action.type}: ${action.title}`;
        });
      }

      setAgentResponse(response.data);
      setQuestion("");

      await refreshHomeDashboard(selectedHome.id);
    } catch (error) {
      console.error("Error asking HouseIQ:", error);
      alert("HouseIQ could not answer. Check your backend terminal.");
    } finally {
      setIsAsking(false);
    }
  }

  function getActionLabel(actionType) {
    const labels = {
      memory_created: "Memory created",
      issue_created: "Issue created",
      project_created: "Project created",
      asset_created: "Asset created",
    };

    return labels[actionType] || actionType;
  }

  function renderEmptyState(message) {
    return <p className="empty-state">{message}</p>;
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Agentic home memory</p>
        <h1>HouseIQ</h1>
        <p className="hero-text">
          An AI that remembers your home, repairs, projects, problems, and
          maintenance history — so you do not have to.
        </p>
      </section>

      <section className="layout">
        <aside className="panel sidebar">
          <h2>Your Homes</h2>

          <form onSubmit={createHome} className="stack">
            <input
              value={homeForm.name}
              onChange={(event) =>
                setHomeForm({ ...homeForm, name: event.target.value })
              }
              placeholder="Home name, e.g. 1978 Ranch"
            />

            <input
              value={homeForm.yearBuilt}
              onChange={(event) =>
                setHomeForm({ ...homeForm, yearBuilt: event.target.value })
              }
              placeholder="Year built"
              type="number"
            />

            <textarea
              value={homeForm.notes}
              onChange={(event) =>
                setHomeForm({ ...homeForm, notes: event.target.value })
              }
              placeholder="General notes about this home"
            />

            <button type="submit">Create Home</button>
          </form>

          <div className="home-list">
            {homes.map((home) => (
              <button
                key={home.id}
                className={
                  selectedHome?.id === home.id ? "home-card active" : "home-card"
                }
                onClick={() => setSelectedHome(home)}
              >
                <strong>{home.name}</strong>
                {home.year_built && <span>Built {home.year_built}</span>}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel main-panel">
          {selectedHome ? (
            <>
              <div className="selected-home-header">
                <div>
                  <p className="eyebrow">Current home</p>
                  <h2>{selectedHome.name}</h2>
                  {selectedHome.notes && <p>{selectedHome.notes}</p>}
                </div>
              </div>

              <section className="agent-grid">
                <form onSubmit={askHouseIQ} className="ask-box stack">
                  <div>
                    <p className="eyebrow">House chat</p>
                    <h3>Ask HouseIQ</h3>
                    <p className="helper-text">
                      Talk naturally. HouseIQ can answer, ask follow-up questions,
                      and create memories, issues, assets, or projects from the chat.
                    </p>
                  </div>

                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Example: The west bedroom window leaked again during last night's storm. I already tried silicone around the trim. What should I do?"
                  />

                  <button type="submit" disabled={isAsking}>
                    {isAsking ? "Thinking..." : "Ask My House"}
                  </button>
                </form>

                <section className="agent-response-panel">
                  <p className="eyebrow">Agent response</p>
                  <h3>What HouseIQ thinks</h3>

                  {!agentResponse ? (
                    renderEmptyState(
                      "Ask something about your home. The response will appear here."
                    )
                  ) : (
                    <div className="agent-response stack">
                      <div className="answer-card">
                        <div className="response-meta-row">
                          {agentResponse.confidence && (
                            <span className="status-pill">
                              Confidence: {agentResponse.confidence}
                            </span>
                          )}

                          {agentResponse.needsMoreInfo && (
                            <span className="status-pill warning">
                              Needs more info
                            </span>
                          )}
                        </div>

                        <p>{agentResponse.answer}</p>
                      </div>

                      {agentResponse.clarifyingQuestions?.length > 0 && (
                        <div className="question-card">
                          <h4>Questions HouseIQ needs answered</h4>

                          <ol>
                            {agentResponse.clarifyingQuestions.map(
                              (clarifyingQuestion, index) => (
                                <li key={`${clarifyingQuestion}-${index}`}>
                                  {clarifyingQuestion}
                                </li>
                              )
                            )}
                          </ol>
                        </div>
                      )}

                      {agentResponse.actionsTaken?.length > 0 && (
                        <div className="actions-card">
                          <h4>What HouseIQ updated</h4>

                          <div className="action-list">
                            {agentResponse.actionsTaken.map((action, index) => (
                              <div className="action-item" key={`${action.id}-${index}`}>
                                <span>{getActionLabel(action.type)}</span>
                                <strong>{action.title}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </section>

              <section className="dashboard-panel">
                <div className="dashboard-header">
                  <div>
                    <p className="eyebrow">Homestead record</p>
                    <h3>What HouseIQ knows</h3>
                  </div>

                  <div className="tab-row">
                    <button
                      className={activeTab === "issues" ? "tab active" : "tab"}
                      onClick={() => setActiveTab("issues")}
                    >
                      Issues ({issues.length})
                    </button>

                    <button
                      className={activeTab === "projects" ? "tab active" : "tab"}
                      onClick={() => setActiveTab("projects")}
                    >
                      Projects ({projects.length})
                    </button>

                    <button
                      className={activeTab === "assets" ? "tab active" : "tab"}
                      onClick={() => setActiveTab("assets")}
                    >
                      Assets ({assets.length})
                    </button>

                    <button
                      className={activeTab === "memories" ? "tab active" : "tab"}
                      onClick={() => setActiveTab("memories")}
                    >
                      Memories ({memories.length})
                    </button>
                  </div>
                </div>

                {activeTab === "issues" && (
                  <div className="record-grid">
                    {issues.length === 0
                      ? renderEmptyState(
                        "No issues yet. Describe a problem in chat and HouseIQ can create one."
                      )
                      : issues.map((issue) => (
                        <article key={issue.id} className="record-card issue-card">
                          <div className="record-header">
                            <strong>{issue.title}</strong>
                            <span>{issue.priority}</span>
                          </div>

                          <p>{issue.description}</p>

                          {issue.recommended_next_step && (
                            <div className="record-note">
                              <small>Recommended next step</small>
                              <p>{issue.recommended_next_step}</p>
                            </div>
                          )}

                          <small>
                            Created {new Date(issue.created_at).toLocaleString()}
                          </small>
                        </article>
                      ))}
                  </div>
                )}

                {activeTab === "projects" && (
                  <div className="record-grid">
                    {projects.length === 0
                      ? renderEmptyState(
                        "No projects yet. HouseIQ will create projects when an issue needs planned work."
                      )
                      : projects.map((project) => (
                        <article key={project.id} className="record-card project-card">
                          <div className="record-header">
                            <strong>{project.title}</strong>
                            <span>{project.status}</span>
                          </div>

                          <p>{project.description}</p>

                          {(project.estimated_cost_low || project.estimated_cost_high) && (
                            <p className="cost-line">
                              Estimated cost: ${project.estimated_cost_low || 0} - $
                              {project.estimated_cost_high || "?"}
                            </p>
                          )}

                          {project.diy_difficulty && (
                            <span className="status-pill">
                              DIY: {project.diy_difficulty}
                            </span>
                          )}

                          {project.safety_notes && (
                            <div className="record-note warning-note">
                              <small>Safety notes</small>
                              <p>{project.safety_notes}</p>
                            </div>
                          )}
                        </article>
                      ))}
                  </div>
                )}

                {activeTab === "assets" && (
                  <div className="record-grid">
                    {assets.length === 0
                      ? renderEmptyState(
                        "No assets yet. Tell HouseIQ about an appliance, HVAC unit, mower, generator, or tool."
                      )
                      : assets.map((asset) => (
                        <article key={asset.id} className="record-card asset-card">
                          <div className="record-header">
                            <strong>{asset.name}</strong>
                            <span>{asset.asset_type}</span>
                          </div>

                          <div className="asset-details">
                            {asset.brand && <p>Brand: {asset.brand}</p>}
                            {asset.model && <p>Model: {asset.model}</p>}
                            {asset.serial_number && <p>Serial: {asset.serial_number}</p>}
                            {asset.location && <p>Location: {asset.location}</p>}
                          </div>

                          {asset.notes && <p>{asset.notes}</p>}
                        </article>
                      ))}
                  </div>
                )}

                {activeTab === "memories" && (
                  <div className="record-grid">
                    {memories.length === 0
                      ? renderEmptyState(
                        "No memories yet. HouseIQ will create memories automatically from chat."
                      )
                      : memories.map((memory) => (
                        <article key={memory.id} className="record-card memory-card">
                          <div className="record-header">
                            <strong>{memory.title}</strong>
                            <span>{memory.category}</span>
                          </div>

                          <p>{memory.content}</p>

                          <small>
                            Saved {new Date(memory.created_at).toLocaleString()}
                          </small>
                        </article>
                      ))}
                  </div>
                )}
              </section>

              <details className="manual-memory-details">
                <summary>Manual memory entry for testing</summary>

                <form onSubmit={createMemory} className="memory-form stack">
                  <h3>Add a Home Memory</h3>

                  <input
                    value={memoryForm.title}
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        title: event.target.value,
                      })
                    }
                    placeholder="Title, e.g. Window leak"
                  />

                  <select
                    value={memoryForm.category}
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        category: event.target.value,
                      })
                    }
                  >
                    <option value="general">General</option>
                    <option value="repair">Repair</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="appliance">Appliance</option>
                    <option value="exterior">Exterior</option>
                    <option value="landscaping">Landscaping</option>
                    <option value="inspection">Inspection</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="hvac">HVAC</option>
                    <option value="tool">Tool</option>
                  </select>

                  <textarea
                    value={memoryForm.content}
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        content: event.target.value,
                      })
                    }
                    placeholder="Example: West bedroom window leaks during hard rain. I sealed around the outside trim with silicone, but it still leaked later."
                  />

                  <button type="submit">Save Memory</button>
                </form>
              </details>
            </>
          ) : (
            <div className="empty-state large">
              <h2>Create your first home</h2>
              <p>
                Once a home exists, HouseIQ can start building a long-term memory
                of repairs, projects, problems, and maintenance history.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;