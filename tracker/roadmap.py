#!/usr/bin/env python3
"""Dependency-free Markdown roadmap tracker used by Work Panel."""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:  # PyYAML is optional.
    import yaml as _yaml
except ImportError:  # pragma: no cover - exercised by forcing the fallback
    _yaml = None


STATUSES = ("To Do", "In Progress", "Blocked", "In Review", "Done")

CREATE_SPEC_HELP = """spec shape:
  {
    "plan_id": "checkout-redesign",          lowercase kebab-case, not registered yet
    "title": "Checkout redesign",
    "plan_path": "docs/programs/checkout-redesign/PLAN.md",   must already exist
    "description": "one paragraph for the parent task",
    "priority": "p1",                        optional: p0 | p1 | p2
    "tasks": [
      {"key": "totals", "title": "Cart totals in one place",
       "description": "...", "acceptance": ["observable criterion", "..."],
       "depends_on": [], "priority": "p1"},
      {"key": "coupons", "title": "Coupon codes",
       "acceptance": ["..."], "depends_on": ["totals"]}
    ]
  }
depends_on names spec keys or existing task ids. --dry-run writes nothing and
prints the ids, titles, dependencies and paths it would create."""
BEGIN = "<!-- ACTIVE_PLANS:BEGIN -->"
END = "<!-- ACTIVE_PLANS:END -->"
COMMENTS_END = "<!-- COMMENTS:END -->"
ID_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*)-(\d+)(?:\.(\d+))?$")
PLAN_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REGISTRY_RE = re.compile(
    r"^\s*\|\s*(\d+)\s*\|\s*\[([^]]+)\]\(([^)]+)\)\s*\|\s*"
    r"(Active|Paused)\s*\|\s*([^|]+?)\s*\|\s*$"
)


class TrackerError(Exception):
    pass


def _scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return ""
    if value in ("null", "Null", "NULL", "~"):
        return None
    if value == "[]":
        return []
    if value.startswith("[") and value.endswith("]"):
        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else value
        except (ValueError, SyntaxError):
            inner = value[1:-1].strip()
            return [] if not inner else [_scalar(part) for part in inner.split(",")]
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        try:
            return ast.literal_eval(value)
        except (ValueError, SyntaxError):
            return value[1:-1]
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    return value


def fallback_yaml(text: str) -> dict[str, Any]:
    """Parse the small flat YAML subset used by task/config files."""
    result: dict[str, Any] = {}
    current: str | None = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", raw)
        if item and current is not None:
            if not isinstance(result.get(current), list):
                result[current] = []
            result[current].append(_scalar(item.group(1)))
            continue
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$", raw)
        if match:
            current = match.group(1)
            tail = match.group(2) or ""
            result[current] = _scalar(tail) if tail else []
    return result


def parse_yaml(text: str) -> dict[str, Any]:
    if _yaml is not None:
        try:
            value = _yaml.safe_load(text)
            return value if isinstance(value, dict) else {}
        except Exception:
            pass
    return fallback_yaml(text)


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return {}, text
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return parse_yaml("".join(lines[1:index])), "".join(lines[index + 1 :])
    return {}, text


def as_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def config(root: Path) -> dict[str, Any]:
    values: dict[str, Any] = {}
    path = root / "backlog.config.yml"
    if path.exists():
        values = parse_yaml(path.read_text(encoding="utf-8"))
    return {
        "task_prefix": str(values.get("task_prefix") or "task"),
        "backlog_directory": str(values.get("backlog_directory") or "backlog"),
        "zero_padded_ids": int(values.get("zero_padded_ids") or 3),
    }


