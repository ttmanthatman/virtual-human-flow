import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig, ResponseDecision } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { formatRecentDialogueForPrompt, formatRecentSituationSummaryForPrompt } from "./conversationContext";

export async function decideResponse(
  event: EventInput,
  appraisal: AppraisalResult,
  memoryRecallNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<ResponseDecision>> {
  const appraisalNarrative = appraisal.narrative || appraisal.appraisalSummary;
  const fallbackNarrative = [
    "她会把当前这句话放进刚才的关系、场景和自身状态里理解。",
    "如果对方正在推进边界、重复某个话题或让她为难，她不会机械复用上一句，而会承接关系已经发生的变化。",
    "本地回退只保留自然语言判断，不替 LLM 做关键词路由。",
  ].join("\n");

  const prompt = [
    "你是虚拟人大脑里的回应决策区。你只决定这一轮该如何开口、是否沉默、是否追问或是否失态，不写具体台词。",
    "请只用自然语言输出，不要 JSON，不要字段名，不要枚举，不要用代码式路由。",
    "不要用关键词触发。请综合她是谁、当前场景、最近对话、关系记忆、状态余波、事件评估和记忆召回来判断。",
    "",
    "当前用户原话：",
    event.content,
    "",
    "事件评估：",
    appraisalNarrative,
    "",
    "记忆浮现：",
    memoryRecallNarrative || "没有特别强的记忆浮上来。",
    "",
    "最近几句对话：",
    formatRecentDialogueForPrompt(state, event),
    "",
    "过去6小时关系、状态和场景摘要：",
    formatRecentSituationSummaryForPrompt(state, event),
    "",
    "她此刻的自然语言状态：",
    formatRuntimeSignalNarrative(state),
    "",
    "请判断：她是否应该回应；如果回应，是一句短答、连续补充、追问、转移、沉默，还是情绪压不住；如果最近已经有过同一边界或同一关系推进，请说明这一次相对上一轮发生了什么递进。",
    "只写判断和理由，不写角色台词。",
  ].join("\n");

  const trace = await runCognitiveModule<string>(
    {
      moduleName: "response_decision",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt,
      outputContract: "自然语言回应决策，不使用 JSON、字段名、枚举或代码式路由。",
    },
    llmConfig,
    fallbackNarrative,
    { onStream },
  );

  return {
    ...trace,
    output: decisionFromNarrative(trace.output),
  };
}

function decisionFromNarrative(narrative: string): ResponseDecision {
  const text = typeof narrative === "string" && narrative.trim() ? narrative.trim() : "她需要根据当前关系和场景自然回应。";
  return {
    narrative: text,
    shouldRespond: true,
    responseMode: "neutral_reply",
    replyRhythm: "single",
    shouldLoseComposure: false,
    shouldBreakPersona: false,
    delaySeconds: 0,
    rationale: text,
  };
}

function formatRuntimeSignalNarrative(state: CharacterState) {
  return Object.values(state.runtime.signalProfiles)
    .map((signal) =>
      [signal.label, signal.summary, signal.considerations.join("；"), signal.cognitiveNarrative].filter(Boolean).join("："),
    )
    .join("\n");
}
