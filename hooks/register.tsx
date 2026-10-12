import type { Register } from 'claude-code'

import type { TreePlan, TreeTask, LiveEntry } from '../types'

// The Work panel: browse the roadmaps of the task tracker in the folder this
// session runs in, start a task whose prerequisites are done, and on "Clear
// and start" in the same roadmap have this session write its handoff note
// first. The tracker is read through one command (`treeCommand`, JSON on
// stdout; the shape is in ../types/index.d.ts and the README).
//
// State lives in module variables, not $.state: /clear gives the process a new
// session id and $.state belongs to the old one, while the module keeps going.

const PANE = 'work-panel'
const LIVE_FRESH_MS = 3 * 60_000
const CLAIM_GUARD_MS = 2 * 60 * 60_000
const TEAL = '#6fb7b9'
const AMBER = '#e0a85a'

let root = ''
let treeArgv: string[] = []
let startHint = ''
let noteAuthor = '@claude'
let liveDir = ''
let isEnabled = false
let sessionId = ''

let plans: TreePlan[] = []
let loadError: string | undefined
let live = new Map<string, LiveEntry>()
const expanded = new Set<string>()
let selected: string | undefined
let armed: string | undefined
let busy: string | undefined
let problem: string | undefined
let sessionTask: { id: string; plan: string } | undefined
// When this session runs a batch (several tasks the plan marked safe to run at
// the same time), all of its task ids; `sessionTask` stays the first of them,
// so the code that only knows one task keeps working.
let sessionBatch: { plan: string; name: string; ids: string[] } | undefined
// The batch picked in the list (the way `selected` is the picked task).
let selectedBatch: { plan: string; name: string } | undefined
// This session's task when the tracker does not list it (a task file that no
// longer parses, say): kept and shown with a warning instead of forgotten.
let missingTask: string | undefined
let showOthers = false
let nowText: string | undefined
let nowAt = 0
let isTurnRunning = false
let isFresh = true
let heartbeat: { cancel: () => void } | undefined

// ---------- data ----------

async function refresh($: any) {
  if (!isEnabled) await resolveTracker($)
  if (!isEnabled) {
    plans = []
    $.ui.invalidate('ui.render')
    return
  }
  try {
    let out = await $.process.run(treeArgv, { cwd: root, timeoutMs: 20_000 })
    const bundled = bundledArgv($)
    if (out.exitCode !== 0 && treeArgv.join(' ') !== bundled.join(' ') && (await $.fs.exists(`${root}/WORK.md`))) {
      // The configured tracker failed (an older copy without `tree`, say);
      // the bundled one reads the same files.
      const retry = await $.process.run(bundled, { cwd: root, timeoutMs: 20_000 })
      if (retry.exitCode === 0) {
        treeArgv = bundled
        out = retry
      }
    }
    if (out.exitCode !== 0) {
      loadError = (out.stderr || out.stdout || 'tree failed').trim().split('\n').slice(-1)[0]
    } else {
      plans = JSON.parse(out.stdout) as TreePlan[]
      loadError = undefined
    }
  } catch (err) {
    loadError = String((err as Error)?.message ?? err)
  }
  live = await readLive($)
  if (missingTask && !sessionTask) {
    const found = findTask(missingTask)
    if (found) {
      sessionTask = { id: missingTask, plan: found.plan.plan_id }
      expanded.add(found.plan.plan_id)
      missingTask = undefined
    }
  }
  try {
    isFresh = (await $.session.messages()).length === 0
  } catch {
    isFresh = false
  }
  $.ui.invalidate('ui.render')
}

async function readLive($: any): Promise<Map<string, LiveEntry>> {
  const map = new Map<string, LiveEntry>()
  try {
    if (!(await $.fs.exists(liveDir))) return map
    const now = await $.clock.now()
    for (const entry of await $.fs.list(liveDir)) {
      if (!entry.name.endsWith('.json')) continue
      try {
        const value = JSON.parse(await $.fs.read(`${liveDir}/${entry.name}`)) as LiveEntry
        if (value.sessionId !== sessionId && now - value.at > 24 * 60 * 60_000) {
          // a session that ended a day ago: drop its file
          await $.process.run(['rm', '-f', `${liveDir}/${entry.name}`])
          continue
        }
        // Every task of another session's batch counts as being worked on.
        const ids = value.tasks?.length ? value.tasks : value.task ? [value.task] : []
        if (!ids.length || value.sessionId === sessionId) continue
        if (now - value.at > LIVE_FRESH_MS) continue
        for (const id of ids) map.set(id, value)
      } catch {
        // a half-written file from another session: skip it this round
      }
    }
  } catch {
    // no live folder yet
  }
  return map
}

async function beat($: any) {
  if (!isEnabled || !sessionId) return
  const value: LiveEntry = {
    sessionId,
    task: sessionTask?.id ?? missingTask ?? null,
    tasks: sessionBatch ? sessionBatch.ids : sessionTask ? [sessionTask.id] : missingTask ? [missingTask] : [],
    now: nowText ?? null,
    nowAt,
    cwd: root,
    at: await $.clock.now(),
  }
  await $.fs.write(`${liveDir}/${sessionId}.json`, JSON.stringify(value))
}

