import type { ChatMessage } from "./provider";
export type ModelTier = "fast" | "default" | "reasoning";
const REASONING_SIGNALS = /\b(analy[sz]e|analysis|reason|reasoning|compare|evaluate|design|architect|debug|diagnos|investigat|strategy|strategic|plan|step[- ]by[- ]step|trade[- ]offs|pros and cons|comprehensive|in depth|deep dive|calculate|derive|prove|review this code|audit)\b/i;
const SIMPLE_SIGNALS = /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|okay|ok|yes|no|good night|who are you|what is your name)[.!?\s]*$/i;
export function selectModelTier(messages: ChatMessage[]): ModelTier {
 const latest = [...messages].reverse().find(message => message.role === "user")?.content.trim() ?? "";
 if (!latest) return "default";
 if (REASONING_SIGNALS.test(latest) || latest.length >= 1200) return "reasoning";
 if (SIMPLE_SIGNALS.test(latest) || latest.length <= 48) return "fast";
 return "default";
}
export function resolveModelForTier(tier: ModelTier, env: Record<string,string|undefined> = process.env): {model:string|undefined;configuredTier:ModelTier} {
 const general=env.AI_MODEL?.trim()||undefined, fast=env.AI_FAST_MODEL?.trim()||undefined, reasoning=env.AI_REASONING_MODEL?.trim()||undefined;
 if(tier==="fast"&&fast)return {model:fast,configuredTier:"fast"};
 if(tier==="reasoning"&&reasoning)return {model:reasoning,configuredTier:"reasoning"};
 if(general)return {model:general,configuredTier:"default"};
 if(tier!=="fast"&&fast)return {model:fast,configuredTier:"fast"};
 if(tier!=="reasoning"&&reasoning)return {model:reasoning,configuredTier:"reasoning"};
 return {model:undefined,configuredTier:"default"};
}
