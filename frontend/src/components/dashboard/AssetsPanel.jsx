// frontend/src/components/dashboard/AssetsPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";


function createFormFromAsset(asset) {
  return {
    name: asset.name || "",
    brand: asset.brand || "",
    model: asset.model || "",
    location: asset.location || "",
    notes: asset.notes || "",
  };
}


function AssetsPanel({
  assets,
  homeId,
  onRecordsChanged,
}) {
  // The id of the asset currently in edit mode, or null.
  const [editingAssetId, setEditingAssetId] =
    useState(null);

  const [assetForm, setAssetForm] =
    useState(null);

  const [isSaving, setIsSaving] =
    useState(false);

  // Keyed by asset id so each card can show its own error.
  const [assetErrors, setAssetErrors] =
    useState({});

  function startEditing(asset) {
    setEditingAssetId(asset.id);
    setAssetForm(createFormFromAsset(asset));

    setAssetErrors((current) => ({
      ...current,
      [asset.id]: "",
    }));
  }

  function cancelEditing(asset) {
    setEditingAssetId(null);
    setAssetForm(null);

    setAssetErrors((current) => ({
      ...current,
      [asset.id]: "",
    }));
  }

  async function saveAsset(asset) {
    if (!homeId || !assetForm) {
      return;
    }

    if (!assetForm.name.trim()) {
      setAssetErrors((current) => ({
        ...current,
        [asset.id]: "Name cannot be empty.",
      }));

      return;
    }

    setIsSaving(true);

    setAssetErrors((current) => ({
      ...current,
      [asset.id]: "",
    }));

    try {
      await api.patch(
        `${API_URL}/homes/${homeId}/assets/${asset.id}`,
        {
          name: assetForm.name.trim(),

          brand:
            assetForm.brand.trim() ||
            null,

          model:
            assetForm.model.trim() ||
            null,

          location:
            assetForm.location.trim() ||
            null,

          notes:
            assetForm.notes.trim() ||
            null,
        }
      );

      setEditingAssetId(null);
      setAssetForm(null);

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setAssetErrors((current) => ({
        ...current,

        [asset.id]:
          error.response?.data?.error ||
          "Could not update this asset.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

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
      {assets.map((asset) => {
        const isEditing =
          editingAssetId === asset.id;

        return (
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

                {!isEditing && (
                  <h4>{asset.name}</h4>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="record-edit-form">
                <label>
                  <span>Name</span>

                  <input
                    value={
                      assetForm.name
                    }
                    onChange={(event) =>
                      setAssetForm({
                        ...assetForm,
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Brand</span>

                  <input
                    value={
                      assetForm.brand
                    }
                    onChange={(event) =>
                      setAssetForm({
                        ...assetForm,
                        brand: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Model</span>

                  <input
                    value={
                      assetForm.model
                    }
                    onChange={(event) =>
                      setAssetForm({
                        ...assetForm,
                        model: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Location</span>

                  <input
                    value={
                      assetForm.location
                    }
                    onChange={(event) =>
                      setAssetForm({
                        ...assetForm,
                        location: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Notes</span>

                  <textarea
                    value={
                      assetForm.notes
                    }
                    onChange={(event) =>
                      setAssetForm({
                        ...assetForm,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="record-actions">
                  <button
                    type="button"
                    className="small-button"
                    disabled={isSaving}
                    onClick={() =>
                      saveAsset(asset)
                    }
                  >
                    {isSaving
                      ? "Saving…"
                      : "Save"}
                  </button>

                  <button
                    type="button"
                    className="small-button text-button"
                    disabled={isSaving}
                    onClick={() =>
                      cancelEditing(asset)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
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

                <div className="record-actions">
                  <button
                    type="button"
                    className="small-button secondary-button"
                    onClick={() =>
                      startEditing(asset)
                    }
                  >
                    Edit
                  </button>
                </div>
              </>
            )}

            {assetErrors[asset.id] && (
              <p className="record-inline-error">
                {assetErrors[asset.id]}
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
        );
      })}
    </div>
  );
}


export default AssetsPanel;
