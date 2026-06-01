import { CharacterState, LlmConfig, PipelineTrace } from "../core/types";
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
}

export async function runConversationPipeline({ content, state, llmConfig }: RunConversationPipelineInput): Promise<{
  nextState: CharacterState;
  trace: PipelineTrace;
}> {
  const event = {
    id: `event_${Date.now()}`,
    type: "user_message" as const,
    timestamp: new Date().toISOString(),
    speakerId: "user_b",
    speakerName: "当前对话者",
    roomId: "main_room",
    content,
  };

  const appraisal = await runAppraisal(event, state, llmConfig);
  const memoryRecall = await retrieveMemory(event, appraisal.output, state, llmConfig);
  const decision = await decideResponse(appraisal.output, memoryRecall.output, state, llmConfig);
  const llmRequest = generateNaturalPromptRequest(event, state, appraisal.output, memoryRecall.output, decision.output, llmConfig.provider, llmConfig.model);
  const llmOutput = await runLlm(llmRequest, llmConfig, { event, state, decision: decision.output });
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
  );
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
  );
  const { nextState, stateDelta } = applyRuntimeSignalEvaluation(stateAfterUpdate, deltaAfterUpdate, runtimeSignalEvaluation.output);

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
