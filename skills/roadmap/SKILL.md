---
name: roadmap
description: Roadmaps of tracked tasks in WORK.md + backlog/, one brief per task. Use to turn a design discussion into a roadmap (`/work create`), to add briefs to an older roadmap, to start or resume a task, to hand off at session end, or to retire a finished roadmap.
---

# Roadmaps

A **roadmap** is one plan of work: a `PLAN.md` that explains the design, a **parent task** that stands for the whole plan, **child tasks** that each deliver one slice, and a row in `WORK.md` that marks the roadmap Active. Tasks are Markdown files under `backlog/tasks/`; a task's **journal** is its comments block. The Work Panel draws all of this and starts tasks from it.

The tracker command is `python3 <this skill's base directory>/../../tracker/roadmap.py` (call it `RM` below). Run it from the project root. `RM --help` and `RM <command> --help` list everything.

**Project rules win.** If the project has its own tracking protocol (`docs/work-tracking.md`, or a document `WORK.md` points to), read it first and follow it wherever it says more than this skill.

## Create a roadmap from a design

This branch runs when the person asks for a roadmap, typically with `/work create <name>` after discussing a feature. It works like plan mode: every task is started later by a fresh session that has never seen the discussion, so each task gets a **task brief**, its own plan file, and the roadmap is finished only when each brief alone is enough to do the task well.

The discussion is the source. Every later file is written from it directly, never from a summary of it: each rewrite of a summary loses a little more.

1. **Check the ground.** `RM plans` and `RM validate`. If `WORK.md` is missing, run `RM init` (add `--prefix <word>` when the person names one). Pick a `plan_id`: lowercase kebab-case from the name, not already registered.
2. **Collect the discussion points.** Read the whole discussion: this conversation from where the topic began, every design page or doc it produced, and every file the person or the discussion named (handoff packages, specs, screenshots, tickets). When part of the discussion happened in an earlier session, find that session's transcript (grep `~/.claude/projects/<project>/*.jsonl` for the topic) and read it too. Write each point as one numbered line: every proposal, number, limit, format, decision, rejected option, worry and open question. A decision carries who made it, when, and their words. A proposal the person never answered is a point labelled `open`, never a decision. Done when every message of the discussion has been read and each concrete statement in it is a point or merged into one.
3. **Write the plan.** Create `docs/programs/<plan_id>/PLAN.md` (or the location the project protocol names): the goal, the design decisions and why, what is out of scope, the slices in order, how each is verified, a `Sources` line (session ids with time ranges, and the lasting path of every supporting file), and the points under `## Discussion points`, each labelled:

   ```
   - P07 [kept → own-video] Customer also ticks 「我拥有这个视频或有权使用」 for the video itself.
   - P08 [changed → queue, intake] Keep files 90 days (first proposal: 30).
   - P09 [dropped] Link import: phase 3 (owner, 10-17).
   - P10 [open] Free checks only for accounts with points for one swap (proposed, never answered).
   ```

   `kept` and `changed` name the slice key(s) whose brief carries the point.
4. **Cut the slices.** Each child task is one slice someone can finish and verify in a session or two: a `key`, a title in plain words, a description, 2-4 observable acceptance criteria, `depends_on` naming the slices that must be Done first, and `files` listing the files or folders (ending in `/`) it expects to change. Prefer vertical slices (one behaviour end to end) over layers. Only real prerequisites become dependencies, so independent slices show as ready together.
5. **Write a brief for each slice** at `docs/programs/<plan_id>/tasks/<key>.md`, in the shape and by the rules in [references/brief.md](references/brief.md). Every kept or changed point naming the slice appears in its brief by id; every supporting file sits at a lasting path.
6. **Run the fresh-session check on each brief.** Dispatch one fresh subagent per brief (no conversation context, read-only, model named explicitly), give it only the brief's path, and ask it: what would you have to ask before you could do this task well; which pointers fail to open; which points in PLAN.md's list touch this slice but are missing from the brief. Fix the brief from the answers and record them in its `## Fresh-session check` section. Repeat until a check comes back with no blocking questions.
7. **Decide the batches.** A **batch** is a named group of slices that are safe to run at the same time; the Work Panel starts a whole batch in one session. Put slices in the same batch (`"batch": "A"`, then `"B"`, …) only when all of these hold:
   - neither depends on the other, directly or through another slice;
   - their `files` do not overlap, and none of them is a shared seam another one is still designing (an interface, a schema, a config both read);
   - they do not share test resources that collide when run together (one database, fixed ports, one output folder).

   When in doubt, leave a slice out of the batch: a wrong batch costs a merge conflict, a missing one costs only a little time. A slice that waits on a batch can sit in the next batch. Write the batches and the reason for each into the PLAN.md slice list.
