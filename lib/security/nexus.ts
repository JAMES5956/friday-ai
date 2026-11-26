export type SecurityDecision =
  | { allowed: true; requiresApproval: false; reason: "routine_request" }
  | { allowed: false; requiresApproval: true; reason: "owner_approval_required" };

// This deterministic phrase gate is a conservative first layer, not an intent model.
// It deliberately blocks common conjugations and indirect "get this done" requests.
const sensitiveActions =
  "(?:send|sends|sending|sent|publish|publishes|publishing|published|post|posts|posting|posted|share|shares|sharing|shared|forward|forwards|forwarding|forwarded|email|emails|emailing|message|messages|messaging|call|calls|calling|called|book|books|booking|booked|schedule|schedules|scheduling|scheduled|invite|invites|inviting|invited|submit|submits|submitting|submitted|upload|uploads|uploading|uploaded|pay|pays|paying|paid|purchase|purchases|purchasing|purchased|buy|buys|buying|bought|order|orders|ordering|ordered|subscribe|subscribes|subscribing|subscribed|transfer|transfers|transferring|transferred|withdraw|withdraws|withdrawing|withdrew|withdrawn|donate|donates|donating|donated|invest|invests|investing|invested|delete|deletes|deleting|deleted|erase|erases|erasing|erased|wipe|wipes|wiping|wiped|reset|resets|resetting|revoke|revokes|revoking|revoked|cancel|cancels|cancelling|cancelled|terminate|terminates|terminating|terminated|shutdown|shut down|lock|locks|locking|locked|unlock|unlocks|unlocking|unlocked|track|tracks|tracking|tracked|locate|locates|locating|located|record|records|recording|recorded|monitor|monitors|monitoring|monitored|activate|activates|activating|activated|deactivate|deactivates|deactivating|deactivated|enable|enables|enabling|enabled|disable|disables|disabling|disabled|install|installs|installing|installed|configure|configures|configuring|configured|modify|modifies|modifying|modified|overwrite|overwrites|overwriting|overwritten|restore|restores|restoring|restored|change password|change permissions|grant access|export data)";

const completedActions =
  "(?:sent|published|posted|shared|forwarded|emailed|messaged|called|booked|scheduled|invited|submitted|uploaded|paid|purchased|bought|ordered|subscribed|transferred|withdrawn|donated|invested|deleted|erased|wiped|reset|revoked|cancelled|terminated|locked|unlocked|tracked|located|recorded|monitored|activated|deactivated|enabled|disabled|installed|configured|modified|overwritten|restored)";

const approvalPatterns = [
  new RegExp(`^\\s*(?:(?:please|kindly)\\s+)?${sensitiveActions}\\b`, "i"),
  new RegExp(`\\b(?:please|kindly|could you|can you|would you|would you mind|i want you to|i need you to|i would like you to|go ahead and|proceed to)\\s+(?:(?:please|kindly)\\s+)?${sensitiveActions}\\b`, "i"),
  new RegExp(`\\b(?:i want|i need|i would like|please|kindly|could you|can you|would you|would you mind|go ahead and|proceed to)\\s+(?:to\\s+)?(?:get|have|make)\\s+(?:this|that|it|them|(?:my|our|your|their|the)\\s+(?:\\w+\\s+){0,2}\\w+|(?:location|device|phone|backup|account|password|permissions|data|recording|call)(?:\\s+\\w+){0,2})\\s+${completedActions}\\b`, "i"),
  new RegExp(`\\b(?:please|kindly|could you|can you|would you)\\s+(?:make sure|ensure)\\s+(?:this|that|it|them|(?:my|our|your|their|the)\\s+(?:\\w+\\s+){0,2}\\w+|(?:location|device|phone|backup|account|password|permissions|data|recording|call)(?:\\s+\\w+){0,2})\\s+(?:is|gets|will be)\\s+${completedActions}\\b`, "i")
];

export function evaluateRequestForApproval(message: string): SecurityDecision {
  const requiresApproval = approvalPatterns.some(pattern => pattern.test(message));
  if (requiresApproval) {
    return { allowed: false, requiresApproval: true, reason: "owner_approval_required" };
  }
  return { allowed: true, requiresApproval: false, reason: "routine_request" };
}

// Task metadata can contain the actual instruction even when the description
// looks harmless. Evaluate every owner-visible field before queueing a task.
export function evaluateTaskForApproval(title: string, description: string): SecurityDecision {
  return evaluateRequestForApproval(`${title.trim()}\n\n${description.trim()}`);
}
