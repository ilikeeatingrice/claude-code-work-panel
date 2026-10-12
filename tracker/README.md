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
```

`create --dry-run --json` previews IDs, dependency mapping, batch, planned files,
and destination paths without writing. `validate` prints `OK` on success and exits
1 for structural errors.
