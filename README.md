# 🏋️‍♂️ FlexFit Studio

A full-stack fitness class booking and membership management application built with **Next.js 15**, **tRPC**, **Drizzle ORM**, and **SQLite**.

---

## 🚀 Quick Start (How to Run This Project)

Follow these simple steps to set up and run the project locally on your machine after cloning.

### 1. Clone the Repository
```bash
git clone https://github.com/KarthikKP2005/flexfit-studio.git
cd flexfit-studio
```

### 2. Prerequisites
Make sure you have **Node.js (v20 or newer)** installed.

We recommend using **pnpm** as the package manager:
```bash
npm install -g pnpm
```

---

### 3. Setup & Start Server

Run the following commands in order inside the project directory:

#### Using `pnpm` (Recommended):
```bash
# 1. Install dependencies
pnpm install

# 2. Push database schema & seed sample data
pnpm db:push
pnpm db:seed

# 3. Start the development server
pnpm dev
```

#### Using `npm`:
```bash
# 1. Install dependencies
npm install

# 2. Push database schema & seed sample data
npm run db:push
npm run db:seed

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to start using the app! 🎉

---

## 🔐 Pre-configured Test Accounts

Once the database is seeded (`db:seed`), you can log in using these demo credentials:

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| 🛡️ **Admin** | `admin@flexfit.test` | `admin123` | Full administrative access |
| 🏋️ **Trainer** | `arjun@flexfit.test` | `trainer123` | Class roster & attendance management |
| 👤 **Member** | `rahul.k@example.com` | `member123` | Member booking & plan selection |

> 💡 *Note: All demo member accounts use the password `member123`. You can inspect additional seeded emails in `src/db/seed.ts`.*

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the Next.js development server at `http://localhost:3000` |
| `pnpm build` | Compiles the production build |
| `pnpm db:push` | Syncs database schema (`src/db/schema.ts`) to SQLite (`flexfit.db`) |
| `pnpm db:seed` | Populates SQLite database with sample classes, plans, & users |
| `pnpm db:reset` | Resets SQLite database file, re-runs schema push & seed |
| `pnpm test` | Runs unit tests using Vitest |

---

## 📁 Project Folder Structure

```text
flexfit-studio/
├── documents/       # Project design, behavior inventories & architecture notes
├── src/
│   ├── app/         # Next.js App Router (pages & API routes)
│   ├── components/  # Reusable UI & layout components
│   ├── db/          # Drizzle ORM schema, client setup, and seed scripts
│   ├── lib/         # Utility helper functions
│   └── server/      # tRPC backend context & routers
├── drizzle.config.ts# Drizzle ORM configuration
├── next.config.mjs  # Next.js configuration
├── package.json     # Project dependencies & scripts
└── README.md        # Documentation
```

---

## ❓ Troubleshooting & Tips

* **Database Errors / HTTP 500 on start**: If API calls fail when loading the app for the first time, run `pnpm db:reset` to generate a fresh `flexfit.db` database with sample data.
* **Schema Changes**: If you modify `src/db/schema.ts`, run `pnpm db:push` to apply the updates to your local SQLite database.
* **Dev Server Conflict**: Avoid running `pnpm build` while `pnpm dev` is active. If you encounter missing module errors, stop the dev server, delete `.next` folder, and run `pnpm dev` again.
