import { CharacterState, CognitiveModuleTrace, EventActivityResult, EventInput, LlmConfig, TemporalSceneProgression } from "../core/types";
import { describeConversationChannelForPrompt } from "../core/conversationChannels";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { formatDialogueMemoryForPrompt, selectRecentDialogueMemories } from "./conversationContext";
import { createLongTermCandidates, formatLongTermCandidates } from "./memoryRetrieval";

export async function runEventActivity(
  event: EventInput,
  state: CharacterState,
  progression: TemporalSceneProgression,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<EventActivityResult>> {
  const fallback = buildFallbackEventActivity(event, state, progression);
  const prompt = buildEventActivityPrompt(event, state, progression);
  const request = {
    moduleName: "event_activity" as const,
    inputMode: "natural_language" as const,
    outputMode: "natural_language" as const,
    prompt,
    outputContract: "自然语言非聊天事件活动：心理活动、动作、位移、关系变化、记忆变化、外显输出。不是 JSON，不是字段表。",
  };
  let trace: CognitiveModuleTrace<string>;
  try {
    trace = await runCognitiveModule<string>(request, llmConfig, serializeEventActivityFallback(fallback), { onStream });
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught);
    const fallbackText = serializeEventActivityFallback(fallback);
    onStream?.(`事件活动模型暂不可用，已使用本地候选结果继续：${reason}\n${fallbackText}`);
    trace = {
      moduleName: "event_activity",
      request,
      output: fallbackText,
      transport: "mock_llm",
      fallbackReason: reason,
    };
  }

  return {
    ...trace,
    output: parseEventActivityNarrative(trace.output, fallback),
  };
}

export function formatEventActivityDetails(activity: EventActivityResult) {
  return [
    `心理活动：${activity.psychologicalActivity}`,
    `动作：${activity.action}`,
    `位移：${activity.movement}`,
    `关系变化：${activity.relationshipShift}`,
    `记忆变化：${activity.memoryNote}`,
    activity.externalOutput ? `外显输出：${activity.externalOutput}` : "",
  ].filter(Boolean);
}

function buildEventActivityPrompt(event: EventInput, state: CharacterState, progression: TemporalSceneProgression) {
  const activeConcerns = state.concerns.filter((concern) => concern.status === "active");
  const shortTermContext = selectRecentDialogueMemories(state, event, 10);
  const longTermCandidates = createLongTermCandidates(state).slice(0, 10);
  const personalityNarrative = [
    state.profile.personalitySummary,
    ...state.profile.personalityFacets.map((facet) => `「${facet.label}」：${facet.summary}${facet.tension ? ` ${facet.tension}` : ""} ${facet.expression}`),
  ]
    .filter(Boolean)
    .join(" ");
  const sceneNarrative = state.scene
    ? `${state.scene.title}：${state.scene.description} ${state.scene.cognitiveNarrative} ${state.scene.sensoryProfile} ${state.scene.interactionPressure}`
    : "当前没有明确场景。";
  const locationNarrative = state.location
    ? [
        `位置：${state.location.label}，${state.location.address}，${state.location.region}`,
        `移动状态：${formatMotionState(state.location.motionState)}，速度约 ${state.location.speedKmh} km/h，方向 ${state.location.headingLabel}`,
        state.location.mapContext ? `周边：${state.location.mapContext.environmentSummary}` : "没有周边地图语境。",
      ].join("。")
    : "没有明确物理位置，不能假装知道具体街道或建筑。";
  const runtimeNarrative = Object.values(state.runtime.signalProfiles)
    .map((signal) => `${signal.label}：${signal.summary} ${signal.considerations.join("；")}。${signal.cognitiveNarrative}`)
    .join("\n");
  const channelNarrative = describeConversationChannelForPrompt(event, state);

  return [
    `你现在不是聊天回复模块。你要直接进入 ${state.profile.name} 的一次非聊天事件活动回合。`,
    "事件是现场或环境里发生的事，不是某个人在和她说话。请让她像真实的人一样先有身体和心理变化，再决定有没有外显动作、位置变化、关系余波或可被别人看见/听见的输出。",
    "不要输出 JSON，不要代码块，不要用规则引擎口吻，不要把人物标签当硬锁。外显输出可以为空；如果她不会说话，不要强行给台词。",
    "",
    `角色稳定背景：${state.profile.background}`,
    `性格质地：${personalityNarrative}`,
    `说话和行动质感：${state.profile.speakingStyle}`,
    `价值取向：${state.profile.values.join("、") || "没有明确列出"}。关系边界：${state.profile.boundaries.join("；") || "没有明确列出"}。`,
    "",
    `当前场景：${sceneNarrative}`,
    `当前位置：${locationNarrative}`,
    `当前自然语言状态：\n${runtimeNarrative}`,
    `当前注意焦点：${state.runtime.attentionFocus || "没有明确写入"}`,
    `事件渠道与现实约束：${channelNarrative}`,
    "",
    `房间最近上下文：\n${shortTermContext.length ? shortTermContext.map((memory) => formatDialogueMemoryForPrompt(memory, state, event)).join("\n") : "最近几个小时没有直接上下文。"}`,
    `长期记忆和关系记忆候选：\n${formatLongTermCandidates(longTermCandidates)}`,
    `长期心事：\n${activeConcerns.length ? activeConcerns.map((concern) => `${concern.title}：${concern.description}`).join("\n") : "没有特别放不下的心事。"}`,
    "",
    `事件：${event.content}`,
    `当前时间和场景校准：当地时间 ${progression.localTimeLabel}；阶段 ${progression.schedulePhase}；${progression.reason}；${progression.locationPlausibility}`,
    "",
    "请输出六段自然语言，段首使用下面六个标题。标题只是为了系统折叠展示，不是让你填表：",
    "心理活动：她这一刻真实的身体感、情绪、注意力和控制感怎么变。",
    "动作：她可能做出的细小动作或停顿；没有明显动作也要写出为什么。",
    "位移：她现在的位置/移动状态如何变化；不能瞬移，不能越过现实动线。",
    "关系变化：这次事件会怎样改变她对房间里人的距离感；没有直接变化也要说明余波。",
    "记忆变化：这次事件在短期记忆里留下什么，下一轮她会自然带着什么余味。",
    "外显输出：别人能看见、听见或收到的东西；如果没有，就写（无）。",
  ].join("\n\n");
}