8. **Preview.** Write the spec to a temporary JSON file (shape in `RM create --help`, with each task's `key` and `brief`) and run `RM create --spec <file> --dry-run`. Show the person:
   - every point labelled dropped, changed or open, first, each with its reason; a dropped point stays dropped only with the person's yes;
   - the plan path and every brief path, with what each fresh-session check raised;
   - every task id and title, what each waits on, and each batch with its tasks.

   Then **end your turn and wait**. The person's explicit OK is the only go; edits mean a new dry run and a new preview.
9. **Write.** `RM create --spec <file>`, then `RM validate` (clean) and `RM tree --plan <plan_id>`. Delete the temporary spec. Put `PLAN.md` and the briefs where every session that works a task will read them: when tasks run in their own worktrees or branches, that means landing them on the main branch first, the way the project ships docs. Report the parent id, the tasks that are ready now (●), the batches, and that the panel will show the roadmap after this turn.

Done when: the roadmap is registered, `validate` prints `OK` (or only errors that existed before), every task has a brief that passed its fresh-session check, and the person saw the preview, points and batches included, before anything was written.

**An older roadmap without briefs** gets them the same way, steps 2, 3, 5 and 6, then `RM brief <id> --set <path> --key <key>` on each task.

## Start or resume a task

1. `RM tree --plan <plan_id>` and read the task file. Its dependencies are Done, or it is In Progress with no live session on it (the Work Panel checks that before it offers the task).
2. **Read the task brief** (the task file's `brief:` field) and every file it marks **must read**, before planning any work. The brief is the plan; the task file holds its acceptance criteria and journal. A task without a brief: read `PLAN.md` and the design docs it names, and say in your claim comment that the task has no brief. When the brief was written before the tasks it depends on shipped, run its fresh-session check again against the shipped code before any work starts, and fix the brief from the answers: names, signatures and seams change while dependencies are built.
3. **Claim it:** `RM status <id> --set "In Progress" --assignee @claude`, then `RM comment <id> --text "session start ..."` naming the branch, the intended scope, and the first verification command.
4. If the task was already In Progress, read its latest journal record first and record the takeover in your claim comment.
5. If the first message named a handoff note on another task, read that task's latest journal record before you start.
6. Work against the brief and the acceptance criteria; keep findings in the journal, not in a second notes file. When a decision changes during the work, edit the brief to match and say so in the journal: the brief stays the current plan.
7. **Keep the Work Panel current.** When the `focus` tool of the work-panel plugin is available, call it right after you claim or switch to a task, at each milestone (a new step, tests running, waiting on the person), and with `done: true` when the task is finished. One short `now` phrase each time.

## Start a batch

The first message names a batch and its tasks. They run in parallel inside this one session.

1. **Use the `overseer` skill** to run the batch. Load it before anything else; it decides the workers, the worktrees, and when the gates run.
2. Check each task and read its brief the way steps 1 and 2 above do, then **claim every task** (step 3 above) before any work starts. Call `focus` with `task_id` set to the first task and `task_ids` set to all of them.
3. Give each task its own worker, kept to that task's `planned_files`. Build each worker's instructions from its task brief: hand over the brief's path and its must-read files, and restate its decisions, rather than writing the worker's instructions from the task file alone. When two workers would write in one checkout, give each its own worktree. A worker that needs a file outside its list is a sign the batch was wrong: stop that worker and finish that task after the others.
4. Verify and record each task on its own: its acceptance criteria, its journal record, its status. One task failing does not hold back the others; it stays In Progress or becomes Blocked with a `Resume condition:` line.
5. Ship the way the project says (one branch and PR per task unless the project rules say otherwise).

## Hand off and finish

At session end, append one journal record to the task with the shape in [references/journal.md](references/journal.md). Tick acceptance and done checkboxes (`- [x]`) by editing the task file honestly; `RM status` changes only the status line. A task you did not finish stays In Progress, or becomes Blocked with a `Resume condition:` line. A task becomes Done only when every acceptance criterion is checked and the final summary is written.

The Work Panel's "Clear and start" writes the handoff record for you when the next task is in the same roadmap.

## Retire a roadmap

When every task is Done (or explicitly Blocked with a reason), record the outcome in the parent task's final summary, set the parent Done, and remove the roadmap's row from the `ACTIVE_PLANS` block in `WORK.md`. Task files stay where they are; they are the history.
