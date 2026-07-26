// frontend/src/components/home-profile/HomeOnboarding.jsx

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    ONBOARDING_QUESTIONS,
} from "./onboardingQuestions";

import {
    findFirstMissingQuestionIndex,
    findSavedQuestionIndex,
    hasKnownValue,
} from "./onboardingHelpers";

import "./HomeOnboarding.css";


// ---------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------

function HomeOnboarding({
    profile,
    onSave,
}) {
    const [
        answer,
        setAnswer,
    ] = useState("");

    const [
        isSaving,
        setIsSaving,
    ] = useState(false);

    const [
        errorMessage,
        setErrorMessage,
    ] = useState("");

    const [
        completionMessage,
        setCompletionMessage,
    ] = useState("");


    const currentQuestionIndex =
        useMemo(() => {
            const savedIndex =
                findSavedQuestionIndex(
                    profile?.onboardingStep
                );

            if (
                profile?.onboardingStatus ===
                "in_progress" &&
                savedIndex >= 0
            ) {
                return savedIndex;
            }

            return findFirstMissingQuestionIndex(
                profile
            );
        }, [
            profile,
        ]);


    const currentQuestion =
        ONBOARDING_QUESTIONS[
        currentQuestionIndex
        ];


    const answeredCount =
        ONBOARDING_QUESTIONS.filter(
            (question) =>
                hasKnownValue(
                    profile?.[
                    question.field
                    ]
                )
        ).length;


    const progressPercent =
        Math.round(
            (
                answeredCount /
                ONBOARDING_QUESTIONS.length
            ) *
            100
        );


    const isCompleted =
        profile?.onboardingStatus ===
        "completed";


    const currentField =
        currentQuestion?.field;

    const currentKnownValue =
        currentField
            ? profile?.[
                currentField
            ]
            : undefined;


    // Seed the form from any known profile value for the active step
    // so resume/refresh and editor-filled fields do not look blank.
    useEffect(() => {
        if (!currentField) {
            setAnswer("");
            return;
        }

        setAnswer(
            hasKnownValue(
                currentKnownValue
            )
                ? String(
                    currentKnownValue
                )
                : ""
        );
    }, [
        currentField,
        currentKnownValue,
    ]);


    // Heal inconsistent state: in_progress with no resolvable
    // question (invalid/missing step and every catalog field known).
    useEffect(() => {
        if (
            !profile ||
            profile.onboardingStatus !==
            "in_progress" ||
            currentQuestionIndex !==
            -1
        ) {
            return;
        }

        let cancelled = false;

        async function healCompletedOnboarding() {
            try {
                setIsSaving(true);
                setErrorMessage("");

                await onSave({
                    onboardingStatus:
                        "completed",

                    onboardingStep:
                        null,
                });

                if (!cancelled) {
                    setCompletionMessage(
                        "The initial profile questions are already complete."
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    console.error(
                        "Home onboarding heal failed:",
                        error
                    );

                    setErrorMessage(
                        error.response?.data?.error ||
                        error.message ||
                        "HouseIQ could not update onboarding status."
                    );
                }
            } finally {
                if (!cancelled) {
                    setIsSaving(false);
                }
            }
        }

        healCompletedOnboarding();

        return () => {
            cancelled = true;
        };
    }, [
        profile,
        currentQuestionIndex,
        onSave,
    ]);


    function getNextQuestion(
        currentIndex
    ) {
        for (
            let index =
                currentIndex +
                1;
            index <
            ONBOARDING_QUESTIONS.length;
            index += 1
        ) {
            const question =
                ONBOARDING_QUESTIONS[
                    index
                ];

            if (
                !hasKnownValue(
                    profile?.[
                        question.field
                    ]
                )
            ) {
                return question;
            }
        }

        return null;
    }


    async function startOnboarding() {
        const startingIndex =
            findFirstMissingQuestionIndex(
                profile
            );

        // All initial onboarding fields are already known.
        if (startingIndex === -1) {
            try {
                setIsSaving(true);
                setErrorMessage("");
                setCompletionMessage("");

                await onSave({
                    onboardingStatus:
                        "completed",

                    onboardingStep:
                        null,
                });

                setCompletionMessage(
                    "The initial profile questions are already complete."
                );
            } catch (error) {
                handleSaveError(
                    error
                );
            } finally {
                setIsSaving(false);
            }

            return;
        }

        const startingQuestion =
            ONBOARDING_QUESTIONS[
                startingIndex
            ];

        try {
            setIsSaving(true);
            setErrorMessage("");
            setCompletionMessage("");

            await onSave({
                onboardingStatus:
                    "in_progress",

                onboardingStep:
                    startingQuestion.field,
            });

            setAnswer("");
        } catch (error) {
            handleSaveError(
                error
            );
        } finally {
            setIsSaving(false);
        }
    }


    async function saveAnswer(
        event
    ) {
        event.preventDefault();

        if (!currentQuestion) {
            return;
        }

        const trimmedAnswer =
            typeof answer === "string"
                ? answer.trim()
                : answer;

        if (
            trimmedAnswer === ""
        ) {
            setErrorMessage(
                "Choose or enter an answer before continuing."
            );

            return;
        }

        const parsedValue =
            currentQuestion.parseValue(
                trimmedAnswer
            );

        if (
            currentQuestion.inputType ===
            "number" &&
            !Number.isFinite(
                parsedValue
            )
        ) {
            setErrorMessage(
                "Enter a valid number before continuing."
            );

            return;
        }

        const nextQuestion =
            getNextQuestion(
                currentQuestionIndex
            );

        try {
            setIsSaving(true);
            setErrorMessage("");
            setCompletionMessage("");

            await onSave({
                [currentQuestion.field]:
                    parsedValue,

                onboardingStatus:
                    nextQuestion
                        ? "in_progress"
                        : "completed",

                onboardingStep:
                    nextQuestion
                        ? nextQuestion.field
                        : null,
            });

            setAnswer("");

            if (!nextQuestion) {
                setCompletionMessage(
                    "Initial home onboarding is complete. You can still edit or add details at any time."
                );
            }
        } catch (error) {
            handleSaveError(
                error
            );
        } finally {
            setIsSaving(false);
        }
    }


    async function skipQuestion() {
        const nextQuestion =
            getNextQuestion(
                currentQuestionIndex
            );

        try {
            setIsSaving(true);
            setErrorMessage("");
            setCompletionMessage("");

            await onSave({
                onboardingStatus:
                    nextQuestion
                        ? "in_progress"
                        : "completed",

                onboardingStep:
                    nextQuestion
                        ? nextQuestion.field
                        : null,
            });

            setAnswer("");

            if (!nextQuestion) {
                setCompletionMessage(
                    "Initial onboarding is complete. Some details are still unknown, and you can fill them in later."
                );
            }
        } catch (error) {
            handleSaveError(
                error
            );
        } finally {
            setIsSaving(false);
        }
    }


    async function restartOnboarding() {
        const firstMissingIndex =
            findFirstMissingQuestionIndex(
                profile
            );

        if (
            firstMissingIndex ===
            -1
        ) {
            setCompletionMessage(
                "All initial onboarding details are already known."
            );

            return;
        }

        const firstQuestion =
            ONBOARDING_QUESTIONS[
                firstMissingIndex
            ];

        try {
            setIsSaving(true);
            setErrorMessage("");
            setCompletionMessage("");

            await onSave({
                onboardingStatus:
                    "in_progress",

                onboardingStep:
                    firstQuestion.field,
            });

            setAnswer("");
        } catch (error) {
            handleSaveError(
                error
            );
        } finally {
            setIsSaving(false);
        }
    }


    function handleSaveError(
        error
    ) {
        console.error(
            "Home onboarding update failed:",
            error
        );

        const fieldErrors =
            error.response?.data?.fields;

        if (
            fieldErrors &&
            typeof fieldErrors ===
            "object"
        ) {
            setErrorMessage(
                Object.values(
                    fieldErrors
                ).join(" ")
            );

            return;
        }

        setErrorMessage(
            error.response?.data?.error ||
            error.message ||
            "HouseIQ could not save the onboarding answer."
        );
    }


    if (!profile) {
        return null;
    }


    if (
        profile.onboardingStatus ===
        "not_started"
    ) {
        return (
            <section className="home-onboarding home-onboarding-introduction">
                <div>
                    <p className="eyebrow">
                        Guided setup
                    </p>

                    <h4>
                        Teach HouseIQ about this home
                    </h4>

                    <p>
                        HouseIQ will ask a short series of questions about the property's size, structure, and major systems. You can skip anything you do not know.
                    </p>
                </div>

                {errorMessage && (
                    <p className="home-onboarding-error">
                        {
                            errorMessage
                        }
                    </p>
                )}

                <button
                    type="button"
                    onClick={
                        startOnboarding
                    }
                    disabled={
                        isSaving
                    }
                >
                    {isSaving
                        ? "Starting..."
                        : "Start guided setup"}
                </button>
            </section>
        );
    }


    // Treat a missing current question the same as completed so the
    // active-step view never reads properties off undefined.
    if (
        isCompleted ||
        !currentQuestion
    ) {
        return (
            <section className="home-onboarding home-onboarding-complete">
                <div>
                    <p className="eyebrow">
                        Guided setup
                    </p>

                    <h4>
                        Initial onboarding complete
                    </h4>

                    <p>
                        HouseIQ has enough basic information to begin giving more context-aware guidance. Unknown details can still be added from the profile editor.
                    </p>
                </div>

                <div className="home-onboarding-complete-actions">
                    <span>
                        {
                            answeredCount
                        }{" "}
                        of{" "}
                        {
                            ONBOARDING_QUESTIONS.length
                        }{" "}
                        onboarding details known
                    </span>

                    <button
                        type="button"
                        className="secondary-button"
                        onClick={
                            restartOnboarding
                        }
                        disabled={
                            isSaving
                        }
                    >
                        Review missing details
                    </button>
                </div>

                {completionMessage && (
                    <p className="home-onboarding-success">
                        {
                            completionMessage
                        }
                    </p>
                )}

                {errorMessage && (
                    <p className="home-onboarding-error">
                        {
                            errorMessage
                        }
                    </p>
                )}
            </section>
        );
    }


    return (
        <section className="home-onboarding">
            <header className="home-onboarding-header">
                <div>
                    <p className="eyebrow">
                        Guided setup
                    </p>

                    <h4>
                        {
                            currentQuestion.title
                        }
                    </h4>

                    <p>
                        {
                            currentQuestion.helpText
                        }
                    </p>
                </div>

                <span className="home-onboarding-count">
                    Question{" "}
                    {
                        currentQuestionIndex +
                        1
                    }{" "}
                    of{" "}
                    {
                        ONBOARDING_QUESTIONS.length
                    }
                </span>
            </header>


            <div className="home-onboarding-progress">
                <div className="home-onboarding-progress-track">
                    <div
                        className="home-onboarding-progress-fill"
                        style={{
                            width:
                                `${progressPercent}%`,
                        }}
                    />
                </div>

                <span>
                    {
                        progressPercent
                    }
                    % known
                </span>
            </div>


            <form
                className="home-onboarding-form"
                onSubmit={
                    saveAnswer
                }
            >
                {currentQuestion.inputType ===
                    "choice" ? (
                    <div className="home-onboarding-options">
                        {currentQuestion.options.map(
                            (option) => (
                                <label
                                    key={
                                        option.value
                                    }
                                    className={
                                        answer ===
                                            option.value
                                            ? "home-onboarding-option selected"
                                            : "home-onboarding-option"
                                    }
                                >
                                    <input
                                        type="radio"
                                        name={
                                            currentQuestion.field
                                        }
                                        value={
                                            option.value
                                        }
                                        checked={
                                            answer ===
                                            option.value
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            setAnswer(
                                                event
                                                    .target
                                                    .value
                                            )
                                        }
                                        disabled={
                                            isSaving
                                        }
                                    />

                                    <span>
                                        {
                                            option.label
                                        }
                                    </span>
                                </label>
                            )
                        )}
                    </div>
                ) : (
                    <label className="home-onboarding-number-field">
                        <span>
                            Your answer
                        </span>

                        <div>
                            <input
                                type="number"
                                value={
                                    answer
                                }
                                min={
                                    currentQuestion.minimum
                                }
                                step={
                                    currentQuestion.step
                                }
                                placeholder={
                                    currentQuestion.placeholder
                                }
                                onChange={(
                                    event
                                ) =>
                                    setAnswer(
                                        event
                                            .target
                                            .value
                                    )
                                }
                                disabled={
                                    isSaving
                                }
                            />

                            {currentQuestion.suffix && (
                                <span>
                                    {
                                        currentQuestion.suffix
                                    }
                                </span>
                            )}
                        </div>
                    </label>
                )}


                {errorMessage && (
                    <p className="home-onboarding-error">
                        {
                            errorMessage
                        }
                    </p>
                )}

                {completionMessage && (
                    <p className="home-onboarding-success">
                        {
                            completionMessage
                        }
                    </p>
                )}


                <div className="home-onboarding-actions">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={
                            skipQuestion
                        }
                        disabled={
                            isSaving
                        }
                    >
                        I don't know
                    </button>

                    <button
                        type="submit"
                        disabled={
                            isSaving
                        }
                    >
                        {isSaving
                            ? "Saving..."
                            : "Save and continue"}
                    </button>
                </div>
            </form>
        </section>
    );
}


export default HomeOnboarding;
