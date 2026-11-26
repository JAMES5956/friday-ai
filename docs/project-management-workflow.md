# Project management workflow

**Status:** Design specification. This document describes the intended workflow; it is not evidence that a project-management module is implemented or active.

## 1. Purpose and operating principles

FRIDAY coordinates projects across the intended FRIDAY AI Corporation departments. Every project must have a clear owner, an approved objective, measurable deliverables, an accountable lead, and a traceable decision history.

- One accountable project owner is named for every project.
- Work is assigned to named departments or specialist agents; assignment does not imply autonomous execution.
- FRIDAY coordinates plans, status and reporting. NEXUS independently reviews security, privacy and integrity risks.
- The user retains approval authority for commitments, sensitive access, spending, publication, external communication and irreversible actions.
- Plans, estimates and generated reports must distinguish verified facts from assumptions.

## 2. Project lifecycle

1. **Proposal** — capture the problem, opportunity, expected value, sponsor and initial constraints.
2. **Triage** — FRIDAY checks fit, duplication, feasibility, dependencies, risk and missing information.
3. **Owner decision** — the user approves, rejects, defers or requests revision. No project becomes active merely because an agent recommends it.
4. **Planning** — appoint the project owner and lead; define scope, deliverables, milestones, resources, budget assumptions, risks, acceptance criteria and communication cadence.
5. **Ready** — confirm dependencies, access, security review and approvals. A project with unresolved critical blockers cannot enter active execution.
6. **Active** — execute approved tasks, track evidence and report progress.
7. **Review** — assess deliverables against acceptance criteria; run required QA, security, privacy and performance checks.
8. **Completed** — owner accepts the deliverables and closure report.
9. **Paused / Cancelled** — record the reason, decision maker, outstanding obligations and safe stopping point.
10. **Archived** — retain approved records according to the data-retention policy; do not silently erase audit history.

## 3. Project brief

Every proposal should record:

- Project title, unique identifier, sponsor and accountable owner.
- Problem statement, intended users and expected outcome.
- Objectives and measurable success indicators.
- In-scope and explicitly out-of-scope work.
- Deliverables and acceptance criteria.
- Proposed start date, target dates and milestone schedule (Africa/Nairobi).
- Departments, contributors and dependencies.
- Resource requirements and cost estimates, clearly marked as estimates until verified.
- Risks, assumptions, constraints and mitigations.
- Data classification, access requirements and NEXUS review status.
- Approval record and latest approved scope version.

## 4. Work breakdown and assignment

Break deliverables into tasks small enough to estimate and verify. Each task records:

- Description, parent project and deliverable.
- One accountable assignee (person, department or configured agent).
- Priority, due date, dependencies and expected effort.
- Required inputs, permissions and tools.
- Definition of done and evidence required.
- Status, update timestamp, blocker and reviewer.

Suggested task states: **Backlog → Ready → In progress → Blocked → In review → Done**. Tasks may also be **Cancelled** with a reason. A blocked task must identify the blocker and who can resolve it. Reopening a completed task requires a reason and preserves the previous completion record.

Agent assignment creates a work request, not permission to take external actions. Specialist execution remains owner-triggered and subject to NEXUS controls. Agents must not claim work, tests or outcomes they have not performed.

## 5. Milestones, deadlines and dependencies

- Milestones represent verifiable project outcomes, not just calendar dates.
- Each milestone has an owner, target date, acceptance evidence and status.
- Dependencies are explicit and ordered; downstream work cannot be marked ready while a required dependency is unresolved.
- FRIDAY flags overdue work, schedule conflicts and critical-path risk in reports.
- Deadline changes require a reason, impact assessment and recorded approval by the project owner; material scope, cost or commitment changes require the user's approval.
- Dates and meeting times use Africa/Nairobi unless a different timezone is explicitly recorded.

## 6. Governance and change control

The project owner manages day-to-day scope within the approved plan. The user approves new projects and material changes involving objectives, scope, budget, external commitments, sensitive data or irreversible actions.

Every change request records the requested change, reason, options considered, schedule/cost/risk impact, recommendation, decision maker, decision and effective version. Rejected changes remain in the history.

NEXUS independently reviews access, privacy, security, integrity and recovery concerns. NEXUS may block unsafe work and escalate unresolved material risks directly to the user. NEXUS does not approve business objectives or override the user's authority.

## 7. Reporting and escalation

Project leads maintain task evidence and submit regular reports using the department report template. FRIDAY consolidates these into a project view containing:

- Overall status with evidence-based rationale.
- Completed deliverables and milestone progress.
- Next actions, owners and due dates.
- Blockers, dependencies and decisions required.
- Schedule, resource and cost variance (actuals separated from estimates).
- Risks, mitigations and NEXUS review findings.
- Changes since the previous report.

Escalate immediately when there is a suspected security incident, privacy breach, data loss, unauthorised commitment, critical deadline threat or blocked decision requiring the user. Routine issues follow the agreed reporting cadence. Do not fabricate progress to make a report appear complete.

## 8. Quality and acceptance

Before a deliverable is accepted, the reviewer checks its stated acceptance criteria and required evidence. Depending on the project, checks may include:

- Functional and regression testing.
- Accessibility and usability.
- Security and privacy review.
- Data validation, backup and recovery.
- Performance and resilience.
- Documentation and operational handover.

A test is recorded as passed only when it was actually run and its result is available. Failed checks create tracked remediation tasks. The project owner recommends acceptance; the user accepts high-impact deliverables or any outcome reserved to the user.

## 9. Closure

A closure report records the final outcome, accepted deliverables, unmet objectives, actual costs where known, open risks, handover owner, retained records, lessons learned and follow-up actions. Projects are not marked completed while critical acceptance or security issues remain unresolved unless the user explicitly accepts the documented exception.

## 10. Minimum future product capabilities

A future project module should provide owner-scoped project records, role-aware access, lifecycle transitions, task and milestone tracking, dependencies, versioned change requests, approvals, evidence attachments, audit events, reporting and archive/restore controls. It should enforce authorization and state transitions server-side, validate all inputs, rate-limit sensitive endpoints, and test cross-owner isolation.

**Implementation boundary:** Until those capabilities are built, tested and configured, this workflow remains a blueprint. Existing specialist tasks are not a substitute for a complete project-management system.
