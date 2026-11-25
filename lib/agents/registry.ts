export const specialistAgents = [
  { id: "friday", name: "FRIDAY", role: "CEO and central intelligence", status: "foundation" },
  { id: "nexus", name: "NEXUS", role: "Independent security and privacy", status: "foundation" },
  { id: "atlas", name: "ATLAS", role: "Strategy", status: "planned" },
  { id: "oracle", name: "ORACLE", role: "Research", status: "planned" },
  { id: "forge", name: "FORGE", role: "Engineering and R&D", status: "planned" },
  { id: "byte", name: "BYTE", role: "Technology and AI", status: "planned" },
  { id: "vantage", name: "VANTAGE", role: "Finance", status: "planned" },
  { id: "sage", name: "SAGE", role: "Legal information", status: "planned" },
  { id: "pixel", name: "PIXEL", role: "Creative", status: "planned" },
  { id: "scout", name: "SCOUT", role: "Opportunities", status: "planned" },
  { id: "vigor", name: "VIGOR", role: "Quality assurance", status: "planned" },
  { id: "probe", name: "PROBE", role: "Security and functional testing", status: "planned" },
  { id: "stress", name: "STRESS", role: "Performance and resilience testing", status: "planned" },
  { id: "aegis", name: "AEGIS", role: "Release safety review", status: "planned" },
  { id: "metric", name: "METRIC", role: "Quality metrics and observability", status: "planned" }
] as const;

export type SpecialistAgentId = (typeof specialistAgents)[number]["id"];
