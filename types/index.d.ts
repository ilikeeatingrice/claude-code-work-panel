// Shapes the Work panel reads: the tracker command's JSON (treeCommand) and
// the per-session live files under ~/.claude/work-panel/live/.

export type TreeTask = {
  task_id: string
  title: string
  status: string
  priority: string | null
  ordinal: number
  assignees: string[]
  labels: string[]
  parent_task_id: string | null
  dependencies: string[]
  ready: boolean
  waiting_on: string[]
  open_children: string[]
  resume_condition: string | null
  last_comment_at: string | null
  completed: boolean
  path: string
  // Optional: older trackers omit both. A named group of tasks in one plan that
  // the plan marked safe to run at the same time, and the files a task expects
  // to change. Missing means null / [].
  batch?: string | null
  planned_files?: string[]
  // Optional: the task's plan file (a task brief) and its spec key. Older
  // trackers omit both.
  brief?: string | null
  key?: string | null
}

export type TreePlan = {
  plan_id: string
  priority: number
  state: string
  path: string
  parent_task_id: string
  parent_title: string | null
  counts: { total: number; done: number; ready: number; in_progress: number; blocked: number; waiting: number }
  tasks: TreeTask[]
}

export type LiveEntry = {
  sessionId: string
  // The first task id; `tasks` lists every task when the session runs a batch.
  task: string | null
  tasks?: string[]
  now?: string | null
  nowAt?: number
  cwd: string
  at: number
}