def registry(root: Path) -> list[dict[str, Any]]:
    path = root / "WORK.md"
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        return []
    section = text.split(BEGIN, 1)[1].split(END, 1)[0]
    rows = []
    for line in section.splitlines():
        match = REGISTRY_RE.match(line)
        if match:
            rows.append(
                {
                    "priority": int(match.group(1)),
                    "plan_id": match.group(2).strip(),
                    "path": match.group(3).strip(),
                    "state": match.group(4),
                    "parent_task_id": match.group(5).strip(),
                }
            )
    return sorted(rows, key=lambda row: row["priority"])


def _comment_metadata(body: str) -> tuple[str | None, str | None]:
    section = body
    if "<!-- COMMENTS:BEGIN -->" in body:
        section = body.split("<!-- COMMENTS:BEGIN -->", 1)[1]
    if COMMENTS_END in section:
        section = section.split(COMMENTS_END, 1)[0]
    created = re.findall(r"(?m)^created:\s*(.*?)\s*$", section)
    resume: str | None = None
    for line in section.splitlines():
        if "Resume condition:" in line:
            candidate = line.split("Resume condition:", 1)[1].strip()
            resume = candidate or None
    return resume, (created[-1] if created else None)


def load_tasks(root: Path) -> list[dict[str, Any]]:
    cfg = config(root)
    base = root / cfg["backlog_directory"]
    found: list[dict[str, Any]] = []
    for folder, completed in ((base / "tasks", False), (base / "completed", True)):
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            meta, body = split_frontmatter(text)
            task_id = str(meta.get("id") or "")
            if not task_id:
                continue
            resume, last_comment_at = _comment_metadata(body)
            ordinal = meta.get("ordinal", 0)
            try:
                ordinal = int(ordinal or 0)
            except (TypeError, ValueError):
                ordinal = 0
            found.append(
                {
                    "task_id": task_id,
                    "title": str(meta.get("title") or ""),
                    "status": str(meta.get("status") or ""),
                    "priority": (str(meta["priority"]).lower() if meta.get("priority") else None),
                    "ordinal": ordinal,
                    "assignees": as_list(meta.get("assignee")),
                    "labels": as_list(meta.get("labels")),
                    "parent_task_id": (
                        meta.get("parent_task_id", meta.get("parent_task", meta.get("parent")))
                    ),
                    "dependencies": as_list(meta.get("dependencies", meta.get("depends_on"))),
                    "resume_condition": resume if str(meta.get("status") or "") == "Blocked" else None,
                    "last_comment_at": last_comment_at,
                    "completed": completed,
                    "path": str(path.resolve()),
                    "_body": body,
                }
            )
    return found


def is_done(task: dict[str, Any]) -> bool:
    return bool(task["completed"] or task["status"] == "Done")


def task_sort_key(task: dict[str, Any]) -> tuple[int, int, str]:
    return ({"p0": 0, "p1": 1, "p2": 2}.get(task["priority"], 3), task["ordinal"], task["task_id"])


def enrich(tasks: list[dict[str, Any]], plans: list[dict[str, Any]]) -> None:
    by_id = {task["task_id"]: task for task in tasks}
    children: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        parent = task["parent_task_id"]
        if parent:
            children.setdefault(str(parent), []).append(task)
    paused = {plan["plan_id"] for plan in plans if plan["state"] == "Paused"}
    for task in tasks:
        task["waiting_on"] = [dep for dep in task["dependencies"] if dep not in by_id or not is_done(by_id[dep])]
        task["open_children"] = [child["task_id"] for child in children.get(task["task_id"], []) if not is_done(child)]
        task["ready"] = bool(
            not task["completed"]
            and task["status"] == "To Do"
            and not paused.intersection(task["labels"])
            and not task["waiting_on"]
            and not task["open_children"]
        )


def public_task(task: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "task_id", "title", "status", "priority", "ordinal", "assignees", "labels",
        "parent_task_id", "dependencies", "ready", "waiting_on", "open_children",
        "resume_condition", "last_comment_at", "completed", "path",
    )
    return {key: task[key] for key in keys}


