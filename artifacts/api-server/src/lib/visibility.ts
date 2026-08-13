import type { PortalReport, PortalUser } from "@workspace/db";
import { isStaff } from "./auth";
import { httpError } from "./http";

/**
 * Visibility is a separate concept from the moderation workflow (status /
 * verification / staff stage). Four effective states, all enforced here:
 *
 *  - `public`     — anyone signed in can view.
 *  - `private`    — reporter + authorized staff only.
 *  - `hidden`     — reporter + authorized staff only, because a moderator or
 *                   administrator hid the report from the community. The
 *                   reporter's original public/private choice is preserved.
 *  - `restricted` — reporter + authorized staff only, because the report is
 *                   priority/risk-critical. The risk policy overrides the
 *                   reporter's choice regardless of what the frontend sends.
 */

export const REPORT_VISIBILITIES = ["public", "private"] as const;
export type ReportVisibility = (typeof REPORT_VISIBILITIES)[number];

export const REPORT_PRIORITIES = ["normal", "high", "critical"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

/** Priorities that automatically restrict community visibility. */
export const RISK_PRIORITIES = new Set<string>(["critical"]);

export type EffectiveVisibility = "public" | "private" | "hidden" | "restricted";

/**
 * Resolves the effective community visibility of a report. Staff hides always
 * win, then the risk policy, then the reporter's original choice.
 */
export function effectiveVisibilityOf(report: Pick<PortalReport, "visibility" | "hidden" | "priority">): EffectiveVisibility {
  if (report.hidden) return "hidden";
  if (RISK_PRIORITIES.has(report.priority)) return "restricted";
  return report.visibility === "private" ? "private" : "public";
}

export function isParticipant(report: PortalReport, viewer: PortalUser): boolean {
  return isStaff(viewer) || report.ownerId === viewer.id;
}

/**
 * Server-side gate: throws 403 unless the viewer may read this report.
 * Staff and the reporter always can; everyone else only when the effective
 * visibility is `public`. The frontend never decides this.
 */
export function assertCanViewReport(report: PortalReport, viewer: PortalUser): void {
  if (isParticipant(report, viewer)) return;
  if (effectiveVisibilityOf(report) === "public") return;
  throw httpError(403, "You do not have access to this report");
}

/** Boolean form used by list endpoints. */
export function canViewReport(report: PortalReport, viewer: PortalUser): boolean {
  if (isParticipant(report, viewer)) return true;
  return effectiveVisibilityOf(report) === "public";
}
