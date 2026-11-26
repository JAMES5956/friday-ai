import { describe, expect, it } from "vitest";
import { projectProgress, validateProjectPayload, type ProjectPayload } from "../lib/projects/policy";

const validProject = (): ProjectPayload => ({
  title: "FRIDAY roadmap", purpose: "Build a secure personal assistant.", status: "planning",
  priority: "high", ownerAgentId: "atlas", startDate: "2026-11-26", targetDate: "2027-02-01",
  milestones: [{ id: "m1", title: "Architecture", dueDate: "2026-12-10", status: "completed", tasks: [] }],
  tasks: [{ id: "t1", title: "Review design", dueDate: null, status: "pending" }],
  progressUpdates: [{ id: "u1", body: "Architecture review completed.", createdAt: "2026-11-26T10:00:00.000Z", agentId: "friday" }],
  blockers: ["Awaiting provider selection"]
});

describe("Project Continuity policy", () => {
  it("accepts a complete, bounded project payload", () => {
    expect(validateProjectPayload(validProject())).toBe(true);
  });
  it("rejects missing titles, invalid dates and unsupported agent owners", () => {
    expect(validateProjectPayload({ ...validProject(), title: " " })).toBe(false);
    expect(validateProjectPayload({ ...validProject(), targetDate: "2026-02-30" })).toBe(false);
    expect(validateProjectPayload({ ...validProject(), ownerAgentId: "nexus" })).toBe(false);
  });
  it("rejects oversized collections and malformed task states", () => {
    expect(validateProjectPayload({ ...validProject(), tasks: Array(101).fill(validProject().tasks[0]) })).toBe(false);
    expect(validateProjectPayload({ ...validProject(), tasks: [{ ...validProject().tasks[0], status: "deleted" }] })).toBe(false);
  });
  it("calculates completion across milestones and tasks", () => {
    expect(projectProgress(validProject())).toBe(50);
    expect(projectProgress({ milestones: [], tasks: [] })).toBe(0);
  });
});