def tree_data(root: Path, plan_filter: str | None = None) -> list[dict[str, Any]]:
    plans = registry(root)
    tasks = load_tasks(root)
    enrich(tasks, plans)
    by_id = {task["task_id"]: task for task in tasks}
    output = []
    for plan in plans:
        if plan_filter and plan["plan_id"] != plan_filter:
            continue
        members = [
            task for task in tasks
            if plan["plan_id"] in task["labels"] and task["task_id"] != plan["parent_task_id"]
        ]
        members.sort(key=task_sort_key)
        counts = {
            "total": len(members),
            "done": sum(is_done(task) for task in members),
            "ready": sum(task["ready"] for task in members),
            "in_progress": sum(task["status"] == "In Progress" and not task["completed"] for task in members),
            "blocked": sum(task["status"] == "Blocked" and not task["completed"] for task in members),
            "waiting": sum(task["status"] == "To Do" and not task["ready"] and not task["completed"] for task in members),
        }
        parent = by_id.get(plan["parent_task_id"])
        output.append(
            {
                **plan,
                "parent_title": parent["title"] if parent else None,
                "counts": counts,
                "tasks": [public_task(task) for task in members],
            }
        )
    return output


def acceptance_unchecked(task: dict[str, Any]) -> bool:
    body = task["_body"]
    if "<!-- AC:BEGIN -->" in body and "<!-- AC:END -->" in body:
        body = body.split("<!-- AC:BEGIN -->", 1)[1].split("<!-- AC:END -->", 1)[0]
    else:
        match = re.search(r"(?mi)^##\s+Acceptance Criteria\s*$", body)
        if not match:
            return False
        body = body[match.end():]
        following_heading = re.search(r"(?m)^##\s+", body)
        if following_heading:
            body = body[:following_heading.start()]
    return bool(re.search(r"(?mi)^\s*-\s*\[\s\]\s*", body))


def validation_errors(root: Path) -> list[str]:
    plans = registry(root)
    tasks = load_tasks(root)
    by_id = {task["task_id"]: task for task in tasks}
    errors: list[str] = []
    seen_plans: set[str] = set()
    for plan in plans:
        if plan["plan_id"] in seen_plans:
            errors.append(f"duplicate plan_id: {plan['plan_id']}")
        seen_plans.add(plan["plan_id"])
        if plan["parent_task_id"] not in by_id:
            errors.append(f"registry parent missing: {plan['plan_id']} -> {plan['parent_task_id']}")
    for task in tasks:
        task_id = task["task_id"]
        if task["status"] not in STATUSES:
            errors.append(f"unknown status: {task_id}: {task['status']}")
        parent = task["parent_task_id"]
        if parent and str(parent) not in by_id:
            errors.append(f"unknown parent: {task_id} -> {parent}")
        for dep in task["dependencies"]:
            if dep not in by_id:
                errors.append(f"unknown dependency: {task_id} -> {dep}")
            if parent and dep == str(parent):
                errors.append(f"task depends on its own parent: {task_id} -> {dep}")
        if is_done(task) and acceptance_unchecked(task):
            errors.append(f"Done task has unchecked acceptance criterion: {task_id}")

    graph = {task["task_id"]: [dep for dep in task["dependencies"] if dep in by_id] for task in tasks}
    visiting: set[str] = set()
    visited: set[str] = set()
    reported: set[tuple[str, ...]] = set()

    def visit(node: str, trail: list[str]) -> None:
        if node in visiting:
            cycle = trail[trail.index(node):] + [node]
            canonical = tuple(sorted(set(cycle)))
            if canonical not in reported:
                errors.append("dependency cycle: " + " -> ".join(cycle))
                reported.add(canonical)
            return
        if node in visited:
            return
        visiting.add(node)
        for dep in graph[node]:
            visit(dep, trail + [dep])
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node, [node])

    for plan in plans:
        if plan["state"] != "Active" or plan["parent_task_id"] not in by_id:
            continue
        descendants: list[dict[str, Any]] = []
        frontier = [plan["parent_task_id"]]
        traversed: set[str] = set()
        while frontier:
            parent = frontier.pop()
            if parent in traversed:
                continue
            traversed.add(parent)
            direct = [task for task in tasks if str(task["parent_task_id"] or "") == parent]
            descendants.extend(direct)
            frontier.extend(task["task_id"] for task in direct)
        for task in descendants:
            if plan["plan_id"] not in task["labels"]:
                errors.append(f"active plan label missing: {task['task_id']} needs {plan['plan_id']}")
    return errors