// After a reload the module starts blank: take this session's task back from
// its own live file, which outlives the module.
async function restoreFromLive($: any) {
  try {
    const path = `${liveDir}/${sessionId}.json`
    if (!(await $.fs.exists(path))) return
    const saved = JSON.parse(await $.fs.read(path)) as LiveEntry
    if (!saved.task) return
    nowText = saved.now ?? undefined
    nowAt = saved.nowAt ?? 0
    const found = findTask(saved.task)
    if (!found) {
      missingTask = saved.task
      return
    }
    sessionTask = { id: saved.task, plan: found.plan.plan_id }
    if (saved.tasks && saved.tasks.length > 1) sessionBatch = batchFrom(saved.tasks)
    expanded.add(found.plan.plan_id)
    nowText = saved.now ?? undefined
    nowAt = saved.nowAt ?? 0
  } catch {
    // no saved state
  }
}

// When the panel does not know this session's task but the conversation has
// history, ask the session's own model once (no tools, cached prefix).
let askedModel = false
async function askModelForTask($: any) {
  if (sessionTask || missingTask || isFresh || askedModel || !plans.length) return
  askedModel = true
  const example = plans.find(plan => plan.tasks.length)?.tasks[0]?.task_id ?? 'TASK-001.01'
  try {
    const reply = await $.model.fork({
      prompt: `Which tracked task is this session working on right now (task ids look like ${example})? Reply with exactly one line: the task id, a space, a vertical bar, a space, then what you are doing now in under 8 words. If this session is not working on a tracked task, reply NONE.`,
    })
    if (!reply.isAnswered || !reply.text) return
    const line = reply.text.trim().split('\n')[0] ?? ''
    const match = line.match(/\b([A-Za-z][A-Za-z0-9]*-\d+(?:\.\d+)*)\b\s*\|?\s*(.*)$/)
    if (!match) return
    const id = match[1]!.toUpperCase()
    const found = findTask(id)
    if (!found || found.task.status === 'Done' || found.task.completed) return
    sessionTask = { id, plan: found.plan.plan_id }
    expanded.add(found.plan.plan_id)
    showOthers = false
    nowText = (match[2] ?? '').trim().slice(0, 80) || undefined
    nowAt = await $.clock.now()
    await beat($)
    $.ui.invalidate('ui.render')
  } catch {
    // the question is a convenience; the panel works without it
  }
}

function findTask(id: string): { plan: TreePlan; task: TreeTask } | undefined {
  for (const plan of plans) {
    const task = plan.tasks.find(one => one.task_id === id)
    if (task) return { plan, task }
  }
  return undefined
}

// A batch from task ids: the ids that exist, in the plan of the first one,
// need to be 2 or more. The name is the tasks' shared `batch`, else 'batch'.
function batchFrom(ids: string[]): { plan: string; name: string; ids: string[] } | undefined {
  const found = [...new Set(ids)].map(findTask).filter((one): one is { plan: TreePlan; task: TreeTask } => one !== undefined)
  const planId = found[0]?.plan.plan_id
  const same = found.filter(one => one.plan.plan_id === planId)
  if (!planId || same.length < 2) return undefined
  const names = new Set(same.map(one => one.task.batch || ''))
  const only = names.size === 1 ? [...names][0] : ''
  return { plan: planId, name: only || 'batch', ids: same.map(one => one.task.task_id) }
}

// The open tasks of one batch in a plan, split into what a press would start
// and what it would leave out (with the reason).
function batchState(members: TreeTask[], now: number) {
  const ready: TreeTask[] = []
  const guards: { task: TreeTask; guard: string }[] = []
  const left: { task: TreeTask; why: string }[] = []
  for (const task of members) {
    const s = startability(task, now)
    if (s.canStart) {
      ready.push(task)
      if (s.guard) guards.push({ task, guard: s.guard })
    } else {
      left.push({ task, why: s.why ?? 'not ready' })
    }
  }
  return { ready, guards, left }
}

function openBatchMembers(plan: TreePlan, name: string): TreeTask[] {
  return plan.tasks.filter(task => task.batch === name && task.status !== 'Done' && !task.completed)
}

