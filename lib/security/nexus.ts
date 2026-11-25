export type SecurityDecision =
  | { allowed: true; requiresApproval: false; reason: "routine_request" }
  | { allowed: false; requiresApproval: true; reason: "owner_approval_required" };

const approvalPatterns = [
  /\b(send|publish|post|share|forward|email|message|call)\b/i,
  /\b(pay|purchase|buy|subscribe|transfer|withdraw|donate|invest)\b/i,
  /\b(delete|erase|wipe|reset|revoke|terminate|shutdown)\b/i,
  /\b(change password|change permissions|grant access|expose|export data)\b/i
];

export function evaluateRequestForApproval(message: string): SecurityDecision {
  const requiresApproval = approvalPatterns.some(pattern => pattern.test(message));
  if (requiresApproval) {
    return { allowed: false, requiresApproval: true, reason: "owner_approval_required" };
  }
  return { allowed: true, requiresApproval: false, reason: "routine_request" };
}
