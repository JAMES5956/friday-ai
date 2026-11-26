export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;
export const PROJECT_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const MILESTONE_STATUSES = ["pending", "in_progress", "completed"] as const;
export const PROJECT_TASK_STATUSES = ["pending", "in_progress", "completed", "blocked"] as const;

export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type ProjectPriority = typeof PROJECT_PRIORITIES[number];
export type ProjectTaskStatus = typeof PROJECT_TASK_STATUSES[number];

export type ProjectTask = { id: string; title: string; dueDate: string | null; status: ProjectTaskStatus };
export type ProjectMilestone = { id: string; title: string; dueDate: string | null; status: typeof MILESTONE_STATUSES[number]; tasks: ProjectTask[] };
export type ProjectUpdate = { id: string; body: string; createdAt: string; agentId: string };
export type ProjectPayload = {
  title: string;
  purpose: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  ownerAgentId: string;
  startDate: string | null;
  targetDate: string | null;
  milestones: ProjectMilestone[];
  tasks: ProjectTask[];
  progressUpdates: ProjectUpdate[];
  blockers: string[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const AGENTS = new Set(["friday", "atlas", "oracle", "forge", "byte", "vantage", "sage", "pixel", "scout"]);

function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validTask(value: unknown): value is ProjectTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string" && ID.test(task.id) &&
    typeof task.title === "string" && !!task.title.trim() && task.title.length <= 180 &&
    validDate(task.dueDate) && typeof task.status === "string" &&
    PROJECT_TASK_STATUSES.includes(task.status as ProjectTaskStatus);
}

export function validateProjectPayload(value: unknown): value is ProjectPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.title !== "string" || !p.title.trim() || p.title.length > 160) return false;
  if (typeof p.purpose !== "string" || !p.purpose.trim() || p.purpose.length > 5000) return false;
  if (typeof p.status !== "string" || !PROJECT_STATUSES.includes(p.status as ProjectStatus)) return false;
  if (typeof p.priority !== "string" || !PROJECT_PRIORITIES.includes(p.priority as ProjectPriority)) return false;
  if (typeof p.ownerAgentId !== "string" || !AGENTS.has(p.ownerAgentId)) return false;
  if (!validDate(p.startDate) || !validDate(p.targetDate)) return false;
  if (!Array.isArray(p.milestones) || p.milestones.length > 40) return false;
  for (const value of p.milestones) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const m = value as Record<string, unknown>;
    if (typeof m.id !== "string" || !ID.test(m.id) || typeof m.title !== "string" || !m.title.trim() || m.title.length > 180 ||
      !validDate(m.dueDate) || typeof m.status !== "string" || !MILESTONE_STATUSES.includes(m.status as typeof MILESTONE_STATUSES[number]) ||
      !Array.isArray(m.tasks) || m.tasks.length > 30 || !m.tasks.every(validTask)) return false;
  }
  if (!Array.isArray(p.tasks) || p.tasks.length > 100 || !p.tasks.every(validTask)) return false;
  if (!Array.isArray(p.progressUpdates) || p.progressUpdates.length > 100 || p.progressUpdates.some(update => {
    if (!update || typeof update !== "object" || Array.isArray(update)) return true;
    const item = update as Record<string, unknown>;
    return typeof item.id !== "string" || !ID.test(item.id) || typeof item.body !== "string" ||
      !item.body.trim() || item.body.length > 4000 || typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt)) || typeof item.agentId !== "string" || !AGENTS.has(item.agentId);
  })) return false;
  if (!Array.isArray(p.blockers) || p.blockers.length > 30 || p.blockers.some(item => typeof item !== "string" || !item.trim() || item.length > 500)) return false;
  return true;
}

export function projectProgress(project: Pick<ProjectPayload, "milestones" | "tasks">): number {
  const items = [...project.milestones, ...project.tasks];
  if (!items.length) return 0;
  const completed = items.filter(item => item.status === "completed").length;
  return Math.round((completed / items.length) * 100);
}