def render_task(task: dict[str, Any], width: int, created: str, plan_id: str, plan_path: str) -> str:
    task_id = task["id"]
    parent = task.get("parent")
    deps = task.get("dependencies", [])
    description = task.get("description", "")
    acceptance = task.get("acceptance", [])
    priority = task.get("priority")
    lines = [
        "---", f"id: {task_id}", f'title: {json.dumps(task["title"], ensure_ascii=False)}',
        "status: To Do", "assignee: []", f"created_date: '{created}'", "labels:", f"  - {plan_id}",
        "dependencies:",
    ]
    lines.extend(f"  - {dep}" for dep in deps)
    if not deps:
        lines[-1] = "dependencies: []"
    lines.extend(["references:", f"  - {plan_path}", "modified_files: []"])
    if parent:
        lines.append(f"parent_task_id: {parent}")
    if priority:
        lines.append(f"priority: {str(priority).lower()}")
    lines.extend([f"ordinal: {task['ordinal']}", "---", "", "## Description", "", "<!-- SECTION:DESCRIPTION:BEGIN -->"])
    if description:
        lines.append(description)
    lines.extend(["<!-- SECTION:DESCRIPTION:END -->", "", "## Acceptance Criteria", "<!-- AC:BEGIN -->"])
    lines.extend(f"- [ ] #{index} {criterion}" for index, criterion in enumerate(acceptance, 1))
    lines.extend([
        "<!-- AC:END -->", "", "## Definition of Done", "<!-- DOD:BEGIN -->",
        "- [ ] #1 Acceptance criteria are checked",
        "- [ ] #2 Exact verification commands and outcomes are recorded",
        "- [ ] #3 Modified files, commits, residual risks, and follow-up work are recorded",
        "<!-- DOD:END -->", "", "## Final Summary", "<!-- SECTION:FINAL_SUMMARY:BEGIN -->",
        "<!-- SECTION:FINAL_SUMMARY:END -->", "", "## Comments", "<!-- COMMENTS:BEGIN -->",
        "<!-- COMMENTS:END -->", "",
    ])
    return "\n".join(lines)


def safe_title(title: str) -> str:
    cleaned = re.sub(r'[/\\:*?"<>|]', "", title)
    return re.sub(r"\s+", "-", cleaned.strip()) or "Untitled"


