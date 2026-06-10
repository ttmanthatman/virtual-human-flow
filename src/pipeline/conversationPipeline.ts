import { CharacterState, CognitiveModuleTrace, LlmConfig, PipelineStepProgress, PipelineTrace } from "../core/types";
import { runAppraisal } from "./appraisal";
import { retrieveMemory } from "./memoryRetrieval";
import { decideResponse } from "./responseDecision";
import { generateNaturalPromptRequest } from "./promptBuilder";
import { runLlm } from "./llmClient";
import { applyStateUpdates } from "./stateUpdater";
import { applyRuntimeSignalEvaluation, evaluateRuntimeSignals } from "./runtimeSignalEvaluator";

interface RunConversationPipelineInput {
  content: string;
  state: CharacterState;
  llmConfig: LlmConfig;
  speaker: {
    id: string;
    name: string;
  };
  onProgress?: (progress: PipelineStepProgress) => void;
}

export async function runConversationPipeline({ content, state, llmConfig, speaker, onProgress }: RunConversationPipelineInput): Promise<{
  nextState: CharacterState;
  trace: PipelineTrace;
}> {
  const emit = (progress: PipelineStepProgress) => onProgress?.(progress);
  const event = {
    id: `event_${Date.now()}`,
    type: "user_message" as const,
    timestamp: new Date().toISOString(),
    speakerId: speaker.id,
    speakerName: speaker.name,
    roomId: "main_room",
    content,
  };

  emit({ step: "event", status: "completed", input: summarizeText(content), output: `${speaker.name}说：「${content}」`, transport: "local" });

  emit({ step: "appraisal", status: "running", input: "事件评估模块输入\n\n" + summarizeText(event.content), output: "等待模型输出..." });
  const appraisal = await runAppraisal(event, state, llmConfig, (output) =>
    emit({ step: "appraisal", status: "streaming", output: summarizeText(output) }),
  );
  const appraisalNarrative = appraisal.output.narrative || "";
  emit({
    step: "appraisal",
    status: "completed",
    input: "事件评估模块输入\n\n" + summarizeText(event.content),
    output: appraisalNarrative,
    transport: appraisal.transport,
  });

  emit({
    step: "memoryRecall",
    status: "running",
    input: "记忆召回模块输入\n\n情境：" + summarizeText(appraisalNarrative),
    output: "等待模型输出...",
  });
  const memoryRecall = await retrieveMemory(event, appraisalNarrative, state, llmConfig, (output) =>
    emit({ step: "memoryRecall", status: "streaming", output: summarizeText(output) }),
  );
  const memoryNarrative = memoryRecall.output.narrative || "";
  emit({
    step: "memoryRecall",
    status: "completed",
    input: "记忆召回模块输入\n\n情境：" + summarizeText(appraisalNarrative, 200),
    output: memoryNarrative,
    transport: memoryRecall.transport,
  });

  emit({ step: "decision", status: "running", input: "回应决策模块输入\n\n" + summarizeText([appraisalNarrative, memoryNarrative].filter(Boolean).join("\n")), output: "等待模型输出..." });
  const decision = await decideResponse(event, appraisal.output, memoryNarrative, state, llmConfig, (output) =>
    emit({ step: "decision", status: "streaming", output: summarizeText(output) }),
  );
  const decisionNarrative = formatDecisionNarrative(decision.output);
  emit({
    step: "decision",
    status: "completed",
    input: "回应决策模块输入\n\n" + summarizeText([appraisalNarrative, memoryNarrative].filter(Boolean).join("\n")),
    output: decisionNarrative,
    transport: decision.transport,
  });

  const llmRequest = generateNaturalPromptRequest(
    event,
    state,
    appraisalNarrative,
    memoryNarrative,
    decisionNarrative,
    llmConfig.provider,
    llmConfig.model,
  );
  emit({
    step: "llmRequest",
    status: "completed",
    input: "Prompt Generator 输入\n\n" + summarizeText([event.content, appraisalNarrative, memoryNarrative, decisionNarrative].join("\n")),
    output: summarizeText(llmRequest.prompt),
    transport: "local",
  });

  emit({ step: "llmOutput", status: "running", input: summarizeText(llmRequest.prompt), output: "等待角色回复..." });
  const llmOutput = await runLlm(llmRequest, llmConfig, { event, state, decision: decision.output }, (output) =>
    emit({ step: "llmOutput", status: "streaming", output: summarizeText(output) }),
  );
  emit({ step: "llmOutput", status: "completed", output: llmOutput.reply || "（林安看见了，但没有回复。）", transport: "external_llm" });

  emit({
    step: "stateUpdate",
    status: "running",
    input: "状态更新模块输入\n\n" + summarizeText([event.content, llmOutput.reply || "她选择了沉默", appraisalNarrative, memoryNarrative, decisionNarrative].join("\n")),
    output: "等待模型输出...",
  });
  const { nextState: stateAfterUpdate, stateDelta: deltaAfterUpdate, stateUpdate } = await applyStateUpdates(
    state,
    event,
    llmOutput,
    {
      appraisal: appraisal.output,
      memoryRecall: memoryRecall.output,
      decision: decision.output,
    },
    llmConfig,
    (output) => emit({ step: "stateUpdate", status: "streaming", output: summarizeText(output) }),
  );
  emit({ step: "stateUpdate", status: "completed", output: formatCognitiveTraceOutput(stateUpdate), transport: stateUpdate.transport });

  emit({
    step: "runtimeSignalEvaluation",
    status: "running",
    input: "信号评估模块输入\n\n" + summarizeText([appraisalNarrative, memoryNarrative, decisionNarrative, stateUpdate.output.narrative || stateUpdate.output.internalStateNote, llmOutput.reply || "她选择了沉默"].join("\n")),
    output: "等待模型输出...",
  });
  const runtimeSignalEvaluation = await evaluateRuntimeSignals(
    stateAfterUpdate,
    event,
    llmOutput,
    {
      appraisal: appraisal.output,
      memoryRecall: memoryRecall.output,
      decision: decision.output,
      stateUpdatePlan: stateUpdate.output,
    },
    llmConfig,
    (output) => emit({ step: "runtimeSignalEvaluation", status: "streaming", output: summarizeText(output) }),
  );
  emit({ step: "runtimeSignalEvaluation", status: "completed", output: formatCognitiveTraceOutput(runtimeSignalEvaluation), transport: runtimeSignalEvaluation.transport });
  const { nextState, stateDelta } = applyRuntimeSignalEvaluation(stateAfterUpdate, deltaAfterUpdate, runtimeSignalEvaluation.output);
  emit({ step: "stateDelta", status: "completed", input: "确定性写回输入\n\n状态更新和信号评估已完成", output: formatStateDelta(stateDelta), transport: "local" });

  return {
    nextState,
    trace: {
      event,
      appraisal,
      memoryRecall,
      decision,
      llmRequest,
      llmOutput,
      stateUpdate,
      runtimeSignalEvaluation,
      stateDelta,
    },
  };
}

