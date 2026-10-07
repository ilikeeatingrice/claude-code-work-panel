# Work Panel

A Claude Code plugin for big, long-running work: a feature that takes many tasks and many sessions.

- **Design → roadmap.** Talk a feature through with the agent, then type `/work create <name>`. The agent writes the plan, cuts it into tasks with their dependencies, shows you a preview, and writes nothing to the tracker until you say OK.
- **Clean context, kept knowledge.** Each task gets a fresh session. When the next task is in the same roadmap, the old session first writes a handoff note into the old task's journal, and the new session starts with it. Unrelated work starts clean.
- **One task, one agent.** The panel offers only tasks whose prerequisites are done, and locks a task another live session is working on.

It is one plugin with three parts: a panel on the right side of the terminal, a `roadmap` skill the agent follows, and a small tracker script that keeps tasks as Markdown files in your repo.

![Work Panel demo](demo/out/work-panel-demo.gif)

[Full-quality video with sound (mp4, 16:9)](demo/out/work-panel-demo.mp4) · [4:5 version](demo/out/work-panel-demo-4x5.mp4)

## Install

In a Claude Code terminal session:

```
/plugin install work-panel --marketplace ilikeeatingrice/claude-code-work-panel
```

Or run it from a clone: `claude --plugin-dir /path/to/claude-code-work-panel`.

Python 3.10+ is needed for the tracker. No other dependencies.

## Use it

1. **Design.** Discuss the feature with the agent as usual.
2. **Create.** `/work create checkout-redesign`. The agent writes `docs/programs/checkout-redesign/PLAN.md`, then shows the preview: every task, and what each one waits on. Reply OK (or ask for changes).
3. **Open the panel.** `/work` shows it; it stays until you type `/work` again. New sessions start with it hidden. Arrow keys move, Enter opens a roadmap or picks a task.
4. **Start.** Pick a `●` task. In a fresh session the button is **Start**; it sends the first message, and the agent claims the task.
5. **Next task.** When a task is done, pick the next one and press **Clear and start** (twice, to confirm).

### What the panel shows

| Mark | State | Can you start it? |
| --- | --- | --- |
| `●` | Ready: every prerequisite is Done | Yes |
| `○` | Waiting: shows what it needs (`needs .15`) | No |
| `◐` | In progress | Only if no live session is on it |
| `■` | Blocked: shows its resume condition | No |
| `✓` | Done, folded into one `N done` line | No |

### What this session is doing

Once a session has a task, the panel shows only that task's roadmap (the rest fold into one row) and a header:

```
▲ THIS SESSION
TASK-001.02 · Guest checkout without an account
now: writing tests for the guest token · 2m ago
```

The agent keeps it current through a small `focus` tool the plugin gives it: it calls it when it claims or switches a task, at each milestone, and when it finishes. If an agent never calls it, the panel still follows its claims: after a tool call that marks a task In Progress, the panel switches to that task.

### What the button does

| Your session | Button | What happens |
| --- | --- | --- |
| Fresh, nothing said yet | **Start** | Sends the first message for the task. |
| Working on a task in the **same** roadmap | **Clear and start** | The session writes a handoff note (changes, commands, commits, decisions, findings, risk, next action), the plugin saves it on the old task with the branch and `git status`, runs `/clear`, and sends the first message with a summary of the note. |
| A **different** roadmap, or no task | **Clear and start** | Plain `/clear`, then the first message. No note. |

The old conversation stays saved; `claude --resume` opens it.

### Who is working on what

Each session running the plugin rewrites a small file, `~/.claude/work-panel/live/<session id>.json`, every minute. A task named by a live file (written in the last 3 minutes) shows `being worked on now` and is locked. A stale claim can be taken over; one younger than 2 hours with no live session asks for a second press. Sessions without the plugin write no file, so the panel can't see them.

## The files it keeps

Everything lives in your repo as plain text:

```
WORK.md                          the active roadmaps
backlog.config.yml               task id prefix, folders
backlog/tasks/task-001.02 - Coupon-codes.md
docs/programs/<roadmap>/PLAN.md  the design
```

Tasks use the [Backlog.md](https://github.com/MrLesk/Backlog.md) file format: YAML front matter (status, labels, dependencies, parent), acceptance criteria, and a comments block that serves as the task's journal. See [tracker/README.md](tracker/README.md) for the format and commands (`plans`, `tree`, `ready`, `validate`, `init`, `create`, `comment`, `status`).

## Settings

In `/config` → Work Panel:

| Setting | Default | Meaning |
| --- | --- | --- |
| `treeCommand` | `scripts/work_tracker.py tree --json` | Use your own tracker instead of the bundled one. When this script is missing and the folder has a `WORK.md`, the bundled tracker is used. |
| `startHint` | empty | Added to each first message, e.g. `Use the work-tracker skill.` |
| `noteAuthor` | `@claude` | Author written on handoff notes. |

A custom tracker command must print the same JSON as `python3 tracker/roadmap.py tree --json`: a list of roadmaps, each with `plan_id`, `state`, `parent_task_id`, `counts` and `tasks`; each task with `task_id`, `title`, `status`, `ready`, `waiting_on`, `open_children`, `resume_condition`, `last_comment_at` (UTC `YYYY-MM-DD HH:MM`) and `path`. The panel draws `ready`; it never computes it.

## How it is built

- `hooks/register.tsx`: the Claude Code hooks module. The panel is a pane drawn by a `ui.render` hook. The handoff note comes from `$.model.fork` over the session's own history with no tools; then `$.command.run({ command: 'clear' })` and `$.prompt.submit` start the next session. State lives in module variables, because `/clear` gives the session a new id.
- `skills/roadmap/`: how the agent creates a roadmap (with the preview gate), claims a task, hands off, and retires a roadmap. A project's own tracking doc (`docs/work-tracking.md`) takes precedence when present.
- `tracker/roadmap.py`: the tracker, Python standard library only (uses PyYAML when installed).

Check with `claude plugin validate .` and `python3 -m pytest tracker/tests`.

## Demo video

`demo/` is a [Remotion](https://www.remotion.dev/) project that recreates the Claude Code terminal cell by cell. The music is original, generated by `demo/audio/make_track.py` at 120 BPM, and every cut, key press and caption sits on its beat grid (`demo/src/beat.ts`; `npm run sync` prints the check).

```
cd demo && npm install
npm run audio        # regenerate audio/track.wav (needs Python with numpy)
npm run render       # 16:9  ->  out/work-panel-demo.mp4
npm run render:4x5   # 4:5   ->  out/work-panel-demo-4x5.mp4
npm run gif
```

If Remotion can't download its headless Chrome, set `REMOTION_CHROME` to a local `chrome-headless-shell` binary.

## License

MIT
