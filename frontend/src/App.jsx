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

  // AI answer from backend
  const [answer, setAnswer] = useState("");

  // Loading states
  const [isAsking, setIsAsking] = useState(false);

  // Load homes when the app first opens
  useEffect(() => {
    fetchHomes();
  }, []);

  // Load memories whenever selectedHome changes
  useEffect(() => {
    if (selectedHome) {
      fetchMemories(selectedHome.id);
      setAnswer("");
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
      setAnswer("");

      const response = await axios.post(
        `${API_URL}/homes/${selectedHome.id}/ask`,
        {
          question,
        }
      );

      setAnswer(response.data.answer);
    } catch (error) {
      console.error("Error asking HouseIQ:", error);
      alert("HouseIQ could not answer. Check your backend terminal.");
    } finally {
      setIsAsking(false);
    }
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

              <div className="grid-two">
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

                <form onSubmit={askHouseIQ} className="ask-box stack">
                  <h3>Ask HouseIQ</h3>

                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Example: What should I fix before winter?"
                  />

                  <button type="submit" disabled={isAsking}>
                    {isAsking ? "Thinking..." : "Ask My House"}
                  </button>

                  {answer && (
                    <pre className="answer-box">
                      {answer}
                    </pre>
                  )}
                </form>
              </div>

              <section className="timeline">
                <h3>Memory Timeline</h3>

                {memories.length === 0 ? (
                  <p className="empty-state">
                    No memories yet. Add the first thing HouseIQ should remember.
                  </p>
                ) : (
                  memories.map((memory) => (
                    <article key={memory.id} className="memory-card">
                      <div className="memory-card-header">
                        <strong>{memory.title}</strong>
                        <span>{memory.category}</span>
                      </div>

                      <p>{memory.content}</p>

                      <small>
                        Saved {new Date(memory.created_at).toLocaleString()}
                      </small>
                    </article>
                  ))
                )}
              </section>
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