---
name: roadmap
description: Roadmaps of tracked tasks in WORK.md + backlog/. Use to turn a design discussion into a roadmap (`/work create`), to start or resume a task, to hand off at session end, or to retire a finished roadmap.
---

# Roadmaps

A **roadmap** is one plan of work: a `PLAN.md` that explains the design, a **parent task** that stands for the whole plan, **child tasks** that each deliver one slice, and a row in `WORK.md` that marks the roadmap Active. Tasks are Markdown files under `backlog/tasks/`; a task's **journal** is its comments block. The Work Panel draws all of this and starts tasks from it.

The tracker command is `python3 <this skill's base directory>/../../tracker/roadmap.py` (call it `RM` below). Run it from the project root. `RM --help` and `RM <command> --help` list everything.

**Project rules win.** If the project has its own tracking protocol (`docs/work-tracking.md`, or a document `WORK.md` points to), read it first and follow it wherever it says more than this skill.

## Create a roadmap from a design

This branch runs when the person asks for a roadmap, typically with `/work create <name>` after discussing a feature. The design lives in this conversation; work from it, and from any design doc the conversation produced.

1. **Check the ground.** `RM plans` and `RM validate`. If `WORK.md` is missing, run `RM init` (add `--prefix <word>` when the person names one). Pick a `plan_id`: lowercase kebab-case from the name, not already registered.
2. **Write the plan.** Create `docs/programs/<plan_id>/PLAN.md` (or the location the project protocol names): the goal, the design decisions and why, what is out of scope, the slices in order, and how each is verified. Write it from the discussion; mark open questions as open instead of inventing answers.
3. **Cut the slices.** Each child task is one slice someone can finish and verify in a session or two: a title in plain words, a description, 2-4 observable acceptance criteria, `depends_on` naming the slices that must be Done first, and `files` listing the files or folders (ending in `/`) it expects to change. Prefer vertical slices (one behaviour end to end) over layers. Only real prerequisites become dependencies, so independent slices show as ready together.
4. **Decide the batches.** A **batch** is a named group of slices that are safe to run at the same time; the Work Panel starts a whole batch in one session. Put slices in the same batch (`"batch": "A"`, then `"B"`, …) only when all of these hold:
   - neither depends on the other, directly or through another slice;
   - their `files` do not overlap, and none of them is a shared seam another one is still designing (an interface, a schema, a config both read);
   - they do not share test resources that collide when run together (one database, fixed ports, one output folder).

   When in doubt, leave a slice out of the batch: a wrong batch costs a merge conflict, a missing one costs only a little time. A slice that waits on a batch can sit in the next batch. Write the batches and the reason for each into the PLAN.md slice list.
5. **Preview.** Write the spec to a temporary JSON file (shape in `RM create --help`) and run `RM create --spec <file> --dry-run`. Show the person the plan path, every task id and title, what each waits on, and each batch with its tasks. Then **end your turn and wait**. The person's explicit OK is the only go; edits mean a new dry run and a new preview.
6. **Write.** `RM create --spec <file>`, then `RM validate` (clean) and `RM tree --plan <plan_id>`. Delete the temporary spec. Report the parent id, the tasks that are ready now (●), the batches, and that the panel will show the roadmap after this turn.

Done when: the roadmap is registered, `validate` prints `OK` (or only errors that existed before), and the person saw the preview, batches included, before anything was written.

## Start or resume a task

1. `RM tree --plan <plan_id>` and read the task file. Its dependencies are Done, or it is In Progress with no live session on it (the Work Panel checks that before it offers the task).
2. **Claim it:** `RM status <id> --set "In Progress" --assignee @claude`, then `RM comment <id> --text "session start ..."` naming the branch, the intended scope, and the first verification command.
3. If the task was already In Progress, read its latest journal record first and record the takeover in your claim comment.
4. If the first message named a handoff note on another task, read that task's latest journal record before you start.
5. Work against the acceptance criteria; keep findings in the journal, not in a second notes file.
6. **Keep the Work Panel current.** When the `focus` tool of the work-panel plugin is available, call it right after you claim or switch to a task, at each milestone (a new step, tests running, waiting on the person), and with `done: true` when the task is finished. One short `now` phrase each time.

## Start a batch

The first message names a batch and its tasks. They run in parallel inside this one session.

1. **Use the `overseer` skill** to run the batch. Load it before anything else; it decides the workers, the worktrees, and when the gates run.
2. Check each task the way step 1 above does, then **claim every task** (step 2 above) before any work starts. Call `focus` with `task_id` set to the first task and `task_ids` set to all of them.
3. Give each task its own worker, kept to that task's `planned_files`. When two workers would write in one checkout, give each its own worktree. A worker that needs a file outside its list is a sign the batch was wrong: stop that worker and finish that task after the others.
4. Verify and record each task on its own: its acceptance criteria, its journal record, its status. One task failing does not hold back the others; it stays In Progress or becomes Blocked with a `Resume condition:` line.
5. Ship the way the project says (one branch and PR per task unless the project rules say otherwise).

## Hand off and finish

At session end, append one journal record to the task with the shape in [references/journal.md](references/journal.md). Tick acceptance and done checkboxes (`- [x]`) by editing the task file honestly; `RM status` changes only the status line. A task you did not finish stays In Progress, or becomes Blocked with a `Resume condition:` line. A task becomes Done only when every acceptance criterion is checked and the final summary is written.

The Work Panel's "Clear and start" writes the handoff record for you when the next task is in the same roadmap.

## Retire a roadmap

When every task is Done (or explicitly Blocked with a reason), record the outcome in the parent task's final summary, set the parent Done, and remove the roadmap's row from the `ACTIVE_PLANS` block in `WORK.md`. Task files stay where they are; they are the history.