function buildFallbackEventActivity(event: EventInput, state: CharacterState, progression: TemporalSceneProgression): EventActivityResult {
  const movement = state.location
    ? `${state.location.label}，${formatMotionState(state.location.motionState)}，仍在${state.location.region}。`
    : "没有足够位置信息，只能确认她没有发生突兀位移。";
  return {
    narrative: `${state.profile.name}把「${event.content}」当作现场事件来承接，而不是当作聊天台词。`,
    psychologicalActivity: `${state.profile.name}的注意力被「${event.content}」从当前节奏里拽了一下，同时意识到现在是${progression.localTimeLabel}。`,
    action: progression.changed ? "她一边被现场动静牵动，一边顺着新的时间段调整动作和注意力。" : "她没有立刻开口，只是先判断这个现场动静从哪里来。",
    movement,
    relationshipShift: "这不是某个人发起的聊天，不直接改变某段关系；但它会成为房间里所有人之后能承接的共同现场背景。",
    memoryNote: "现场事件写入短期记忆，下一轮角色主脑会带着这次场景和身体余波理解对话。",
    externalOutput: "",
  };
}

function serializeEventActivityFallback(fallback: EventActivityResult) {
  return [
    `心理活动：${fallback.psychologicalActivity}`,
    `动作：${fallback.action}`,
    `位移：${fallback.movement}`,
    `关系变化：${fallback.relationshipShift}`,
    `记忆变化：${fallback.memoryNote}`,
    `外显输出：${fallback.externalOutput || "（无）"}`,
  ].join("\n");
}

function parseEventActivityNarrative(text: string, fallback: EventActivityResult): EventActivityResult {
  const rawText = typeof text === "string" && text.trim() ? text.trim() : serializeEventActivityFallback(fallback);
  const sections = extractEventActivitySections(rawText);
  const externalOutput = normalizeEmptyOutput(sections.externalOutput || fallback.externalOutput);
  const activity = {
    psychologicalActivity: sections.psychologicalActivity || fallback.psychologicalActivity,
    action: sections.action || fallback.action,
    movement: sections.movement || fallback.movement,
    relationshipShift: sections.relationshipShift || fallback.relationshipShift,
    memoryNote: sections.memoryNote || fallback.memoryNote,
    externalOutput,
  };
  return {
    narrative: [activity.psychologicalActivity, activity.action, activity.externalOutput].filter(Boolean).join("\n"),
    ...activity,
  };
}

function extractEventActivitySections(text: string) {
  const cleanText = text.replace(/\*\*/g, "").trim();
  const headingPattern = /(?:^|\n)\s*[#*\-\s]{0,6}(心理活动|内心活动|动作|位移|关系变化|记忆变化|外显输出|对外输出)\s*[：:]\s*/g;
  const matches = [...cleanText.matchAll(headingPattern)];
  const sections: Partial<EventActivityResult> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const heading = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? cleanText.length;
    const value = cleanText.slice(start, end).trim();
    if (!value) continue;
    if (heading === "心理活动" || heading === "内心活动") sections.psychologicalActivity = value;
    if (heading === "动作") sections.action = value;
    if (heading === "位移") sections.movement = value;
    if (heading === "关系变化") sections.relationshipShift = value;
    if (heading === "记忆变化") sections.memoryNote = value;
    if (heading === "外显输出" || heading === "对外输出") sections.externalOutput = value;
  }
  return sections;
}

function normalizeEmptyOutput(output: string) {
  const clean = output.trim();
  if (!clean || /^（?\s*(无|没有|无输出|不说话|沉默)\s*）?。?$/.test(clean)) return "";
  return clean;
}

function formatMotionState(motionState: string) {
  if (motionState === "stationary") return "停留";
  if (motionState === "walking") return "步行";
  if (motionState === "driving") return "驾车";
  if (motionState === "transit") return "乘坐交通工具";
  return "未知";
}
