import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[1] / "roadmap.py"
SPEC = importlib.util.spec_from_file_location("roadmap", MODULE_PATH)
roadmap = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(roadmap)


def task_text(
    task_id,
    title="Title",
    status="To Do",
    labels=None,
    dependencies=None,
    parent=None,
    priority="p1",
    ordinal=1000,
    checked=False,
    extra_body="",
    block_lists=False,
):
    labels = labels or []
    dependencies = dependencies or []
    if block_lists:
        label_yaml = "labels:\n" + "".join(f"  - {x}\n" for x in labels)
        dep_yaml = "dependencies:\n" + "".join(f"  - {x}\n" for x in dependencies)
    else:
        label_yaml = f"labels: {json.dumps(labels)}\n"
        dep_yaml = f"dependencies: {json.dumps(dependencies)}\n"
    parent_yaml = f"parent_task_id: {parent}\n" if parent else ""
    mark = "x" if checked else " "
    return (
        f"---\nid: {task_id}\ntitle: {json.dumps(title)}\nstatus: {status}\nassignee: []\n"
        f"{label_yaml}{dep_yaml}{parent_yaml}priority: {priority}\nordinal: {ordinal}\n---\n\n"
        f"## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [{mark}] #1 Works\n<!-- AC:END -->\n"
        f"## Comments\n<!-- COMMENTS:BEGIN -->\n{extra_body}<!-- COMMENTS:END -->\n"
    )


def setup_repo(tmp_path, plans=None, tasks=None, completed=None):
    plans = plans or []
    tasks = tasks or {}
    completed = completed or {}
    (tmp_path / "backlog" / "tasks").mkdir(parents=True)
    (tmp_path / "backlog" / "completed").mkdir(parents=True)
    (tmp_path / "backlog.config.yml").write_text(
        'task_prefix: "work"\nbacklog_directory: "backlog"\nzero_padded_ids: 3\n', encoding="utf-8"
    )
    rows = "".join(
        f"| {i} | [{plan_id}]({path}) | {state} | {parent} |\n"
        for i, plan_id, path, state, parent in plans
    )
    (tmp_path / "WORK.md").write_text(
        f"# Local work tracker\n\n{roadmap.BEGIN}\n{rows}{roadmap.END}\n", encoding="utf-8"
    )
    for name, content in tasks.items():
        (tmp_path / "backlog" / "tasks" / name).write_text(content, encoding="utf-8")
    for name, content in completed.items():
        (tmp_path / "backlog" / "completed" / name).write_text(content, encoding="utf-8")
    return tmp_path


def run_cli(root, *args):
    return subprocess.run(
        [sys.executable, str(MODULE_PATH), "--root", str(root), *args],
        text=True,
        capture_output=True,
    )


@pytest.mark.parametrize("force_fallback", [False, True])
def test_inline_and_block_lists_parse_the_same(tmp_path, monkeypatch, force_fallback):
    if force_fallback:
        monkeypatch.setattr(roadmap, "_yaml", None)
    setup_repo(
        tmp_path,
        tasks={
            "a.md": task_text("WORK-001", labels=["a", "b"], dependencies=["WORK-099"]),
            "b.md": task_text("WORK-002", labels=["a", "b"], dependencies=["WORK-099"], block_lists=True),
        },
    )
    tasks = roadmap.load_tasks(tmp_path)
    assert tasks[0]["labels"] == tasks[1]["labels"] == ["a", "b"]
    assert tasks[0]["dependencies"] == tasks[1]["dependencies"] == ["WORK-099"]


