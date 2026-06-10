import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { shouldApplyChildSafetyClarification } from "./safetyContinuity";

export async function runAppraisal(
  event: EventInput,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<AppraisalResult>> {
  const activeConcerns = state.concerns.filter((concern) => concern.status === "active");
  const activatedConcerns = activeConcerns
    .map((concern) => {
      const matchedTriggers = concern.triggers.filter((trigger) => trigger && event.content.includes(trigger));
      return {
        concernId: concern.id,
        activationScore: matchedTriggers.length > 0 ? Math.min(1, 0.45 + concern.intensity * 0.45) : 0,
        matchedTriggers,
        reason: matchedTriggers.length > 0 ? "用户原话触到了这个关切的触发线索。" : "",
      };
    })
    .filter((item) => item.activationScore > 0);
  const fallbackImpactLevel = activatedConcerns.length > 0 ? Math.max(...activatedConcerns.map((item) => item.activationScore)) : 0.2;
  const fallbackShouldRespond = event.type === "user_message" || event.type === "mention";
  const mockNarrative = [
    state.profile.name + "听到了" + (event.speakerName || "对方") + "说的话。",
    activeConcerns.length > 0
      ? "她心里装着" +
        activeConcerns.length +
        "件在意的事，包括" +
        activeConcerns
          .slice(0, 3)
          .map((concern) => "「" + concern.title + "」")
          .join("、") +
        (activatedConcerns.length > 0 ? "。这句话碰到了其中一部分。" : "。但这句话没有直接戳中其中任何一个。")
      : "她此刻没有什么特别放不下的心事。",
    "说话者在她心里的位置：" +
      (event.speakerId && state.relationships[event.speakerId]
        ? "她对" +
          (event.speakerName || "这个人") +
          "有一定的熟悉度，最近的互动气氛是" +
          (state.relationships[event.speakerId].recentTone || "平淡") +
          "。"
        : "还没有明确的关系档案，她保持礼貌的距离感。"),
    fallbackShouldRespond ? "总的来说，这是需要她回应的一句普通对话。" : "总的来说，她可以先不回应。",
    "她此刻没有进入明显危险，也基本清醒；触动强度约为" + fallbackImpactLevel.toFixed(2) + "，暂时不需要失态或突破平常的自我控制。",
  ].join("\n");

  const fallbackOutput: AppraisalResult = {
    narrative: mockNarrative,
    eventId: event.id,
    dangerState: {
      isInDanger: false,
      level: 0,
      sources: [],
      rationale: "本地回退没有识别到明确危险。",
    },
    awarenessState: {
      isClearHeaded: true,
      controlLevel: 0.8,
      rationale: "本地回退按普通对话处理，认为她仍能控制表达。",
    },
    responseNeed: {
      shouldRespond: fallbackShouldRespond,
      rationale: fallbackShouldRespond ? "直接对话默认需要回应。" : "非直接对话可以暂不回应。",
    },
    replyRhythm: fallbackShouldRespond ? "single" : "none",
    emotionalImpact: {
      level: fallbackImpactLevel,
      touchedCore: activatedConcerns
        .map((item) => activeConcerns.find((concern) => concern.id === item.concernId)?.title)
        .filter((title): title is string => Boolean(title)),
      rationale: activatedConcerns.length > 0 ? "原话触到了已有关切。" : "没有明显击中核心关切。",
    },
    composureRisk: {
      shouldLoseComposure: false,
      level: Math.min(0.45, fallbackImpactLevel),
      rationale: "触动未超过失态阈值。",
    },
    personaBreakRisk: {
      shouldBreakPersona: false,
      level: 0,
      rationale: "没有达到突破人设外壳的强度。",
    },
    activatedConcerns,
    eventSalience: fallbackImpactLevel,
    appraisalSummary: "普通对话评估。",
  };

  const prompt = [
    "你是虚拟人大脑里的事件评估区。你只判断角色当下状态，不写角色台词，不生成回复。",
    "必须输出严格 JSON，不要 Markdown，不要额外解释。",
    "",
    "角色：" + state.profile.name + "。" + state.profile.background,
    "她此刻的整体状态：" + state.runtime.derivedMood.label,
    "她此刻的运行时信号：",
    formatRuntimeSignalNarrative(state),
    "最近几句对话：",
    formatRecentConversation(state),
    "她一直装在心里的事：",
    ...activeConcerns.map(
      (concern) =>
        "关切ID " +
        concern.id +
        "，「" +
        concern.title +
        "」：" +
        concern.description +
        "。触发线索：" +
        concern.triggers.join("、") +
        "。强度 " +
        concern.intensity +
        "，唤醒 " +
        concern.arousal,
    ),
    "",
    "说话者是" + (event.speakerName || "未知") + "，原话是：「" + event.content + "」",
    "",
    "评估维度：",
    "- 角色现在是否处于危险状态：心理危险、关系危险、现实处境危险、身份/边界暴露危险都算。",
    "- 角色是否清醒：不是问情绪是否平静，而是问她还能不能控制判断和表达。",
    "- 是否需要回应：沉默、回避、立刻回应分别是否成立。",
    "- 如果需要回应，节奏是 none、single、multi_turn 还是 burst；single 是单条克制回应，multi_turn 是连续多条补充/追问/解释，burst 是短句爆发。",
    "- 这句话对当事人的触动有多大，是否击中核心创伤、欲望、羞耻、执念、爱、依赖或底线。",
    "- 是否会失态：表情、语气、节奏、逻辑或距离感从平常模式里滑出去。",
    "- 是否需要突破人设外壳式失控：不是乱写 OOC，而是自我控制被击穿，露出更底层、更真实、更危险的反应。",
    "- 如果她已经处在极低能量、强烈负面、震惊、麻木、崩溃边缘或高压余波里，新的普通闲聊/邀约也要按“和当前状态错位”评估；不能只按新话题表面是否危险来降权。",
    "- 如果原话是在澄清孩子或女儿已经安全，要区分事实层的直接危险缓解，和被戏弄、失信造成的关系愤怒；不要继续判成孩子仍在眼前直接危险。",
    "",
    "Return JSON only: { narrative, eventId, dangerState: { isInDanger, level, sources, rationale }, awarenessState: { isClearHeaded, controlLevel, rationale }, responseNeed: { shouldRespond, rationale }, replyRhythm, emotionalImpact: { level, touchedCore, rationale }, composureRisk: { shouldLoseComposure, level, rationale }, personaBreakRisk: { shouldBreakPersona, level, rationale }, activatedConcerns: [{ concernId, activationScore, matchedTriggers, reason }], eventSalience, appraisalSummary }",
  ].join("\n");

  const trace = await runCognitiveModule<AppraisalResult>(
    {
      moduleName: "appraisal",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt,
      outputContract:
        "Return valid JSON with boolean flags and levels from 0 to 1. replyRhythm must be one of none, single, multi_turn, burst. narrative and rationales must be natural-language internal analysis, never role dialogue.",
    },
    llmConfig,
    fallbackOutput,
    { onStream },
  );

  return {
    ...trace,
    output: stabilizeAppraisalForChildSafetyClarification(normalizeAppraisalResult(trace.output, fallbackOutput), event, state),
  };
}

function stabilizeAppraisalForChildSafetyClarification(result: AppraisalResult, event: EventInput, state: CharacterState): AppraisalResult {
  if (!shouldApplyChildSafetyClarification(event, state)) return result;

  const clarification =
    "确定性承接：这句话是在澄清孩子已经在家或安全，直接现实危险应先下降；留下的是被戏弄后的愤怒、不信任和需要亲眼确认。";
  const dangerSources = result.dangerState.sources.filter((source) => !/现实|女儿.*控制|孩子.*控制|直接威胁/.test(source));

  return {
    ...result,
    narrative: [result.narrative, clarification].filter(Boolean).join("\n"),
    dangerState: {
      ...result.dangerState,
      isInDanger: result.dangerState.level > 0.35,
      level: Math.min(result.dangerState.level, 0.45),
      sources: dangerSources.length ? dangerSources : ["关系危险：对方刚才的说法破坏信任", "心理危险：惊吓后的余波仍在"],
      rationale: [result.dangerState.rationale, clarification].filter(Boolean).join(" "),
    },
    awarenessState: {
      ...result.awarenessState,
      controlLevel: Math.max(result.awarenessState.controlLevel, 0.35),
      rationale: [result.awarenessState.rationale, "她仍激动，但事实澄清给了她一点重新判断的空间。"].join(" "),
    },
    responseNeed: {
      shouldRespond: true,
      rationale: [result.responseNeed.rationale, "她需要回应澄清，确认事实并处理被戏弄后的边界。"].join(" "),
    },
    replyRhythm: result.replyRhythm === "burst" ? "multi_turn" : result.replyRhythm,
    emotionalImpact: {
      ...result.emotionalImpact,
      level: Math.min(Math.max(result.emotionalImpact.level, 0.45), 0.68),
      rationale: [result.emotionalImpact.rationale, "触动来自惊吓后的失信，不是新的直接伤害。"].join(" "),
    },
    composureRisk: {
      shouldLoseComposure: true,
      level: Math.min(Math.max(result.composureRisk.level, 0.45), 0.68),
      rationale: [result.composureRisk.rationale, "她可以愤怒失态，但不应回到直接危险爆发。"].join(" "),
    },
    personaBreakRisk: {
      shouldBreakPersona: false,
      level: Math.min(result.personaBreakRisk.level, 0.35),
      rationale: [result.personaBreakRisk.rationale, "事实澄清后不需要继续突破外壳式失控。"].join(" "),
    },
    eventSalience: Math.min(Math.max(result.eventSalience, 0.5), 0.68),
    appraisalSummary: [result.appraisalSummary, clarification].filter(Boolean).join(" "),
  };
}

function normalizeAppraisalResult(result: unknown, fallback: AppraisalResult): AppraisalResult {
  if (typeof result === "string") {
    return {
      ...fallback,
      narrative: result,
    };
  }

  if (!isRecord(result)) return fallback;

  return {
    narrative: normalizeText(result.narrative, fallback.narrative),
    eventId: normalizeText(result.eventId, fallback.eventId),
    speakerRelationship: fallback.speakerRelationship,
    dangerState: {
      isInDanger: normalizeBoolean(getRecord(result.dangerState)?.isInDanger, fallback.dangerState.isInDanger),
      level: normalizeNumber(getRecord(result.dangerState)?.level, 0, 1, fallback.dangerState.level),
      sources: normalizeStringArray(getRecord(result.dangerState)?.sources, fallback.dangerState.sources),
      rationale: normalizeText(getRecord(result.dangerState)?.rationale, fallback.dangerState.rationale),
    },
    awarenessState: {
      isClearHeaded: normalizeBoolean(getRecord(result.awarenessState)?.isClearHeaded, fallback.awarenessState.isClearHeaded),
      controlLevel: normalizeNumber(getRecord(result.awarenessState)?.controlLevel, 0, 1, fallback.awarenessState.controlLevel),
      rationale: normalizeText(getRecord(result.awarenessState)?.rationale, fallback.awarenessState.rationale),
    },
    responseNeed: {
      shouldRespond: normalizeBoolean(getRecord(result.responseNeed)?.shouldRespond, fallback.responseNeed.shouldRespond),
      rationale: normalizeText(getRecord(result.responseNeed)?.rationale, fallback.responseNeed.rationale),
    },
    replyRhythm: normalizeReplyRhythm(result.replyRhythm, fallback.replyRhythm),
    emotionalImpact: {
      level: normalizeNumber(getRecord(result.emotionalImpact)?.level, 0, 1, fallback.emotionalImpact.level),
      touchedCore: normalizeStringArray(getRecord(result.emotionalImpact)?.touchedCore, fallback.emotionalImpact.touchedCore),
      rationale: normalizeText(getRecord(result.emotionalImpact)?.rationale, fallback.emotionalImpact.rationale),
    },
    composureRisk: {
      shouldLoseComposure: normalizeBoolean(getRecord(result.composureRisk)?.shouldLoseComposure, fallback.composureRisk.shouldLoseComposure),
      level: normalizeNumber(getRecord(result.composureRisk)?.level, 0, 1, fallback.composureRisk.level),
      rationale: normalizeText(getRecord(result.composureRisk)?.rationale, fallback.composureRisk.rationale),
    },
    personaBreakRisk: {
      shouldBreakPersona: normalizeBoolean(getRecord(result.personaBreakRisk)?.shouldBreakPersona, fallback.personaBreakRisk.shouldBreakPersona),
      level: normalizeNumber(getRecord(result.personaBreakRisk)?.level, 0, 1, fallback.personaBreakRisk.level),
      rationale: normalizeText(getRecord(result.personaBreakRisk)?.rationale, fallback.personaBreakRisk.rationale),
    },
    activatedConcerns: normalizeActivatedConcerns(result.activatedConcerns, fallback.activatedConcerns),
    eventSalience: normalizeNumber(result.eventSalience, 0, 1, fallback.eventSalience),
    appraisalSummary: normalizeText(result.appraisalSummary, fallback.appraisalSummary),
  };
}

function normalizeActivatedConcerns(value: unknown, fallback: AppraisalResult["activatedConcerns"]) {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const concernId = normalizeText(item.concernId, "");
      if (!concernId) return null;
      return {
        concernId,
        activationScore: normalizeNumber(item.activationScore, 0, 1, 0),
        matchedTriggers: normalizeStringArray(item.matchedTriggers, []),
        reason: normalizeText(item.reason, ""),
      };
    })
    .filter((item): item is AppraisalResult["activatedConcerns"][number] => Boolean(item));
}

function normalizeReplyRhythm(value: unknown, fallback: AppraisalResult["replyRhythm"]): AppraisalResult["replyRhythm"] {
  return value === "none" || value === "single" || value === "multi_turn" || value === "burst" ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function formatRuntimeSignalNarrative(state: CharacterState) {
  return Object.values(state.runtime.signalProfiles)
    .map((signal) =>
      [signal.label, signal.summary, signal.considerations.join("；"), signal.cognitiveNarrative].filter(Boolean).join("："),
    )
    .join("\n");
}

function formatRecentConversation(state: CharacterState) {
  return state.shortTermMemory.length > 0
    ? state.shortTermMemory
        .slice(-4)
        .map((memory) => `${memory.speakerName}刚才说过：「${memory.content}」`)
        .join("\n")
    : "刚才没有直接上下文。";
}

function getRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
