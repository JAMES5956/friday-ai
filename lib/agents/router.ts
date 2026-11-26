import type { CoreSpecialistAgentId } from "./registry";

export type AgentRecommendation = {
  agentId: CoreSpecialistAgentId;
  name: string;
  role: string;
  confidence: "high" | "moderate";
  reason: string;
};

const ROUTES: Array<{
  agentId: CoreSpecialistAgentId;
  name: string;
  role: string;
  terms: string[];
}> = [
  {
    agentId: "oracle", name: "ORACLE", role: "research and intelligence",
    terms: ["research", "investigate", "find sources", "fact check", "market research", "analyse data", "analyze data", "summarise", "summarize", "look up", "verify sources"]
  },
  {
    agentId: "forge", name: "FORGE", role: "engineering and R&D",
    terms: ["engineering", "robotics", "hardware", "mechanical design", "electrical design", "physical prototype", "industrial design", "manufacturing process", "engineering feasibility"]
  },
  {
    agentId: "byte", name: "BYTE", role: "technology, software and programming",
    terms: ["code", "coding", "program", "debug", "bug", "build an app", "build a website", "implement", "typescript", "javascript", "python", "api", "database", "software", "web development", "mobile app", "automation", "integrate ai"]
  },
  {
    agentId: "atlas", name: "ATLAS", role: "strategy and operations",
    terms: ["strategy", "strategic plan", "strategic roadmap", "business plan", "roadmap", "business model", "growth plan", "decision framework", "long term plan", "long term strategic", "prioritise", "prioritize", "operations plan", "project milestones"]
  },
  {
    agentId: "vantage", name: "VANTAGE", role: "finance and business",
    terms: ["budget", "cash flow", "financial analysis", "investment", "forecast", "profit margin", "pricing model", "financial statement", "cost analysis", "accounting", "bookkeeping", "reconciliation", "trading", "forex", "stock market", "deriv", "risk management"]
  },
  {
    agentId: "sage", name: "SAGE", role: "education and learning",
    terms: ["mathematics", "math", "algebra", "calculus", "physics", "chemistry", "biology", "tutoring", "study plan", "exam preparation", "teach me", "explain this lesson", "academic research", "revision"]
  },
  {
    agentId: "pixel", name: "PIXEL", role: "creative production",
    terms: ["design", "logo", "brand identity", "write a story", "creative", "script", "video idea", "content calendar", "illustration", "copywriting", "presentation", "animation"]
  },
  {
    agentId: "scout", name: "SCOUT", role: "opportunities and discovery",
    terms: ["scholarship", "scholarships", "scholarship opportunities", "job opportunity", "career opportunity", "grant", "grants", "funding opportunity", "internship", "vacancy", "tender", "competition", "partnership opportunity"]
  }
];

export function recommendSpecialist(message: string): AgentRecommendation | null {
  const normalized = ` ${message.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const ranked = ROUTES
    .map(route => ({
      ...route,
      score: route.terms.reduce((score, term) => {
        const match = term.includes(" ")
          ? normalized.includes(` ${term} `)
          : normalized.includes(` ${term} `);
        return score + (match ? (term.includes(" ") ? 2 : 1) : 0);
      }, 0)
    }))
    .filter(route => route.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score < 2) return null;
  if (ranked[1] && ranked[0].score === ranked[1].score) return null;

  const winner = ranked[0];
  return {
    agentId: winner.agentId,
    name: winner.name,
    role: winner.role,
    confidence: winner.score >= 4 ? "high" : "moderate",
    reason: `Your request appears to involve ${winner.role}.`
  };
}
