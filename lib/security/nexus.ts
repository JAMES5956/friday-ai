export type SecurityDecision =
  | { allowed: true; requiresApproval: false; reason: "routine_request" }
  | { allowed: false; requiresApproval: true; reason: "owner_approval_required" };

const sensitiveActions =
  "(?:send(?:ing)?|publish(?:ing)?|post(?:ing)?|share|sharing|forward(?:ing)?|email|message|call|book|booking|schedule|scheduling|invite|inviting|submit|submitting|upload|uploading|pay(?:ing)?|purchase|buy(?:ing)?|order|ordering|subscribe|transfer|withdraw|donate|invest|delete|deleting|erase|erasing|wipe|reset|revoke|cancel|cancelling|terminate|shutdown|change password|change permissions|grant access|export data)";

const approvalPatterns = [
  new RegExp(`^\\s*(?:(?:please|kindly)\\s+)?${sensitiveActions}\\b`, "i"),
  new RegExp(`\\b(?:please|kindly|could you|can you|would you|would you mind|i want you to|i need you to|i would like you to|go ahead and|proceed to)\\s+(?:(?:please|kindly)\\s+)?${sensitiveActions}\\b`, "i")
];

export function evaluateRequestForApproval(message: string): SecurityDecision {
  const requiresApproval = approvalPatterns.some(pattern => pattern.test(message));
  if (requiresApproval) {
    return { allowed: false, requiresApproval: true, reason: "owner_approval_required" };
  }
  return { allowed: true, requiresApproval: false, reason: "routine_request" };
}
