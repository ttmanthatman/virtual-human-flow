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
  const mockOutput = buildDeterministicRuntimeSignals(state, context.stateUpdatePlan);

  return runCognitiveModule<RuntimeSignalEvaluationResult>(
    {
      moduleName: "runtime_signal_evaluation",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的运行时信号评估区。你不写台词，也不直接决定角色怎么回复。",
        "你的任务是根据本轮事件、记忆、决策和状态写回结果，评估给人观察用的能量、情绪、情绪倾向和唤醒度。",
        `角色：${state.profile.name}。背景：${state.profile.background}`,
        `事件：${event.speakerName ?? "对方"}说「${event.content}」`,
        `她说出口的话：${replyOutput.reply || "她选择了沉默"}`,
        `事件评估：${context.appraisal.appraisalSummary}`,
        `记忆召回：${context.memoryRecall.longTermMemories.map((memory) => memory.summary).join("；") || "没有特别强的记忆"}`,
        `回应决策：${context.decision.rationale}`,
        `状态写回：${context.stateUpdatePlan.internalStateNote || "没有明显内心余波"}`,
        `当前关切：${state.concerns.map((concern) => `${concern.title}，强度 ${concern.intensity}，情绪倾向 ${concern.valence}，唤醒度 ${concern.arousal}`).join("；")}`,
        "请输出这四个信号的数值和自然语言说明。数值范围：energy 0 到 1；valence -1 到 1；arousal 0 到 1。说明只能描述内部状态、成因、身体感、关系距离和注意力落点，不能写成回复指令。",
      ].join("\n\n"),
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

function buildDeterministicRuntimeSignals(state: CharacterState, stateUpdatePlan: StateUpdatePlan): RuntimeSignalEvaluationResult {
  const concernPressure = state.concerns.reduce((sum, concern) => sum + concern.intensity * Math.max(0, -concern.valence), 0) / Math.max(state.concerns.length, 1);
  const arousalPressure = state.concerns.reduce((sum, concern) => sum + concern.intensity * concern.arousal, 0) / Math.max(state.concerns.length, 1);
  const changedConcernIds = new Set(stateUpdatePlan.concernUpdates.map((update) => update.concernId));
  const changedConcernTitles = state.concerns.filter((concern) => changedConcernIds.has(concern.id)).map((concern) => concern.title);

  const energy = round(clamp(state.runtime.energy - concernPressure * 0.08 + (stateUpdatePlan.relationshipUpdates.length > 0 ? 0.01 : 0), 0, 1));
  const valence = round(clamp(state.runtime.derivedMood.valence - concernPressure * 0.12, -1, 1));
  const arousal = round(clamp(arousalPressure, 0, 1));
  const changedText = changedConcernTitles.length > 0 ? changedConcernTitles.join("、") : "本轮互动";

  return {
    energy,
    derivedMood: {
      valence,
      arousal,
      label: valence < -0.25 ? "被旧事牵动，语气更轻" : valence > 0.25 ? "稍微放松" : "平稳克制",
    },
    signalProfiles: {
      energy: {
        label: energy < 0.45 ? "能量被明显占用" : "能回应，但保留余量",
        summary: "本轮互动之后，她仍有回应余力，但心理预算会先分给维持体面和保护边界。",
        considerations: [`${changedText}占用了一部分注意力`, "工作和旧关系仍在后台消耗", "普通善意能让她短暂调动礼貌"],
        cognitiveNarrative: "能量变化来自心事占用、关系安全感和刚刚说出口后的余波，而不是单独的台词风格控制。",
      },
      mood: {
        label: valence < -0.25 ? "被旧事牵动，语气更轻" : valence > 0.25 ? "稍微放松" : "平稳克制",
        summary: "她表层仍然克制，底下的波动取决于刚才触到的具体心事。",
        considerations: [`${changedText}仍在心里留有余波`, "关系距离会影响她愿意显露多少", "场景会放大停顿和内收感"],
        cognitiveNarrative: "情绪不是一个全局开关，而是由事件评估、记忆浮现、关系对象和状态写回共同形成。",
      },
      valence: {
        label: valence < -0.25 ? "局部偏负面" : valence > 0.25 ? "局部缓和" : "接近中性",
        summary: "她对当前生活不是全面低落，而是某些对象和话题会把感受拉低。",
        considerations: ["前任相关内容更容易引发负面余波", "当前对话者的普通闲聊不会自动让她低沉", "若出现明确善意，她可以短暂缓和"],
        cognitiveNarrative: "负面感受主要依附在前任、未完成约定和失去感上，普通善意互动仍可能让她短暂缓和。",
      },
      arousal: {
        label: arousal > 0.45 ? "内在被牵动，外表压低" : "外表平稳，内部观察",
        summary: "她心里有波动，但外在表达会压低音量和长度。",
        considerations: ["被旧事戳中时会先出现身体收紧", "越亲近的人越可能看到真实波动", "半熟的人只会看到短暂停顿"],
        cognitiveNarrative: "话题命中旧关系时，心跳和注意力会先起波动，外在仍维持低音量和短停顿。",
      },
    },
    rationale: "模拟模式下用关切强度、情绪倾向、唤醒度和本轮状态写回生成观察信号。",
  };
}
