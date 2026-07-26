// frontend/src/components/agent/AgentPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";

import {
  formatLabel,
} from "../../utils/formatters.js";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";


// ---------------------------------------------------------
// HOUSEIQ CONVERSATION PANEL
// ---------------------------------------------------------
//
// The parent renders this panel with:
//
// key={selectedHome?.id || "no-home"}
//
// so every piece of agent state below is discarded when the
// user switches to a different home.
//
function AgentPanel({
  selectedHome,
  onRecordsChanged,
}) {
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

      const response = await api.post(
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
      await onRecordsChanged?.();
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
  // PANEL
  // -----------------------------------------------------

  return (
    <section className="agent-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Talk naturally
          </p>

          <h3>
            Tell HouseIQ what is happening
          </h3>
        </div>

        <span className="agent-status">
          Memory agent active
        </span>
      </div>

      <form
        onSubmit={askHouseIQ}
        className="agent-form"
      >
        <textarea
          value={question}
          onChange={(event) =>
            setQuestion(
              event.target.value
            )
          }
          placeholder="Example: The west bedroom window leaked again during last night's storm. I already sealed the outside trim with silicone. What should I do next?"
        />

        <button
          type="submit"
          disabled={isAsking}
        >
          {isAsking
            ? "HouseIQ is thinking..."
            : "Send to HouseIQ"}
        </button>
      </form>

      {askError && (
        <div className="error-message">
          <strong>
            HouseIQ encountered a problem
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
                HouseIQ response
              </p>

              <h3>
                Recommended next step
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
            {agentResponse.answer}
          </div>

          {agentResponse.contextUsed && (
            <section className="context-used-section">
              <h4>
                Used for this answer
              </h4>

              <p className="context-used-summary">
                {[
                  agentResponse.contextUsed
                    .counts?.profileFields
                    ? `${agentResponse.contextUsed.counts.profileFields} profile facts`
                    : null,
                  agentResponse.contextUsed
                    .counts?.memories
                    ? `${agentResponse.contextUsed.counts.memories} memories`
                    : null,
                  agentResponse.contextUsed
                    .counts?.issues
                    ? `${agentResponse.contextUsed.counts.issues} open issues`
                    : null,
                  agentResponse.contextUsed
                    .counts?.projects
                    ? `${agentResponse.contextUsed.counts.projects} projects`
                    : null,
                  agentResponse.contextUsed
                    .counts?.assets
                    ? `${agentResponse.contextUsed.counts.assets} assets`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "No stored home context yet"}
              </p>

              {(agentResponse.contextUsed
                .issueTitles?.length > 0 ||
                agentResponse.contextUsed
                  .memoryTitles?.length > 0) && (
                <ul className="context-used-list">
                  {agentResponse.contextUsed.issueTitles
                    ?.slice(0, 3)
                    .map((title) => (
                      <li key={`issue-${title}`}>
                        Issue: {title}
                      </li>
                    ))}
                  {agentResponse.contextUsed.memoryTitles
                    ?.slice(0, 3)
                    .map((title) => (
                      <li key={`memory-${title}`}>
                        Memory: {title}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}

          {agentResponse.needsMoreInfo &&
            agentResponse
              .clarifyingQuestions
              ?.length > 0 && (
              <section className="clarifying-section">
                <h4>
                  Questions HouseIQ needs answered
                </h4>

                <ol>
                  {agentResponse.clarifyingQuestions.map(
                    (item, index) => (
                      <li
                        key={`${item}-${index}`}
                      >
                        {item}
                      </li>
                    )
                  )}
                </ol>
              </section>
            )}

          <section className="actions-section">
            <h4>
              What HouseIQ updated
            </h4>

            {agentResponse.actionsTaken
              ?.length > 0 ? (
              <div className="action-list">
                {agentResponse.actionsTaken.map(
                  (action, index) => (
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
                          {action.title}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="empty-state">
                HouseIQ answered without creating
                any new records.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}


export default AgentPanel;
