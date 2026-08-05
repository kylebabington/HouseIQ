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

// How many prior turns are sent back to the backend as light
// conversational context. Keeps the request small and cheap.
const CONVERSATION_HISTORY_TURN_LIMIT = 3;

// Each history entry is truncated to this many characters so a
// long answer or question cannot balloon the request body.
const CONVERSATION_HISTORY_CHAR_LIMIT = 400;


// ---------------------------------------------------------
// MAP AN AGENT ACTION TO A DASHBOARD TAB
// ---------------------------------------------------------
//
// actionsTaken entries look like { type, recordId, title }.
// This tells the parent which dashboard tab to reveal when the
// homeowner clicks that action's chip.
//
function mapActionTypeToTab(actionType) {
  if (!actionType) {
    return null;
  }

  if (actionType === "memory_created") {
    return "memories";
  }

  if (actionType === "issue_created") {
    return "issues";
  }

  if (actionType === "project_created") {
    return "projects";
  }

  if (actionType === "asset_created") {
    return "assets";
  }

  if (actionType.startsWith("document_")) {
    return "documents";
  }

  return null;
}


/**
 * Trims a string down to a safe length for conversational
 * context sent back to the backend.
 */
function truncateForHistory(value) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= CONVERSATION_HISTORY_CHAR_LIMIT) {
    return value;
  }

  return `${value.slice(0, CONVERSATION_HISTORY_CHAR_LIMIT)}...`;
}


/**
 * Turns the last few turns into a short { role, content } list
 * the backend can lightly fold into the agent prompt.
 */
