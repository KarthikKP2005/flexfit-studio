# AGENT_RULES.md
### Operating rules for anyone (human or AI) editing FlexFit Studio during the hackathon

This document is the constitution for this repo. It applies to every commit, every
file, every refactor, every "quick fix." If an instruction elsewhere conflicts with
this file, this file wins. If you (the agent) are ever unsure whether an action is
allowed, the default answer is **don't do it yet — document the question and ask.**

The brief is blunt about what's being judged: *how clearly you communicate, how you
organise documentation, how you write code, and how you handle a problem you haven't
seen before.* These rules exist to make all four of those things show up in the repo,
not just in your head.

---

## 0. Prime Directive

> **The app must behave exactly the same when you're done.**
> Same inputs, same outputs, same error codes, same messages, same edge cases,
> same database side effects. A member who could book a class can still book it.
> An admin who could refund a payment can still refund it — including the bugs,
> unless a bug is explicitly triaged and fixed (see Rule 3).

Restructuring is expected and rewarded. Silently changing behavior while
restructuring is the single fastest way to lose marks. **Refactor and fix are two
different acts and must never be hidden inside the same change.**

---

## 1. Red lines — never do these, no exceptions

1. Never change a tRPC procedure's input schema, output shape, error code, or
   error message as a side effect of moving code around. If the shape must change,
   that is a **fix**, not a refactor, and it follows Rule 3.
2. Never touch `src/db/schema.ts` casually. Schema changes are allowed by the brief,
   but every change needs a migration, a reason recorded in
   `architecture-decisions.md`, and a check that nothing downstream silently breaks.
3. Never delete a file's logic and "clean it up" in the same commit as moving it.
   Move first (commit), then clean (separate commit). Two diffs, two purposes.
4. Never fix more than one confirmed defect per commit. One defect ID, one commit,
   one log entry, one test.
5. Never introduce a behavior change without first writing a characterization test
   that captures the *current* behavior (bug included), so the "before" is provable.
6. Never leave a function, loop, or non-obvious business rule without a comment
   (see Rule 5). No exceptions for "obvious" code — the reviewer wasn't in your head.
