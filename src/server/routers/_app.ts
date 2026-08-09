import { router } from "../trpc";
import { authRouter } from "./auth";
import { membersRouter } from "./members";
import { plansRouter } from "./plans";
import { classesRouter } from "./classes";
import { bookingsRouter } from "./bookings";
import { paymentsRouter } from "./payments";
import { adminRouter } from "./admin";
import { notificationsRouter } from "./notifications";
import { trainersRouter } from "./trainers";
import { corporateBookingsRouter } from "./corporate-bookings";
import { adminCompaniesRouter } from "./admin-companies";
import { reschedulesRouter } from "./reschedules";
import { adminStaffRouter } from "./adminStaff";
import { adminClassesRouter } from "./adminClasses";
import { adminMembersRouter } from "./adminMembers";
import { adminPlansRouter } from "./adminPlans";

export const appRouter = router({
  auth: authRouter,
  members: membersRouter,
  plans: plansRouter,
  classes: classesRouter,
  bookings: bookingsRouter,
  reschedules: reschedulesRouter,
  corporateBookings: corporateBookingsRouter,
  payments: paymentsRouter,
  admin: adminRouter,
  adminCompanies: adminCompaniesRouter,
  adminStaff: adminStaffRouter,
  adminClasses: adminClassesRouter,
  adminMembers: adminMembersRouter,
  adminPlans: adminPlansRouter,
  notifications: notificationsRouter,
  trainers: trainersRouter,
});

export type AppRouter = typeof appRouter;
