// frontend/src/components/home-profile/HomeOnboarding.jsx

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import "./HomeOnboarding.css";


// ---------------------------------------------------------
// ONBOARDING QUESTION CATALOG
// ---------------------------------------------------------
//
// This is the controlled sequence for the first onboarding
// experience.
//
// Each question identifies:
//
// - the home-profile field it updates
// - the wording shown to the user
// - the expected input type
// - optional choices
// - a function that converts browser input into API data
//
// The LLM does not choose database fields or construct SQL.
// The application owns that logic.
//
const ONBOARDING_QUESTIONS = [
    {
        field:
            "propertyType",

        title:
            "What kind of home is this?",

        helpText:
            "Choose the option that best describes the property.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "single_family",

                label:
                    "Single-family home",
            },
            {
                value:
                    "townhouse",

                label:
                    "Townhouse",
            },
            {
                value:
                    "condo",

                label:
                    "Condominium",
            },
            {
                value:
                    "duplex",

                label:
                    "Duplex",
            },
            {
                value:
                    "manufactured_home",

                label:
                    "Manufactured home",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "squareFeet",

        title:
            "About how large is the home?",

        helpText:
            "An estimate is completely fine. Enter the finished living area in square feet.",

        inputType:
            "number",

        placeholder:
            "Example: 1850",

        minimum:
            1,

        step:
            1,

        suffix:
            "square feet",

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "bedrooms",

        title:
            "How many bedrooms does it have?",

        helpText:
            "Count rooms that are normally considered bedrooms.",

        inputType:
            "number",

        placeholder:
            "Example: 3",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "fullBathrooms",

        title:
            "How many full bathrooms are there?",

        helpText:
            "A full bathroom normally includes a toilet, sink, and bathtub or shower.",

        inputType:
            "number",

        placeholder:
            "Example: 2",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "halfBathrooms",

        title:
            "How many half bathrooms are there?",

        helpText:
            "A half bathroom usually has a toilet and sink but no bathtub or shower.",

        inputType:
            "number",

        placeholder:
            "Example: 1",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "stories",

        title:
            "How many stories does the home have?",

        helpText:
            "Values such as 1, 1.5, and 2 are accepted.",

        inputType:
            "number",

        placeholder:
            "Example: 2",

        minimum:
            0.5,

        step:
            0.5,

        parseValue:
            (value) =>
                Number.parseFloat(
                    value
                ),
    },

    {
        field:
            "foundationType",

        title:
            "What is underneath the home?",

        helpText:
            "Choose the primary foundation type.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "basement",

                label:
                    "Basement",
            },
            {
                value:
                    "crawl_space",

                label:
                    "Crawl space",
            },
            {
                value:
                    "slab",

                label:
                    "Concrete slab",
            },
            {
                value:
                    "pier_and_beam",

                label:
                    "Pier and beam",
            },
            {
                value:
                    "mixed",

                label:
                    "More than one type",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "exteriorMaterial",

        title:
            "What is the primary exterior material?",

        helpText:
            "Choose the material covering most of the outside walls.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "vinyl",

                label:
                    "Vinyl siding",
            },
            {
                value:
                    "wood",

                label:
                    "Wood siding",
            },
            {
                value:
                    "fiber_cement",

                label:
                    "Fiber cement",
            },
            {
                value:
                    "brick",

                label:
                    "Brick",
            },
            {
                value:
                    "stone",

                label:
                    "Stone",
            },
            {
                value:
                    "stucco",

                label:
                    "Stucco",
            },
            {
                value:
                    "metal",

                label:
                    "Metal",
            },
            {
                value:
                    "mixed",

                label:
                    "Mixed materials",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "roofMaterial",

        title:
            "What is the roof made from?",

        helpText:
            "Choose the primary roof covering.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "asphalt_shingle",

                label:
                    "Asphalt shingles",
            },
            {
                value:
                    "metal",

                label:
                    "Metal",
            },
            {
                value:
                    "tile",

                label:
                    "Tile",
            },
            {
                value:
                    "slate",

                label:
                    "Slate",
            },
            {
                value:
                    "wood_shake",

                label:
                    "Wood shake",
            },
            {
                value:
                    "rubber_membrane",

                label:
                    "Rubber membrane",
            },
            {
                value:
                    "built_up",

                label:
                    "Built-up roof",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "heatingType",

        title:
            "How is the home primarily heated?",

        helpText:
            "Choose the system responsible for most of the heating.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "gas_furnace",

                label:
                    "Gas furnace",
            },
            {
                value:
                    "electric_furnace",

                label:
                    "Electric furnace",
            },
            {
                value:
                    "heat_pump",

                label:
                    "Heat pump",
            },
            {
                value:
                    "boiler",

                label:
                    "Boiler",
            },
            {
                value:
                    "radiant",

                label:
                    "Radiant heat",
            },
            {
                value:
                    "baseboard",

                label:
                    "Baseboard heat",
            },
            {
                value:
                    "wood_stove",

                label:
                    "Wood stove",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "coolingType",

        title:
            "How is the home cooled?",

        helpText:
            "Choose the primary cooling system.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "central_air",

                label:
                    "Central air",
            },
            {
                value:
                    "heat_pump",

                label:
                    "Heat pump",
            },
            {
                value:
                    "mini_split",

                label:
                    "Mini-split",
            },
            {
                value:
                    "window_units",

                label:
                    "Window units",
            },
            {
                value:
                    "evaporative_cooler",

                label:
                    "Evaporative cooler",
            },
            {
                value:
                    "none",

                label:
                    "No cooling system",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "waterSource",

        title:
            "Where does the home's water come from?",

        helpText:
            "Most homes use municipal water or a private well.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "municipal",

                label:
                    "Municipal water",
            },
            {
                value:
                    "private_well",

                label:
                    "Private well",
            },
            {
                value:
                    "shared_well",

                label:
                    "Shared well",
            },
            {
                value:
                    "cistern",

                label:
                    "Cistern",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "sewerType",

        title:
            "Where does the wastewater go?",

        helpText:
            "Choose municipal sewer, septic, or the closest match.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "municipal",

                label:
                    "Municipal sewer",
            },
            {
                value:
                    "septic",

                label:
                    "Private septic system",
            },
            {
                value:
                    "shared_septic",

                label:
                    "Shared septic system",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "garageType",

        title:
            "What kind of garage or covered parking does it have?",

        helpText:
            "Choose the closest match.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "none",

                label:
                    "No garage",
            },
            {
                value:
                    "attached",

                label:
                    "Attached garage",
            },
            {
                value:
                    "detached",

                label:
                    "Detached garage",
            },
            {
                value:
                    "carport",

                label:
                    "Carport",
            },
            {
                value:
                    "integral",

                label:
                    "Integral or basement garage",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },
];


// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

function hasKnownValue(
    value
) {
    return (
        value !== null &&
        value !== undefined &&
        value !== ""
    );
}


function findFirstMissingQuestionIndex(
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


function findSavedQuestionIndex(
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
        const nextIndex =
            currentIndex + 1;

        if (
            nextIndex >=
            ONBOARDING_QUESTIONS.length
        ) {
            return null;
        }

        return ONBOARDING_QUESTIONS[
            nextIndex
        ];
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