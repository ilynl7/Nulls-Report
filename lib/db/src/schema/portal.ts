import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const portalUsersTable = pgTable("portal_users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name").notNull().default("Nulls reporter"),
  role: text("role").notNull().default("user"),
  blocked: boolean("blocked").notNull().default(false),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
  nullsConnectId: text("nulls_connect_id"),
  nullsConnectName: text("nulls_connect_name"),
  avatarPath: text("avatar_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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
  status: text("status").notNull().default("submitted"),
  priority: text("priority").notNull().default("normal"),
  allowUserMessages: boolean("allow_user_messages").notNull().default(false),
  verifiedBy: integer("verified_by").references(() => portalUsersTable.id),
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
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportMessagesTable = pgTable("report_messages", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => portalReportsTable.id),
  authorId: integer("author_id").notNull().references(() => portalUsersTable.id),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export type PortalUser = typeof portalUsersTable.$inferSelect;
export type PortalReport = typeof portalReportsTable.$inferSelect;
export type ReportHistory = typeof reportHistoryTable.$inferSelect;
export type ReportMessage = typeof reportMessagesTable.$inferSelect;
export type ReportAttachment = typeof reportAttachmentsTable.$inferSelect;
export type PendingUpload = typeof pendingUploadsTable.$inferSelect;
export type PortalNotification = typeof portalNotificationsTable.$inferSelect;
