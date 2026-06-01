import { CharacterState, LlmConfig, PipelineTrace } from "../core/types";
import { runAppraisal } from "./appraisal";
import { retrieveMemory } from "./memoryRetrieval";
import { decideResponse } from "./responseDecision";
import { generateNaturalPromptRequest } from "./promptBuilder";
import { runLlm } from "./llmClient";
import { applyStateUpdates } from "./stateUpdater";

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
    speakerName: "B",
    roomId: "main_room",
    content,
  };

  const appraisal = runAppraisal(event, state);
  const memoryRecall = retrieveMemory(event, appraisal, state);
  const decision = decideResponse(appraisal, state);
  const llmRequest = generateNaturalPromptRequest(event, state, appraisal, memoryRecall, decision, llmConfig.provider, llmConfig.model);
  const llmOutput = await runLlm(llmRequest, llmConfig, { event, state, decision });
  const { nextState, stateDelta } = applyStateUpdates(state, event, llmOutput);

  return {
    nextState,
    trace: {
      event,
      appraisal,
      memoryRecall,
      decision,
      llmRequest,
      llmOutput,
      stateDelta,
    },
  };
}
