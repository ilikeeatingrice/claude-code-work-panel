# Task briefs

A **task brief** is the plan for one task, written so a fresh session that has never seen
the discussion can do the task well from the brief and the files it points to. It plays the
part of the plan file in plan mode: the context is cleared, the brief is what survives.

Path: `docs/programs/<plan_id>/tasks/<key>.md`, next to `PLAN.md` (or where the project's
tracking protocol puts plans). The task file's `brief:` field points to it.

## Sections, in this order

```markdown
# <key>: <task title>

## Context
Why this task exists: the problem, what prompted it, the outcome wanted. Two to five lines.

## Decisions
Every decision that binds this task, each with who made it and when, quoting the person's
own words when they made it. Numbers and limits go here (sizes, durations, counts, formats).
- 4–30 s videos (owner, 2026-10-17: "yes to the rest").

## Approach
The recommended approach only, in steps. Where the discussion weighed options, one line per
rejected option and why, so the next session does not reopen it.

## Files and code to reuse
The files to change (matches the task's planned files), and existing functions, modules
and patterns to reuse, each with its path.

## Supporting material
Every document, design page, handoff package, screenshot or earlier session that holds more
detail, each at a lasting path, with what to read in it and why. Mark the ones the session
must read before starting with **must read**.
- **must read** `docs/dev/upload-design.md` rules 1 and 3.
- `docs/handoff/<handoff>.zip` → `page.html`: the designer's page mockup.
- Source discussion: session `<session id>`, `<start>`–`<end>` UTC.

## Discussion points covered
The ids from PLAN.md's `## Discussion points` that this brief carries, each restated in a
line, so the reader does not need PLAN.md open: `P07 — the terms tick before paying (kept).`

## Open questions
What is still undecided, and who decides. "None" when there are none.

## Verification
How to prove the task works end to end: the commands, the real scenario, what the person
should see. Acceptance criteria stay in the task file; this says how to check them.

## Fresh-session check
Date, who ran it, the questions the fresh reader raised, and how each was answered in this
brief. "No blocking questions" once it comes back clean.
```

## Rules

- **Lasting paths.** A brief never points into `/tmp`, a session scratchpad, or a download
  folder that gets cleaned. Copy the file into the repository or point at its lasting copy
  (for example a synced notes vault). `validate` refuses `/tmp/` and `scratchpad` paths.
- **Coverage.** Every discussion point labelled kept or changed for this task's key appears
  in this brief by its id. `validate` checks it.
- **Self-contained.** Restate what the task needs instead of writing "see the discussion".
  A pointer is for depth; the brief alone must carry what the task turns on.
- **Scan, then execute.** Short enough to read in two minutes, detailed enough to act on
  without asking. Prefer lists to paragraphs.
- **One source per fact.** A rule that lives in a design record is named there and
  restated in a line here; the record stays the authority.
