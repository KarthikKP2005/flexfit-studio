# 🏋️‍♂️ FlexFit Studio – Team Collaboration Hub

Welcome to the **FlexFit Studio** repository! This project is being actively developed as a collaborative team. This document serves as our team guide for setting up the project, branch conventions, team communication, and contribution workflows.

---

## 👥 Team Communication & Workflow

To work seamlessly as a single team without code conflicts:

### 1. Branching Strategy
* **`main`**: Production-ready, stable code. Do not push directly to `main`.
* **Feature / Task Branches**: Create branches using the naming convention:
  * `feature/<feature-name>` (e.g., `feature/user-profile`)
  * `fix/<bug-name>` (e.g., `fix/kiosk-checkin`)
  * `refactor/<architecture-change>` (e.g., `refactor/architecture`)

```bash
# Create and switch to your task branch
git checkout -b feature/your-feature-name
```

### 2. Pull Request (PR) Process
1. Before starting work, sync your branch with `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout feature/your-feature-name
   git merge main
   ```
2. Commit your changes with clear messages (`git commit -m "feat: add user check-in button"`).
3. Push your feature branch and open a Pull Request (PR) on GitHub.
4. Notify the team for a code review before merging into `main`.

---

## 🚀 Quick Setup Guide for Team Members

Follow these steps when setting up the project on your local machine after cloning:

```bash
# 1. Clone your team repository
git clone https://github.com/KarthikKP2005/flexfit-studio.git
cd flexfit-studio

# 2. Install dependencies (pnpm recommended)
pnpm install

# 3. Setup SQLite Database & Seed Data
pnpm db:push
pnpm db:seed

# 4. Start local development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Shared Test Credentials

Seed data creates standard accounts for testing all roles:

| Role | Email | Password | Access Details |
| :--- | :--- | :--- | :--- |
| 🛡️ **Admin** | `admin@flexfit.test` | `admin123` | Management, system analytics, configuration |
| 🏋️ **Trainer** | `arjun@flexfit.test` | `trainer123` | Class rosters, attendance tracking |
| 👤 **Member** | `rahul.k@example.com` | `member123` | Class booking, waitlist, memberships |

---

## 🛠️ Common Team Commands

| Command | Usage in Team |
| :--- | :--- |
| `pnpm dev` | Starts local dev server at `http://localhost:3000` |
| `pnpm db:push` | Run whenever a teammate adds/updates database schema in `src/db/schema.ts` |
| `pnpm db:seed` | Reseed your local database with fresh test data |
| `pnpm db:reset` | Wipes local database file and re-seeds (use when local DB gets messy) |
| `pnpm test` | Runs unit test suite before creating a PR |

---

## 📂 System Architecture & Shared Docs

Detailed team documentation is maintained in the [`documents/`](./documents) directory:

- 📋 [Behavior Inventory](./documents/behavior-inventory.md) – User stories, features & flows.
- 🗺️ [System Map](./documents/system-map.md) – Architecture layout, routes, and tRPC mappings.
- 🏗️ [Architecture Plan](./documents/architecture-plan.md) – Technical roadmap & design patterns.
- 🐛 [Known Issues](./documents/known-issues.md) – Common setup & runtime gotchas.
- 📊 [Baseline Results](./documents/baseline-results.md) – Test coverage & build status.

---

## 🤝 Team Rules & Best Practices

1. **Database Schema Changes**: If you modify `src/db/schema.ts`, inform the team in group chat so everyone can run `pnpm db:push` on their local branch.
2. **Never push broken builds**: Run `pnpm test` and ensure `pnpm dev` starts cleanly before creating your PR.
3. **Keep PRs focused**: Keep pull requests focused on a single feature or bug fix so reviews are fast and simple.
