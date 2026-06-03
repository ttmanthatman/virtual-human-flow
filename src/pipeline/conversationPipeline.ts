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
  onProgress?: (progress: PipelineStepProgress) => void;
}

export async function runConversationPipeline({ content, state, llmConfig, onProgress }: RunConversationPipelineInput): Promise<{
  nextState: CharacterState;
  trace: PipelineTrace;
}> {
  const emit = (progress: PipelineStepProgress) => onProgress?.(progress);
  const event = {
    id: `event_${Date.now()}`,
    type: "user_message" as const,
    timestamp: new Date().toISOString(),
    speakerId: "user_b",
    speakerName: "当前对话者",
    roomId: "main_room",
    content,
  };

  emit({ step: "event", status: "completed", input: content, output: JSON.stringify(event, null, 2), transport: "local" });

  emit({ step: "appraisal", status: "running", input: "事件评估模块输入\n\n" + JSON.stringify({ event, concerns: state.concerns, relationships: state.relationships }, null, 2), output: "等待模型输出..." });
  const appraisal = await runAppraisal(event, state, llmConfig, (output) =>
    emit({ step: "appraisal", status: "streaming", output }),
  );
  emit({ step: "appraisal", status: "completed", output: formatCognitiveTraceOutput(appraisal), transport: appraisal.transport });

  emit({
    step: "memoryRecall",
    status: "running",
    input:
      "记忆召回模块输入\n\n" +
      JSON.stringify(
        {
          event,
          appraisal: appraisal.output,
          shortTermMemory: state.shortTermMemory.slice(-8),
          longTermMemory: state.longTermMemory,
          runtime: state.runtime,
        },
        null,
        2,
      ),
    output: "等待模型输出...",
  });
  const memoryRecall = await retrieveMemory(event, appraisal.output, state, llmConfig, (output) =>
    emit({ step: "memoryRecall", status: "streaming", output }),
  );
  emit({ step: "memoryRecall", status: "completed", output: formatCognitiveTraceOutput(memoryRecall), transport: memoryRecall.transport });

  emit({ step: "decision", status: "running", input: "回应决策模块输入\n\n" + JSON.stringify({ appraisal: appraisal.output, memoryRecall: memoryRecall.output, runtime: state.runtime }, null, 2), output: "等待模型输出..." });
  const decision = await decideResponse(appraisal.output, memoryRecall.output, state, llmConfig, (output) =>
    emit({ step: "decision", status: "streaming", output }),
  );
  emit({ step: "decision", status: "completed", output: formatCognitiveTraceOutput(decision), transport: decision.transport });

  const llmRequest = generateNaturalPromptRequest(event, state, appraisal.output, memoryRecall.output, decision.output, llmConfig.provider, llmConfig.model);
  emit({ step: "llmRequest", status: "completed", input: "Prompt Generator 输入\n\n" + JSON.stringify({ event, appraisal: appraisal.output, memoryRecall: memoryRecall.output, decision: decision.output }, null, 2), output: llmRequest.prompt, transport: "local" });

  emit({ step: "llmOutput", status: "running", input: llmRequest.prompt, output: "等待角色回复..." });
  const llmOutput = await runLlm(llmRequest, llmConfig, { event, state, decision: decision.output }, (output) =>
    emit({ step: "llmOutput", status: "streaming", output }),
  );
  emit({ step: "llmOutput", status: "completed", output: llmOutput.reply || "（林安看见了，但没有回复。）", transport: "external_llm" });

  emit({ step: "stateUpdate", status: "running", input: "状态更新模块输入\n\n" + JSON.stringify({ event, replyOutput: llmOutput, appraisal: appraisal.output, memoryRecall: memoryRecall.output, decision: decision.output }, null, 2), output: "等待模型输出..." });
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
    (output) => emit({ step: "stateUpdate", status: "streaming", output }),
  );
  emit({ step: "stateUpdate", status: "completed", output: formatCognitiveTraceOutput(stateUpdate), transport: stateUpdate.transport });

  emit({ step: "runtimeSignalEvaluation", status: "running", input: "信号评估模块输入\n\n" + JSON.stringify({ event, replyOutput: llmOutput, stateUpdatePlan: stateUpdate.output, runtime: stateAfterUpdate.runtime }, null, 2), output: "等待模型输出..." });
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
    (output) => emit({ step: "runtimeSignalEvaluation", status: "streaming", output }),
  );
  emit({ step: "runtimeSignalEvaluation", status: "completed", output: formatCognitiveTraceOutput(runtimeSignalEvaluation), transport: runtimeSignalEvaluation.transport });
  const { nextState, stateDelta } = applyRuntimeSignalEvaluation(stateAfterUpdate, deltaAfterUpdate, runtimeSignalEvaluation.output);
  emit({ step: "stateDelta", status: "completed", input: "确定性写回输入\n\n" + JSON.stringify({ stateAfterUpdate, runtimeSignalEvaluation: runtimeSignalEvaluation.output }, null, 2), output: JSON.stringify(stateDelta, null, 2), transport: "local" });

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

function formatCognitiveTraceOutput(trace: CognitiveModuleTrace<unknown>) {
  return JSON.stringify(trace.fallbackReason ? { fallbackReason: trace.fallbackReason, output: trace.output } : trace.output, null, 2);
}
