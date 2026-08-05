// frontend/src/components/home-profile/PassportPanel.jsx

import { useState } from "react";

import api from "../../api.js";

export default function PassportPanel({ homeId }) {
  const [scope, setScope] = useState("full");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generatePassport() {
    if (!homeId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await api.get(
        `/homes/${homeId}/passport`,
        { params: { scope } }
      );
      setPayload(response.data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Could not build Home Passport"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Selective share</p>
          <h2>Home Passport</h2>
        </div>
      </header>

      <p>
        Generate a verified, source-backed package for a buyer,
        contractor, or family member—scoped to what they need.
      </p>

      <label>
        Recipient scope
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="full">Full household</option>
          <option value="contractor">Contractor</option>
          <option value="buyer">Buyer / realtor</option>
          <option value="family">Family</option>
        </select>
      </label>

      <button
        type="button"
        onClick={generatePassport}
        disabled={loading || !homeId}
      >
        {loading ? "Building…" : "Generate Passport"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {payload && (
        <pre style={{ marginTop: "1rem", textAlign: "left" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </section>
  );
}