function lastCommentMs(task: TreeTask): number | undefined {
  if (!task.last_comment_at) return undefined
  const ms = Date.parse(`${task.last_comment_at.trim().replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? undefined : ms
}

// Can this task be started from the panel, and does it need a second press?
function startability(task: TreeTask, now: number): { canStart: boolean; why?: string; guard?: string } {
  if (task.completed || task.status === 'Done') return { canStart: false, why: 'done' }
  if (sessionTask?.id === task.task_id || sessionBatch?.ids.includes(task.task_id)) return { canStart: false, why: 'this session' }
  if (task.status === 'Blocked') return { canStart: false, why: task.resume_condition ? `blocked · ${task.resume_condition}` : 'blocked' }
  if (task.status === 'In Progress') {
    const holder = live.get(task.task_id)
    if (holder) return { canStart: false, why: 'being worked on now' }
    const last = lastCommentMs(task)
    const age = last === undefined ? undefined : now - last
    const ago = age === undefined ? 'claimed' : `claimed ${agoText(age)} ago`
    if (age !== undefined && age < CLAIM_GUARD_MS) return { canStart: true, why: `${ago} · no live session`, guard: `${ago}, no live session seen` }
    return { canStart: true, why: `${ago} · nobody on it now` }
  }
  if (task.status === 'To Do' && task.ready) return { canStart: true }
  if (task.status === 'To Do') {
    const waits = [...task.waiting_on, ...task.open_children].map(shortId)
    return { canStart: false, why: waits.length ? `needs ${waits.join(', ')}` : 'not ready' }
  }
  return { canStart: false, why: task.status.toLowerCase() }
}

function agoText(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}

function nowLine(text: string, ageMs: number): string {
  const ago = ageMs < 60_000 ? 'just now' : `${agoText(ageMs)} ago`
  return text === 'done' ? `finished ${ago}` : `now: ${text} · ${ago}`
}

function shortId(id: string): string {
  const dot = id.indexOf('.')
  return dot === -1 ? id : id.slice(dot)
}

type Case = 'start' | 'same' | 'other'

function caseFor(plan: TreePlan): Case {
  if (isFresh && !sessionTask) return 'start'
  if (sessionTask && sessionTask.plan === plan.plan_id) return 'same'
  return 'other'
}

// ---------- the start flow ----------

const NOTE_PROMPT = `Write the handoff note for the task this session worked on, for the next session that continues the same roadmap. Use exactly this shape, replacing every placeholder with exact facts from this session (write "None" where nothing applies). Reply with the note only, no preamble.

session end
  Changes: <exact files and behavior changed>
  Commands/results: \`<exact command>\`: <trimmed actual result>
  Commits or dirty state: <SHA(s), or the exact git status>
  Decisions: <decisions made and why>
  Findings: <facts discovered, including failed attempts>
  Residual risk: <known unverified behavior, or None>
  Next action: <the next concrete action or None>`

async function appendComment($: any, path: string, entry: string) {
  const text: string = await $.fs.read(path)
  const end = '<!-- COMMENTS:END -->'
  const at = text.lastIndexOf(end)
  if (at === -1) throw new Error('task file has no comments block')
  const now = new Date(await $.clock.now())
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z')
  const created = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
  const body = entry.trim().split('\n')
  const record = `author: ${noteAuthor}\ncreated: ${created}\n---\n${iso}: ${body[0]}\n${body.slice(1).join('\n')}\n---\n`
  const before = text.slice(0, at)
  await $.fs.write(path, `${before}${before.endsWith('\n') ? '' : '\n'}${record}${text.slice(at)}`)
}

async function gitFacts($: any): Promise<string> {
  try {
    const branch = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })
    const status = await $.process.run(['git', 'status', '--short'], { cwd: root })
    const lines = status.stdout.trim().split('\n').filter(Boolean)
    const shown = lines.slice(0, 15).map((line: string) => `    ${line}`).join('\n')
    return `  Branch (read by the work panel): ${branch.stdout.trim()}\n  git status --short (${lines.length} lines):\n${shown || '    clean'}${lines.length > 15 ? '\n    …' : ''}`
  } catch {
    return '  Branch: (could not read git)'
  }
}

type Note = { from: string; text: string }

const takeoverLine = (task: TreeTask) =>
  `${task.task_id} is already In Progress${task.assignees.length ? ` (assignee ${task.assignees.join(', ')})` : ''}, but no live session is working on it. Read its latest comment first, take over the claim, and record the takeover in its journal.`

function noteLines(note: Note): string[] {
  return [
    '',
    `This continues the same roadmap. The previous session just handed off ${note.from}; its full note is the latest comment on ${note.from}. Read it before you start. The note:`,
    '',
    note.text.trim(),
  ]
}

function firstMessage(plan: TreePlan, task: TreeTask, note?: Note): string {
  const lines = [
    `Start ${task.task_id} (${task.title}). Roadmap: ${plan.plan_id} (${plan.parent_task_id}).${startHint ? ` ${startHint}` : ''}`,
  ]
  if (task.status === 'In Progress') lines.push(takeoverLine(task))
  if (note) lines.push(...noteLines(note))
  return lines.join('\n')
}

function batchMessage(plan: TreePlan, name: string, members: TreeTask[], note?: Note): string {
  const list = members.map(task => `${task.task_id} (${task.title})`).join(', ')
  const lines = [
    `Start batch ${name} of roadmap ${plan.plan_id} (${plan.parent_task_id}): ${list}.`,
    `The plan marked these tasks safe to run at the same time. Use the overseer skill to run them in parallel: claim every task first, give each task its own worker (in its own worktree when they would share a checkout), keep each worker to that task's planned files, then verify and hand off each task on its own.${startHint ? ` ${startHint}` : ''}`,
  ]
  for (const task of members) {
    if (task.status === 'In Progress') lines.push(takeoverLine(task))
  }
  const files = members.filter(task => task.planned_files?.length)
  if (files.length) {
    lines.push(`Planned files — ${files.map(task => `${shortId(task.task_id)}: ${task.planned_files!.join(', ')}`).join('; ')}`)
  }
  if (note) lines.push(...noteLines(note))
  return lines.join('\n')
}

