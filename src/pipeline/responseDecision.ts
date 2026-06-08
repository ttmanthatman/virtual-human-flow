import { CharacterState, CognitiveModuleTrace, LlmConfig, ResponseDecision } from "../core/types";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function decideResponse(
  appraisalNarrative: string,
  memoryRecallNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<ResponseDecision>> {
  const mockOutput: ResponseDecision = {
    shouldRespond: true,
    responseMode: "neutral_reply",
    delaySeconds: 2,
    rationale: "当前是直接对话场景，默认给予简短自然的回应。",
  };

  return runDecisionModule(appraisalNarrative, memoryRecallNarrative, state, llmConfig, mockOutput, onStream);
}

function runDecisionModule(
  appraisalNarrative: string,
  memoryRecallNarrative: string,
  state: CharacterState,
  llmConfig: LlmConfig,
  mockOutput: ResponseDecision,
  onStream?: (output: string) => void,
) {
  const prompt = [
    "你是虚拟人大脑里的行为决策区。不输出JSON。",
    "第一行只写一个词：是 或 否。然后另起一段写自然语言。",
    "",
    "她此刻的整体状态：" + state.runtime.derivedMood.label,
    "",
    "事件评估：",
    appraisalNarrative,
    "",
    "记忆浮现：",
    memoryRecallNarrative || "没有特别强的记忆浮上来。",
    "",
    "请判断她要不要开口回应。如果是直接对话、没有必须沉默的强理由，默认是。",
    "",
    "然后描述她的回应姿态。不要用标签或枚举名，用自然语言：",
    "- 她是温和接住？保持距离？转移话题？反问？简短回避？沉默？",
    "- 为什么是这个姿态？",
    "- 如果要回应，语气和节奏是怎样的？",
  ].join("\n");

  return runCognitiveModule<string | ResponseDecision>(
    {
      moduleName: "response_decision",
      inputMode: "structured_context",
      outputMode: "natural_language",
      prompt,
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
      narrative,
      rationale: narrative || fallback.rationale,
    };
  }

  if (!isRecord(result)) return fallback;

  return {
    shouldRespond: typeof result.shouldRespond === "boolean" ? result.shouldRespond : fallback.shouldRespond,
    responseMode: typeof result.responseMode === "string" ? (result.responseMode as ResponseDecision["responseMode"]) : fallback.responseMode,
    delaySeconds: typeof result.delaySeconds === "number" ? result.delaySeconds : fallback.delaySeconds,
    narrative: typeof result.narrative === "string" ? result.narrative : fallback.narrative,
    rationale: typeof result.rationale === "string" && result.rationale.trim() ? result.rationale : fallback.rationale,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