function buildConversationHistory(turns) {
  const recentTurns = turns.slice(
    -CONVERSATION_HISTORY_TURN_LIMIT
  );

  const history = [];

  for (const turn of recentTurns) {
    history.push({
      role: "user",
      content: truncateForHistory(turn.question),
    });

    history.push({
      role: "assistant",
      content: truncateForHistory(turn.answer),
    });
  }

  return history;
}


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
  onNavigateTab,
  askLocked = false,
  askLockReason = "",
}) {
  // -----------------------------------------------------
  // HOUSEIQ AGENT STATE
  // -----------------------------------------------------

  // The natural-language message entered by the user.
  const [question, setQuestion] = useState("");

  // Every turn of the conversation for this home, oldest first.
  // Each turn is the complete structured response from /ask plus
  // the question that produced it.
  const [turns, setTurns] = useState([]);

  const [isAsking, setIsAsking] =
    useState(false);

  const [askError, setAskError] =
    useState("");


  // -----------------------------------------------------
  // ASK HOUSEIQ
  // -----------------------------------------------------

  async function askHouseIQ(event) {
    event.preventDefault();

    if (askLocked) {
      setAskError(
        askLockReason
          ? `Ask is locked until HouseIQ knows more about this home (${askLockReason}).`
          : "Ask is locked until HouseIQ knows more about this home."
      );
      return;
    }

    if (!selectedHome) {
      setAskError(
        "Create or select a home first."
      );
      return;
    }

    if (!question.trim()) {
      setAskError(
        "Tell HouseIQ something or ask a question."
      );
      return;
    }

    const askedQuestion = question.trim();

    try {
      setIsAsking(true);
      setAskError("");

      const response = await api.post(
        `${API_URL}/homes/${selectedHome.id}/ask`,
        {
          question: askedQuestion,
          conversationHistory:
            buildConversationHistory(turns),
        }
      );

      const data = response.data;

      // Append this turn to the running conversation instead of
      // replacing a single "latest response" slot.
      setTurns((previousTurns) => [
        ...previousTurns,
        {
          id:
            data.agentRunId ||
            `${Date.now()}-${previousTurns.length}`,
          question: askedQuestion,
          answer: data.answer,
          confidence: data.confidence,
          needsMoreInfo: data.needsMoreInfo,
          clarifyingQuestions:
            data.clarifyingQuestions || [],
          actionsTaken: data.actionsTaken || [],
          contextUsed: data.contextUsed || null,
          citations: data.citations || [],
        },
      ]);

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
  // HANDLE A CLICK ON AN ACTION CHIP
  // -----------------------------------------------------

  function handleActionChipClick(action) {
    const tabName = mapActionTypeToTab(action.type);

    if (tabName) {
      onNavigateTab?.(tabName);
    }
  }


  // -----------------------------------------------------
  // COMPACT CONTEXT-USED SUMMARY FOR A SINGLE TURN
  // -----------------------------------------------------

  function renderContextUsedSummary(contextUsed) {
    if (!contextUsed) {
      return null;
    }

    const summary = [
      contextUsed.counts?.profileFields
        ? `${contextUsed.counts.profileFields} profile facts`
        : null,
      contextUsed.counts?.memories
        ? `${contextUsed.counts.memories} memories`
        : null,
      contextUsed.counts?.issues
        ? `${contextUsed.counts.issues} open issues`
        : null,
      contextUsed.counts?.projects
        ? `${contextUsed.counts.projects} projects`
        : null,
      contextUsed.counts?.assets
        ? `${contextUsed.counts.assets} assets`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <p className="turn-context-used">
        Used: {summary || "No stored home context yet"}
      </p>
    );
  }


  // -----------------------------------------------------
  // PANEL
  // -----------------------------------------------------

  return (
    <section
      id="houseiq-agent-section"
      className="agent-section"
    >
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

      {askLocked ? (
        <p className="onboarding-gate-lock" role="status">
          Ask is locked until basics are known
          {askLockReason
            ? `: ${askLockReason}`
            : "."}
        </p>
      ) : null}

      <form
        onSubmit={askHouseIQ}
        className="agent-form"
      >
        <textarea
          id="houseiq-agent-textarea"
          value={question}
          disabled={askLocked || isAsking}
          onChange={(event) =>
            setQuestion(
              event.target.value
            )
          }
          placeholder="Example: The west bedroom window leaked again during last night's storm. I already sealed the outside trim with silicone. What should I do next?"
        />

        <button
          type="submit"
          disabled={isAsking || askLocked}
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
      {/* CONVERSATION TURN HISTORY    */}
      {/* ---------------------------- */}

      {turns.length > 0 && (
        <div className="turn-list">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className="turn-item"
            >
              <div className="turn-question">
                <span className="turn-question-label">
                  You asked
                </span>

                <p>{turn.question}</p>
              </div>

              <div className="turn-response">
                <div className="turn-response-header">
                  <span className="turn-response-label">
                    HouseIQ
                  </span>

                  <span
                    className={`confidence-badge confidence-${turn.confidence}`}
                  >
                    {formatLabel(turn.confidence)}{" "}
                    confidence
                  </span>
                </div>

                <div className="answer-box">
                  {turn.answer}
                </div>

                {turn.citations?.length > 0 && (
                  <section className="clarifying-section">
                    <h4>Evidence</h4>
                    <ul className="timeline-list">
                      {turn.citations.map((citation) => (
                        <li key={citation.id}>
                          <strong>
                            {citation.title || "Source"}
                            {citation.page
                              ? ` · p. ${citation.page}`
                              : ""}
                          </strong>
                          {citation.passage ? (
                            <em>
                              &ldquo;{citation.passage}&rdquo;
                            </em>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {renderContextUsedSummary(
                  turn.contextUsed
                )}

                {turn.needsMoreInfo &&
                  turn.clarifyingQuestions?.length > 0 && (
                    <section className="clarifying-section">
                      <h4>
                        Questions HouseIQ needs answered
                      </h4>

                      <ol>
                        {turn.clarifyingQuestions.map(
                          (item, index) => (
                            <li
                              key={`${turn.id}-${index}`}
                            >
                              {item}
                            </li>
                          )
                        )}
                      </ol>
                    </section>
                  )}

                {turn.actionsTaken?.length > 0 && (
                  <div className="action-chip-list">
                    {turn.actionsTaken.map(
                      (action, index) => {
                        const tabName =
                          mapActionTypeToTab(action.type);

                        return (
                          <button
                            key={`${turn.id}-${action.recordId}-${index}`}
                            type="button"
                            className="action-chip"
                            disabled={!tabName}
                            onClick={() =>
                              handleActionChipClick(action)
                            }
                          >
                            <span className="action-chip-icon">
                              ✓
                            </span>

                            {formatLabel(action.type)}:{" "}
                            {action.title}
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


export default AgentPanel;
