import {
  AppraisalResult,
  CharacterState,
  CognitiveModuleTrace,
  EventInput,
  LlmConfig,
  MemoryRecallResult,
  ReplyOutput,
  ResponseDecision,
  RuntimeSignalEvaluationResult,
  StateDelta,
  StateUpdatePlan,
} from "../core/types";
import { clamp, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function evaluateRuntimeSignals(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    appraisal: AppraisalResult;
    memoryRecall: MemoryRecallResult;
    decision: ResponseDecision;
    stateUpdatePlan: StateUpdatePlan;
  },
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<RuntimeSignalEvaluationResult>> {
  const mockOutput = buildDeterministicRuntimeSignals(state);

  return runCognitiveModule<RuntimeSignalEvaluationResult>(
    {
      moduleName: "runtime_signal_evaluation",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的运行时信号评估区。",
        "你不写台词，也不决定她怎么回复。只评估给人观察用的状态信号。",
        "",
        "事件评估：" + context.appraisal.narrative,
        "记忆浮现：" + context.memoryRecall.narrative,
        "回应决策：" + context.decision.narrative,
        "状态写回：" + context.stateUpdatePlan.narrative,
        "她说出口的话：" + (replyOutput.reply || "她选择了沉默"),
        "",
        "字符：" + state.profile.name + "。" + state.profile.background,
        "当前各信号 ：" + JSON.stringify(state.runtime.signalProfiles),
        "",
        "请根据以上所有信息决定四个信号的数值和自然语言说明。",
        "数值范围：energy 0~1；valence -1~1；arousal 0~1。",
        "自然语言说明只描述内部状态、身体感、注意力落点，不写成回复指令。",
        "不要把“外表克制”写成内在平稳；如果她是在压住崩溃，mood/valence/arousal 的 label 和 cognitiveNarrative 必须保留痛苦、麻木、应激或耗竭的余波。",
        "以这个 JSON 格式回复：",
        '{ energy: number, derivedMood: { valence, arousal, label }, signalProfiles: { energy: {...}, mood: {...}, valence: {...}, arousal: {...} }, rationale: "..." }',
      ].join("\n"),
      outputContract:
        "Return JSON only: { energy, derivedMood: { valence, arousal, label }, signalProfiles: { energy: { label, summary, considerations, cognitiveNarrative }, mood: { label, summary, considerations, cognitiveNarrative }, valence: { label, summary, considerations, cognitiveNarrative }, arousal: { label, summary, considerations, cognitiveNarrative } }, rationale }",
    },
    llmConfig,
    mockOutput,
    { onStream },
  );
}

export function applyRuntimeSignalEvaluation(
  state: CharacterState,
  stateDelta: StateDelta,
  evaluation: RuntimeSignalEvaluationResult,
): { nextState: CharacterState; stateDelta: StateDelta } {
  const normalized = normalizeRuntimeSignalEvaluation(state, evaluation);
  const energy = round(clamp(normalized.energy, 0, 1));
  const valence = round(clamp(normalized.derivedMood.valence, -1, 1));
  const arousal = round(clamp(normalized.derivedMood.arousal, 0, 1));

  return {
    nextState: {
      ...state,
      runtime: {
        ...state.runtime,
        energy,
        derivedMood: {
          valence,
          arousal,
          label: normalized.derivedMood.label || state.runtime.derivedMood.label,
        },
        signalProfiles: normalized.signalProfiles,
      },
    },
    stateDelta: {
      ...stateDelta,
      runtimeChanges: [
        ...stateDelta.runtimeChanges,
        `runtimeSignalEvaluation -> energy ${energy}, valence ${valence}, arousal ${arousal}`,
        normalized.rationale ? `runtimeSignalEvaluation rationale: ${normalized.rationale}` : "",
      ].filter(Boolean),
    },
  };
}

function normalizeRuntimeSignalEvaluation(state: CharacterState, evaluation: RuntimeSignalEvaluationResult): RuntimeSignalEvaluationResult {
  const fallback = state.runtime.signalProfiles;

  return {
    energy: typeof evaluation.energy === "number" ? evaluation.energy : state.runtime.energy,
    derivedMood: {
      valence: typeof evaluation.derivedMood?.valence === "number" ? evaluation.derivedMood.valence : state.runtime.derivedMood.valence,
      arousal: typeof evaluation.derivedMood?.arousal === "number" ? evaluation.derivedMood.arousal : state.runtime.derivedMood.arousal,
      label: typeof evaluation.derivedMood?.label === "string" ? evaluation.derivedMood.label : state.runtime.derivedMood.label,
    },
    signalProfiles: {
      energy: normalizeRuntimeSignalProfile(evaluation.signalProfiles?.energy, fallback.energy),
      mood: normalizeRuntimeSignalProfile(evaluation.signalProfiles?.mood, fallback.mood),
      valence: normalizeRuntimeSignalProfile(evaluation.signalProfiles?.valence, fallback.valence),
      arousal: normalizeRuntimeSignalProfile(evaluation.signalProfiles?.arousal, fallback.arousal),
    },
    rationale: typeof evaluation.rationale === "string" ? evaluation.rationale : "模型输出已归一化为稳定状态信号结构。",
  };
}

function normalizeRuntimeSignalProfile(
  profile: RuntimeSignalEvaluationResult["signalProfiles"]["energy"] | undefined,
  fallback: RuntimeSignalEvaluationResult["signalProfiles"]["energy"],
) {
  const rawConsiderations = profile?.considerations as unknown;
  const considerations = Array.isArray(rawConsiderations)
    ? rawConsiderations.map(String)
    : typeof rawConsiderations === "string"
      ? rawConsiderations.split(/[；;。\n]/).map((item: string) => item.trim()).filter(Boolean)
      : fallback.considerations;

  return {
    label: typeof profile?.label === "string" ? profile.label : fallback.label,
    summary: typeof profile?.summary === "string" ? profile.summary : fallback.summary,
    considerations,
    cognitiveNarrative: typeof profile?.cognitiveNarrative === "string" ? profile.cognitiveNarrative : fallback.cognitiveNarrative,
  };
}

function buildDeterministicRuntimeSignals(state: CharacterState): RuntimeSignalEvaluationResult {
  return {
    energy: state.runtime.energy,
    derivedMood: { ...state.runtime.derivedMood },
    signalProfiles: { ...state.runtime.signalProfiles },
    rationale: "LLM 未返回信号评估，维持之前的状态。",
  };
}
