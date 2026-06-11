import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";
import { formatRecentDialogueForPrompt, formatRecentSituationSummaryForPrompt } from "./conversationContext";

export async function runAppraisal(
  event: EventInput,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<AppraisalResult>> {
  const activeConcerns = state.concerns.filter((concern) => concern.status === "active");
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
        "。这些心事是否被触动，只能由这一轮自然语言评估判断。"
      : "她此刻没有什么特别放不下的心事。",
    "说话者在她心里的位置：" +
      (event.speakerId && state.relationships[event.speakerId]
        ? "她对" +
          (event.speakerName || "这个人") +
          "有一定的熟悉度，最近的互动气氛是" +
          (state.relationships[event.speakerId].recentTone || "平淡") +
          "。"
        : "还没有明确的关系档案，她保持礼貌的距离感。"),
    fallbackShouldRespond ? "总的来说，对方正在直接向她说话，她需要在关系、场景和自身状态里形成回应判断。" : "总的来说，她可以先观察。",
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
      level: 0.35,
      touchedCore: [],
      rationale: "本地回退不使用关键词判断触动，只保留一段温和默认评估。",
    },
    composureRisk: {
      shouldLoseComposure: false,
      level: 0.25,
      rationale: "触动未超过失态阈值。",
    },
    personaBreakRisk: {
      shouldBreakPersona: false,
      level: 0,
      rationale: "没有达到突破人设外壳的强度。",
    },
    activatedConcerns: [],
    eventSalience: 0.35,
    appraisalSummary: mockNarrative,
  };

  const prompt = [
    "你是虚拟人大脑里的事件评估区。你只判断角色当下状态，不写角色台词，不生成回复。",
    "请只用自然语言写出你的判断，不要输出 JSON，不要列字段名，不要使用代码式键值。",
    "不要用单个关键词、单一数值或触发词去判断；请像人在理解另一个人一样，把原话、关系、最近上下文、场景和人物长期状态合在一起评估。",
    "",
    "角色：" + state.profile.name + "。" + state.profile.background,
    "她此刻的整体状态：" + state.runtime.derivedMood.label,
    "她此刻的运行时信号：",
    formatRuntimeSignalNarrative(state),
    "最近几句对话：",
    formatRecentDialogueForPrompt(state, event),
    "过去6小时关系、状态和场景摘要：",
    formatRecentSituationSummaryForPrompt(state, event),
    "她一直装在心里的事：",
    ...activeConcerns.map(
      (concern) =>
        "关切ID " +
        concern.id +
        "，「" +
        concern.title +
        "」：" +
        concern.description +
        "。这不是关键词触发表，只是人物长期心事的自然语言背景。强度 " +
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
    "- 如果需要回应，请自然语言描述她更可能沉默、克制短答、连续补充、追问解释，还是短句失控。",
    "- 这句话对当事人的触动有多大，是否击中核心创伤、欲望、羞耻、执念、爱、依赖或底线。",
    "- 是否会失态：表情、语气、节奏、逻辑或距离感从平常模式里滑出去。",
    "- 是否需要突破人设外壳式失控：不是乱写 OOC，而是自我控制被击穿，露出更底层、更真实、更危险的反应。",
    "- 如果她已经处在极低能量、强烈负面、震惊、麻木、崩溃边缘或高压余波里，新的普通闲聊/邀约也要按“和当前状态错位”评估；不能只按新话题表面是否危险来降权。",
    "- 如果同一个边界、亲密推进、危险、澄清或承诺在最近几轮反复出现，要评价它在关系里的递进，而不是把每句话当成孤立事件。",
    "",
    "请写成几句自然语言评估，说明她此刻怎么理解这句话、哪些记忆或关系被带起、她还能不能稳住、需不需要回应，以及这一轮大概会是沉默、短答、追问、连续补充还是失态爆发。不要写角色台词。",
  ].join("\n");

  const trace = await runCognitiveModule<string>(
    {
      moduleName: "appraisal",
      inputMode: "natural_language",
      outputMode: "natural_language",
      prompt,
      outputContract: "自然语言事件评估，不使用 JSON、字段名或代码式结构。",
    },
    llmConfig,
    mockNarrative,
    { onStream },
  );

  return {
    ...trace,
    output: appraisalFromNarrative(trace.output, fallbackOutput),
  };
}

function appraisalFromNarrative(narrative: string, fallback: AppraisalResult): AppraisalResult {
  const text = typeof narrative === "string" && narrative.trim() ? narrative.trim() : fallback.narrative || fallback.appraisalSummary;
  return {
    ...fallback,
    narrative: text,
    appraisalSummary: text,
    dangerState: {
      ...fallback.dangerState,
      rationale: text,
    },
    awarenessState: {
      ...fallback.awarenessState,
      rationale: text,
    },
    responseNeed: {
      ...fallback.responseNeed,
      rationale: text,
    },
    emotionalImpact: {
      ...fallback.emotionalImpact,
      rationale: text,
    },
    composureRisk: {
      ...fallback.composureRisk,
      rationale: text,
    },
    personaBreakRisk: {
      ...fallback.personaBreakRisk,
      rationale: text,
    },
  };
}

function formatRuntimeSignalNarrative(state: CharacterState) {
  return Object.values(state.runtime.signalProfiles)
    .map((signal) =>
      [signal.label, signal.summary, signal.considerations.join("；"), signal.cognitiveNarrative].filter(Boolean).join("："),
    )
    .join("\n");
}
