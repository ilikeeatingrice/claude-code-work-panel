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
    extra_frontmatter="",
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
        f"{label_yaml}{dep_yaml}{parent_yaml}priority: {priority}\nordinal: {ordinal}\n"
        f"{extra_frontmatter}---\n\n"
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


@pytest.mark.parametrize("force_fallback", [False, True])
def test_tree_json_emits_batch_and_planned_files_defaults(tmp_path, monkeypatch, force_fallback):
    if force_fallback:
        monkeypatch.setattr(roadmap, "_yaml", None)
    setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/a.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "batched.md": task_text(
                "WORK-001.01",
                labels=["alpha"],
                parent="WORK-001",
                extra_frontmatter=(
                    "batch: A-1\nplanned_files:\n"
                    "  - src/cart/totals.py\n  - tests/cart/\n"
                ),
            ),
            "plain.md": task_text("WORK-001.02", labels=["alpha"], parent="WORK-001"),
        },
    )
    data = roadmap.tree_data(tmp_path)
    by_id = {task["task_id"]: task for task in data[0]["tasks"]}
    assert by_id["WORK-001.01"]["batch"] == "A-1"
    assert by_id["WORK-001.01"]["planned_files"] == ["src/cart/totals.py", "tests/cart/"]
    assert by_id["WORK-001.02"]["batch"] is None
    assert by_id["WORK-001.02"]["planned_files"] == []
    cli_data = json.loads(run_cli(tmp_path, "tree", "--json").stdout)
    assert cli_data[0]["tasks"] == data[0]["tasks"]


def test_validate_parallel_batch_rules_and_clean_batch(tmp_path):
    root = setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/a.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "bad-batch.md": task_text(
                "WORK-001.01", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: 'bad name'\n",
            ),
            "bad-files.md": task_text(
                "WORK-001.02", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="planned_files: src/not-a-list.py\n",
            ),
            "dep-a.md": task_text(
                "WORK-001.03", labels=["alpha"], dependencies=["WORK-001.04"],
                parent="WORK-001", extra_frontmatter="batch: DEP\n",
            ),
            "dep-middle.md": task_text(
                "WORK-001.04", labels=["alpha"], dependencies=["WORK-001.05"],
                parent="WORK-001",
            ),
            "dep-c.md": task_text(
                "WORK-001.05", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: DEP\n",
            ),
            "files-a.md": task_text(
                "WORK-001.06", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: FILES\nplanned_files: [./src/cart/]\n",
            ),
            "files-b.md": task_text(
                "WORK-001.07", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: FILES\nplanned_files: [src/cart/totals.py]\n",
            ),
            "clean-a.md": task_text(
                "WORK-001.08", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: CLEAN\nplanned_files: [src/a.py]\n",
            ),
            "clean-b.md": task_text(
                "WORK-001.09", labels=["alpha"], parent="WORK-001",
                extra_frontmatter="batch: CLEAN\nplanned_files: [src/b.py]\n",
            ),
        },
    )
    errors = roadmap.validation_errors(root)
    assert any("invalid batch: WORK-001.01" in error for error in errors)
    assert any("invalid planned_files: WORK-001.02" in error for error in errors)
    assert any(
        "batch DEP" in error and "WORK-001.03" in error and "WORK-001.05" in error
        for error in errors
    )
    assert any(
        "batch FILES" in error and "WORK-001.06" in error
        and "WORK-001.07" in error and "src/cart/" in error
        for error in errors
    )
    assert not any("batch CLEAN" in error for error in errors)

    clean = tmp_path / "clean"
    setup_repo(
        clean,
        plans=[(1, "alpha", "docs/a.md", "Active", "WORK-010")],
        tasks={
            "p.md": task_text("WORK-010", labels=["alpha"]),
            "a.md": task_text(
                "WORK-010.01", labels=["alpha"], parent="WORK-010",
                extra_frontmatter="batch: A\nplanned_files: [src/a.py]\n",
            ),
            "b.md": task_text(
                "WORK-010.02", labels=["alpha"], parent="WORK-010",
                extra_frontmatter="batch: A\nplanned_files: [src/b.py]\n",
            ),
        },
    )
    assert roadmap.validation_errors(clean) == []


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
    "tasks,error",
    [
        (
            [
                {"key": "a", "title": "A", "depends_on": ["b"], "batch": "A"},
                {"key": "b", "title": "B", "depends_on": [], "batch": "A"},
            ],
            "batch A tasks depend on each other",
        ),
        (
            [
                {"key": "a", "title": "A", "depends_on": [], "batch": "A", "files": ["src/cart/"]},
                {
                    "key": "b", "title": "B", "depends_on": [], "batch": "A",
                    "files": ["./src/cart/totals.py"],
                },
            ],
            "batch A planned files overlap",
        ),
    ],
)
def test_create_dry_run_rejects_batch_conflicts(tmp_path, tasks, error):
    root = fresh_create_repo(tmp_path)
    spec = create_spec(tmp_path, tasks=tasks)
    with pytest.raises(roadmap.TrackerError, match=error):
        roadmap.plan_create(root, spec, True)
    assert list((root / "backlog" / "tasks").iterdir()) == []


