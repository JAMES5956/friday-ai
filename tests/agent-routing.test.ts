import {describe,expect,it} from "vitest";
import {recommendSpecialist} from "../lib/agents/router";
describe("FRIDAY specialist recommendations",()=>{
it("routes software implementation to FORGE",()=>expect(recommendSpecialist("Help me debug this TypeScript API")).toMatchObject({agentId:"forge"}));
it("routes scholarship searches to SCOUT",()=>expect(recommendSpecialist("Find scholarship opportunities and grants")).toMatchObject({agentId:"scout"}));
it("routes financial analysis to VANTAGE",()=>expect(recommendSpecialist("Prepare a cash flow forecast and budget")).toMatchObject({agentId:"vantage"}));
it("routes research to ORACLE",()=>expect(recommendSpecialist("Research this topic and find sources")).toMatchObject({agentId:"oracle"}));
it("routes creative scripts to PIXEL",()=>expect(recommendSpecialist("Write a creative video script")).toMatchObject({agentId:"pixel"}));
it("does not guess on vague requests",()=>{expect(recommendSpecialist("Hello Friday")).toBeNull();expect(recommendSpecialist("What do you think?")).toBeNull();});
it("returns no recommendation on a tie",()=>expect(recommendSpecialist("Create a business plan and financial analysis")).toBeNull());
});