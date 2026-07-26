// frontend/src/components/dashboard/AssetsPanel.jsx

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


function AssetsPanel({ assets }) {
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


export default AssetsPanel;