def test_create_writes_batch_fields_and_tree_round_trips(tmp_path):
    root = fresh_create_repo(tmp_path)
    tasks = [
        {
            "key": "totals", "title": "Cart totals", "depends_on": [],
            "batch": "A", "files": ["src/cart/totals.py", "tests/cart/"],
        },
        {
            "key": "coupons", "title": "Coupons", "depends_on": [],
            "batch": "A", "files": ["src/cart/coupons.py"],
        },
    ]
    spec = create_spec(tmp_path, tasks=tasks)
    preview = roadmap.plan_create(root, spec, True)
    assert preview[0]["batch"] is None and preview[0]["planned_files"] == []
    assert preview[1]["batch"] == "A"
    assert preview[1]["planned_files"] == ["src/cart/totals.py", "tests/cart/"]

    roadmap.plan_create(root, spec, False)
    tree = roadmap.tree_data(root)[0]["tasks"]
    by_id = {task["task_id"]: task for task in tree}
    assert by_id["WORK-001.01"]["batch"] == "A"
    assert by_id["WORK-001.01"]["planned_files"] == ["src/cart/totals.py", "tests/cart/"]
    written = Path(by_id["WORK-001.01"]["path"]).read_text()
    assert 'batch: "A"\n' in written
    assert "planned_files:\n" in written


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


def write_brief(root, relative, text="## Fresh-session check\n\nReady.\n"):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_create_writes_key_brief_and_reference_and_rejects_missing_brief(tmp_path):
    root = fresh_create_repo(tmp_path)
    brief = "docs/programs/checkout-redesign/tasks/totals.md"
    write_brief(root, brief)
    spec = create_spec(
        tmp_path,
        tasks=[{"key": "totals", "title": "Cart totals", "brief": brief}],
    )
    roadmap.plan_create(root, spec, False)
    task = {task["task_id"]: task for task in roadmap.load_tasks(root)}["WORK-001.01"]
    written = Path(task["path"]).read_text(encoding="utf-8")
    assert task["key"] == "totals"
    assert task["brief"] == brief
    assert 'key: "totals"\n' in written
    assert f'brief: "{brief}"\n' in written
    assert f"  - {brief}\n" in written

    missing_root = tmp_path / "missing"
    missing_root.mkdir()
    fresh_create_repo(missing_root)
    missing_spec = create_spec(
        tmp_path / "missing",
        tasks=[{"key": "totals", "title": "Cart totals", "brief": "docs/missing.md"}],
    )
    with pytest.raises(roadmap.TrackerError, match="brief.*does not exist"):
        roadmap.plan_create(missing_root, missing_spec, True)


def test_tree_json_includes_key_and_brief(tmp_path):
    setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/a.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "a.md": task_text(
                "WORK-001.01", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "queue"\nbrief: "docs/queue.md"\n',
            ),
        },
    )
    task = json.loads(run_cli(tmp_path, "tree", "--json").stdout)[0]["tasks"][0]
    assert task["key"] == "queue"
    assert task["brief"] == "docs/queue.md"


def test_validate_old_plan_without_discussion_points_needs_no_briefs(tmp_path):
    root = setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/PLAN.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "a.md": task_text("WORK-001.01", labels=["alpha"], parent="WORK-001"),
        },
    )
    write_brief(root, "docs/PLAN.md", "# Plan\n")
    assert roadmap.validation_errors(root) == []


