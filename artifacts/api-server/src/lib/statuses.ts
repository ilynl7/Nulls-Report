/**
 * Canonical ticket state model.
 *
 * Three independent concepts drive every report:
 *
 *  - `status`        — what is currently happening with the ticket
 *                      (new → under_review → awaiting_admin → in_progress →
 *                       waiting_for_user → resolved → closed).
 *  - `verification`  — has a moderator determined the report is legitimate?
 *                      (unverified / verified / rejected). This persists
 *                      independently: changing the ticket status never
 *                      overwrites it.
 *  - `staffStage`    — which part of the workflow is responsible right now
 *                      (derived from status + verification).
 */

export const TICKET_STATUSES = [
  "new",
  "under_review",
  "awaiting_admin",
  "in_progress",
  "waiting_for_user",
  "resolved",
  "closed",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const VERIFICATIONS = ["unverified", "verified", "rejected"] as const;

export type Verification = (typeof VERIFICATIONS)[number];

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  under_review: "Under review",
  awaiting_admin: "Awaiting administrator",
  in_progress: "In progress",
  waiting_for_user: "Waiting for user",
  resolved: "Resolved",
  closed: "Closed",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: "Unverified",
  verified: "Verified",
  rejected: "Rejected",
};

export const TERMINAL_STATUSES = new Set(["resolved", "closed"]);

/** Which ticket statuses each role may set directly via the update endpoint. */
export const STATUS_PERMISSIONS: Record<string, string[]> = {
  moderator: ["new", "under_review", "closed"],
  administrator: [
    "new",
    "under_review",
    "awaiting_admin",
    "in_progress",
    "waiting_for_user",
    "resolved",
    "closed",
  ],
};

export function staffStageOf(status: string, verification: string): string {
  if (verification === "rejected" || TERMINAL_STATUSES.has(status)) {
    return "resolution";
  }
  if (verification === "verified") {
    return "administrator_review";
  }
  return "moderator_review";
}
