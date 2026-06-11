import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
  EventInput,
  LlmConfig,
  MemoryRecallResult,
  ResponseDecision,
  RoleTurnProbeResult,
  RoleTurnResult,
} from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import {
  formatDialogueMemoryForPrompt,
  formatRecentDialogueForPrompt,
  formatRecentSituationSummaryForPrompt,
  selectRecentDialogueMemories,
  stripReplyStageDirections,
} from "./conversationContext";
import { splitReplyIntoSegments } from "./llmClient";
import { createLongTermCandidates, formatLongTermCandidates } from "./memoryRetrieval";

export async function runRoleTurn(
  event: EventInput,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<RoleTurnResult>> {
  const fallback = buildFallbackRoleTurn(event, state);
  const prompt = buildRoleTurnPrompt(event, state);
  const trace = await runCognitiveModule<string>(
    {
      moduleName: "role_turn",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt,
      outputContract: "自然语言角色主脑回合：心理状态、记忆浮现、开口倾向、说出口。不是 JSON，不是字段表。",
    },
    llmConfig,
    serializeRoleTurnFallback(fallback),
    { onStream },
  );

  return {
    ...trace,
    output: parseRoleTurnNarrative(trace.output, fallback),
  };
}

export async function runRoleTurnProbe(
  event: EventInput,
  state: CharacterState,
  roleTurn: CognitiveModuleTrace<RoleTurnResult>,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<RoleTurnProbeResult>> {
  const fallback = buildFallbackRoleTurnProbe(event, state, roleTurn);
  const prompt = buildRoleTurnProbePrompt(event, state, roleTurn);
  const trace = await runCognitiveModule<string>(
    {
      moduleName: "role_turn_probe",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt,
      outputContract: "自然语言审计探针：决策路径、关键心理证据、标签锁定风险、上下文噪声、建议裁剪。只观察，不改写台词或状态。",
    },
    llmConfig,
    serializeRoleTurnProbeFallback(fallback),
    { onStream },
  );

  return {
    ...trace,
    output: parseRoleTurnProbeNarrative(trace.output, fallback),
  };
}

export function buildAppraisalTraceFromRoleTurn(
  event: EventInput,
  state: CharacterState,
  roleTurn: CognitiveModuleTrace<RoleTurnResult>,
): CognitiveModuleTrace<AppraisalResult> {
  const narrative = roleTurn.output.innerStateNarrative;
  const impact = estimateCompatibilityImpact(state, roleTurn.output);
  const shouldRespond = Boolean(roleTurn.output.replyOutput.reply.trim());
  return {
    moduleName: "appraisal",
    request: derivedRequest("appraisal", roleTurn, "由人物主脑的心理状态段落派生为评估视图，供 UI、审计和状态写回兼容使用。"),
    output: {
      narrative,
      eventId: event.id,
      dangerState: {
        isInDanger: impact >= 0.75,
        level: impact >= 0.75 ? impact : 0,
        sources: impact >= 0.75 ? ["role_turn_inner_state"] : [],
        rationale: narrative,
      },
      awarenessState: {
        isClearHeaded: impact < 0.82,
        controlLevel: roundCompatibility(1 - impact * 0.72),
        rationale: narrative,
      },
      responseNeed: {
        shouldRespond,
        rationale: shouldRespond ? roleTurn.output.decisionNarrative : "人物主脑判断这一轮更接近沉默或收住。",
      },
      replyRhythm: inferReplyRhythm(roleTurn.output),
      emotionalImpact: {
        level: impact,
        touchedCore: [],
        rationale: narrative,
      },
      composureRisk: {
        shouldLoseComposure: impact >= 0.72 || inferReplyRhythm(roleTurn.output) === "burst",
        level: impact,
        rationale: roleTurn.output.decisionNarrative,
      },
      personaBreakRisk: {
        shouldBreakPersona: impact >= 0.86,
        level: impact >= 0.86 ? impact : 0,
        rationale: roleTurn.output.decisionNarrative,
      },
      activatedConcerns: [],
      eventSalience: impact,
      appraisalSummary: narrative,
    },
    transport: "local",
  };
}

export function buildMemoryTraceFromRoleTurn(
  event: EventInput,
  state: CharacterState,
  roleTurn: CognitiveModuleTrace<RoleTurnResult>,
): CognitiveModuleTrace<MemoryRecallResult> {
  const shortTermContext = selectRecentDialogueMemories(state, event, 10);
  const longTermCandidates = createLongTermCandidates(state).slice(0, 8);
  return {
    moduleName: "memory_retrieval",
    request: derivedRequest("memory_retrieval", roleTurn, "由人物主脑的记忆浮现段落派生为召回视图；候选由本地上下文选择器提供。"),
    output: {
      source: "sync_response",
      retrievalMode: "hybrid_relevance",
      naturalLanguageQuery: ["当前用户原话：" + event.content, "人物主脑心理状态：" + roleTurn.output.innerStateNarrative].join("\n\n"),
      shortTermContext,
      longTermMemories: longTermCandidates.map((memory) => ({
        memoryId: memory.id,
        summary: memory.summary,
        score: memory.importance,
        reason: "作为人物主脑上下文候选提供；最终浮现由 role_turn 自然语言判断承接。",
        factors: [],
      })),
      narrative: roleTurn.output.memoryNarrative,
    },
    transport: "local",
  };
}

export function buildDecisionTraceFromRoleTurn(
  event: EventInput,
  roleTurn: CognitiveModuleTrace<RoleTurnResult>,
): CognitiveModuleTrace<ResponseDecision> {
  const rhythm = inferReplyRhythm(roleTurn.output);
  const shouldRespond = Boolean(roleTurn.output.replyOutput.reply.trim());
  const decisionText = roleTurn.output.decisionNarrative;
  return {
    moduleName: "response_decision",
    request: derivedRequest("response_decision", roleTurn, "由人物主脑的开口倾向和最终台词派生为回应决策视图。"),
    output: {
      narrative: decisionText,
      shouldRespond,
      responseMode: shouldRespond ? inferResponseMode(roleTurn.output, rhythm) : "silence",
      replyRhythm: shouldRespond ? rhythm : "none",
      shouldLoseComposure: estimateNarrativeHeat(roleTurn.output) >= 0.72 || rhythm === "burst",
      shouldBreakPersona: estimateNarrativeHeat(roleTurn.output) >= 0.86,
      delaySeconds: 0,
      rationale: decisionText || `${event.speakerName || "对方"}这句话让她把回应收在当前关系距离里。`,
    },
    transport: "local",
  };
}

function buildRoleTurnPrompt(event: EventInput, state: CharacterState) {
  const activeConcerns = state.concerns.filter((concern) => concern.status === "active");
  const shortTermContext = selectRecentDialogueMemories(state, event, 10);
  const longTermCandidates = createLongTermCandidates(state).slice(0, 12);
  const relationshipMemory = (state.relationshipMemory ?? []).find((memory) => memory.targetUserId === event.speakerId);
  const relationshipNarrative = relationshipMemory
    ? [
        `说话者是 ${relationshipMemory.targetUserName}。`,
        `她对这个人的印象：${relationshipMemory.impressionSummary}`,
        `当前关系感：${relationshipMemory.relationshipSummary}`,
        `最近互动余波：${relationshipMemory.lastInteractionSummary}`,
        relationshipMemory.evidence.length > 0 ? `关系证据：${relationshipMemory.evidence.join("；")}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : event.speakerId && state.relationships[event.speakerId]
      ? `说话者是 ${state.relationships[event.speakerId].targetName}。最近互动气氛：${state.relationships[event.speakerId].recentTone}。关系备注：${state.relationships[event.speakerId].notes.slice(-4).join("；") || "暂无"}。`
      : "说话者还没有稳定关系记忆，她会从此刻这句话和最近上下文里形成距离感。";

  const personalityNarrative = [
    state.profile.personalitySummary,
    ...state.profile.personalityFacets.map((facet) => `「${facet.label}」：${facet.summary}${facet.tension ? ` ${facet.tension}` : ""} ${facet.expression}`),
  ]
    .filter(Boolean)
    .join(" ");
  const lifeNarrative = [
    state.profile.socialPersonaPattern ? `人群中的性格位置：${state.profile.socialPersonaPattern}` : "",
    state.profile.fullLifeStory ? `人生脉络：${state.profile.fullLifeStory}` : "",
    ...state.profile.lifeEvents.map(
      (item) => `${item.ageRange}「${item.title}」：${item.summary} 心理变化：${item.psychologicalChange} 关系变化：${item.relationshipChange}`,
    ),
  ]
    .filter(Boolean)
    .join(" ");
  const runtimeNarrative = Object.values(state.runtime.signalProfiles)
    .map((signal) => `${signal.label}：${signal.summary} ${signal.considerations.join("；")}。${signal.cognitiveNarrative}`)
    .join("\n");
  const sceneNarrative = state.scene
    ? `${state.scene.title}：${state.scene.description} ${state.scene.cognitiveNarrative} ${state.scene.sensoryProfile} ${state.scene.interactionPressure}`
    : "当前没有明确场景，按普通私聊现场理解。";
  const locationNarrative = state.location
    ? [
        `位置：${state.location.label}，${state.location.address}，${state.location.region}`,
        `移动状态：${describeMotionState(state.location.motionState)}，速度约 ${state.location.speedKmh} km/h，方向 ${state.location.headingLabel}`,
        state.location.mapContext ? `周边：${state.location.mapContext.environmentSummary}` : "没有周边地图语境。",
      ].join("。")
    : "没有明确物理位置，不能假装知道具体街道或建筑。";
  const examples = state.profile.examples.length
    ? state.profile.examples.map((example) => `情境「${example.situation}」里她可能说：「${example.expectedReply}」`).join("\n")
    : "没有表达样本。";

  return [
    `你现在不是分析模块，也不是编剧旁白。你要直接进入 ${state.profile.name} 的一次心理-表达回合。`,
    "先在心里把她是谁、她和对方的关系、此刻场景、最近几句、记忆余波、身体状态一起过一遍，再让她自然开口。",
    "不要把规则当成台词，不要解释系统，不要输出 JSON，不要代码块。最终只有“说出口”段落会进入聊天历史。",
    "",
    `角色稳定背景：${state.profile.background}`,
    lifeNarrative ? `成长经历和关系变化：${lifeNarrative}` : "",
    `性格质地：${personalityNarrative}`,
    `说话质感：${state.profile.speakingStyle}`,
    `价值取向：${state.profile.values.join("、") || "没有明确列出"}。关系边界：${state.profile.boundaries.join("；") || "没有明确列出"}。`,
    `表达样本：\n${examples}`,
    "",
    `当前场景：${sceneNarrative}`,
    `当前位置：${locationNarrative}`,
    `当前自然语言状态：\n${runtimeNarrative}`,
    `当前注意焦点：${state.runtime.attentionFocus || "没有明确写入"}`,
    "",
    `当前关系：${relationshipNarrative}`,
    `最近直接对话：\n${shortTermContext.length ? shortTermContext.map((memory) => formatDialogueMemoryForPrompt(memory, state, event)).join("\n") : "最近几个小时没有直接上下文。"}`,
    `过去6小时关系、状态和场景摘要：\n${formatRecentSituationSummaryForPrompt(state, event)}`,
    `长期记忆和关系记忆候选：\n${formatLongTermCandidates(longTermCandidates)}`,
    `长期心事：\n${activeConcerns.length ? activeConcerns.map((concern) => `${concern.title}：${concern.description}`).join("\n") : "没有特别放不下的心事。"}`,
    "",
    `${event.speakerName ?? "对方"}刚刚说：「${event.content}」`,
    "",
    "请输出四段自然语言，段首使用下面四个标题。标题只是为了系统把心理摘要和台词分开，不是让你填表：",
    "心理状态：她这一刻真实的身体感、情绪、关系距离和控制感。",
    "记忆浮现：此刻真正会浮上来的最近对话、关系余波或长期记忆；没有就说没有明显记忆浮现。",
    "开口倾向：她为什么沉默、短答、追问、连续补充、转移、拒绝或失态；要承接上一轮已经发生的关系变化。",
    "说出口：只写她会发给对方的聊天内容。多条消息直接换行；如果她会沉默，只写（沉默）。不要写动作旁白或说话人标签。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildFallbackRoleTurn(event: EventInput, state: CharacterState): RoleTurnResult {
  const innerStateNarrative = `${state.profile.name}听见${event.speakerName || "对方"}这句话时，会先把它放进当前场景、关系距离和自己的状态里理解。`;
  const memoryNarrative = formatRecentDialogueForPrompt(state, event);
  const decisionNarrative = "她需要自然回应，但不应该把心理分析说出口。";
  const reply = "嗯，我听到了。你继续说。";
  return {
    narrative: [innerStateNarrative, memoryNarrative, decisionNarrative].join("\n"),
    innerStateNarrative,
    memoryNarrative,
    decisionNarrative,
    replyOutput: {
      reply,
      segments: [reply],
    },
  };
}

function buildRoleTurnProbePrompt(event: EventInput, state: CharacterState, roleTurn: CognitiveModuleTrace<RoleTurnResult>) {
  return [
    "你是虚拟人对话系统的旁路心理探针，只做本轮审计，不参与角色思考，不给角色新指令，不改写台词。",
    "下面的主脑输入和输出已经发生，最终回复、状态写回和记忆写入都不会读取你的结论。",
    "你的任务是帮助开发者看清：主脑如何从人物/关系/场景/记忆走到这句回复；人物标签有没有把表达锁死；上下文是否有重复、旧模块术语或过量材料污染。",
    "",
    `角色：${state.profile.name}`,
    `用户原话：${event.speakerName ?? "对方"}：「${event.content}」`,
    "",
    "人物主脑本轮原始输入：",
    roleTurn.request.prompt,
    "",
    "人物主脑本轮输出：",
    formatRoleTurnProbeSource(roleTurn.output),
    "",
    "请只输出下面五段自然语言，段首必须使用这些标题。不要 JSON，不要代码块，不要提出会影响下一轮角色回复的指令。",
    "决策路径：用 3-5 句说明她从身体状态、关系距离、记忆余波到开口选择的心理变化。",
    "关键心理证据：列出本轮真正影响回复的证据；区分主脑自己用到的证据和只是 prompt 里出现但未明显生效的材料。",
    "标签锁定风险：判断人物档案里的稳定标签是否把她锁成固定反应；如果有，指出是哪类标签/措辞在拉偏。",
    "上下文噪声：指出重复内容、旧模块术语、过量候选或与此刻无关的材料是否可能污染主脑。",
    "建议裁剪：只给面向开发者的 prompt/context 调整建议，不要给角色下一轮应如何说话的建议。",
  ].join("\n\n");
}

function buildFallbackRoleTurnProbe(event: EventInput, state: CharacterState, roleTurn: CognitiveModuleTrace<RoleTurnResult>): RoleTurnProbeResult {
  const decisionPath = `${state.profile.name}先承接「${event.content}」带来的关系距离，再把身体状态、记忆浮现和开口倾向收束成当前回复。`;
  const psychologicalEvidence = [roleTurn.output.innerStateNarrative, roleTurn.output.memoryNarrative, roleTurn.output.decisionNarrative].filter(Boolean).join("\n");
  return {
    narrative: decisionPath,
    decisionPath,
    psychologicalEvidence: psychologicalEvidence || "本轮主脑输出较短，只能从最终台词和开口倾向粗略回看。",
    labelLockRisk: "未运行外部探针；无法细判标签锁定，只能提示稳定人格标签不应被当作硬规则。",
    contextNoise: "未运行外部探针；无法细判重复上下文，只能提示关系记忆、近期摘要和长期候选需要避免重复。",
    suggestedTrim: "保持探针旁路观察；若发现重复关系记忆，可再裁剪 roleTurn prompt 的候选清单。",
  };
}

function serializeRoleTurnProbeFallback(fallback: RoleTurnProbeResult) {
  return [
    `决策路径：${fallback.decisionPath}`,
    `关键心理证据：${fallback.psychologicalEvidence}`,
    `标签锁定风险：${fallback.labelLockRisk}`,
    `上下文噪声：${fallback.contextNoise}`,
    `建议裁剪：${fallback.suggestedTrim}`,
  ].join("\n");
}

function serializeRoleTurnFallback(fallback: RoleTurnResult) {
  return [
    `心理状态：${fallback.innerStateNarrative}`,
    `记忆浮现：${fallback.memoryNarrative}`,
    `开口倾向：${fallback.decisionNarrative}`,
    `说出口：${fallback.replyOutput.reply || "（沉默）"}`,
  ].join("\n");
}

function parseRoleTurnProbeNarrative(text: string, fallback: RoleTurnProbeResult): RoleTurnProbeResult {
  const rawText = typeof text === "string" && text.trim() ? text.trim() : serializeRoleTurnProbeFallback(fallback);
  const sections = extractProbeSections(rawText);
  const decisionPath = sections.decisionPath || fallback.decisionPath;
  const psychologicalEvidence = sections.psychologicalEvidence || fallback.psychologicalEvidence;
  const labelLockRisk = sections.labelLockRisk || fallback.labelLockRisk;
  const contextNoise = sections.contextNoise || fallback.contextNoise;
  const suggestedTrim = sections.suggestedTrim || fallback.suggestedTrim;
  return {
    narrative: [decisionPath, labelLockRisk, contextNoise].filter(Boolean).join("\n"),
    decisionPath,
    psychologicalEvidence,
    labelLockRisk,
    contextNoise,
    suggestedTrim,
  };
}

function parseRoleTurnNarrative(text: string, fallback: RoleTurnResult): RoleTurnResult {
  const rawText = typeof text === "string" && text.trim() ? text.trim() : serializeRoleTurnFallback(fallback);
  const sections = extractNaturalSections(rawText);
  const innerStateNarrative = sections.innerStateNarrative || fallback.innerStateNarrative;
  const memoryNarrative = sections.memoryNarrative || fallback.memoryNarrative;
  const decisionNarrative = sections.decisionNarrative || fallback.decisionNarrative;
  const replyRaw = sections.reply || extractLastQuotedReply(rawText) || fallback.replyOutput.reply;
  const reply = normalizeSpokenReply(replyRaw);
  const rhythm = inferReplyRhythmFromText(reply, decisionNarrative);
  const segments = splitReplyIntoSegments(reply, rhythm);
  return {
    narrative: [innerStateNarrative, memoryNarrative, decisionNarrative].filter(Boolean).join("\n"),
    innerStateNarrative,
    memoryNarrative,
    decisionNarrative,
    replyOutput: {
      reply,
      segments,
    },
  };
}

function extractNaturalSections(text: string) {
  const cleanText = text.replace(/\*\*/g, "").trim();
  const headingPattern = /(?:^|\n)\s*[#*\-\s]{0,6}(心理状态|内心状态|记忆浮现|开口倾向|说出口|最终说出口|台词)\s*[：:]\s*/g;
  const matches = [...cleanText.matchAll(headingPattern)];
  const sections: {
    innerStateNarrative?: string;
    memoryNarrative?: string;
    decisionNarrative?: string;
    reply?: string;
  } = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const heading = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? cleanText.length;
    const value = cleanText.slice(start, end).trim();
    if (!value) continue;
    if (heading === "心理状态" || heading === "内心状态") sections.innerStateNarrative = value;
    if (heading === "记忆浮现") sections.memoryNarrative = value;
    if (heading === "开口倾向") sections.decisionNarrative = value;
    if (heading === "说出口" || heading === "最终说出口" || heading === "台词") sections.reply = value;
  }
  return sections;
}

function extractProbeSections(text: string) {
  const cleanText = text.replace(/\*\*/g, "").trim();
  const headingPattern = /(?:^|\n)\s*[#*\-\s]{0,6}(决策路径|关键心理证据|心理证据|标签锁定风险|上下文噪声|建议裁剪)\s*[：:]\s*/g;
  const matches = [...cleanText.matchAll(headingPattern)];
  const sections: {
    decisionPath?: string;
    psychologicalEvidence?: string;
    labelLockRisk?: string;
    contextNoise?: string;
    suggestedTrim?: string;
  } = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const heading = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? cleanText.length;
    const value = cleanText.slice(start, end).trim();
    if (!value) continue;
    if (heading === "决策路径") sections.decisionPath = value;
    if (heading === "关键心理证据" || heading === "心理证据") sections.psychologicalEvidence = value;
    if (heading === "标签锁定风险") sections.labelLockRisk = value;
    if (heading === "上下文噪声") sections.contextNoise = value;
    if (heading === "建议裁剪") sections.suggestedTrim = value;
  }
  return sections;
}

function formatRoleTurnProbeSource(roleTurn: RoleTurnResult) {
  return [
    `心理状态：${roleTurn.innerStateNarrative}`,
    `记忆浮现：${roleTurn.memoryNarrative}`,
    `开口倾向：${roleTurn.decisionNarrative}`,
    `说出口：${roleTurn.replyOutput.reply || "（沉默）"}`,
  ].join("\n");
}

function extractLastQuotedReply(text: string) {
  const quoted = [...text.matchAll(/[「“]([^「」“”]{1,240})[」”]/g)].map((match) => match[1].trim()).filter(Boolean);
  return quoted.at(-1) ?? "";
}

function normalizeSpokenReply(reply: string) {
  const stripped = stripReplyStageDirections(reply)
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/^[-\s]+/, "")
    .trim();
  if (!stripped) return "";
  if (/^（?\s*(沉默|不说话|没有说出口|无回应|无回复)\s*）?。?$/.test(stripped)) return "";
  return stripped;
}

function derivedRequest(moduleName: "appraisal" | "memory_retrieval" | "response_decision", roleTurn: CognitiveModuleTrace<RoleTurnResult>, description: string) {
  const sourceOutput =
    moduleName === "appraisal"
      ? roleTurn.output.innerStateNarrative
      : moduleName === "memory_retrieval"
        ? roleTurn.output.memoryNarrative
        : roleTurn.output.decisionNarrative;
  return {
    moduleName,
    inputMode: "natural_language" as const,
    outputMode: "natural_language" as const,
    prompt: [description, "原始完整输入见 PipelineTrace.roleTurn.request.prompt。", "人物主脑对应输出片段：", sourceOutput].join("\n"),
    outputContract: "本步骤不再单独调用 LLM；它是 role_turn 自然语言结果的兼容视图。",
  };
}

function inferReplyRhythm(roleTurn: RoleTurnResult) {
  return inferReplyRhythmFromText(roleTurn.replyOutput.reply, roleTurn.decisionNarrative);
}

function inferReplyRhythmFromText(reply: string, decisionNarrative: string) {
  const lines = reply.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (!reply.trim()) return "none";
  if (lines.length >= 3) return "burst";
  if (lines.length >= 2) return "multi_turn";
  if (/短句|失态|压不住|一连|连续|补充|追问|爆发/.test(decisionNarrative)) {
    return /短句|失态|压不住|爆发/.test(decisionNarrative) ? "burst" : "multi_turn";
  }
  return "single";
}

function inferResponseMode(roleTurn: RoleTurnResult, rhythm: ResponseDecision["replyRhythm"]) {
  const text = [roleTurn.innerStateNarrative, roleTurn.decisionNarrative, roleTurn.replyOutput.reply].join("\n");
  if (!roleTurn.replyOutput.reply.trim()) return "silence";
  if (rhythm === "burst" || /失态|压不住|别再|别这样|崩溃|爆发/.test(text)) return "emotional_outburst";
  if (/追问|问/.test(roleTurn.decisionNarrative)) return "question_back";
  if (/回避|转移|岔开/.test(roleTurn.decisionNarrative)) return "topic_shift";
  if (/拒绝|边界|不方便|不能/.test(text)) return "short_avoidance";
  if (/靠近|柔和|温和|愿意|放松/.test(text)) return "warm_reply";
  return "neutral_reply";
}

function estimateCompatibilityImpact(state: CharacterState, roleTurn: RoleTurnResult) {
  const runtimeImpact = Math.max(
    state.runtime.derivedMood.arousal,
    Math.abs(Math.min(state.runtime.derivedMood.valence, 0)),
    1 - state.runtime.energy,
  );
  const narrativeHeat = estimateNarrativeHeat(roleTurn);
  return roundCompatibility(Math.max(0.25, runtimeImpact * 0.72, narrativeHeat));
}

function estimateNarrativeHeat(roleTurn: RoleTurnResult) {
  const text = [roleTurn.innerStateNarrative, roleTurn.memoryNarrative, roleTurn.decisionNarrative, roleTurn.replyOutput.reply].join("\n");
  if (/崩溃|撕票|绑架|死亡|死|危险|击穿|被辞退|家人|严重|灾难/.test(text)) return 0.88;
  if (/震惊|麻木|强烈|压不住|失态|警报|恐惧|愤怒/.test(text)) return 0.76;
  if (/边界|拒绝|防备|不信任|不被看见|刺痛|难堪/.test(text)) return 0.58;
  if (/温和|放松|靠近|缓和/.test(text)) return 0.38;
  return 0.32;
}

function roundCompatibility(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function describeMotionState(motionState: NonNullable<CharacterState["location"]>["motionState"]) {
  switch (motionState) {
    case "stationary":
      return "停留";
    case "walking":
      return "步行";
    case "riding":
      return "骑行";
    case "driving":
      return "驾车";
    case "unknown":
      return "未知";
  }
}