def test_validate_discussion_point_and_brief_errors(tmp_path):
    root = setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/PLAN.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "queue.md": task_text(
                "WORK-001.01", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "queue"\nbrief: "docs/queue.md"\n',
            ),
            "intake.md": task_text(
                "WORK-001.02", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "intake"\nbrief: "docs/missing.md"\n',
            ),
            "nobrief.md": task_text(
                "WORK-001.03", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "nobrief"\n',
            ),
            "done.md": task_text(
                "WORK-001.04", status="Done", checked=True, labels=["alpha"],
                parent="WORK-001", extra_frontmatter='key: "done"\n',
            ),
        },
    )
    write_brief(
        root,
        "docs/PLAN.md",
        "# Plan\n\n## Discussion points\n"
        "- P01 [kept → queue] Queue detail.\n"
        "- P01 [changed -> queue] Duplicate.\n"
        "- P02 [kept] Missing key.\n"
        "- P03 [kept -> unknown] Unknown.\n"
        "- P04 kept -> queue] Malformed.\n",
    )
    write_brief(root, "docs/queue.md", "P99\n/tmp/file\nscratchpad notes\n")
    errors = roadmap.validation_errors(root)
    expected = (
        "brief missing: WORK-001.02 -> docs/missing.md",
        "malformed discussion point: alpha: - P04 kept -> queue] Malformed.",
        "duplicate discussion point: alpha: P01",
        "discussion point P02 has no task key: alpha",
        "point P03 names unknown task key: unknown",
        "brief required: WORK-001.03",
        "brief for WORK-001.01 does not cover P01",
        "brief points at a temporary path: WORK-001.01: line 2",
        "brief points at a temporary path: WORK-001.01: line 3",
        "brief has no fresh-session check: WORK-001.01",
    )
    for error in expected:
        assert errors.count(error) == 1
    assert not any("brief required: WORK-001.04" in error for error in errors)


def test_validate_fully_covered_discussion_points(tmp_path):
    root = setup_repo(
        tmp_path,
        plans=[(1, "alpha", "docs/PLAN.md", "Active", "WORK-001")],
        tasks={
            "p.md": task_text("WORK-001", labels=["alpha"]),
            "queue.md": task_text(
                "WORK-001.01", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "queue"\nbrief: "docs/queue.md"\n',
            ),
            "intake.md": task_text(
                "WORK-001.02", labels=["alpha"], parent="WORK-001",
                extra_frontmatter='key: "intake"\nbrief: "docs/intake.md"\n',
            ),
        },
    )
    write_brief(
        root,
        "docs/PLAN.md",
        "## Discussion points\n"
        "- P01 [kept → queue] Queue.\n"
        "- P02 [changed -> queue, intake] Retention.\n"
        "- P03 [dropped] Later.\n"
        "- P04 [open] Unanswered.\n\n## Next\n- P05 [kept] ignored\n",
    )
    write_brief(root, "docs/queue.md", "P01 and P02\n\n## Fresh-session check\nOK\n")
    write_brief(root, "docs/intake.md", "P02\n\n## Fresh-session check\nOK\n")
    assert roadmap.validation_errors(root) == []


def test_brief_command_sets_replaces_preserves_body_and_rejects_missing(tmp_path):
    original = task_text("WORK-001", extra_frontmatter="references:\n  - docs/PLAN.md\n")
    setup_repo(tmp_path, tasks={"a.md": original})
    write_brief(tmp_path, "docs/one.md")
    write_brief(tmp_path, "docs/two.md")
    path = tmp_path / "backlog" / "tasks" / "a.md"
    body = original.split("---\n", 2)[2]

    assert run_cli(tmp_path, "brief", "WORK-001", "--set", "docs/one.md", "--key", "queue").returncode == 0
    first = path.read_text(encoding="utf-8")
    assert 'brief: "docs/one.md"' in first and 'key: "queue"' in first
    assert "  - docs/one.md" in first and first.endswith(body)

    assert run_cli(tmp_path, "brief", "WORK-001", "--set", "docs/two.md").returncode == 0
    second = path.read_text(encoding="utf-8")
    assert 'brief: "docs/two.md"' in second and 'brief: "docs/one.md"' not in second
    assert "  - docs/two.md" in second and second.endswith(body)

    before = path.read_bytes()
    result = run_cli(tmp_path, "brief", "WORK-001", "--set", "docs/missing.md")
    assert result.returncode == 2 and "does not exist" in result.stderr
    assert path.read_bytes() == before
