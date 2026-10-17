# Roadmap tracker

`roadmap.py` is Work Panel's dependency-free Python 3.10+ tracker. Run it from a
project root, or pass `--root DIR` anywhere on the command line. Machine-readable
commands accept `--json`.

## Format

`WORK.md` lists roadmaps between `<!-- ACTIVE_PLANS:BEGIN -->` and
`<!-- ACTIVE_PLANS:END -->` as table rows:

```md
| 1 | [checkout-redesign](docs/programs/checkout-redesign/PLAN.md) | Active | TASK-012 |
```

Tasks are Markdown files with YAML frontmatter in `backlog/tasks/`; archived tasks
go in `backlog/completed/`. A task joins a roadmap when its `labels` includes the
plan ID. `backlog.config.yml` may set `task_prefix`, `backlog_directory`, and
`zero_padded_ids`. PyYAML is used when installed; the bundled parser handles the
supported flat frontmatter format otherwise.

### Parallel batches

Tasks that are safe to run at the same time may share a plan-scoped `batch` name
(beginning with a letter or digit, then letters, digits, or hyphens). Their optional
`planned_files` list records expected file or directory changes; directory paths end
in `/`.

```yaml
batch: A
planned_files:
  - src/cart/totals.py
  - tests/cart/
```

Every task in `tree --json` includes `batch` (a string or `null`) and
`planned_files` (a list, empty when omitted). `validate` rejects malformed values,
dependencies between members of the same plan and batch (including transitive
dependencies), and overlapping planned paths. Equal paths overlap after removing a
leading `./`; a directory also overlaps every path beneath it.

In a `create --spec` task, use `"batch": "A"` and `"files": ["path", ...]`.
Dry runs validate batch dependencies and file overlaps before anything is written.

### Task briefs and discussion points

A task created from a spec may include a stable task key and a Markdown brief under
the project root:

```json
{"key": "queue", "title": "Queue jobs", "brief": "docs/programs/jobs/tasks/queue.md"}
```

`create` writes `key` and `brief` to the task frontmatter and adds the brief after
the plan in `references`. The brief must already exist, and must contain a
`## Fresh-session check` heading. Existing tasks can be backfilled with `brief`;
`--key` is optional when the task already has a key.

An Active plan can preserve the decisions from its source discussion in PLAN.md:

```md
## Discussion points
- P01 [kept → queue] Two runners on today's box; one running job per account.
- P02 [changed -> queue, intake] Keep files 90 days (first proposal was 30).
- P03 [dropped] Link import — phase 3.
- P04 [open] Free checks were proposed but never resolved.
```

The section ends at the next `##` heading. `validate` checks its syntax, unique
point IDs, named task keys, required briefs for non-Done descendants, and coverage:
each kept or changed point ID must occur as a whole-word token in every named
task's brief. It also rejects brief lines containing `/tmp/` or `scratchpad`.
Plans without a Discussion points section retain the older validation behavior.

## Commands

```text
python3 tracker/roadmap.py plans [--json]
python3 tracker/roadmap.py tree [--plan ID] [--json]
python3 tracker/roadmap.py ready [--plan ID] [--json]
python3 tracker/roadmap.py validate
python3 tracker/roadmap.py init [--prefix task]
python3 tracker/roadmap.py create --spec spec.json [--dry-run] [--json]
python3 tracker/roadmap.py comment TASK_ID (--text TEXT | --file FILE) [--author @claude]
python3 tracker/roadmap.py status TASK_ID --set STATUS [--assignee @name]
python3 tracker/roadmap.py brief TASK_ID --set PATH [--key KEY]
```

`create --dry-run --json` previews IDs, dependency mapping, batch, planned files,
and destination paths without writing. `validate` prints `OK` on success and exits
1 for structural errors.
