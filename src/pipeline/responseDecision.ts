import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig, ReplyRhythm, ResponseDecision, ResponseMode } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { isChildSafetyClarification, isCasualSocialDiscontinuity, shouldAvoidChildSafetyDangerLoop } from "./safetyContinuity";

export async function decideResponse(
  event: EventInput,
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

  return runDecisionModule(event, appraisal, memoryRecallNarrative, state, llmConfig, mockOutput, onStream);
}

function runDecisionModule(
  event: EventInput,
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
    "当前用户原话：" + event.content,
    "她此刻的整体状态：" + state.runtime.derivedMood.label,
    "她此刻的运行时信号：",
    formatRuntimeSignalNarrative(state),
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
    "- 如果她上一刻已经处在强烈负面、低能量、震惊、麻木或崩溃边缘，普通邀约、周末计划、工作安排也可能因为时机错位而让她失态、沉默或碎裂回应；不能只用“邀约本身无威胁”来维持礼貌工作状态。",
    "- 如果刚刚原话是在澄清女儿或孩子安全，或者最近已经有过安全澄清，保留不信任和愤怒，但事实层不再是孩子仍在眼前直接危险；回复路由不要回到旧的直接危险爆发。",
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
  ).then((trace) => {
    const normalized = normalizeResponseDecision(trace.output, mockOutput);
    return {
      ...trace,
      output: stabilizeDecisionForCurrentState(normalized, event, appraisal, state, memoryRecallNarrative),
    };
  });
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

function stabilizeDecisionForCurrentState(
  decision: ResponseDecision,
  event: EventInput,
  appraisal: AppraisalResult,
  state: CharacterState,
  memoryRecallNarrative: string,
): ResponseDecision {
  if (shouldAvoidChildSafetyDangerLoop(event, state)) return stabilizeDecisionForChildSafetyContinuity(decision, event);
  if (!isSevereRuntimeState(state) || !isCasualDiscontinuity(event.content)) return decision;
  if (!hasRecentSevereAftermathEvidence(state, event, memoryRecallNarrative)) return decision;
  if (!decision.shouldRespond || decision.responseMode === "silence") return decision;
  if (decision.shouldLoseComposure || decision.shouldBreakPersona || decision.replyRhythm === "burst") return decision;

  const appraisalImpact = Math.max(appraisal.emotionalImpact.level, appraisal.composureRisk.level, appraisal.personaBreakRisk.level, appraisal.dangerState.level);
  const isSurfaceLowImpact = appraisalImpact <= 0.45;
  if (!isSurfaceLowImpact) return decision;

  const rationale =
    "确定性承接：近期重大事件仍在同一关系里留下强烈余波，普通邀约与当下状态严重错位，不能继续按礼貌工作状态处理。";

  return {
    ...decision,
    shouldRespond: true,
    responseMode: "emotional_outburst",
    replyRhythm: state.runtime.energy <= 0.15 || state.runtime.derivedMood.valence <= -0.8 ? "burst" : "multi_turn",
    shouldLoseComposure: true,
    shouldBreakPersona: state.runtime.energy <= 0.15 || state.runtime.derivedMood.valence <= -0.85,
    delaySeconds: 0,
    narrative: [decision.narrative, rationale].filter(Boolean).join("\n"),
    rationale: [decision.rationale, rationale].filter(Boolean).join("\n"),
  };
}

function stabilizeDecisionForChildSafetyContinuity(decision: ResponseDecision, event: EventInput): ResponseDecision {
  const isClarification = isChildSafetyClarification(event.content);
  const rationale = isClarification
    ? "确定性承接：对方正在澄清孩子安全，事实层不再按眼前直接危险处理；她仍会愤怒、追问、要求确认，但不继续走旧的爆发式寻找路线。"
    : "确定性承接：最近已经有过孩子安全澄清，新的普通话题会刺痛她的信任和边界，但不应把她拉回孩子仍在眼前直接危险的旧循环。";

  return {
    ...decision,
    shouldRespond: true,
    responseMode: isClarification ? "question_back" : isCasualSocialDiscontinuity(event.content) ? "short_avoidance" : decision.responseMode,
    replyRhythm: isClarification ? "multi_turn" : "single",
    shouldLoseComposure: true,
    shouldBreakPersona: false,
    delaySeconds: 0,
    narrative: [decision.narrative, rationale].filter(Boolean).join("\n"),
    rationale: [decision.rationale, rationale].filter(Boolean).join("\n"),
  };
}

