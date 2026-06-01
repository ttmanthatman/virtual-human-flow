import { CognitiveModuleRequest, CognitiveModuleTrace, LlmConfig } from "../core/types";

export async function runCognitiveModule<TOutput>(
  request: CognitiveModuleRequest,
  config: LlmConfig,
  mockOutput: TOutput,
): Promise<CognitiveModuleTrace<TOutput>> {
  if (config.provider === "external" && config.endpoint.trim()) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        moduleName: request.moduleName,
        inputMode: request.inputMode,
        outputMode: request.outputMode,
        prompt: request.prompt,
        outputContract: request.outputContract,
      }),
    });

    if (!response.ok) {
      throw new Error(`${request.moduleName} module failed: ${response.status}`);
    }

    return {
      moduleName: request.moduleName,
      request,
      output: (await response.json()) as TOutput,
      transport: "external_llm",
    };
  }

  return {
    moduleName: request.moduleName,
    request,
    output: mockOutput,
    transport: "mock_llm",
  };
}
