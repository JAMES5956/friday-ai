import type { SpecialistAgentId } from "./registry";
export type AgentRecommendation = { agentId: SpecialistAgentId; name: string; role: string; confidence: "high" | "moderate"; reason: string };
const ROUTES: Array<{agentId: SpecialistAgentId;name:string;role:string;terms:string[]}> = [
{agentId:"oracle",name:"ORACLE",role:"Research",terms:["research","investigate","find sources","fact check","market research","analyse data","analyze data","summarise","summarize","look up"]},
{agentId:"forge",name:"FORGE",role:"Engineering and R&D",terms:["code","coding","program","debug","bug","build an app","build a website","implement","typescript","javascript","python","api","database","software"]},
{agentId:"atlas",name:"ATLAS",role:"Strategy",terms:["strategy","strategic plan","business plan","roadmap","business model","growth plan","decision framework","long term plan","prioritise","prioritize"]},
{agentId:"byte",name:"BYTE",role:"Technology and AI",terms:["artificial intelligence"," ai ","machine learning","llm","model architecture","automation","technical architecture","technology stack","integrate ai"]},
{agentId:"vantage",name:"VANTAGE",role:"Finance",terms:["budget","cash flow","financial analysis","investment","forecast","profit margin","pricing model","financial statement","cost analysis","accounting"]},
{agentId:"sage",name:"SAGE",role:"Legal information",terms:["legal","law","legislation","regulation","contract","compliance","licence","license","intellectual property","terms and conditions"]},
{agentId:"pixel",name:"PIXEL",role:"Creative",terms:["design","logo","brand identity","write a story","creative","script","video idea","content calendar","illustration","copywriting","presentation"]},
{agentId:"scout",name:"SCOUT",role:"Opportunities",terms:["scholarship","job opportunity","career opportunity","grant","funding opportunity","internship","vacancy","tender","competitions"]},
{agentId:"vigor",name:"VIGOR",role:"Quality assurance",terms:["quality assurance","qa review","review quality","test plan","acceptance criteria","check quality","quality audit"]},
{agentId:"probe",name:"PROBE",role:"Security and functional testing",terms:["penetration test","security test","vulnerability scan","security audit","functional test","threat model"]},
{agentId:"stress",name:"STRESS",role:"Performance and resilience testing",terms:["load test","stress test","performance test","benchmark","scalability test","resilience test"]},
{agentId:"aegis",name:"AEGIS",role:"Release safety review",terms:["release review","release readiness","pre-release","go live review","release safety"]},
{agentId:"metric",name:"METRIC",role:"Quality metrics and observability",terms:["analytics dashboard","quality metrics","observability","monitoring metrics","kpi dashboard","error tracking"]}
];
export function recommendSpecialist(message:string):AgentRecommendation|null {
const normalized=` ${message.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu," ").trim()} `;
const ranked=ROUTES.map(route=>({...route,score:route.terms.reduce((score,term)=>score+(normalized.includes(term)?(term.trim().includes(" ")?2:1):0),0)})).filter(route=>route.score>0).sort((a,b)=>b.score-a.score);
if(!ranked.length||ranked[0].score<2)return null;
if(ranked[1]&&ranked[0].score===ranked[1].score)return null;
const winner=ranked[0];return {agentId:winner.agentId,name:winner.name,role:winner.role,confidence:winner.score>=4?"high":"moderate",reason:`Your request appears to involve ${winner.role.toLowerCase()}.`};
}