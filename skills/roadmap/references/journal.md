# Journal records

A task's journal is the block between `<!-- COMMENTS:BEGIN -->` and `<!-- COMMENTS:END -->`. Each record:

```
author: @claude
created: 2026-10-07 04:31
---
2026-10-07T04:31:07Z: session end
  Changes: <exact files and behaviour changed>
  Commands/results: `<exact command>`: <trimmed actual result>
  Commits or dirty state: <SHA(s), or the exact `git status --short` output>
  Decisions: <decisions made and why>
  Findings: <facts discovered, including failed attempts>
  Residual risk: <known unverified behaviour, or None>
  Next action: <the next concrete action, or None>
---
```

- `created` is UTC, `YYYY-MM-DD HH:MM`; the entry's first line starts with the ISO time.
- Write it with `RM comment <id> --file <note.md>`, where the file starts at `session end` (no time): the command adds the `author`/`created` header and the ISO time itself. Earlier records are never rewritten.
- A session start record names the branch or worktree, the intended scope, and the first verification command.
- A Blocked task's latest record holds a line `Resume condition: <what unblocks it>`; the Work Panel shows it.
