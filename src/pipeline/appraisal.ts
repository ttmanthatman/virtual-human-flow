import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function runAppraisal(
  event: EventInput,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<AppraisalResult>> {
  const mockNarrative = [
    state.profile.name + "听到了" + (event.speakerName || "对方") + "说的话。",
    state.concerns.filter((concern) => concern.status === "active").length > 0
      ? "她心里装着" +
        state.concerns.filter((concern) => concern.status === "active").length +
        "件在意的事，包括" +
        state.concerns
          .filter((concern) => concern.status === "active")
          .slice(0, 3)
          .map((concern) => "「" + concern.title + "」")
          .join("、") +
        "。但这句话没有直接戳中其中任何一个。"
      : "她此刻没有什么特别放不下的心事。",
    "说话者在她心里的位置：" +
      (event.speakerId && state.relationships[event.speakerId]
        ? "她对" +
          (event.speakerName || "这个人") +
          "有一定的熟悉度，最近的互动气氛是" +
          (state.relationships[event.speakerId].recentTone || "平淡") +
          "。"
        : "还没有明确的关系档案，她保持礼貌的距离感。"),
    "总的来说，这是需要她回应的一句普通对话。",
  ].join("\n");

  const fallbackOutput: AppraisalResult = {
    narrative: mockNarrative,
    eventId: event.id,
    activatedConcerns: [],
    eventSalience: 0,
    appraisalSummary: "",
  };

  const prompt = [
    "你是虚拟人大脑里的事件评估区。不输出JSON，不输出数字，不输出字段名。只输出一段自然语言。",
    "",
    "角色：" + state.profile.name + "。" + state.profile.background,
    "她一直装在心里的事：",
    ...state.concerns
      .filter((concern) => concern.status === "active")
      .map((concern) => "「" + concern.title + "」：" + concern.description),
    "",
    "说话者是" + (event.speakerName || "未知") + "，原话是：「" + event.content + "」",
    "",
    "请用一段连贯的自然语言描述：",
    "- 这句话和她有没有关系？触到了她心里哪件事？",
    "- 触到的深度：只是轻轻擦到，还是被顶了一下？",
    "- 说话的人在她心里处在什么位置？",
    "- 所有这些因素综合起来，这件事对她来说有多重要？",
  ].join("\n");

  const trace = await runCognitiveModule<string>(
    {
      moduleName: "appraisal",
      inputMode: "structured_context",
      outputMode: "natural_language",
      prompt,
    },
    llmConfig,
    mockNarrative,
    { onStream },
  );

  return {
    ...trace,
    output: normalizeAppraisalResult(trace.output, fallbackOutput),
  };
}

function normalizeAppraisalResult(result: unknown, fallback: AppraisalResult): AppraisalResult {
  if (typeof result === "string") {
    return {
      ...fallback,
      narrative: result,
    };
  }

  return fallback;
}
