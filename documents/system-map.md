# System Map

## Architecture Overview
FlexFit Studio is built using a modern full-stack TypeScript stack powered by Next.js App Router, tRPC, Drizzle ORM, and SQLite.

```
[ Frontend: Next.js App Router ] 
             │
      (tRPC Client)
             │
             ▼
 [ Backend: tRPC Routers / API ]
             │
       (Drizzle ORM)
             │
             ▼
  [ Database: SQLite (libsql) ]
```

---

## Directory & Router Mapping

### App Routes (`/src/app`)
- `/` - Landing Page / Home
- `/login` - Authentication Page
- `/schedule` - Class Schedule & Booking
- `/plans` - Membership Plans & Pricing
- `/dashboard` - Member Portal
- `/kiosk` - Self-service Check-in Kiosk
- `/trainer` - Trainer Roster & Class Management
- `/admin` - Administrative Management
- `/notifications` - User Alerts & Reminders
- `/waitlist` - Class Waitlist Status

### Backend Architecture (`/src/server` & `/src/db`)
- `src/server/routers` - tRPC procedures (`auth`, `classes`, `plans`, `users`, etc.)
- `src/db/schema.ts` - Drizzle database schema definitions
- `src/db/seed.ts` - Database seeding script
