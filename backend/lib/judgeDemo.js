export const JUDGE_ASK_QUESTION =
    "What major expenses should I prepare for over the next three years?";

export const JUDGE_AUDIT_QUESTION =
    "What evidence supports what HouseIQ believes about the furnace?";

export function getPublicDemoHomeId() {
    return (process.env.PUBLIC_DEMO_HOME_ID || "").trim();
}
