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

`create --dry-run --json` previews IDs, dependency mapping, and destination paths
without writing. `validate` prints `OK` on success and exits 1 for structural errors.
