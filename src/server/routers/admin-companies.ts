import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  companies,
  companyMembers,
  users,
  corporateBookings,
  classes,
  corporateLedger,
} from "@/db/schema";
import { router, adminProcedure } from "../trpc";

/**
 * Admin CRUD for corporate accounts: company records, credit pool
 * top-ups, and employee linking. Not responsible for: spending a
 * company's credit pool (see corporate-bookings.ts) or a ledger of top-up
 * history (see ADMIN-002 in known-issues.md — top-ups only ever mutate
 * the balance directly, no audit trail).
 */

export const adminCompaniesRouter = router({
  /** All companies, newest first. */
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: companies.id,
        name: companies.name,
        contactEmail: companies.contactEmail,
        creditPoolBalance: companies.creditPoolBalance,
        active: companies.active,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .orderBy(desc(companies.createdAt));
  }),

  /**
   * Company detail plus its linked members and its 20 most recent
   * corporate bookings.
   *
   * @throws NOT_FOUND if the company doesn't exist
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.db
        .select()
        .from(companies)
        .where(eq(companies.id, input.id))
        .get();

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      const members = await ctx.db
        .select({
          id: users.id,
          companyMemberId: companyMembers.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
        })
        .from(companyMembers)
        .innerJoin(users, eq(companyMembers.userId, users.id))
        .where(eq(companyMembers.companyId, company.id))
        .orderBy(users.name);

      const recentBookings = await ctx.db
        .select({
          id: corporateBookings.id,
          status: corporateBookings.status,
          creditsUsed: corporateBookings.creditsUsed,
          bookedAt: corporateBookings.bookedAt,
          className: classes.name,
          startsAt: classes.startsAt,
          memberName: users.name,
        })
        .from(corporateBookings)
        .innerJoin(classes, eq(corporateBookings.classId, classes.id))
        .innerJoin(users, eq(corporateBookings.userId, users.id))
        .where(eq(corporateBookings.companyId, company.id))
        .orderBy(desc(corporateBookings.bookedAt))
        .limit(20);

      return {
        ...company,
        members,
        recentBookings,
      };
    }),

  /** Creates a new company, always active, with an initial credit pool (default 0). */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        contactEmail: z.string().email(),
        creditPoolBalance: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db
        .insert(companies)
        .values({
          name: input.name,
          contactEmail: input.contactEmail,
          creditPoolBalance: input.creditPoolBalance,
          active: true,
        })
        .returning()
        .get();

      return created;
    }),

  /**
   * Toggles a company's active flag.
   *
   * @throws NOT_FOUND if the company doesn't exist
   */
  updateActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db
        .select()
        .from(companies)
        .where(eq(companies.id, input.id))
        .get();

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      return ctx.db
        .update(companies)
        .set({ active: input.active })
        .where(eq(companies.id, input.id))
        .returning()
        .get();
    }),

  /**
   * Adds `amount` to a company's credit pool balance and logs it in corporateLedger.
   *
   * @throws NOT_FOUND if the company doesn't exist
   */
  topUp: adminProcedure
    .input(z.object({ id: z.number(), amount: z.number().int().positive(), amountCents: z.number().int().min(0).default(0) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const company = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, input.id))
          .get();

        if (!company) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        }

        const updated = await tx
          .update(companies)
          .set({
            creditPoolBalance: company.creditPoolBalance + input.amount,
          })
          .where(eq(companies.id, input.id))
          .returning()
          .get();

        await tx.insert(corporateLedger).values({
          companyId: company.id,
          amountCents: input.amountCents,
          creditsAdded: input.amount,
        });

        return updated;
      });
    }),

  /**
   * Links a member to a company.
   *
   * Behavior note (see COMPANY-001 in known-issues.md — not fixed here):
   * only rejects an exact duplicate (same user + same company) — nothing
   * stops a user from being linked to more than one company at once.
   *
   * @throws NOT_FOUND if the company or user doesn't exist
   * @throws BAD_REQUEST if the user's role isn't "member"
   * @throws CONFLICT if this exact user+company link already exists
   */
  linkMember: adminProcedure
    .input(z.object({ companyId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db
        .select()
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .get();

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (user.role !== "member") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only members can be linked to companies.",
        });
      }

      const existing = await ctx.db
        .select()
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.userId, input.userId),
            eq(companyMembers.companyId, input.companyId),
          ),
        )
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This member is already linked to this company.",
        });
      }

      return ctx.db
        .insert(companyMembers)
        .values({
          userId: input.userId,
          companyId: input.companyId,
        })
        .returning()
        .get();
    }),

  /**
   * Removes a member-company link.
   *
   * @throws NOT_FOUND if the link doesn't exist
   */
  unlinkMember: adminProcedure
    .input(z.object({ companyMemberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyMember = await ctx.db
        .select()
        .from(companyMembers)
        .where(eq(companyMembers.id, input.companyMemberId))
        .get();

      if (!companyMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Company member link not found.",
        });
      }

      await ctx.db
        .delete(companyMembers)
        .where(eq(companyMembers.id, input.companyMemberId));

      return { ok: true };
    }),
});
