# Decision and risk register

**Status:** Operating-design template. It does not represent an implemented register or live monitoring service.

## Decision log

Record material decisions so that FRIDAY can explain what was decided, by whom, on what evidence and under which conditions.

| Field | Required information |
|---|---|
| Decision ID | Unique stable identifier |
| Date / timezone | When the decision was made; default Africa/Nairobi |
| Context | Project, task or operational area |
| Decision requested | The precise question requiring a decision |
| Options | Viable alternatives considered |
| Evidence | Sources, tests or documents relied upon |
| Recommendation | Recommendation, clearly distinguished from approval |
| Decision | Approved / Rejected / Deferred / Returned for revision |
| Decision maker | Person with authority to decide |
| Conditions | Limits, expiry, required checks or follow-up |
| Audit reference | Link or identifier for the immutable event record |

Never infer approval from silence, a suggestion, an agent's output or a task being created. Preserve superseded decisions and record the reason for a change.

## Risk register

Use a consistent scale defined by the organisation; until one is formally approved, describe likelihood and impact in words rather than inventing numerical scores.

| Field | Required information |
|---|---|
| Risk ID | Unique stable identifier |
| Description | Cause, uncertain event and potential consequence |
| Category | Security, privacy, safety, delivery, finance, legal, operational or reputation |
| Likelihood / impact | Evidence-based assessment and rationale |
| Owner | Person accountable for monitoring the risk |
| Mitigation | Preventive actions and due dates |
| Contingency | Response if the risk occurs |
| Trigger | Observable condition requiring escalation |
| Residual risk | Remaining exposure after mitigation |
| Status | Open / Monitoring / Mitigating / Escalated / Closed |
| Review date | Next scheduled reassessment |
| Evidence | Incident, test, review or source references |

## Escalation rules

Escalate immediately to NEXUS and the user for suspected compromise, unauthorised access, privacy exposure, data loss, unsafe automation or tampering with audit evidence. Escalate material cost, scope, deadline, legal or external-commitment decisions to the user before proceeding.

NEXUS may independently block unsafe technical activity and report directly to the user. FRIDAY coordinates the response and preserves relevant evidence where lawful and technically supported. Neither agent may claim that an incident is contained until containment is verified.

## Review discipline

- Assign a named owner to every open risk.
- Review critical risks before a project moves to the next lifecycle stage.
- Record the evidence supporting risk closure.
- Keep estimates, assumptions and confirmed facts distinct.
- Do not expose sensitive incident details in general department reports.
- Apply retention and access controls to the register.

**Implementation boundary:** These templates become operational only when backed by authenticated, owner-scoped storage, access controls, audit events, review workflows and tested escalation paths.