def plan_create(root: Path, spec_path: Path, dry_run: bool) -> list[dict[str, Any]]:
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TrackerError(f"invalid spec: {exc}") from exc
    plan_id = spec.get("plan_id", "")
    if not isinstance(plan_id, str) or not PLAN_ID_RE.fullmatch(plan_id):
        raise TrackerError("plan_id must be lowercase kebab-case")
    plans = registry(root)
    if any(plan["plan_id"] == plan_id for plan in plans):
        raise TrackerError(f"plan_id already registered: {plan_id}")
    plan_path = spec.get("plan_path")
    if not isinstance(plan_path, str) or not (root / plan_path).is_file():
        raise TrackerError(f"plan_path does not exist: {plan_path}")
    items = spec.get("tasks")
    if not isinstance(items, list):
        raise TrackerError("tasks must be a list")
    keys = [item.get("key") for item in items if isinstance(item, dict)]
    if len(keys) != len(items) or any(not isinstance(key, str) or not key for key in keys) or len(set(keys)) != len(keys):
        raise TrackerError("task keys must be non-empty and unique")
    cfg = config(root)
    existing = load_tasks(root)
    existing_ids = {task["task_id"] for task in existing}
    top_numbers = []
    for task_id in existing_ids:
        match = ID_RE.match(task_id)
        if match and match.group(3) is None:
            top_numbers.append(int(match.group(2)))
    number = max(top_numbers, default=0) + 1
    prefix = cfg["task_prefix"].upper()
    base_id = f"{prefix}-{number:0{cfg['zero_padded_ids']}d}"
    key_ids = {key: f"{base_id}.{index:02d}" for index, key in enumerate(keys, 1)}
    graph: dict[str, list[str]] = {}
    prepared_children = []
    for index, item in enumerate(items, 1):
        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            raise TrackerError(f"task {item.get('key')} needs a title")
        raw_deps = item.get("depends_on", [])
        if not isinstance(raw_deps, list):
            raise TrackerError(f"depends_on must be a list: {item['key']}")
        mapped = []
        for dep in raw_deps:
            if not isinstance(dep, str):
                raise TrackerError(f"unknown dependency: {item['key']} -> {dep}")
            if dep in key_ids:
                mapped.append(key_ids[dep])
            elif isinstance(dep, str) and dep in existing_ids:
                mapped.append(dep)
            else:
                raise TrackerError(f"unknown dependency: {item['key']} -> {dep}")
        graph[item["key"]] = [dep for dep in raw_deps if dep in key_ids]
        prepared_children.append(
            {
                "id": key_ids[item["key"]], "title": title, "description": str(item.get("description") or ""),
                "acceptance": as_list(item.get("acceptance")), "dependencies": mapped,
                "priority": str(item.get("priority") or spec.get("priority") or "p1").lower(),
                "ordinal": 1000 * index, "parent": base_id,
            }
        )
    visiting: set[str] = set()
    visited: set[str] = set()

    def check_cycle(key: str) -> None:
        if key in visiting:
            raise TrackerError("dependency cycle in spec")
        if key in visited:
            return
        visiting.add(key)
        for dep in graph[key]:
            check_cycle(dep)
        visiting.remove(key)
        visited.add(key)

    for key in graph:
        check_cycle(key)
    parent = {
        "id": base_id, "title": str(spec.get("title") or plan_id), "description": str(spec.get("description") or ""),
        "acceptance": [], "dependencies": [], "priority": str(spec.get("priority") or "p1").lower(), "ordinal": 1000,
    }
    out_dir = root / cfg["backlog_directory"] / "tasks"
    all_prepared = [parent] + prepared_children
    preview = []
    for task in all_prepared:
        destination = out_dir / f"{task['id'].lower()} - {safe_title(task['title'])}.md"
        if destination.exists():
            raise TrackerError(f"refusing to overwrite: {destination}")
        preview.append({"task_id": task["id"], "title": task["title"], "dependencies": task["dependencies"], "path": str(destination.resolve())})
    work_path = root / "WORK.md"
    if not work_path.exists() or BEGIN not in work_path.read_text(encoding="utf-8") or END not in work_path.read_text(encoding="utf-8"):
        raise TrackerError("WORK.md with active-plan markers is required; run init")
    if dry_run:
        return preview
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    out_dir.mkdir(parents=True, exist_ok=True)
    staged: list[tuple[Path, Path]] = []
    try:
        for task, row in zip(all_prepared, preview):
            destination = Path(row["path"])
            content = render_task(task, cfg["zero_padded_ids"], created, plan_id, plan_path)
            handle, temp_name = tempfile.mkstemp(prefix=".roadmap-", dir=out_dir, text=True)
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                stream.write(content)
            staged.append((Path(temp_name), destination))
        for temporary, destination in staged:
            os.replace(temporary, destination)
        work = work_path.read_text(encoding="utf-8")
        priority = max((plan["priority"] for plan in plans), default=0) + 1
        row = f"| {priority} | [{plan_id}]({plan_path}) | Active | {base_id} |\n"
        work = work.replace(END, row + END, 1)
        handle, work_temp_name = tempfile.mkstemp(prefix=".roadmap-work-", dir=root, text=True)
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(work)
        os.replace(work_temp_name, work_path)
    except Exception:
        for temporary, destination in staged:
            temporary.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
        raise
    return preview


