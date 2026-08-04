// frontend/src/components/home-profile/OnboardingGate.jsx

import HomeOnboarding from "./HomeOnboarding.jsx";

/**
 * Blocking first-run gate so the home knows basics before ask.
 */
function OnboardingGate({
  homeId,
  homeProfile,
  onProfileSaved,
  onSkip,
  askUnlocked,
  askLockReason,
}) {
  return (
    <section
      className="onboarding-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-gate-title"
    >
      <div className="onboarding-gate-card">
        <p className="eyebrow">Know this home</p>
        <h2 id="onboarding-gate-title">
          Help HouseIQ know your house better than you do
        </h2>
        <p>
          A few physical facts make every answer and
          priority board grounded in <em>this</em> home —
          not generic advice.
        </p>

        {!askUnlocked ? (
          <p className="onboarding-gate-lock" role="status">
            Ask is locked until basics are known
            {askLockReason
              ? `: ${askLockReason}`
              : "."}
          </p>
        ) : null}

        <HomeOnboarding
          homeId={homeId}
          homeProfile={homeProfile}
          onProfileSaved={onProfileSaved}
        />

        <div className="onboarding-gate-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </section>
  );
}

export default OnboardingGate;
