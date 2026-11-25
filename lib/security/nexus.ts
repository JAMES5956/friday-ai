export type SecurityDecision =
  | { allowed: true; requiresApproval: false; reason: "routine_request" }
  | { allowed: false; requiresApproval: true; reason: "owner_approval_required" };

const sensitiveActions =
  "(?:send|publish|post|share|forward|email|message|call|pay|purchase|buy|subscribe|transfer|withdraw|donate|invest|delete|erase|wipe|reset|revoke|terminate|shutdown|change password|change permissions|grant access|export data)";

const approvalPatterns = [
  new RegExp(`^\\s*(?:(?:please|kindly)\\s+)?${sensitiveActions}\\b`, "i"),
  new RegExp(`\\b(?:please|kindly|could you|can you|would you|i want you to|i need you to|go ahead and|proceed to)\\s+${sensitiveActions}\\b`, "i")
];

export function evaluateRequestForApproval(message: string): SecurityDecision {
  const requiresApproval = approvalPatterns.some(pattern => pattern.test(message));
  if (requiresApproval) {
    return { allowed: false, requiresApproval: true, reason: "owner_approval_required" };
  }
  return { allowed: true, requiresApproval: false, reason: "routine_request" };
}
