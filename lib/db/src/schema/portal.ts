import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const portalUsersTable = pgTable(
  "portal_users",
  {
    id: serial("id").primaryKey(),
    // Permanent random user tag (e.g. "A7K4P2", displayed as #A7K4P2).
    // Generated automatically; never derived from database ids. The unique
    // index below (portal_users_tag_idx) enforces uniqueness.
    tag: text("tag"),
    displayName: text("display_name").notNull().default("Nulls reporter"),
    role: text("role").notNull().default("user"),
    blocked: boolean("blocked").notNull().default(false),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    nullsConnectId: text("nulls_connect_id"),
    nullsConnectName: text("nulls_connect_name"),
    avatarPath: text("avatar_path"),
    // Discord identity when the user signed in (or linked) via Discord OAuth.
    discordId: text("discord_id"),
    discordUsername: text("discord_username"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("portal_users_tag_idx").on(table.tag)],
);

/**
 * Authentication identities. One portal account can have many linked
 * identities (Discord, Nulls Connect) and each provider identity maps to
 * exactly one internal account — providers are never separate accounts.
 */
export const authIdentitiesTable = pgTable(
  "auth_identities",
  {
    id: serial("id").primaryKey(),
    // discord | nulls_connect
    provider: text("provider").notNull(),
    // Provider-side user id (Discord id, Nulls player id)
    providerUserId: text("provider_user_id").notNull(),
    portalUserId: integer("portal_user_id")
      .notNull()
      .references(() => portalUsersTable.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("auth_identities_provider_user_idx").on(table.provider, table.providerUserId)],
);

/** Server-side sessions: opaque random token, stored hashed, HttpOnly cookie. */
export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  portalUserId: integer("portal_user_id")
    .notNull()
    .references(() => portalUsersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalCountersTable = pgTable("portal_counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const portalReportsTable = pgTable("portal_reports", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  ownerId: integer("owner_id").notNull().references(() => portalUsersTable.id),
  game: text("game").notNull().default("nulls-brawl"),
  category: text("category").notNull(),
  subtype: text("subtype").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull(),
  anonymous: boolean("anonymous").notNull().default(false),
  // Original reporter-chosen visibility (public | private). The community can
  // see public reports; private ones are reporter + staff only.
  visibility: text("visibility").notNull().default("public"),
  // Staff can hide a report from the community. `hidden` overrides the
  // original visibility; the original setting stays stored for the audit log.
  hidden: boolean("hidden").notNull().default(false),
  hiddenBy: integer("hidden_by").references(() => portalUsersTable.id),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
  // Ticket workflow status — describes what is currently happening.
  status: text("status").notNull().default("new"),
  // Verification state — persists independently from `status` so changing
  // the ticket status never erases whether a moderator verified/rejected it.
  verification: text("verification").notNull().default("unverified"),
  // community | game — the top-level reporting flow the ticket came from.
  issueType: text("issue_type").notNull().default("community"),
  // Structured answers from the guided report form (data-driven fields).
  fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
  priority: text("priority").notNull().default("normal"),
  allowUserMessages: boolean("allow_user_messages").notNull().default(false),
  verifiedBy: integer("verified_by").references(() => portalUsersTable.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  forwardedBy: integer("forwarded_by").references(() => portalUsersTable.id),
  resolvedBy: integer("resolved_by").references(() => portalUsersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const reportHistoryTable = pgTable("report_history", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => portalReportsTable.id),
  actorId: integer("actor_id").references(() => portalUsersTable.id),
  // Role of the actor at the time of the action, so the audit log stays
  // truthful even if the user is later promoted/demoted.
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  fromVerification: text("from_verification"),
  toVerification: text("to_verification"),
  // Generic old/new values for field edits (title, priority, …).
  fromValue: text("from_value"),
  toValue: text("to_value"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportMessagesTable = pgTable(
  "report_messages",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull().references(() => portalReportsTable.id),
    authorId: integer("author_id").notNull().references(() => portalUsersTable.id),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    // Client-generated idempotency key: the same (report, author, key) can
    // never insert twice, so a double-click or a retry cannot duplicate a
    // message. NULL for legacy rows.
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_messages_dedupe_key_idx").on(
      table.reportId,
      table.authorId,
      table.dedupeKey,
    ),
  ],
);

export const reportAttachmentsTable = pgTable("report_attachments", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => portalReportsTable.id),
  // Set when the attachment was sent inside a ticket message; null for
  // attachments attached directly to the report at submission.
  messageId: integer("message_id").references(() => reportMessagesTable.id),
  uploaderId: integer("uploader_id").notNull().references(() => portalUsersTable.id),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uploads requested via the storage API but not yet attached to a report. */
export const pendingUploadsTable = pgTable("pending_uploads", {
  id: serial("id").primaryKey(),
  uploaderId: integer("uploader_id").notNull().references(() => portalUsersTable.id),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalNotificationsTable = pgTable("portal_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => portalUsersTable.id),
  reportId: integer("report_id").references(() => portalReportsTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortalUserSchema = createInsertSchema(portalUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPortalReportSchema = createInsertSchema(portalReportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});
export const insertReportHistorySchema = createInsertSchema(reportHistoryTable).omit({
  id: true,
  createdAt: true,
});
export const insertReportMessageSchema = createInsertSchema(reportMessagesTable).omit({
  id: true,
  createdAt: true,
});
export const insertReportAttachmentSchema = createInsertSchema(reportAttachmentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertPendingUploadSchema = createInsertSchema(pendingUploadsTable).omit({
  id: true,
  createdAt: true,
});
export const insertPortalNotificationSchema = createInsertSchema(portalNotificationsTable).omit({
  id: true,
  createdAt: true,
  readAt: true,
});
export const insertAuthIdentitySchema = createInsertSchema(authIdentitiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export type PortalUser = typeof portalUsersTable.$inferSelect;
export type AuthIdentity = typeof authIdentitiesTable.$inferSelect;
export type PortalSession = typeof sessionsTable.$inferSelect;
export type PortalReport = typeof portalReportsTable.$inferSelect;
export type ReportHistory = typeof reportHistoryTable.$inferSelect;
export type ReportMessage = typeof reportMessagesTable.$inferSelect;
export type ReportAttachment = typeof reportAttachmentsTable.$inferSelect;
export type PendingUpload = typeof pendingUploadsTable.$inferSelect;
export type PortalNotification = typeof portalNotificationsTable.$inferSelect;