def test_ready_waiting_children_paused_sort_comments_counts_and_parent_excluded(tmp_path):
    comments = (
        "author: @a\ncreated: 2026-01-01 01:01\n---\nResume condition: first\n---\n"
        "author: @b\ncreated: 2026-02-02 02:02\n---\nnote\nResume condition: ship it\n---\n"
    )
    tasks = {
        "parent.md": task_text("WORK-001", "Parent", labels=["alpha"]),
        "ready.md": task_text("WORK-001.01", "Ready", labels=["alpha"], parent="WORK-001", priority="P0", ordinal=3000),
        "dep.md": task_text("WORK-001.02", "Dep", status="Done", labels=["alpha"], parent="WORK-001", checked=True, priority="p2"),
        "waiting.md": task_text("WORK-001.03", "Waiting", labels=["alpha"], dependencies=["WORK-404"], parent="WORK-001", ordinal=1),
        "blocked.md": task_text("WORK-001.04", "Blocked", status="Blocked", labels=["alpha"], parent="WORK-001", extra_body=comments),
        "container.md": task_text("WORK-001.05", "Container", labels=["alpha"], parent="WORK-001"),
        "child.md": task_text("WORK-001.06", "Child", labels=["alpha"], parent="WORK-001.05"),
        "paused-parent.md": task_text("WORK-002", "Paused parent", labels=["beta"]),
        "paused.md": task_text("WORK-002.01", "Paused", labels=["beta"], parent="WORK-002"),
    }
    setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/a/PLAN.md", "Active", "WORK-001"), (2, "beta", "docs/b/PLAN.md", "Paused", "WORK-002")],
        tasks=tasks,
    )
    data = roadmap.tree_data(tmp_path)
    alpha = data[0]
    ids = [task["task_id"] for task in alpha["tasks"]]
    assert ids[0] == "WORK-001.01"  # p0 sorts first
    assert "WORK-001" not in ids
    by_id = {task["task_id"]: task for task in alpha["tasks"]}
    assert by_id["WORK-001.01"]["ready"] is True
    assert by_id["WORK-001.03"]["waiting_on"] == ["WORK-404"]
    assert by_id["WORK-001.05"]["open_children"] == ["WORK-001.06"]
    assert by_id["WORK-001.05"]["ready"] is False
    assert by_id["WORK-001.04"]["resume_condition"] == "ship it"
    assert by_id["WORK-001.04"]["last_comment_at"] == "2026-02-02 02:02"
    assert data[1]["tasks"][0]["ready"] is False
    assert alpha["counts"] == {"total": 6, "done": 1, "ready": 2, "in_progress": 0, "blocked": 1, "waiting": 2}


def test_validate_clean_and_all_error_classes(tmp_path):
    clean = tmp_path / "clean"
    setup_repo(
        clean,
        plans=[(1, "alpha", "docs/a.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "c.md": task_text("WORK-001.01", labels=["alpha"], parent="WORK-001"),
        },
    )
    result = run_cli(clean, "validate")
    assert result.returncode == 0 and result.stdout.strip() == "OK"

    bad = tmp_path / "bad"
    setup_repo(
        bad,
        plans=[
            (1, "alpha", "a", "Active", "WORK-001"),
            (2, "alpha", "b", "Active", "WORK-999"),
        ],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "a.md": task_text("WORK-001.01", status="Bogus", labels=[], dependencies=["WORK-001", "WORK-001.02", "WORK-404"], parent="WORK-001"),
            "b.md": task_text("WORK-001.02", status="Done", labels=["alpha"], dependencies=["WORK-001.01"], parent="WORK-777", checked=False),
        },
    )
    errors = "\n".join(roadmap.validation_errors(bad))
    for phrase in (
        "duplicate plan_id", "registry parent missing", "unknown status", "unknown parent",
        "unknown dependency", "depends on its own parent", "dependency cycle",
        "active plan label missing", "Done task has unchecked acceptance criterion",
    ):
        assert phrase in errors


def test_init_is_idempotent(tmp_path):
    roadmap.initialize(tmp_path, "work")
    before = {path: path.read_bytes() for path in (tmp_path / "WORK.md", tmp_path / "backlog.config.yml")}
    roadmap.initialize(tmp_path, "other")
    assert all(path.read_bytes() == content for path, content in before.items())
    assert (tmp_path / "backlog" / "tasks").is_dir()


def create_spec(tmp_path, **changes):
    spec = {
        "plan_id": "checkout-redesign",
        "title": "Checkout redesign",
        "plan_path": "docs/programs/checkout-redesign/PLAN.md",
        "description": "Improve checkout.",
        "priority": "p1",
        "tasks": [
            {"key": "totals", "title": "Cart totals", "acceptance": ["One source"], "depends_on": [], "priority": "p0"},
            {"key": "coupons", "title": "Coupon/codes", "acceptance": ["Works"], "depends_on": ["totals"]},
        ],
    }
    spec.update(changes)
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(spec), encoding="utf-8")
    return path


def fresh_create_repo(tmp_path):
    roadmap.initialize(tmp_path, "work")
    plan = tmp_path / "docs" / "programs" / "checkout-redesign" / "PLAN.md"
    plan.parent.mkdir(parents=True)
    plan.write_text("# Plan\n", encoding="utf-8")
    return tmp_path


