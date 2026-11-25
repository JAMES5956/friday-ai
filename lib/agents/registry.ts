export const specialistAgents = [
  { id: "atlas", name: "ATLAS", role: "Strategy", status: "planned" },
  { id: "oracle", name: "ORACLE", role: "Research", status: "planned" },
  { id: "forge", name: "FORGE", role: "Engineering", status: "planned" },
  { id: "byte", name: "BYTE", role: "Technology and AI", status: "planned" },
  { id: "vantage", name: "VANTAGE", role: "Finance", status: "planned" },
  { id: "sage", name: "SAGE", role: "Legal information", status: "planned" },
  { id: "pixel", name: "PIXEL", role: "Creative", status: "planned" },
  { id: "scout", name: "SCOUT", role: "Opportunities", status: "planned" },
  { id: "nexus", name: "NEXUS", role: "Security and privacy", status: "foundation" }
] as const;

export type SpecialistAgentId = (typeof specialistAgents)[number]["id"];