function formatCognitiveTraceOutput(trace: CognitiveModuleTrace<any>) {
  if (trace.output && typeof trace.output.narrative === "string" && trace.output.narrative.trim()) {
    return trace.output.narrative;
  }
  if (trace.fallbackReason) {
    return "[fallback] " + trace.fallbackReason;
  }
  return JSON.stringify(trace.output, null, 2);
}

function summarizeText(value: string, maxLength = 300) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1) + "…";
}

function formatDecisionNarrative(decision: PipelineTrace["decision"]["output"]) {
  const rhythmNarrative =
    decision.replyRhythm === "none"
      ? "她倾向于不回应。"
      : decision.replyRhythm === "single"
        ? "如果开口，适合单条、相对完整而克制地回应。"
        : decision.replyRhythm === "multi_turn"
          ? "如果开口，她可能会连续发出几条话，像是解释、追问或补充压不住。"
          : "如果开口，她更像是短句爆发，话会先冲出来。";
  const composureNarrative = decision.shouldLoseComposure ? "她这次可能会失态，语气和节奏会偏离平常的稳定外壳。" : "她大体还能维持平常的表达外壳。";
  const personaNarrative = decision.shouldBreakPersona ? "她可能短暂突破平常维持的人设外壳，露出更底层、更真实、更失控的反应。" : "不需要突破平常人设外壳。";

  return [decision.narrative || decision.rationale, rhythmNarrative, composureNarrative, personaNarrative].filter(Boolean).join("\n");
}

function formatStateDelta(stateDelta: PipelineTrace["stateDelta"]) {
  return [
    ...stateDelta.concernChanges.map((change) => "心事：" + change),
    ...stateDelta.relationshipChanges.map((change) => "关系：" + change),
    ...stateDelta.memoryWrites.map((change) => "记忆：" + change),
    ...stateDelta.runtimeChanges.map((change) => "信号：" + change),
  ].join("\n") || "没有明显变化。";
}
