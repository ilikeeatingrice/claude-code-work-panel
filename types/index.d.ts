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
  task: string | null
  now?: string | null
  nowAt?: number
  cwd: string
  at: number
}
