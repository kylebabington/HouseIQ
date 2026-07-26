// frontend/src/components/home-profile/onboardingHelpers.js

import {
    ONBOARDING_QUESTIONS,
} from "./onboardingQuestions";

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

export function hasKnownValue(
    value
) {
    return (
        value !== null &&
        value !== undefined &&
        value !== ""
    );
}


export function findFirstMissingQuestionIndex(
    profile
) {
    return ONBOARDING_QUESTIONS.findIndex(
        (question) =>
            !hasKnownValue(
                profile?.[
                question.field
                ]
            )
    );
}


export function findSavedQuestionIndex(
    onboardingStep
) {
    if (!onboardingStep) {
        return -1;
    }

    return ONBOARDING_QUESTIONS.findIndex(
        (question) =>
            question.field ===
            onboardingStep
    );
}

