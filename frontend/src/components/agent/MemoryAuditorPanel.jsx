// frontend/src/components/agent/MemoryAuditorPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";
import McpToolTrace from "./McpToolTrace.jsx";

const DEFAULT_AUDITOR_QUESTION =
  "Show me everything HouseIQ currently knows about the HVAC system and where that knowledge came from.";

function MemoryAuditorPanel({
  selectedHome,
}) {
  const [question, setQuestion] = useState(
    DEFAULT_AUDITOR_QUESTION
  );
  const [isAuditing, setIsAuditing] =
    useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function runAudit(event) {
    event.preventDefault();

    if (!selectedHome?.id) {
      setError("Select a home first.");
      return;
    }

    if (!question.trim()) {
      setError("Question is required.");
      return;
    }

    setIsAuditing(true);
    setError("");

    try {
      const response = await api.post(
        `/homes/${selectedHome.id}/memory-audit`,
        {
          question: question.trim(),
        }
      );

      setResult(response.data);
    } catch (requestError) {
      const status =
        requestError.response?.status;
      const message =
        requestError.response?.data?.error;

      if (status === 503) {
        setError(
          message ||
            "CockroachDB Cloud MCP is not configured on this server."
        );
      } else {
        setError(
          message ||
            "HouseIQ could not audit memory through CockroachDB MCP."
        );
      }

      setResult(null);
    } finally {
      setIsAuditing(false);
    }
  }

  return (
    <section className="memory-auditor-panel panel-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Developer / Demo Details
          </p>
          <h3>
            Memory Auditor (CockroachDB MCP)
          </h3>
        </div>
        <span className="agent-status">
          Read-only MCP
        </span>
      </div>

      <p className="memory-auditor-copy">
        This agent inspects HouseIQ memory through
        CockroachDB Cloud Managed MCP — not the Ask
        vector path. It does not create or change
        records.
      </p>

      <form
        onSubmit={runAudit}
        className="agent-form"
      >
        <textarea
          value={question}
          disabled={isAuditing || !selectedHome?.id}
          onChange={(event) =>
            setQuestion(event.target.value)
          }
        />
        <button
          type="submit"
          disabled={isAuditing || !selectedHome?.id}
        >
          {isAuditing
            ? "Querying MCP..."
            : "Audit memory"}
        </button>
      </form>

      {error ? (
        <div className="error-message" role="alert">
          <strong>Memory Auditor</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="memory-auditor-result">
          <div className="answer-box">
            {result.answer}
          </div>

          <McpToolTrace result={result} />
        </div>
      ) : null}
    </section>
  );
}

export default MemoryAuditorPanel;
