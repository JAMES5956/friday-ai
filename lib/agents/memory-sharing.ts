import { specialistAgents } from "./registry";

export function canShareMemory(fromAgentId: string, toAgentId: string, sensitivity: string): boolean {
  const from = specialistAgents.find(agent => agent.id === fromAgentId);
  const to = specialistAgents.find(agent => agent.id === toAgentId);
  return Boolean(from && to && from.id !== "friday" && from.id !== "nexus" &&
    to.id !== "friday" && to.id !== "nexus" && from.id !== to.id &&
    sensitivity !== "restricted");
}

export function isUnexpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > now;
}
