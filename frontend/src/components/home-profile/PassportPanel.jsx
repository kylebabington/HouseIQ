// frontend/src/components/home-profile/PassportPanel.jsx

import { useState } from "react";

import api from "../../api.js";
import {
  documentDisplayTitle,
  formatLabel,
  formatMonthYear,
  formatYear,
} from "../../utils/formatters.js";
import "./HomeProfile.css";

const GENERATE_LABELS = {
  full: "Generate Home Passport",
  contractor: "Generate Contractor Home Passport",
  buyer: "Generate Buyer Home Passport",
  family: "Generate Family Home Passport",
};

function profileTitle(profile) {
  if (!profile) {
    return "Home Passport";
  }

  if (profile.name) {
    return profile.name;
  }

  const year = profile.year_built;
  const type = profile.property_type
    ? formatLabel(profile.property_type)
    : "Home";

  return year ? `${year} ${type}` : type;
}

function profileSubtitle(profile) {
  if (!profile) {
    return "";
  }

  const place = [profile.city, profile.state]
    .filter(Boolean)
    .join(", ");
  const year = profile.year_built
    ? `Built ${profile.year_built}`
    : null;
  const type = profile.property_type
    ? formatLabel(profile.property_type)
    : null;

  return [year, type, place].filter(Boolean).join(" · ");
}

function assetLine(asset) {
  const label =
    [asset.brand, asset.name].filter(Boolean).join(" ") ||
    formatLabel(asset.asset_type);
  const year = formatYear(asset.install_date);

  if (year) {
    return `${label} — installed ${year}`;
  }

  return label;
}

function maintenanceLine(event) {
  const title =
    (event.notes && event.notes.split(".")[0]) ||
    formatLabel(event.event_type);
  const when = formatMonthYear(
    event.completed_at || event.created_at
  );
  return when ? `${title} — ${when}` : title;
}

function documentLine(doc) {
  const name = documentDisplayTitle(doc);
  const type = doc.document_type
    ? formatLabel(doc.document_type)
    : null;
  return type ? `${type} — ${name}` : name;
}

function openIssues(issues) {
  return (issues || []).filter(
    (issue) =>
      !["resolved", "closed"].includes(
        String(issue.status || "").toLowerCase()
      )
  );
}

function buildShareText(payload) {
  const title = profileTitle(payload.profile);
  const lines = [`${title}`, "Home Passport", ""];

  if (payload.assets?.length) {
    lines.push("Major systems");
    for (const asset of payload.assets) {
      lines.push(`- ${assetLine(asset)}`);
    }
    lines.push("");
  }

  const issues = openIssues(payload.issues);
  if (issues.length) {
    lines.push("Current concerns");
    for (const issue of issues) {
      lines.push(
        `- ${issue.title}${issue.priority ? ` — ${formatLabel(issue.priority)}` : ""}`
      );
    }
    lines.push("");
  }

  if (payload.maintenance?.length) {
    lines.push("Recent work");
    for (const event of payload.maintenance.slice(0, 8)) {
      lines.push(`- ${maintenanceLine(event)}`);
    }
    lines.push("");
  }

  if (payload.documents?.length) {
    lines.push("Evidence");
    for (const doc of payload.documents.slice(0, 8)) {
      lines.push(`- ${documentLine(doc)}`);
    }
  }

  return lines.join("\n");
}

function PassportSection({ title, items, renderItem }) {
  if (!items?.length) {
    return null;
  }

  return (
    <section className="passport-section">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={item.id || `${title}-${index}`}>
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PassportPanel({ homeId }) {
  const [scope, setScope] = useState("contractor");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function generatePassport() {
    if (!homeId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setStatus("");
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

  function printPassport() {
    window.print();
  }

  function downloadPassport() {
    if (!payload) {
      return;
    }

    const title = profileTitle(payload.profile)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const blob = new Blob([buildShareText(payload)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "home"}-passport.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function sharePassport() {
    if (!payload) {
      return;
    }

    const title = `${profileTitle(payload.profile)} Home Passport`;
    const text = buildShareText(payload);

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setStatus("Passport shared.");
        return;
      }

      await navigator.clipboard.writeText(text);
      setStatus("Passport summary copied.");
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      setError("Could not share Home Passport");
    }
  }

  const issues = openIssues(payload?.issues);
  const recentWork = [
    ...(payload?.maintenance || []),
    ...(payload?.projects || []).map((project) => ({
      notes: project.title,
      completed_at: project.updated_at || project.created_at,
      event_type: "project",
    })),
  ].slice(0, 8);

  return (
    <section className="panel" id="houseiq-passport-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Selective share</p>
          <h2>Home Passport</h2>
        </div>
      </header>

      <p>
        A verified package you can hand a contractor, buyer,
        realtor, or family member—scoped to what they need.
      </p>

      <div className="passport-controls">
        <label>
          Recipient scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="contractor">Contractor</option>
            <option value="buyer">Buyer / realtor</option>
            <option value="family">Family</option>
            <option value="full">Full household</option>
          </select>
        </label>

        <button
          type="button"
          onClick={generatePassport}
          disabled={loading || !homeId}
        >
          {loading
            ? "Building…"
            : GENERATE_LABELS[scope] || "Generate Passport"}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}
      {status && <p className="passport-status">{status}</p>}

      {payload && (
        <article
          className="passport-card"
          id="houseiq-passport-card"
        >
          <header className="passport-card-header">
            <p className="eyebrow">Home Passport</p>
            <h3>{profileTitle(payload.profile)}</h3>
            <p className="passport-subtitle">
              {profileSubtitle(payload.profile)}
            </p>
            <p className="passport-meta">
              {formatLabel(payload.scope)} scope
              {payload.generatedAt
                ? ` · ${formatMonthYear(payload.generatedAt)}`
                : ""}
            </p>
          </header>

          <PassportSection
            title="Major systems"
            items={payload.assets}
            renderItem={assetLine}
          />

          <PassportSection
            title="Current concerns"
            items={issues}
            renderItem={(issue) => (
              <>
                <span>{issue.title}</span>
                {issue.priority ? (
                  <span
                    className={`priority-badge priority-${issue.priority}`}
                  >
                    {formatLabel(issue.priority)}
                  </span>
                ) : null}
              </>
            )}
          />

          <PassportSection
            title="Recent work"
            items={recentWork}
            renderItem={maintenanceLine}
          />

          <PassportSection
            title="Evidence"
            items={payload.documents}
            renderItem={documentLine}
          />

          <div className="passport-actions">
            <button type="button" onClick={printPassport}>
              Print
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadPassport}
            >
              Download
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={sharePassport}
            >
              Share
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
