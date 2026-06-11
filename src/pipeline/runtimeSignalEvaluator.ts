import {
  CharacterState,
  CognitiveModuleTrace,
  EventInput,
  LlmConfig,
  ReplyOutput,
  RuntimeSignalEvaluationResult,
  StateDelta,
} from "../core/types";
import { clamp, round } from "../core/utils";

export async function evaluateRuntimeSignals(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  context: {
    stateUpdatePlan: { narrative?: string; internalStateNote?: string };
  },
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<RuntimeSignalEvaluationResult>> {
  void llmConfig;
  const output = buildCommittedRuntimeSignals(state, event, replyOutput, context.stateUpdatePlan);
  onStream?.(JSON.stringify(output, null, 2));

  return {
    moduleName: "runtime_signal_evaluation",
    request: {
      moduleName: "runtime_signal_evaluation",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: "本地根据 State Update 已写入的 runtime 派生展示信号，不再进行同步外部 LLM 复判。",
      outputContract: "Local deterministic runtime signal snapshot.",
    },
    output,
    transport: "mock_llm",
  };
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

function buildCommittedRuntimeSignals(
  state: CharacterState,
  event: EventInput,
  replyOutput: ReplyOutput,
  stateUpdatePlan: { narrative?: string; internalStateNote?: string },
): RuntimeSignalEvaluationResult {
  const stateNote = stateUpdatePlan.narrative || stateUpdatePlan.internalStateNote || "状态写回已完成。";
  const speechNote = replyOutput.reply ? `她说出口后，展示信号承接这次状态写回。` : "她选择沉默后，展示信号承接这次状态写回。";
  return {
    narrative: `运行时信号由状态写回本地派生：${state.runtime.derivedMood.label}。`,
    energy: state.runtime.energy,
    derivedMood: { ...state.runtime.derivedMood },
    signalProfiles: { ...state.runtime.signalProfiles },
    rationale: `${event.content} -> ${stateNote} ${speechNote}`,
  };
}
