import { AppraisalResult, CharacterState, CognitiveModuleTrace, LlmConfig, ReplyRhythm, ResponseDecision, ResponseMode } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function decideResponse(
  appraisal: AppraisalResult,
  memoryRecallNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<ResponseDecision>> {
  const fallbackMode = chooseFallbackResponseMode(appraisal);
  const mockOutput: ResponseDecision = {
    shouldRespond: appraisal.responseNeed.shouldRespond,
    responseMode: fallbackMode,
    replyRhythm: appraisal.responseNeed.shouldRespond ? appraisal.replyRhythm : "none",
    shouldLoseComposure: appraisal.composureRisk.shouldLoseComposure,
    shouldBreakPersona: appraisal.personaBreakRisk.shouldBreakPersona,
    delaySeconds: appraisal.awarenessState.controlLevel < 0.35 ? 0 : 2,
    rationale: appraisal.responseNeed.shouldRespond
      ? "当前是直接对话场景，按评估结果选择自然回应节奏。"
      : "评估认为她可以先不回应。",
  };

  return runDecisionModule(appraisal, memoryRecallNarrative, state, llmConfig, mockOutput, onStream);
}

function runDecisionModule(
  appraisal: AppraisalResult,
  memoryRecallNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  mockOutput: ResponseDecision,
  onStream?: (output: string) => void,
) {
  const appraisalNarrative = appraisal.narrative || appraisal.appraisalSummary;
  const prompt = [
    "你是虚拟人大脑里的行为决策区。你只决定回复路由，不写角色台词。",
    "必须输出严格 JSON，不要 Markdown，不要额外解释。",
    "",
    "她此刻的整体状态：" + state.runtime.derivedMood.label,
    "",
    "事件评估：",
    appraisalNarrative,
    "危险状态：" + formatBoolean(appraisal.dangerState.isInDanger) + "，强度 " + appraisal.dangerState.level + "。" + appraisal.dangerState.rationale,
    "清醒程度：" + formatBoolean(appraisal.awarenessState.isClearHeaded) + "，控制力 " + appraisal.awarenessState.controlLevel + "。" + appraisal.awarenessState.rationale,
    "是否需要回应：" + formatBoolean(appraisal.responseNeed.shouldRespond) + "。" + appraisal.responseNeed.rationale,
    "建议节奏：" + appraisal.replyRhythm,
    "触动强度：" + appraisal.emotionalImpact.level + "。" + appraisal.emotionalImpact.rationale,
    "失态风险：" + formatBoolean(appraisal.composureRisk.shouldLoseComposure) + "，强度 " + appraisal.composureRisk.level + "。" + appraisal.composureRisk.rationale,
    "突破人设外壳风险：" + formatBoolean(appraisal.personaBreakRisk.shouldBreakPersona) + "，强度 " + appraisal.personaBreakRisk.level + "。" + appraisal.personaBreakRisk.rationale,
    "",
    "记忆浮现：",
    memoryRecallNarrative || "没有特别强的记忆浮上来。",
    "",
    "请决定这一轮回复路由：",
    "- shouldRespond：是否开口。",
    "- responseMode：warm_reply、neutral_reply、short_avoidance、topic_shift、question_back、silence、delayed_reply、emotional_outburst 之一。",
    "- replyRhythm：none、single、multi_turn、burst 之一。multi_turn 表示她可能连续发多条，burst 表示短句爆发。",
    "- shouldLoseComposure：是否失态。",
    "- shouldBreakPersona：是否突破平常人设外壳进行失控式回应。只有评估强度足够时才为 true。",
    "- narrative/rationale 用自然语言解释为什么这样路由，但不要写具体台词。",
    "",
    "Return JSON only: { shouldRespond, responseMode, replyRhythm, shouldLoseComposure, shouldBreakPersona, delaySeconds, narrative, rationale }",
  ].join("\n");

  return runCognitiveModule<ResponseDecision>(
    {
      moduleName: "response_decision",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt,
      outputContract:
        "Return valid JSON. responseMode must be one known ResponseMode. replyRhythm must be none, single, multi_turn, or burst. Do not include role dialogue.",
    },
    llmConfig,
    mockOutput,
    { onStream },
  ).then((trace) => ({
    ...trace,
    output: normalizeResponseDecision(trace.output, mockOutput),
  }));
}

function normalizeResponseDecision(result: unknown, fallback: ResponseDecision): ResponseDecision {
  if (typeof result === "string") {
    const [firstLine = "", ...narrativeLines] = result.split(/\r?\n/);
    const firstLineText = firstLine.trim();
    const narrative = narrativeLines.join("\n").trim();
    const shouldRespond = firstLineText.startsWith("否") ? false : true;

    return {
      ...fallback,
      shouldRespond,
      replyRhythm: shouldRespond ? fallback.replyRhythm : "none",
      narrative,
      rationale: narrative || fallback.rationale,
    };
  }

  if (!isRecord(result)) return fallback;

  return {
    shouldRespond: typeof result.shouldRespond === "boolean" ? result.shouldRespond : fallback.shouldRespond,
    responseMode: normalizeResponseMode(result.responseMode, fallback.responseMode),
    replyRhythm: normalizeReplyRhythm(result.replyRhythm, fallback.replyRhythm),
    shouldLoseComposure: typeof result.shouldLoseComposure === "boolean" ? result.shouldLoseComposure : fallback.shouldLoseComposure,
    shouldBreakPersona: typeof result.shouldBreakPersona === "boolean" ? result.shouldBreakPersona : fallback.shouldBreakPersona,
    delaySeconds: typeof result.delaySeconds === "number" ? result.delaySeconds : fallback.delaySeconds,
    narrative: typeof result.narrative === "string" ? result.narrative : fallback.narrative,
    rationale: typeof result.rationale === "string" && result.rationale.trim() ? result.rationale : fallback.rationale,
  };
}

function chooseFallbackResponseMode(appraisal: AppraisalResult): ResponseMode {
  if (!appraisal.responseNeed.shouldRespond) return "silence";
  if (appraisal.personaBreakRisk.shouldBreakPersona || appraisal.composureRisk.shouldLoseComposure || appraisal.replyRhythm === "burst") {
    return "emotional_outburst";
  }
  if (appraisal.dangerState.isInDanger) return "short_avoidance";
  if (appraisal.emotionalImpact.level > 0.7) return "question_back";
  return "neutral_reply";
}

function normalizeResponseMode(value: unknown, fallback: ResponseMode): ResponseMode {
  return value === "warm_reply" ||
    value === "neutral_reply" ||
    value === "short_avoidance" ||
    value === "topic_shift" ||
    value === "question_back" ||
    value === "silence" ||
    value === "delayed_reply" ||
    value === "emotional_outburst"
    ? value
    : fallback;
}

function normalizeReplyRhythm(value: unknown, fallback: ReplyRhythm): ReplyRhythm {
  return value === "none" || value === "single" || value === "multi_turn" || value === "burst" ? value : fallback;
}

function formatBoolean(value: boolean) {
  return value ? "是" : "否";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
