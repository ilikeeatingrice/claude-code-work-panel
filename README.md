# Work Panel

A Claude Code mod that puts your task tracker in a panel on the right side of the terminal. Browse your roadmaps, pick a task whose prerequisites are done, and start it with one key press.

When you move to the next task in the same roadmap, it can clear the session for you. Before the clear, the current session writes a handoff note into the old task's journal, so the fresh session starts with what matters and nothing else.

![Work Panel demo](demo/out/work-panel-demo.gif)

[Full-quality video (mp4)](demo/out/work-panel-demo.mp4)

## What it does

- `/work` shows or hides the panel. It remembers your choice.
- Roadmaps open and close. Each one shows progress, like `10/19 · 5 ready`.
- Every task shows its state:

| Mark | State | Can you start it? |
| --- | --- | --- |
| `●` | Ready: To Do, every prerequisite is Done | Yes |
| `○` | Waiting: shows what it needs (`needs .15`) | No |
| `◐` | In progress | Only if no live session is on it |
| `■` | Blocked: shows its resume condition | No |
| `✓` | Done, folded into one `N done` line | No |

### The button has three cases

| Your session | Button | What happens |
| --- | --- | --- |
| Fresh, nothing said yet | **Start** | Sends the first message for the task. |
| Working on a task in the **same** roadmap | **Clear and start** | The session writes a handoff note, the mod saves it on the old task, runs `/clear`, then sends the first message with a summary of the note. |
| A **different** roadmap, or no task | **Clear and start** | Plain `/clear`, then the first message. No note. |

Clearing asks for a second press. The old conversation is still saved and `claude --resume` opens it.

The handoff note uses a fixed shape: changes, commands and results, commits or dirty state, decisions, findings, residual risk, next action. The mod adds the branch and `git status` it reads itself.

The mod never claims a task. The new session's agent does, the way your workflow says to.

### Who is working on what

Each session running the mod rewrites a small file, `~/.claude/work-panel/live/<session id>.json`, every minute. A claimed task that a live session names (written in the last 3 minutes) shows `being worked on now` and can't be started. A stale claim can be picked up. A claim younger than 2 hours with no live session asks for a second press. Files older than a day are removed.

Sessions without the mod don't write these files, so the panel can't see them.

## Install

In a Claude Code terminal session:

```
/plugin install work-panel --marketplace ilikeeatingrice/claude-code-work-panel
```

Or run it from a clone:

```
claude --plugin-dir /path/to/claude-code-work-panel
```

The panel docks beside the chat in the full-screen layout from 110 columns. In a narrower window it sits above the prompt.

## Connect your tracker

The mod reads your tracker through one command, run in the session's folder, that prints JSON. Set it in `/config` (Work Panel → Tracker command):

| Setting | Default | Meaning |
| --- | --- | --- |
| `treeCommand` | `scripts/work_tracker.py tree --json` | Prints the roadmap tree. A first word with a `/` must exist in the folder, or the mod stays off there. A `.py` script runs with the folder's `.venv` Python, else `python3`. |
| `startHint` | empty | Added to each first message, for example `Use the work-tracker skill.` |
| `noteAuthor` | `@claude` | Author written on handoff notes. |

### The JSON the command prints

A list of roadmaps. Each task's `ready` must be your tracker's own rule for "can be claimed now"; the panel draws it and never computes it.

```json
[
  {
    "plan_id": "checkout-redesign",
    "state": "Active",
    "priority": 1,
    "path": "docs/plans/checkout-redesign.md",
    "parent_task_id": "TASK-012",
    "parent_title": "Checkout redesign",
    "counts": { "total": 6, "done": 2, "ready": 2, "in_progress": 1, "blocked": 0, "waiting": 1 },
    "tasks": [
      {
        "task_id": "TASK-012.03",
        "title": "Coupon codes",
        "status": "To Do",
        "priority": "P1",
        "ordinal": 3000,
        "assignees": [],
        "labels": ["checkout-redesign"],
        "parent_task_id": "TASK-012",
        "dependencies": ["TASK-012.02"],
        "ready": false,
        "waiting_on": ["TASK-012.02"],
        "open_children": [],
        "resume_condition": null,
        "last_comment_at": "2026-10-03 10:00",
        "completed": false,
        "path": "/abs/path/backlog/tasks/task-012.03 - Coupon-codes.md"
      }
    ]
  }
]
```

- Statuses: `To Do`, `In Progress`, `Blocked`, `Done`. Only `Active` roadmaps are shown.
- `last_comment_at` is UTC, `YYYY-MM-DD HH:MM`. It dates a claim.
- `path` is the task's Markdown file. Handoff notes are inserted before its `<!-- COMMENTS:END -->` marker, in [Backlog.md](https://github.com/MrLesk/Backlog.md)'s comment format:

```
author: @claude
created: 2026-10-07 04:31
---
2026-10-07T04:31:07Z: session end
  Changes: ...
  Next action: ...
---
```

## How it is built

It is a Claude Code hooks mod (`hooks/register.tsx`):

- a pane drawn by a `ui.render` hook, opened by `/work`;
- `$.model.fork` writes the handoff note from the session's own history, with no tools;
- `$.command.run({ command: 'clear' })`, then `$.prompt.submit` for the first message;
- state lives in module variables, because `/clear` gives the session a new id and session state does not carry over.

Check it with `claude plugin validate .`.

## Demo video

`demo/` is a [Remotion](https://www.remotion.dev/) project. `cd demo && npm install && npm run render` rebuilds `demo/out/work-panel-demo.mp4`. If Remotion can't download its headless Chrome, set `REMOTION_CHROME` to a local `chrome-headless-shell` binary. `npm run gif` makes the GIF.

## License

MIT