7. Never mark a task done without updating `EDIT_LOG.md` in the same commit.
8. Never guess at an ambiguous business rule (e.g. "what should refund do to
   existing bookings?"). Document the ambiguity in `known-issues.md` or
   `architecture-decisions.md` and either leave it alone or make an explicit,
   written decision — don't silently pick one behavior and move on.
9. Never use `any` in new or touched TypeScript. If a type must be loosened
   temporarily, write `// TODO(TYPE):` with a one-line reason.
10. Never claim a defect is "fixed" without a passing regression test that would
    have failed before the fix.

---

## 2. Before touching any file

Run this checklist before writing a single line:

- [ ] Have I read the file end to end at least once?
- [ ] Do I understand every tRPC procedure in it and who calls it (grep for usages
      in `src/app/**` and other routers)?
- [ ] Is there an existing characterization test for the behavior I'm about to
      touch? If not, write one **first**, on the untouched code, and get it green.
- [ ] Have I checked `known-issues.md` / `confirmed-defects.md` for whether this
      area is already flagged, so I don't duplicate or contradict prior findings?
- [ ] Do I know which category this change falls into (see Rule 3)?

If any box is unchecked, stop and do that first.

---

## 3. The three kinds of change — pick one, don't blend them

Every commit must declare which of these it is, in the commit message and in
`EDIT_LOG.md`:

| Type | What it means | Requirements |
|---|---|---|
| **REFACTOR** | Code moves, gets renamed, split into modules, deduplicated — behavior is byte-for-byte identical | Characterization test passes unchanged before and after. No output/error/db diff allowed. |
| **FIX** | A confirmed defect is corrected — behavior changes on purpose | Must reference a defect ID from `known-issues.md`. Old (buggy) behavior test is updated to document what changed and why. New test proves the fix. |
| **DOCUMENT** | Nothing in the code changes; a known problem is written up and deliberately left alone | Entry added to `known-issues.md` with severity, reasoning for not fixing, and what "fixed" would look like later. |

If a change doesn't cleanly fit one row, it's too big — split it.

---

## 4. Editing workflow (the loop, every time)

1. **Characterize.** Write a tRPC-caller-level test (see Rule 6) that exercises the
   current behavior of the code you're about to touch, including quirky/buggy
   behavior. Run it. It must pass against the *unmodified* code.
2. **Classify.** Decide REFACTOR / FIX / DOCUMENT (Rule 3). Write the entry stub in
   `EDIT_LOG.md` before you start editing, not after.
3. **Edit.** Make the smallest change that accomplishes the one stated purpose.
4. **Re-run tests.** Characterization test(s) must still pass (REFACTOR/DOCUMENT) or
   must be updated to reflect the intended new behavior with a clear diff
   explaining old vs. new (FIX).
5. **Comment.** Apply the commenting standard (Rule 5) to anything you touched,
   even if you didn't add new logic — if you moved a function and it still has no
   docstring, add one now.
6. **Log.** Finish the `EDIT_LOG.md` entry: what changed, why, files touched, tests
   added/updated, defect ID if applicable, behavior-change Y/N.
7. **Commit.** One logical change per commit. Message format in Rule 9.

---

## 5. Code comment standard

This applies to every file you create or touch, not just new code.

### Every function/procedure needs a header comment
```ts
/**
 * Cancels a member's booking and, if eligible, refunds the credit.
 * Also promotes the longest-waiting waitlisted booking into the freed seat.
 *
 * Behavior notes (do not "fix" silently — see FIX-BOOK-004):
 * - Refund only applies if cancelled >= FREE_CANCELLATION_HOURS before class start.
 * - Promotion does not currently re-check the promoted member's credit balance.
 *
 * @throws NOT_FOUND if the booking doesn't exist
 * @throws FORBIDDEN if the caller doesn't own the booking and isn't staff
 * @throws BAD_REQUEST if the booking is already cancelled/attended
 */
```
- State **what** it does, **why** it exists if non-obvious, and **what errors** it
  can throw with the exact code.
- If the function has a known bug, say so and reference the defect ID rather than
  pretending the current behavior is intentional.

### Every loop needs an intent comment
```ts
// Walk every waitlisted booking for this class, oldest first, until we find
// one whose membership still has enough credits to be promoted (see
// FIX-BOOK-004 — this credit check does not exist yet in the unpatched code).
for (const candidate of waitlisted) { ... }
```
A one-line comment above the loop explaining *why* it iterates and *what it's
looking for* — not a restatement of the code ("loop over items").

### Every non-obvious business rule needs an inline comment with a source
```ts
// Rule: corporate bookings get a 24h free-cancellation window vs 12h for
// personal memberships. Confirmed intentional — see behavior-inventory.md
// under "Corporate booking".
export const CORPORATE_FREE_CANCELLATION_HOURS = 24;
```

### File-level header for every module
Top of every file: 2–4 lines stating what the module is responsible for and,
critically, what it is **not** responsible for (so responsibilities don't creep
back together after you've split things apart).

---

## 6. Testing requirements

- Tests live at the **tRPC caller level** (per the brief) — call procedures
  directly through a server-side caller, not through HTTP or the UI, for speed
  and reliability.
- Every characterization test must assert: return value shape, exact error code +
  message where relevant, and the resulting database state (query the row back).
- Minimum coverage before any refactor of a file begins: happy path + every edge
  case already identified for that domain in `behavior-inventory.md`
  (duplicate booking, no membership, insufficient credits, full class → waitlist,
  cancellation before/after the free window, etc.).
- Tests are never deleted to make a refactor pass. If a test starts failing after
  a REFACTOR, the refactor broke behavior — revert, don't edit the test.
- FIX commits are the only place a test's *expected value* is allowed to change,
  and the old expectation must be visible in the diff/commit, not silently erased.

---

## 7. Folder structure rules

- No file may mix two unrelated responsibilities (e.g. booking policy + waitlist
  promotion + DB access + HTTP response shaping all in one 400-line router).
- Prefer feature folders over type folders where logic is domain-heavy, e.g.:
  ```
  src/features/bookings/
    booking-service.ts       // pure business logic, DB access
    cancellation-service.ts
    waitlist-service.ts
    capacity-service.ts
    booking-policy.ts        // pure functions, no DB — easy to unit test
    booking-errors.ts
  src/server/routers/bookings.ts   // thin: validation + calls into services
  ```
- tRPC routers stay **thin** — validation, calling a service, shaping the
  response. Business logic does not live in the router file.
- Whatever structure you choose, write the reasoning in
  `architecture-decisions.md`. There is no single correct layout — there is only
  a layout you can defend when asked "why did you put it there?"

---

## 8. Commit & PR discipline

Commit message format:
```
<TYPE>(<area>): <one-line summary>

Defect: <ID or "n/a">
Behavior change: <yes/no>
Tests: <added/updated — file names>
```
Example:
```
FIX(bookings): validate credits before promoting waitlisted member

Defect: BOOK-004
Behavior change: yes — promotion now rejects if member lacks credits
Tests: added bookings.waitlist-promotion.test.ts::rejects-insufficient-credit
```
`<TYPE>` is one of `REFACTOR`, `FIX`, `DOCUMENT`, `TEST`, `CHORE`.

Never combine two `<TYPE>`s in one commit.

---

## 9. AI tool usage

Anthropic said it plainly: use AI, they use it too, they're checking whether you
understand what ends up in your repo, not whether you avoided a tool.

- Keep a running note (in `EDIT_LOG.md` or a dedicated section) of which tool
  wrote which non-trivial chunk, in plain language — not for permission, for
  your own honest answer when asked "what tools did you use."
- Before accepting any AI-generated diff: read it, understand every line, and be
  able to explain *why* it's correct, not just *that* it compiles. If you can't
  explain a line, don't merge it — ask the tool to explain it back to you first.
- Never let an AI tool silently "improve" behavior while refactoring. Constrain
  it explicitly with this file and the characterization tests as guardrails.

---

## 10. Definition of Done (per file / per feature)

A file is "done" only when all of the following are true:
- [ ] No function without a header comment (Rule 5)
- [ ] No loop without an intent comment (Rule 5)
- [ ] No unexplained non-obvious business rule
- [ ] Characterization tests exist and pass for its behavior
- [ ] Every REFACTOR/FIX/DOCUMENT applied to it is logged in `EDIT_LOG.md`
- [ ] Any known defect touching it is either fixed-with-tests, or present in
      `known-issues.md` with an explicit reason it wasn't touched
- [ ] It does one job, and its header comment says what that job is

---

## 11. Judging-criteria cheat sheet — map every action back to this

| They're grading... | ...so make sure you always... |
|---|---|
| Communication | Write the "why" before the "what" in every log/comment |
| Documentation organisation | Keep `documents/` current, never let code and docs drift apart |
| Code quality | Small, single-purpose files; no `any`; comments per Rule 5 |
| Handling the unfamiliar | When you hit an ambiguous rule, *show your reasoning* in `architecture-decisions.md` instead of guessing silently |

If an action doesn't clearly serve one of these four, it's not worth doing this
week.
