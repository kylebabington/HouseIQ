/**
 * Invite household members (owner only).
 */
function ShareHomePanel({
  members,
  isOwner,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteError,
  inviteSuccess,
  onInvite,
  onRemove,
  isBusy,
  readOnly = false,
}) {
  return (
    <section className="share-home">
      <h4>Household access</h4>
      {readOnly ? (
        <p>
          Sharing is disabled in the public demo.
        </p>
      ) : (
        <p>
          Owners, household members, and invited helpers
          for this home. Invite by email — they redeem
          access on next sign-in.
        </p>
      )}

      {isOwner && !readOnly ? (
        <form
          className="stack share-form"
          onSubmit={onInvite}
        >
          <label>
            Email
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) =>
                setInviteEmail(event.target.value)
              }
              placeholder="partner@example.com"
              required
            />
          </label>

          <label>
            Role
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value)
              }
            >
              <option value="member">Member (can edit)</option>
              <option value="viewer">Viewer (read + ask)</option>
            </select>
          </label>

          <button type="submit" disabled={isBusy}>
            {isBusy ? "Inviting…" : "Send invite"}
          </button>
        </form>
      ) : null}

      {inviteError ? (
        <p className="error-message" role="alert">
          {inviteError}
        </p>
      ) : null}

      {inviteSuccess ? (
        <p className="success-message">
          {inviteSuccess}
        </p>
      ) : null}

      {members?.length > 0 ? (
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.member_auth0_id}>
              <span>
                {member.invited_email ||
                  member.member_auth0_id}{" "}
                · {member.role}
              </span>
              {isOwner && !readOnly && member.role !== "owner" ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    onRemove(
                      member.member_auth0_id
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          No household members listed yet.
        </p>
      )}
    </section>
  );
}

export default ShareHomePanel;