function isSevereRuntimeState(state: CharacterState) {
  const labels = [
    state.runtime.derivedMood.label,
    ...Object.values(state.runtime.signalProfiles).flatMap((profile) => [profile.label, profile.summary, profile.cognitiveNarrative]),
  ].join(" ");
  return (
    state.runtime.energy <= 0.25 ||
    state.runtime.derivedMood.valence <= -0.65 ||
    /极低|耗竭|强烈负面|极度负面|痛苦|震惊|崩溃|麻木|绝望|天塌|无法集中|警报/.test(labels)
  );
}

const severeAftermathWindowMs = 24 * 60 * 60 * 1000;
const severeAftermathTerms =
  /被辞退|绑架|撕票|遇害|死亡|去世|死了|威胁|危险|羞辱|背叛|伤害|崩溃|天塌|失控|家人.*(遇害|绑架|危险|死亡)|女儿.*(失踪|不见|被控制|危险)|孩子.*(失踪|不见|被控制|危险)/;

function hasRecentSevereAftermathEvidence(
  state: CharacterState,
  event: EventInput,
  memoryRecallNarrative: string,
) {
  const eventTime = Date.parse(event.timestamp);
  const personaId = state.profile.id;
  const recentShortTermTexts = state.shortTermMemory
    .filter((memory) => {
      const sameDialogue = memory.speakerId === personaId || (event.speakerId ? memory.speakerId === event.speakerId : false);
      if (!sameDialogue) return false;
      if (!Number.isFinite(eventTime)) return true;
      const memoryTime = Date.parse(memory.timestamp);
      return Number.isFinite(memoryTime) && eventTime - memoryTime >= 0 && eventTime - memoryTime <= severeAftermathWindowMs;
    })
    .map((memory) => memory.content);

  const relationshipTexts = (state.relationshipMemory ?? [])
    .filter((memory) => !event.speakerId || memory.targetUserId === event.speakerId)
    .filter((memory) => {
      if (!Number.isFinite(eventTime)) return true;
      const updatedAt = Date.parse(memory.updatedAt);
      return Number.isFinite(updatedAt) && eventTime - updatedAt >= 0 && eventTime - updatedAt <= severeAftermathWindowMs;
    })
    .flatMap((memory) => [
      memory.impressionSummary,
      memory.relationshipSummary,
      memory.lastInteractionSummary,
      ...memory.evidence,
      ...memory.history.map((item) => item.summary),
    ]);

  const longTermTexts = state.longTermMemory
    .filter((memory) => memory.importance >= 0.75 || memory.emotionalIntensity >= 0.7)
    .filter((memory) => {
      if (!Number.isFinite(eventTime)) return true;
      const createdAt = Date.parse(memory.createdAt);
      return Number.isFinite(createdAt) && eventTime - createdAt >= 0 && eventTime - createdAt <= severeAftermathWindowMs;
    })
    .map((memory) => memory.summary);

  return severeAftermathTerms.test([memoryRecallNarrative, ...recentShortTermTexts, ...relationshipTexts, ...longTermTexts].join(" "));
}

function isCasualDiscontinuity(content: string) {
  return /周末|爬山|约|一起|出去|玩|吃饭|喝|电影|逛|聚|安排|上班|工作|单|项目/.test(content);
}

function formatRuntimeSignalNarrative(state: CharacterState) {
  return Object.values(state.runtime.signalProfiles)
    .map((signal) =>
      [signal.label, signal.summary, signal.considerations.join("；"), signal.cognitiveNarrative].filter(Boolean).join("："),
    )
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