// The shared first half of a start: when the session is in the same roadmap,
// its model writes the handoff note (saved on the task it was on); then
// /clear, unless the session is fresh. Returns the note, if one was written.
async function handOff($: any, which: Case): Promise<Note | undefined> {
  let note: Note | undefined
  if (which === 'same' && sessionTask) {
    const from = findTask(sessionTask.id)
    busy = `writing the handoff note on ${sessionTask.id}…`
    $.ui.invalidate('ui.render')
    const reply = await $.model.fork({ prompt: NOTE_PROMPT })
    if (!reply.isAnswered || !reply.text?.trim()) {
      throw new Error(`the note could not be written (${reply.reason ?? 'empty reply'}); nothing was cleared`)
    }
    const text = `${reply.text.trim()}\n${await gitFacts($)}`
    if (from) await appendComment($, from.task.path, text)
    note = { from: sessionTask.id, text }
  }
  if (which !== 'start') {
    busy = 'clearing…'
    $.ui.invalidate('ui.render')
    await $.command.run({ command: 'clear' })
    sessionId = await $.session.id()
  }
  return note
}

// Hand off, clear, take the task(s) as this session's, and send the first
// message. `batchName` is set when `ids` is a batch.
async function launch(
  $: any,
  plan: TreePlan,
  which: Case,
  ids: string[],
  batchName: string | undefined,
  message: (note?: Note) => string,
) {
  problem = undefined
  armed = undefined
  try {
    const note = await handOff($, which)
    sessionTask = { id: ids[0]!, plan: plan.plan_id }
    sessionBatch = batchName ? { plan: plan.plan_id, name: batchName, ids } : undefined
    missingTask = undefined
    nowText = batchName ? 'starting batch' : 'starting'
    nowAt = await $.clock.now()
    expanded.add(plan.plan_id)
    showOthers = false
    selected = undefined
    selectedBatch = undefined
    busy = undefined
    isFresh = false
    await beat($)
    $.ui.invalidate('ui.render')
    await $.prompt.submit({ text: message(note) })
  } catch (err) {
    busy = undefined
    problem = String((err as Error)?.message ?? err)
    $.ui.invalidate('ui.render')
  }
}

async function start($: any, planId: string, taskId: string) {
  const found = findTask(taskId)
  if (!found || found.plan.plan_id !== planId) return
  const { plan, task } = found
  await launch($, plan, caseFor(plan), [task.task_id], undefined, note => firstMessage(plan, task, note))
}

async function startBatch($: any, planId: string, name: string) {
  problem = undefined
  armed = undefined
  // The list may have moved since the press that armed this: read it again.
  await refresh($)
  const plan = plans.find(one => one.plan_id === planId)
  const members = plan ? batchState(openBatchMembers(plan, name), await $.clock.now()).ready : []
  if (!plan || members.length < 2) {
    problem = `Batch ${name} no longer has 2 tasks ready to start; nothing was cleared.`
    $.ui.invalidate('ui.render')
    return
  }
  await launch($, plan, caseFor(plan), members.map(task => task.task_id), name, note => batchMessage(plan, name, members, note))
}

// ---------- hooks ----------

// About 30% of the terminal, 56-96 columns; remembered for opens at startup.
function paneColumns(terminalColumns: number | undefined): number {
  return Math.min(96, Math.max(56, Math.round((terminalColumns ?? 190) * 0.3)))
}

async function openPane($: any, terminalColumns?: number) {
  const stored = await $.store.get('columns')
  const columns = terminalColumns ? paneColumns(terminalColumns) : typeof stored === 'number' ? stored : paneColumns(undefined)
  await $.store.set('columns', columns)
  return $.ui.open({ id: PANE, title: 'Work', columns, focus: true })
}

// The command's first word: a script path relative to the session folder
// (a .py one runs with that folder's .venv python, else python3), or a
// program on PATH.
async function resolveTree($: any, command: string): Promise<string[] | undefined> {
  const words = command.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  if (!first) return undefined
  const isPath = first.includes('/')
  if (isPath && !(await $.fs.exists(`${root}/${first}`))) return undefined
  if (first.endsWith('.py')) {
    const venv = `${root}/.venv/bin/python`
    return [(await $.fs.exists(venv)) ? venv : 'python3', ...words]
  }
  return words
}

let treeCommand = ''

const FOCUS_TOOL = 'mcp__work-panel__focus'
const FOCUS_SPEC = {
  name: 'focus',
  description:
    "Tell the Work Panel (the task list beside this conversation) which tracked task this session is working on and what you are doing right now. Call it when you claim or switch to a task, at each milestone (a new step, tests running, waiting on the person), and with done: true when the task is finished. Keep `now` to a short phrase, e.g. 'writing tests for coupon rules'. When you run a batch of tasks together, pass every task id in task_ids. It only updates the panel; it changes no files.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The tracked task id, e.g. TASK-001.02' },
      task_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Every task id this session is working on, when it runs a batch',
      },
      now: { type: 'string', description: 'What you are doing right now, a short phrase (under 60 characters)' },
      done: { type: 'boolean', description: 'True when the task is finished' },
    },
    required: ['task_id', 'now'],
  },
}

