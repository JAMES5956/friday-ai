import {describe,expect,it} from "vitest";
import {resolveModelForTier,selectModelTier} from "../lib/ai/model-router";
import type {ChatMessage} from "../lib/ai/provider";
const conversation=(content:string):ChatMessage[]=>[{role:"system",content:"You are FRIDAY."},{role:"user",content}];
describe("FRIDAY model routing",()=>{
 it("routes greetings to fast",()=>expect(selectModelTier(conversation("Good morning, FRIDAY."))).toBe("fast"));
 it("routes ordinary questions to default",()=>expect(selectModelTier(conversation("Can you explain the difference between revenue and profit?"))).toBe("default"));
 it("routes analysis to reasoning",()=>expect(selectModelTier(conversation("Analyse these options, compare the trade-offs, and recommend a strategy."))).toBe("reasoning"));
 it("uses only the latest user turn",()=>expect(selectModelTier([{role:"assistant",content:"Analyse and compare."},{role:"user",content:"Thanks."}])).toBe("fast"));
 it("selects a configured specialist",()=>expect(resolveModelForTier("reasoning",{AI_MODEL:"general",AI_REASONING_MODEL:"deep"})).toEqual({model:"deep",configuredTier:"reasoning"}));
 it("falls back to general",()=>expect(resolveModelForTier("reasoning",{AI_MODEL:"general"})).toEqual({model:"general",configuredTier:"default"}));
 it("uses an available specialist as fallback",()=>expect(resolveModelForTier("default",{AI_FAST_MODEL:"fast"})).toEqual({model:"fast",configuredTier:"fast"}));
 it("fails closed without a model",()=>expect(resolveModelForTier("default",{})).toEqual({model:undefined,configuredTier:"default"}));
});
