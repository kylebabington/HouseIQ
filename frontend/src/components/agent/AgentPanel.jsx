// frontend/src/components/agent/AgentPanel.jsx

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import api from "../../api.js";

import {
  formatLabel,
} from "../../utils/formatters.js";
import { SUGGESTED_HOME_QUESTIONS } from "../../navigation.js";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

// How many prior turns are sent back to the backend as
// conversational context. Keeps the request small and cheap.
const CONVERSATION_HISTORY_TURN_LIMIT = 6;

// Each history entry is truncated to this many characters so a
// long answer or question cannot balloon the request body.
const CONVERSATION_HISTORY_CHAR_LIMIT = 1200;

// Recent saved answers restored into the live thread so a
// follow-up still works after a refresh.
const HYDRATED_TURN_LIMIT = 4;


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

function turnsFromAgentRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return [];
  }

  return [...runs]
    .filter(
      (run) =>
        run?.answer &&
        run.status !== "failed"
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.created_at) || 0;
      const rightTime = Date.parse(right.created_at) || 0;
      return leftTime - rightTime;
    })
    .slice(-HYDRATED_TURN_LIMIT)
    .map((run) => ({
      id: run.id,
      question: run.user_question || "",
      answer: run.answer,
      confidence: run.confidence,
      needsMoreInfo: run.needs_more_info,
      clarifyingQuestions:
        run.clarifying_questions || [],
      actionsTaken: run.actions_taken || [],
      contextUsed: null,
      citations: run.citations || [],
    }));
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
  suggestedQuestions = SUGGESTED_HOME_QUESTIONS,
  agentRuns = [],
}) {
  // -----------------------------------------------------
  // HOUSEIQ AGENT STATE
  // -----------------------------------------------------

  // The natural-language message entered by the user.
  const [question, setQuestion] = useState("");

  const hydratedTurns = useMemo(
    () => turnsFromAgentRuns(agentRuns),
    [agentRuns]
  );
  const [liveTurns, setLiveTurns] = useState(null);
  const turns = liveTurns ?? hydratedTurns;

  const [isAsking, setIsAsking] =
    useState(false);

  const [askError, setAskError] =
    useState("");

  const turnListRef = useRef(null);

  useEffect(() => {
    const node = turnListRef.current;

    if (!node || turns.length === 0) {
      return;
    }

    node.lastElementChild?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [turns.length, isAsking]);

  function startNewChat() {
    if (isAsking) {
      return;
    }

    setLiveTurns([]);
    setQuestion("");
    setAskError("");
  }


  // -----------------------------------------------------
  // ASK HOUSEIQ
  // -----------------------------------------------------

  async function submitQuestion(rawQuestion) {
    if (isAsking) {
      return;
    }

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

    const askedQuestion = String(rawQuestion || "").trim();

    if (!askedQuestion) {
      setAskError(
        "Tell HouseIQ something or ask a follow-up."
      );
      return;
    }

    try {
      setIsAsking(true);
      setAskError("");
      setQuestion("");

      const response = await api.post(
        `${API_URL}/homes/${selectedHome.id}/ask`,
        {
          question: askedQuestion,
          conversationHistory:
            buildConversationHistory(turns),
        }
      );

      const data = response.data;

      setLiveTurns((previousTurns) => {
        const prior = previousTurns ?? hydratedTurns;

        return [
          ...prior,
          {
            id:
              data.agentRunId ||
              `${Date.now()}-${prior.length}`,
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
        ];
      });

      await onRecordsChanged?.();
    } catch (error) {
      console.error(
        "Error asking HouseIQ:",
        error
      );

      setQuestion(askedQuestion);
      setAskError(
        error.response?.data?.details ||
        error.response?.data?.error ||
        "HouseIQ could not process that request."
      );
    } finally {
      setIsAsking(false);
    }
  }

  function askHouseIQ(event) {
    event.preventDefault();
    submitQuestion(question);
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitQuestion(question);
  }

  function startNewChat() {
    setLiveTurns([]);
    setQuestion("");
    setAskError("");
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
      contextUsed.counts?.documentChunks
        ? `${contextUsed.counts.documentChunks} document excerpts`
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
    <CollapsibleSection
      title="Ask HouseIQ"
      summary={
        turns.length
          ? "Continuing conversation"
          : "Ask about repairs, systems, or documents"
      }
      defaultOpen
      openOnMobile
    >
    <section
      id="houseiq-agent-section"
      className="agent-section"
    >
      {askLocked ? (
        <p className="onboarding-gate-lock" role="status">
          Ask is locked until basics are known
          {askLockReason
            ? `: ${askLockReason}`
            : "."}
        </p>
      ) : null}

      {turns.length > 0 ? (
        <div className="agent-chat-toolbar">
          <button
            type="button"
            className="secondary-button"
            disabled={isAsking}
            onClick={startNewChat}
          >
            New chat
          </button>
        </div>
      ) : (
        <p className="agent-conversation-intro">
          This is a conversation. Ask about the home, then
          follow up on the answer for clarification, cost,
          timing, or what to do next.
        </p>
      )}

      {turns.length === 0 &&
      suggestedQuestions?.length > 0 ? (
        <div className="suggested-questions">
          <h4>Suggested questions</h4>
          <div className="demo-cta-buttons">
            {suggestedQuestions.map((item) => (
              <button
                key={item}
                type="button"
                className="secondary-button"
                disabled={askLocked || isAsking}
                onClick={() => submitQuestion(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {turns.length > 0 && (
        <div
          className="turn-list"
          ref={turnListRef}
        >
          {turns.map((turn) => (
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
                            <p className="evidence-quote">
                              &ldquo;{citation.passage}&rdquo;
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {renderContextUsedSummary(
                  turn.contextUsed
                )}

                {turn.clarifyingQuestions?.length > 0 && (
                    <section className="clarifying-section">
                      <h4>
                        {turn.needsMoreInfo
                          ? "HouseIQ needs a bit more"
                          : "Ask a follow-up"}
                      </h4>

                      <div className="demo-cta-buttons">
                        {turn.clarifyingQuestions.map(
                          (item, index) => (
                            <button
                              key={`${turn.id}-${index}`}
                              type="button"
                              className="secondary-button"
                              disabled={
                                askLocked || isAsking
                              }
                              onClick={() =>
                                submitQuestion(item)
                              }
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>
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
          {isAsking ? (
            <p
              className="turn-thinking"
              role="status"
            >
              HouseIQ is thinking…
            </p>
          ) : null}
        </div>
      )}

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

      <form
        onSubmit={askHouseIQ}
        className={
          turns.length > 0
            ? "agent-form agent-form-follow-up"
            : "agent-form"
        }
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
          onKeyDown={handleComposerKeyDown}
          placeholder={
            turns.length > 0
              ? "Ask a follow-up about that answer…"
              : "Ask a question about your home..."
          }
        />

        <button
          type="submit"
          disabled={isAsking || askLocked}
        >
          {isAsking
            ? "HouseIQ is thinking..."
            : turns.length > 0
              ? "Send"
              : "Ask HouseIQ"}
        </button>
      </form>
    </section>
    </CollapsibleSection>
  );
}


export default AgentPanel;