def test_create_dry_run_then_create_and_validate(tmp_path):
    root = fresh_create_repo(tmp_path)
    spec = create_spec(tmp_path)
    preview = roadmap.plan_create(root, spec, True)
    assert [row["task_id"] for row in preview] == ["WORK-001", "WORK-001.01", "WORK-001.02"]
    assert preview[2]["dependencies"] == ["WORK-001.01"]
    assert list((root / "backlog" / "tasks").iterdir()) == []
    assert "checkout-redesign" not in (root / "WORK.md").read_text()

    roadmap.plan_create(root, spec, False)
    tasks = {task["task_id"]: task for task in roadmap.load_tasks(root)}
    assert tasks["WORK-001"]["ordinal"] == 1000
    assert tasks["WORK-001.01"]["ordinal"] == 1000
    assert tasks["WORK-001.02"]["ordinal"] == 2000
    assert tasks["WORK-001.02"]["dependencies"] == ["WORK-001.01"]
    assert "| 1 | [checkout-redesign]" in (root / "WORK.md").read_text()
    assert roadmap.validation_errors(root) == []
    ready = [task["task_id"] for task in roadmap.tree_data(root)[0]["tasks"] if task["ready"]]
    assert ready == ["WORK-001.01"]


@pytest.mark.parametrize(
    "mutation,error",
    [
        ({"plan_id": "Bad ID"}, "kebab-case"),
        ({"plan_path": "missing.md"}, "does not exist"),
        ({"tasks": [{"key": "a", "title": "A", "depends_on": ["nope"]}]}, "unknown dependency"),
        ({"tasks": [{"key": "a", "title": "A", "depends_on": ["b"]}, {"key": "b", "title": "B", "depends_on": ["a"]}]}, "cycle"),
    ],
)
def test_create_rejects_invalid_specs(tmp_path, mutation, error):
    root = fresh_create_repo(tmp_path)
    spec = create_spec(tmp_path, **mutation)
    with pytest.raises(roadmap.TrackerError, match=error):
        roadmap.plan_create(root, spec, False)


def test_create_refuses_duplicate_plan(tmp_path):
    root = fresh_create_repo(tmp_path)
    spec = create_spec(tmp_path)
    roadmap.plan_create(root, spec, False)
    with pytest.raises(roadmap.TrackerError, match="already registered"):
        roadmap.plan_create(root, spec, False)


def test_next_id_uses_completed_and_padding(tmp_path):
    root = fresh_create_repo(tmp_path)
    (root / "backlog.config.yml").write_text('task_prefix: "x"\nbacklog_directory: backlog\nzero_padded_ids: 4\n')
    (root / "backlog" / "completed").mkdir()
    (root / "backlog" / "completed" / "x-0012 - Old.md").write_text(task_text("X-0012", status="Done", checked=True))
    preview = roadmap.plan_create(root, create_spec(tmp_path), True)
    assert preview[0]["task_id"] == "X-0013"


def test_comment_appends_without_touching_prefix(tmp_path):
    setup_repo(tmp_path, tasks={"a.md": task_text("WORK-001")})
    path = tmp_path / "backlog" / "tasks" / "a.md"
    before = path.read_text()
    prefix = before.split(roadmap.COMMENTS_END)[0]
    roadmap.append_comment(tmp_path, "WORK-001", "hello\n  Branch: feat/x", "@me")
    after = path.read_text()
    assert after.startswith(prefix)
    assert "author: @me" in after and ": hello\n  Branch: feat/x" in after


def test_status_preserves_every_other_line(tmp_path):
    original = task_text("WORK-001").replace("assignee: []", "assignee:\n  - @old")
    setup_repo(tmp_path, tasks={"a.md": original})
    path = tmp_path / "backlog" / "tasks" / "a.md"
    roadmap.set_status(tmp_path, "WORK-001", "In Progress", "@new")
    changed = path.read_text()
    expected = original.replace("status: To Do", "status: In Progress").replace("assignee:\n  - @old", 'assignee: ["@new"]')
    assert changed == expected


def test_status_assignee_is_valid_yaml(tmp_path):
    yaml = pytest.importorskip("yaml")
    setup_repo(tmp_path, tasks={"a.md": task_text("WORK-001")})
    roadmap.set_status(tmp_path, "WORK-001", "In Progress", "@claude")
    text = (tmp_path / "backlog" / "tasks" / "a.md").read_text()
    front = text.split("---\n")[1]
    assert yaml.safe_load(front)["assignee"] == ["@claude"]


def test_status_and_comment_preserve_crlf_prefix(tmp_path):
    setup_repo(tmp_path, tasks={"a.md": task_text("WORK-001")})
    path = tmp_path / "backlog" / "tasks" / "a.md"
    original = path.read_bytes().replace(b"\n", b"\r\n")
    path.write_bytes(original)
    roadmap.set_status(tmp_path, "WORK-001", "Blocked", None)
    changed = path.read_bytes()
    assert changed == original.replace(b"status: To Do", b"status: Blocked")
    prefix = changed.split(roadmap.COMMENTS_END.encode())[0]
    roadmap.append_comment(tmp_path, "WORK-001", "wait", "@me")
    assert path.read_bytes().startswith(prefix)
