import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";

/**
 * Drizzle table definitions for the whole app — the single source of
 * truth for what's in flexfit.db. Not responsible for: query logic,
 * business rules, or validation (those live in the routers/services that
 * use these tables). Per AGENT_RULES.md Rule 1.2, changes here need a
 * migration, a recorded reason in architecture-decisions.md, and a check
 * that nothing downstream breaks — this pass only adds comments, no
 * column/type/constraint changed.
 */

/** Every person with an account: members, trainers, admins (see `role`). */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role", { enum: ["member", "trainer", "admin"] })
    .notNull()
    .default("member"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Auth session tokens, one row per signed-in device/browser. `token` is
 * the value stored in the flexfit_session cookie (see trpc.ts's
 * SESSION_COOKIE / createContext).
 */
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Purchasable plan catalog (name, price, duration, class credits).
 * `memberships` rows reference these; deactivating a plan (active: false)
 * does not affect memberships already created from it.
 */
export const membershipPlans = sqliteTable("membership_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  durationDays: integer("duration_days").notNull(),
  classCredits: integer("class_credits").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/**
 * A member's purchased plan instance. `creditsRemaining >=
 * UNLIMITED_CREDITS` (999, see bookings.ts) is treated as an unlimited
 * plan that never decrements. `status` is tracked independently of the
 * date range — a row can be status: "active" with an already-past
 * endDate; callers that need "usable today" check both (see bookings.ts's
 * activeMembershipFor).
 */
export const memberships = sqliteTable("memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => membershipPlans.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  creditsRemaining: integer("credits_remaining").notNull().default(0),
  status: text("status", { enum: ["active", "expired", "cancelled", "frozen"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A single scheduled class instance, not a recurring series — two
 * "Sunrise Yoga" sessions on different days are two separate rows with
 * the same `name`. Same-named instances are not required to share the
 * same `creditCost`.
 */
export const classes = sqliteTable("classes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  trainerId: integer("trainer_id").references(() => users.id),
  room: text("room").notNull(),
  capacity: integer("capacity").notNull(),
  startsAt: text("starts_at").notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  creditCost: integer("credit_cost").notNull().default(1),
  cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A member's personal booking, paid from their own membership credits.
 * Structurally parallel to `corporateBookings` below (same status/credit
 * shape), which is paid from a company's credit pool instead — the two
 * tables are tracked, capacitated, and waitlisted independently of each
 * other in the current code.
 */
export const bookings = sqliteTable("bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  classId: integer("class_id")
    .notNull()
    .references(() => classes.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  membershipId: integer("membership_id").references(() => memberships.id),
  status: text("status", {
    enum: ["booked", "cancelled", "attended", "no_show", "waitlisted"],
  })
    .notNull()
    .default("booked"),
  creditsUsed: integer("credits_used").notNull().default(0),
  bookedAt: text("booked_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  cancelledAt: text("cancelled_at"),
});

/**
 * Attendance record. `bookingId` only foreign-keys to `bookings`
 * (personal) — corporate check-ins currently insert this with
 * `bookingId: null` (see corporate-bookings.ts's markAttended), so a
 * corporate attendee's check-in row can't be traced back to their
 * corporate booking through this column.
 */
export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  bookingId: integer("booking_id").references(() => bookings.id),
  checkedInAt: text("checked_in_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  source: text("source", { enum: ["front_desk", "kiosk", "app"] })
    .notNull()
    .default("front_desk"),
});

/**
 * One row per payment event. `plans.ts`'s subscribe mutation inserts one
 * automatically as status: "paid" — there's no real payment gateway
 * involved, purchase is instant.
 */
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  membershipId: integer("membership_id").references(() => memberships.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method", { enum: ["card", "cash", "upi", "transfer"] }).notNull(),
  status: text("status", { enum: ["pending", "paid", "failed", "refunded"] })
    .notNull()
    .default("pending"),
  reference: text("reference"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * `type` includes waitlist_promotion / class_cancelled /
 * membership_expiring, but only "announcement" (admin broadcast, see
 * notifications.ts) is ever inserted anywhere in the current code — the
 * other three types are defined here but never triggered.
 */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type", {
    enum: ["waitlist_promotion", "class_cancelled", "membership_expiring", "announcement"],
  })
    .notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * One row per trainer per day-of-week (`dayOfWeek` 0-6). trainers.ts's
 * checkAvailability compares this against getUTCDay()/getUTCHours(), so
 * `startTime`/`endTime` here are effectively interpreted as UTC clock
 * times, not the trainer's local time.
 */
export const trainerAvailability = sqliteTable("trainer_availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Audit trail of a reschedule action — links the cancelled fromBooking/
 * fromClass to the new toBooking/toClass it was moved to. Carries no
 * credit information itself; that lives on the `bookings` rows it
 * references.
 */
export const reschedules = sqliteTable("reschedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  fromBookingId: integer("from_booking_id")
    .notNull()
    .references(() => bookings.id),
  toBookingId: integer("to_booking_id")
    .notNull()
    .references(() => bookings.id),
  fromClassId: integer("from_class_id")
    .notNull()
    .references(() => classes.id),
  toClassId: integer("to_class_id")
    .notNull()
    .references(() => classes.id),
  rescheduledAt: text("rescheduled_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A corporate account with a shared credit pool (`creditPoolBalance`)
 * that its linked employees (see `companyMembers`) draw from via
 * `corporateBookings`.
 */
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull(),
  creditPoolBalance: integer("credit_pool_balance").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Links a user to a company — at most one company per user. `userId` is
 * unique (see COMPANY-001 in known-issues.md): a member must be unlinked
 * from their current company before being linked to a different one;
 * `admin-companies.ts`'s `linkMember` surfaces a violation of this as a
 * clean CONFLICT rather than a raw DB error.
 */
export const companyMembers = sqliteTable("company_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Same status/credit shape as `bookings`, but paid from the linked
 * company's `creditPoolBalance` instead of a personal membership. Kept as
 * a separate table rather than a variant of `bookings` in this pass — see
 * architecture-decisions.md for the reasoning.
 */
export const corporateBookings = sqliteTable("corporate_bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  classId: integer("class_id")
    .notNull()
    .references(() => classes.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  status: text("status", {
    enum: ["booked", "cancelled", "attended", "no_show", "waitlisted"],
  })
    .notNull()
    .default("booked"),
  creditsUsed: integer("credits_used").notNull().default(0),
  bookedAt: text("booked_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  cancelledAt: text("cancelled_at"),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type GymClass = typeof classes.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type TrainerAvailability = typeof trainerAvailability.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type CorporateBooking = typeof corporateBookings.$inferSelect;
export type Reschedule = typeof reschedules.$inferSelect;
