# Architecture Plan

## Core Objectives
1. **Scalability & Clean Separation**: Decouple client components from business logic using tRPC routers and typed services.
2. **Database Integrity**: Leverage Drizzle ORM schemas with typed migrations and seeds.
3. **Performance & Caching**: Optimize React Query cache times and server-side prefetching.

---

## Proposed Refactor Structure

### 1. Data Access Layer
- Modularize database queries into dedicated service files inside `src/server/services/`.
- Ensure fallback handling for uninitialized database tables.

### 2. Router Layer
- Maintain strict type validation using Zod schemas for all tRPC endpoints.
- Modularize tRPC procedures into sub-routers (`classesRouter`, `authRouter`, `plansRouter`).

### 3. Client & UI Layer
- Utilize shared UI components under `src/components/ui/`.
- Implement global state and toast feedback for user actions.