def find_task(root: Path, task_id: str) -> dict[str, Any]:
    matches = [task for task in load_tasks(root) if task["task_id"].upper() == task_id.upper()]
    if not matches:
        raise TrackerError(f"task not found: {task_id}")
    if len(matches) > 1:
        raise TrackerError(f"duplicate task id: {task_id}")
    return matches[0]


def append_comment(root: Path, task_id: str, message: str, author: str) -> None:
    task = find_task(root, task_id)
    path = Path(task["path"])
    text = path.read_bytes().decode("utf-8")
    if COMMENTS_END not in text:
        raise TrackerError(f"comments marker missing: {task_id}")
    now = datetime.now(timezone.utc)
    newline = "\r\n" if "\r\n" in text else "\n"
    content_lines = message.splitlines() or [""]
    content_lines[0] = now.strftime("%Y-%m-%dT%H:%M:%SZ: ") + content_lines[0]
    record = (
        f"author: {author}{newline}created: {now.strftime('%Y-%m-%d %H:%M')}{newline}"
        f"---{newline}" + newline.join(content_lines) + f"{newline}---{newline}"
    )
    changed = text.replace(COMMENTS_END, record + COMMENTS_END, 1)
    path.write_bytes(changed.encode("utf-8"))


def set_status(root: Path, task_id: str, status: str, assignee: str | None) -> None:
    if status not in STATUSES:
        raise TrackerError("status must be one of: " + ", ".join(STATUSES))
    task = find_task(root, task_id)
    path = Path(task["path"])
    text = path.read_bytes().decode("utf-8")
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise TrackerError(f"frontmatter missing: {task_id}")
    end = next((index for index in range(1, len(lines)) if lines[index].strip() == "---"), None)
    if end is None:
        raise TrackerError(f"frontmatter unterminated: {task_id}")
    newline = "\r\n" if any(line.endswith("\r\n") for line in lines[:end]) else "\n"
    status_index = next((i for i in range(1, end) if re.match(r"^status:\s*", lines[i])), None)
    if status_index is None:
        raise TrackerError(f"status field missing: {task_id}")
    lines[status_index] = f"status: {status}{newline}"
    if assignee is not None:
        assignee_index = next((i for i in range(1, end) if re.match(r"^assignee:\s*", lines[i])), None)
        replacement = f"assignee: [{json.dumps(assignee)}]{newline}"
        if assignee_index is None:
            lines.insert(status_index + 1, replacement)
        else:
            block_end = assignee_index + 1
            while block_end < end and re.match(r"^\s+-\s+", lines[block_end]):
                block_end += 1
            lines[assignee_index:block_end] = [replacement]
    path.write_bytes("".join(lines).encode("utf-8"))


def initialize(root: Path, prefix: str) -> None:
    work = root / "WORK.md"
    if not work.exists():
        work.write_text(f"# Local work tracker\n\n{BEGIN}\n{END}\n", encoding="utf-8")
    cfg = root / "backlog.config.yml"
    if not cfg.exists():
        cfg.write_text(f'task_prefix: "{prefix}"\nbacklog_directory: "backlog"\nzero_padded_ids: 3\n', encoding="utf-8")
    (root / "backlog" / "tasks").mkdir(parents=True, exist_ok=True)