function bundledArgv($: any): string[] {
  return ['python3', `${$.plugin.root}/tracker/roadmap.py`, 'tree', '--json']
}

// The configured tracker command when its script is here; otherwise the
// bundled tracker once the folder has a WORK.md registry.
async function resolveTracker($: any) {
  const argv = await resolveTree($, treeCommand)
  if (argv) {
    treeArgv = argv
  } else if (await $.fs.exists(`${root}/WORK.md`)) {
    treeArgv = bundledArgv($)
  } else {
    isEnabled = false
    return
  }
  isEnabled = true
}

function createPrompt(name: string): string {
  return [
    `Create a roadmap named "${name}" from the design we discussed in this conversation.`,
    'Follow the "Create a roadmap from a design" steps of the roadmap skill (work-panel:roadmap):',
    'write the PLAN.md, cut the slices, show me the dry-run preview, and wait for my OK before anything is written.',
  ].join(' ')
}

export const register: Register = (on, options) => {
  const settings = options as { treeCommand?: string; startHint?: string; noteAuthor?: string }
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    root = e.cwd
    treeCommand = settings.treeCommand || 'scripts/work_tracker.py tree --json'
    startHint = settings.startHint || 'Use the roadmap skill (work-panel:roadmap).'
    noteAuthor = settings.noteAuthor || '@claude'
    const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    liveDir = `${home}/.claude/work-panel/live`
    sessionId = await $.session.id()
    await $.command.register({
      name: 'work',
      description: 'Show or hide the Work panel; /work create <name> turns the design discussed here into a roadmap',
      argumentHint: '[create <name>]',
    })
    await $.tool.register(FOCUS_SPEC)
    await refresh($)
    await restoreFromLive($)
    $.ui.invalidate('ui.render')
    await beat($)
    heartbeat?.cancel()
    heartbeat = $.clock.every(60_000, () => {
      void beat($).then(() => (isTurnRunning ? undefined : refresh($)))
    })
    return started
  })

  on('session.end', async ($, e, next) => {
    // The process goes on after /clear under a new id; free the old id's entry.
    if (isEnabled && e.sessionId) {
      try {
        await $.fs.write(`${liveDir}/${e.sessionId}.json`, JSON.stringify({ sessionId: e.sessionId, task: null, cwd: root, at: 0 }))
      } catch {
        // nothing to free
      }
    }
    if (e.reason === 'clear') {
      sessionTask = undefined
      sessionBatch = undefined
      missingTask = undefined
      nowText = undefined
      askedModel = false
      isFresh = true
    }
    return next(e)
  })

  on('command.run', { command: 'work' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (/^create\b/i.test(args)) {
      const name = args.replace(/^create\b/i, '').trim()
      if (!name) return { text: 'Usage: /work create <roadmap name>' }
      if (isTurnRunning) return { text: 'Work panel: wait for the current turn to finish, then /work create again.' }
      $.clock.after(50, () => void $.prompt.submit({ text: createPrompt(name) }))
      return { text: `Work panel: asked the agent to draft the roadmap "${name}". It will show a preview first.` }
    }
    const panes = await $.ui.panes()
    // A pane opened unasked waits undrawn below 144 columns: only one the
    // person can see is closed; otherwise /work opens it for real.
    if (panes.some(pane => pane.id === PANE && pane.isPlaced && pane.isShown)) {
      await $.ui.close({ id: PANE })
      return { text: 'Work panel hidden.' }
    }
    await refresh($)
    void askModelForTask($)
    const opened = await openPane($, e.presentation?.columns)
    return { text: opened.isPlaced ? 'Work panel open.' : 'Work panel waits for a wider terminal.' }
  })

  on('prompt.submit', async ($, e, next) => {
    isTurnRunning = true
    isFresh = false
    return next(e)
  }).catch(($, e, next) => next(e))

  // The agent reports its task and what it is doing now; the panel shows it.
  on('tool.call', { tool: FOCUS_TOOL }, async ($, e) => {
    const input = e as unknown as { task_id?: string; task_ids?: unknown; now?: string; done?: boolean }
    const id = String(input.task_id ?? '').trim().toUpperCase()
    const given = Array.isArray(input.task_ids)
      ? input.task_ids.map(one => String(one).trim().toUpperCase()).filter(Boolean)
      : []
    let found = findTask(id)
    if (!found || given.some(one => !findTask(one))) {
      await refresh($)
      found = findTask(id)
    }
    if (!found) return { result: `Work Panel: no task ${id} in this folder's tracker; nothing changed.` }
    const batch = given.length ? batchFrom([id, ...given]) : undefined
    // A single task of the current batch keeps the batch and only moves the
    // now text; any other task replaces the batch.
    const keeps = !batch && sessionBatch?.ids.includes(id) === true
    const sameBatch = batch !== undefined && sessionBatch?.ids.join() === batch.ids.join()
    if (!keeps && (batch ? !sameBatch : sessionTask?.id !== id)) {
      expanded.add(found.plan.plan_id)
      showOthers = false
      selected = undefined
      selectedBatch = undefined
      armed = undefined
    }
    if (!keeps) {
      sessionTask = { id, plan: found.plan.plan_id }
      sessionBatch = batch
    }
    missingTask = undefined
    // One member finishing is not the batch finishing: name which one.
    const doneText = keeps ? `${shortId(id)} done` : 'done'
    nowText = input.done ? doneText : String(input.now ?? '').trim().slice(0, 80) || undefined
    nowAt = await $.clock.now()
    await beat($)
    $.ui.invalidate('ui.render')
    const where = sessionBatch ? `batch ${sessionBatch.name} (${sessionBatch.ids.join(', ')})` : id
    return { result: `Work Panel shows this session on ${where}${nowText ? ` (now: ${nowText})` : ''}.` }
  }).catch(() => ({ result: 'Work Panel could not update; carry on with the task.' }))

  // This session's task follows its claims as they happen: after a tool call
  // that names a task and looks like a status change, the tracker is re-read,
  // and a named task that has just become In Progress is this session's task.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (!isEnabled || e.tool === FOCUS_TOOL) return result
    const fields = e as unknown as Record<string, unknown>
    const text = [fields.command, fields.file_path, fields.new_string, fields.content]
      .filter(v => typeof v === 'string')
      .join(' ')
    if (!/in progress|status|tasks\//i.test(text)) return result
    const named = new Set<string>()
    for (const match of text.matchAll(/\b([a-z][a-z0-9]*)-(\d+(?:\.\d+)*)\b/gi)) {
      named.add(`${match[1]!.toUpperCase()}-${match[2]}`)
    }
    const before = [...named].filter(id => {
      const found = findTask(id)
      return found !== undefined && found.task.status !== 'In Progress'
    })
    if (!before.length) return result
    await refresh($)
    for (const id of before) {
      const found = findTask(id)
      // A claim inside this session's own batch is the batch working, not a switch.
      if (sessionBatch?.ids.includes(id)) continue
      if (found && found.task.status === 'In Progress' && sessionTask?.id !== id) {
        sessionTask = { id, plan: found.plan.plan_id }
        sessionBatch = undefined
        missingTask = undefined
        expanded.add(found.plan.plan_id)
        showOthers = false
        selected = undefined
        selectedBatch = undefined
        armed = undefined
        await beat($)
        $.ui.invalidate('ui.render')
      }
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    isTurnRunning = false
    if (isEnabled) void refresh($).then(() => askModelForTask($))
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    // The pane's own body width (viewport.columns is the whole conversation's).
    const width = Math.max(30, (e.props?.bodyColumns ?? 58) - 1)
    const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
    const now = Date.now()

    if (!isEnabled) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>WORK</Text>
          <Text dimColor wrap="wrap">No roadmaps here yet.</Text>
          <Text wrap="wrap">{'Talk through a design with the agent, then type /work create <name>.'}</Text>
        </Box>
      )
    }
    if (loadError && !plans.length) {
      return (
        <Box flexDirection="column">
          <Text color="error">Could not read the tracker</Text>
          <Text dimColor wrap="wrap">{loadError}</Text>
          <Button plain dimColor onPress={() => void refresh($)}>Retry</Button>
        </Box>
      )
    }

    const current = sessionTask ? findTask(sessionTask.id) : undefined
    const lostId = current ? undefined : (sessionTask?.id ?? missingTask)
    const active = plans.filter(plan => plan.state === 'Active')
    const pickedRow = selected ? findTask(selected) : undefined

    // A session with a task sees its own roadmap; the rest fold into one row.
    const focus = sessionTask ? active.find(plan => plan.plan_id === sessionTask?.plan) : undefined
    const others = focus ? active.length - 1 : 0
    const shown = focus && !showOthers ? [focus] : active

    const rows: any[] = []
    for (const plan of shown) {
      const isOpen = expanded.has(plan.plan_id)
      const isSame = sessionTask?.plan === plan.plan_id
      const meta = `${plan.counts.done}/${plan.counts.total} · ${plan.counts.ready} ready`
      const name = `${plan.parent_task_id.replace(/^[A-Za-z]+-/, '')} ${plan.plan_id}`
      rows.push(
        <Box key={`p-${plan.plan_id}`} flexDirection="row" justifyContent="space-between">
          <Button
            key={`plan-${plan.plan_id}`}
            plain
            label={`${isOpen ? '▾' : '▸'} ${cut(name, width - meta.length - 4)}`}
            onPress={() => {
              if (isOpen) expanded.delete(plan.plan_id)
              else expanded.add(plan.plan_id)
              $.ui.invalidate('ui.render')
            }}
          />
          <Text color={isSame ? TEAL : undefined} dimColor={!isSame}>{isSame ? 'this roadmap' : meta}</Text>
        </Box>,
      )
      if (!isOpen) continue
      const open = plan.tasks.filter(task => task.status !== 'Done' && !task.completed)
      const doneCount = plan.tasks.length - open.length
      const order = (task: TreeTask) => {
        const s = startability(task, now)
        if (task.status === 'In Progress') return s.canStart ? 1 : 0
        if (s.canStart) return 1
        if (task.status === 'Blocked') return 3
        return 2
      }
      const sorted = [...open].sort((a, b) => order(a) - order(b))
      // One task's row (and its why line); batch members sit two columns deeper.
      const pushTask = (task: TreeTask, indent: number) => {
        const s = startability(task, now)
        const mark =
          task.status === 'In Progress' ? '◐' : task.status === 'Blocked' ? '■' : s.canStart ? '●' : '○'
        const isPicked = selected === task.task_id
        // A task someone is on right now is drawn in teal; this session's own, bold.
        const isMine = s.why === 'this session'
        const working = isMine || s.why === 'being worked on now'
        const label = `${' '.repeat(indent)}${isPicked ? '▶' : mark} ${shortId(task.task_id).padEnd(4)} ${cut(task.title, width - 10 - indent)}`
        rows.push(
          s.canStart ? (
            <Button
              key={`t-${task.task_id}`}
              plain
              dimColor={!isPicked && task.status === 'In Progress'}
              label={label}
              onPress={() => {
                selected = task.task_id
                selectedBatch = undefined
                armed = undefined
                problem = undefined
                $.ui.invalidate('ui.render')
              }}
            />
          ) : (
            <Text
              key={`t-${task.task_id}`}
              dimColor={!working}
              bold={isMine}
              color={working ? TEAL : task.status === 'Blocked' ? AMBER : undefined}
              wrap="truncate-end"
            >
              {label}
            </Text>
          ),
        )
        if (s.why) {
          rows.push(
            <Text key={`w-${task.task_id}`} dimColor={!isMine} color={working ? TEAL : undefined} wrap="truncate-end">
              {`${' '.repeat(indent + 7)}${cut(s.why, width - 8 - indent)}`}
            </Text>,
          )
        }
      }
      // A batch is drawn at the place of its best-sorted member: a header, then
      // its members. Tasks without a batch are drawn as they always were.
      const drawn = new Set<string>()
      for (const task of sorted) {
        const bname = task.batch || undefined
        if (!bname) {
          pushTask(task, 2)
          continue
        }
        if (drawn.has(bname)) continue
        drawn.add(bname)
        const members = sorted.filter(one => one.batch === bname)
        const ready = batchState(members, now).ready.length
        const isMineBatch = sessionBatch?.plan === plan.plan_id && sessionBatch.name === bname
        const isPickedBatch = selectedBatch?.plan === plan.plan_id && selectedBatch.name === bname
        const header = isMineBatch
          ? `  ⧉ batch ${bname} · this session`
          : `  ${isPickedBatch ? '▶' : '⧉'} batch ${bname} · ${ready} ready`
        rows.push(
          !isMineBatch && ready >= 2 ? (
            <Button
              key={`b-${plan.plan_id}-${bname}`}
              plain
              label={cut(header, width)}
              onPress={() => {
                selectedBatch = { plan: plan.plan_id, name: bname }
                selected = undefined
                armed = undefined
                problem = undefined
                $.ui.invalidate('ui.render')
              }}
            />
          ) : (
            <Text
              key={`b-${plan.plan_id}-${bname}`}
              dimColor={!isMineBatch}
              color={isMineBatch ? TEAL : undefined}
              wrap="truncate-end"
            >
              {cut(header, width)}
            </Text>
          ),
        )
        for (const member of members) pushTask(member, 4)
      }
      if (doneCount) rows.push(<Text key={`d-${plan.plan_id}`} dimColor>{`  ✓ ${doneCount} done`}</Text>)
    }
    if (others > 0) {
      rows.push(
        <Button
          key="others"
          plain
          dimColor
          label={showOthers ? '▴ only this roadmap' : `▸ ${others} other roadmap${others === 1 ? '' : 's'}`}
          onPress={() => {
            showOthers = !showOthers
            $.ui.invalidate('ui.render')
          }}
        />,
      )
    }

    const hintFor = (which: Case) =>
      which === 'same'
        ? `Same roadmap: a handoff note goes on ${sessionTask?.id} first.`
        : which === 'other'
          ? 'No handoff note: different roadmap or no task here.'
          : 'Fresh session: nothing to clear.'

    // The picked batch counts only while 2 of its members can still start.
    const pickedBatchPlan = selectedBatch ? plans.find(plan => plan.plan_id === selectedBatch?.plan) : undefined
    const pickedBatchState =
      pickedBatchPlan && selectedBatch ? batchState(openBatchMembers(pickedBatchPlan, selectedBatch.name), now) : undefined

    let action: any = null
    if (busy) {
      action = <Text color={TEAL}>{busy}</Text>
    } else if (pickedBatchPlan && selectedBatch && pickedBatchState && pickedBatchState.ready.length >= 2) {
      const bplan = pickedBatchPlan
      const bname = selectedBatch.name
      const { ready, guards, left } = pickedBatchState
      const which = caseFor(bplan)
      const ids = ready.map(task => shortId(task.task_id)).join(' ')
      const verb = which === 'start' ? 'Start' : 'Clear and start'
      const needsConfirm = which !== 'start' || guards.length > 0
      const key = `batch:${bplan.plan_id}:${bname}`
      const isArmed = armed === key
      action = (
        <Box flexDirection="column">
          {guards.map(one => (
            <Text key={`g-${one.task.task_id}`} color={AMBER} wrap="wrap">{`Careful: ${shortId(one.task.task_id)} ${one.guard}.`}</Text>
          ))}
          <Button
            key="go-batch"
            variant="primary"
            autoFocus
            label={isArmed ? `Press again: ${verb.toLowerCase()} batch ${bname} (${ids})` : `${verb} batch ${bname} (${ids})`}
            onPress={() => {
              if (isTurnRunning) {
                problem = 'Wait for the current turn to finish.'
                $.ui.invalidate('ui.render')
                return
              }
              if (needsConfirm && !isArmed) {
                armed = key
                $.ui.invalidate('ui.render')
                return
              }
              const planId = bplan.plan_id
              $.clock.after(50, () => void startBatch($, planId, bname))
            }}
          />
          <Text dimColor wrap="wrap">{hintFor(which)}</Text>
          {left.length ? (
            <Text dimColor wrap="wrap">{`Leaves out ${left.map(one => `${shortId(one.task.task_id)} (${one.why})`).join(', ')}`}</Text>
          ) : null}
          <Text dimColor wrap="wrap">Runs in one session; overseer runs them in parallel.</Text>
        </Box>
      )
    } else if (pickedRow) {
      const which = caseFor(pickedRow.plan)
      const s = startability(pickedRow.task, now)
      const id = shortId(pickedRow.task.task_id)
      const verb = which === 'start' ? 'Start' : 'Clear and start'
      const needsConfirm = which !== 'start' || Boolean(s.guard)
      const isArmed = armed === pickedRow.task.task_id
      const hint = hintFor(which)
      action = (
        <Box flexDirection="column">
          {s.guard ? <Text color={AMBER} wrap="wrap">{`Careful: ${s.guard}.`}</Text> : null}
          <Button
            key="go"
            variant="primary"
            autoFocus
            label={isArmed ? `Press again: ${verb.toLowerCase()} ${id}` : `${verb} ${pickedRow.task.task_id}`}
            onPress={() => {
              if (isTurnRunning) {
                problem = 'Wait for the current turn to finish.'
                $.ui.invalidate('ui.render')
                return
              }
              if (needsConfirm && !isArmed) {
                armed = pickedRow.task.task_id
                $.ui.invalidate('ui.render')
                return
              }
              const planId = pickedRow.plan.plan_id
              const taskId = pickedRow.task.task_id
              $.clock.after(50, () => void start($, planId, taskId))
            }}
          />
          <Text dimColor wrap="wrap">{hint}</Text>
        </Box>
      )
    } else {
      action = <Text dimColor>Pick a ● task to start it.</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>WORK</Text>
          <Text dimColor>{`${active.length} roadmap${active.length === 1 ? '' : 's'} · /work hides`}</Text>
        </Box>
        {current ? (
          <Box flexDirection="column">
            <Text color={AMBER}>
              {sessionBatch && sessionBatch.ids.length >= 2
                ? `▲ THIS SESSION · batch ${sessionBatch.name}`
                : current.task.status === 'Done' || current.task.completed
                  ? '▲ THIS SESSION · done'
                  : '▲ THIS SESSION'}
            </Text>
            {sessionBatch && sessionBatch.ids.length >= 2 ? (
              sessionBatch.ids.map(id => {
                const member = findTask(id)?.task
                const isDone = member?.status === 'Done' || member?.completed
                return <Text key={`m-${id}`}>{cut(`${isDone ? '✓' : '◐'} ${shortId(id)} ${member?.title ?? "(not in the tracker's list)"}`, width)}</Text>
              })
            ) : (
              <Text>{cut(`${current.task.task_id} · ${current.task.title}`, width)}</Text>
            )}
            {nowText ? <Text dimColor>{cut(nowLine(nowText, now - nowAt), width)}</Text> : null}
          </Box>
        ) : lostId ? (
          <Box flexDirection="column">
            <Text color={AMBER}>▲ THIS SESSION</Text>
            <Text>{cut(`${lostId} · not in the tracker's list`, width)}</Text>
            <Text color="warning" wrap="wrap">
              Its task file may not parse. Run the tracker's validate command to see why.
            </Text>
          </Box>
        ) : null}
        <Box flexDirection="column">{rows}</Box>
        <Box flexDirection="column">
          {action}
          {problem ? <Text color="error" wrap="wrap">{problem}</Text> : null}
          {loadError ? <Text color="warning" wrap="wrap">{`Tracker: ${loadError}`}</Text> : null}
        </Box>
      </Box>
    )
  })
}
