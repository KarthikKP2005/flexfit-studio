import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

/**
 * Next.js route handler wiring the whole tRPC router into the App
 * Router's fetch-based API surface. Not responsible for anything beyond
 * that wiring — auth/validation/business logic all live in the router
 * tree and trpc.ts's context.
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