def extract_common(argv: list[str]) -> tuple[list[str], Path, bool]:
    remaining: list[str] = []
    root = Path.cwd()
    json_output = False
    index = 0
    while index < len(argv):
        if argv[index] == "--root":
            if index + 1 >= len(argv):
                raise TrackerError("--root requires a directory")
            root = Path(argv[index + 1]).resolve()
            index += 2
        elif argv[index].startswith("--root="):
            root = Path(argv[index].split("=", 1)[1]).resolve()
            index += 1
        elif argv[index] == "--json":
            json_output = True
            index += 1
        else:
            remaining.append(argv[index])
            index += 1
    return remaining, root, json_output


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("plans")
    ready = commands.add_parser("ready")
    ready.add_argument("--plan")
    tree = commands.add_parser("tree")
    tree.add_argument("--plan")
    commands.add_parser("validate")
    init = commands.add_parser("init")
    init.add_argument("--prefix", default="task")
    create = commands.add_parser(
        "create",
        help="create a roadmap from a JSON spec",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=CREATE_SPEC_HELP,
    )
    create.add_argument("--spec", required=True, help="JSON spec file (shape below)")
    create.add_argument("--dry-run", action="store_true")
    comment = commands.add_parser("comment")
    comment.add_argument("task_id")
    group = comment.add_mutually_exclusive_group(required=True)
    group.add_argument("--text")
    group.add_argument("--file")
    comment.add_argument("--author", default="@claude")
    status = commands.add_parser("status")
    status.add_argument("task_id")
    status.add_argument("--set", required=True, dest="new_status")
    status.add_argument("--assignee")
    return result


def print_text_tree(data: list[dict[str, Any]]) -> None:
    for plan in data:
        counts = plan["counts"]
        print(f"{plan['plan_id']}\t{plan['state']}\t{plan['parent_task_id']}\t{counts['done']}/{counts['total']}")
        for task in plan["tasks"]:
            if is_done(task):
                mark = "✓"
            elif task["status"] == "In Progress":
                mark = "◐"
            elif task["status"] == "Blocked":
                mark = "■"
            elif task["ready"]:
                mark = "●"
            else:
                mark = "○"
            suffix = ""
            if mark == "○" and task["waiting_on"]:
                suffix = "\tneeds " + ",".join(task["waiting_on"])
            print(f"  {mark} {task['task_id']}\t{task['status']}\t{task['title']}{suffix}")


def main(argv: list[str] | None = None) -> int:
    try:
        args_list, root, json_output = extract_common(list(sys.argv[1:] if argv is None else argv))
        args = parser().parse_args(args_list)
        if args.command == "plans":
            data = registry(root)
            if json_output:
                print(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for row in data:
                    print(f"{row['priority']}\t{row['plan_id']}\t{row['state']}\t{row['path']}\t{row['parent_task_id']}")
        elif args.command in ("tree", "ready"):
            data = tree_data(root, args.plan)
            if args.command == "ready":
                ready_rows = [task for plan in data for task in plan["tasks"] if task["ready"]]
                if json_output:
                    print(json.dumps(ready_rows, indent=2, ensure_ascii=False))
                else:
                    for task in ready_rows:
                        print(f"{task['task_id']}\t{task['title']}")
            elif json_output:
                print(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                print_text_tree(data)
        elif args.command == "validate":
            errors = validation_errors(root)
            if errors:
                print("\n".join(errors))
                return 1
            print("OK")
        elif args.command == "init":
            initialize(root, args.prefix)
        elif args.command == "create":
            data = plan_create(root, Path(args.spec).resolve(), args.dry_run)
            if json_output:
                print(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for row in data:
                    print(f"{row['task_id']}\t{row['title']}\t{','.join(row['dependencies'])}\t{row['path']}")
        elif args.command == "comment":
            message = args.text if args.text is not None else Path(args.file).read_text(encoding="utf-8")
            append_comment(root, args.task_id, message, args.author)
        elif args.command == "status":
            set_status(root, args.task_id, args.new_status, args.assignee)
        return 0
    except (TrackerError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
