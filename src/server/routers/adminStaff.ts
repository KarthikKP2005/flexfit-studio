import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { router, adminProcedure } from "../trpc";

export const adminStaffRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(inArray(users.role, ["admin", "trainer"]));
  }),

  createTrainer: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with that email already exists.",
        });
      }

      await ctx.db.insert(users).values({
        name: input.name,
        email,
        passwordHash: hashPassword(input.password),
        role: "trainer",
        active: true,
      });

      return { ok: true };
    }),
});
