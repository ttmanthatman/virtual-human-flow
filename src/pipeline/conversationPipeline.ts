import { CharacterState, CognitiveModuleTrace, LlmConfig, MindFlowFrame, PipelineStepProgress, PipelineTrace } from "../core/types";
import { runAppraisal } from "./appraisal";
import { retrieveMemory } from "./memoryRetrieval";
import { decideResponse } from "./responseDecision";
import { runExpressionLlm } from "./llmClient";
import { applyStateUpdates } from "./stateUpdater";
import { applyRuntimeSignalEvaluation, evaluateRuntimeSignals } from "./runtimeSignalEvaluator";
import { advanceSceneForCurrentTime } from "./temporalScene";

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
  const mindFlow: MindFlowFrame[] = [];
  const emitMindFlow = (frame: Omit<MindFlowFrame, "id" | "eventId" | "sequence" | "timestamp">) => {
    const nextFrame: MindFlowFrame = {
      ...frame,
      id: `mind_${event.id}_${mindFlow.length + 1}`,
      eventId: event.id,
      sequence: mindFlow.length + 1,
      timestamp: new Date().toISOString(),
    };
    mindFlow.push(nextFrame);
    emit({
      step: frame.relatedStep,
      status: frame.status,
      output: `${frame.title}：${frame.content}`,
      transport: "local",
      mindFlow: nextFrame,
    });
  };

  emit({ step: "event", status: "completed", input: summarizeText(content), output: `${speaker.name}说：「${content}」`, transport: "local" });

  const { nextState: sceneAwareState, progression: sceneContext } = advanceSceneForCurrentTime(state, event);
  emit({
    step: "sceneContext",
    status: "completed",
    input: "当前人物、原场景、物理位置和当地真实时间",
    output: formatSceneContext(sceneContext),
    transport: "local",
  });
  emitMindFlow({
    phase: "pre_speech",
    kind: "scene",
    relatedStep: "sceneContext",
    status: "completed",
    title: "场景先动了一下",
    content: summarizeText(formatSceneMindFlow(sceneContext), 220),
  });

  emit({ step: "appraisal", status: "running", input: "事件评估模块输入\n\n" + summarizeText(event.content), output: "等待模型输出..." });
  const appraisal = await runAppraisal(event, sceneAwareState, llmConfig, (output) =>
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
  emitMindFlow({
    phase: "pre_speech",
    kind: "internal_state",
    relatedStep: "appraisal",
    status: "completed",
    title: "心里先有了判断",
    content: summarizeText(formatAppraisalMindFlow(appraisal.output), 260),
  });

  emit({
    step: "memoryRecall",
    status: "running",
    input: "记忆召回模块输入\n\n情境：" + summarizeText(appraisalNarrative),
    output: "等待模型输出...",
  });
  const memoryRecall = await retrieveMemory(event, appraisalNarrative, sceneAwareState, llmConfig, (output) =>
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
  emitMindFlow({
    phase: "pre_speech",
    kind: memoryNarrative.includes("关系") ? "relationship" : "memory",
    relatedStep: "memoryRecall",
    status: "completed",
    title: "记忆和关系浮上来",
    content: summarizeText(memoryNarrative || "没有特别强的记忆浮上来，她更多是在观察当前这句话。", 260),
  });

  emit({ step: "decision", status: "running", input: "回应决策模块输入\n\n" + summarizeText([appraisalNarrative, memoryNarrative].filter(Boolean).join("\n")), output: "等待模型输出..." });
  const decision = await decideResponse(event, appraisal.output, memoryNarrative, sceneAwareState, llmConfig, (output) =>
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
  emitMindFlow({
    phase: "pre_speech",
    kind: "action",
    relatedStep: "decision",
    status: "completed",
    title: "话到嘴边之前",
    content: summarizeText(formatDecisionMindFlow(decision.output), 260),
  });

  const expressionInputSummary = [event.content, appraisalNarrative, memoryNarrative, decisionNarrative].join("\n");
  emit({
    step: "llmRequest",
    status: "completed",
    input: "表达模块整合输入\n\n" + summarizeText(expressionInputSummary),
    output: "表达模块会把前序自然语言评估整合成给 Reply LLM 的不失真上下文。",
    transport: "local",
  });

  emit({ step: "llmOutput", status: "running", input: summarizeText(expressionInputSummary), output: "等待表达模块生成角色回复..." });
  const expression = await runExpressionLlm(
    {
      event,
      state: sceneAwareState,
      appraisalNarrative,
      memoryRecallNarrative: memoryNarrative,
      decisionNarrative,
      decision: decision.output,
    },
    llmConfig,
    (output) =>
    emit({ step: "llmOutput", status: "streaming", output: summarizeText(output) }),
  );
  const llmRequest = expression.request;
  const llmOutput = expression.output;
  emit({
    step: "llmOutput",
    status: "completed",
    output: llmOutput.reply || "（林安看见了，但没有回复。）",
    transport: "external_llm",
    replyOutput: llmOutput,
  });

  emit({
    step: "stateUpdate",
    status: "running",
    input: "状态更新模块输入\n\n" + summarizeText([event.content, llmOutput.reply || "她选择了沉默", appraisalNarrative, memoryNarrative, decisionNarrative].join("\n")),
    output: "等待模型输出...",
  });
  const { nextState: stateAfterUpdate, stateDelta: deltaAfterUpdate, stateUpdate } = await applyStateUpdates(
    sceneAwareState,
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
  emitMindFlow({
    phase: "post_speech",
    kind: "internal_state",
    relatedStep: "stateUpdate",
    status: "completed",
    title: "说完以后还在变化",
    content: summarizeText(formatStateUpdateMindFlow(stateUpdate.output), 260),
  });

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
      stateUpdatePlan: stateUpdate.output,
    },
    llmConfig,
    (output) => emit({ step: "runtimeSignalEvaluation", status: "streaming", output: summarizeText(output) }),
  );
  emit({ step: "runtimeSignalEvaluation", status: "completed", output: formatCognitiveTraceOutput(runtimeSignalEvaluation), transport: runtimeSignalEvaluation.transport });
  emitMindFlow({
    phase: "post_speech",
    kind: "internal_state",
    relatedStep: "runtimeSignalEvaluation",
    status: "completed",
    title: "身体和情绪重新落点",
    content: summarizeText(formatRuntimeSignalMindFlow(runtimeSignalEvaluation.output), 260),
  });
  const { nextState, stateDelta } = applyRuntimeSignalEvaluation(stateAfterUpdate, deltaAfterUpdate, runtimeSignalEvaluation.output);
  const finalStateDelta = {
    ...stateDelta,
    runtimeChanges: [
      ...stateDelta.runtimeChanges,
      `场景推进：${sceneContext.reason}；${sceneContext.locationPlausibility}`,
    ],
  };
  emit({ step: "stateDelta", status: "completed", input: "确定性写回输入\n\n状态更新、信号评估和场景推进已完成", output: formatStateDelta(finalStateDelta), transport: "local" });
  emitMindFlow({
    phase: "post_speech",
    kind: (llmOutput.segments?.length ?? 0) > 1 ? "speech" : "settle",
    relatedStep: "stateDelta",
    status: "completed",
    title: (llmOutput.segments?.length ?? 0) > 1 ? "还有后半句话往外冒" : "余波暂时收住",
    content:
      (llmOutput.segments?.length ?? 0) > 1
        ? "她说完第一句后，心理余波还在推着后面的短句继续出来。"
        : "她说完后仍有余波，但这一轮没有形成第二句能说出口的话。",
  });

  return {
    nextState,
    trace: {
      event,
      sceneContext,
      mindFlow,
      appraisal,
      memoryRecall,
      decision,
      llmRequest,
      llmOutput,
      stateUpdate,
      runtimeSignalEvaluation,
      stateDelta: finalStateDelta,
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

function formatSceneContext(sceneContext: PipelineTrace["sceneContext"]) {
  return [
    `当地时间：${sceneContext.localTimeLabel}（${sceneContext.timezone}）`,
    `生活阶段：${sceneContext.schedulePhase}`,
    `场景：${sceneContext.previousSceneTitle ?? "未记录"} -> ${sceneContext.nextSceneTitle ?? "未记录"}`,
    `原因：${sceneContext.reason}`,
    `地理约束：${sceneContext.locationPlausibility}`,
  ].join("\n");
}

function formatSceneMindFlow(sceneContext: PipelineTrace["sceneContext"]) {
  const transition =
    sceneContext.previousSceneTitle && sceneContext.nextSceneTitle && sceneContext.previousSceneTitle !== sceneContext.nextSceneTitle
      ? `${sceneContext.previousSceneTitle} 转到 ${sceneContext.nextSceneTitle}`
      : sceneContext.nextSceneTitle || sceneContext.previousSceneTitle || "现场暂时不变";
  return `${sceneContext.localTimeLabel}，${transition}。${sceneContext.reason}`;
}

function formatAppraisalMindFlow(appraisal: PipelineTrace["appraisal"]["output"]) {
  const danger = appraisal.dangerState.isInDanger ? `危险感 ${appraisal.dangerState.level.toFixed(2)}` : "没有直接危险";
  const composure = appraisal.composureRisk.shouldLoseComposure ? `失态风险 ${appraisal.composureRisk.level.toFixed(2)}` : "还能压住外壳";
  return [appraisal.narrative || appraisal.appraisalSummary, danger, composure].filter(Boolean).join(" ");
}

function formatDecisionMindFlow(decision: PipelineTrace["decision"]["output"]) {
  const rhythm =
    decision.replyRhythm === "none"
      ? "话没有形成出口。"
      : decision.replyRhythm === "single"
        ? "会先压成一句能说出口的话。"
        : decision.replyRhythm === "multi_turn"
          ? "第一句后面还可能继续补出来。"
          : "短句会先冲出来。";
  return [decision.narrative || decision.rationale, rhythm].filter(Boolean).join(" ");
}

function formatStateUpdateMindFlow(stateUpdate: PipelineTrace["stateUpdate"]["output"]) {
  const relationship = stateUpdate.userRelationshipMemory?.relationshipSummary ? `关系里留下：${stateUpdate.userRelationshipMemory.relationshipSummary}` : "";
  return [stateUpdate.narrative || stateUpdate.internalStateNote, relationship].filter(Boolean).join(" ");
}

function formatRuntimeSignalMindFlow(runtimeSignal: PipelineTrace["runtimeSignalEvaluation"]["output"]) {
  const mood = runtimeSignal.derivedMood?.label ? `情绪落在「${runtimeSignal.derivedMood.label}」` : "";
  const energy = typeof runtimeSignal.energy === "number" ? `能量 ${runtimeSignal.energy.toFixed(2)}` : "";
  return [runtimeSignal.narrative || runtimeSignal.rationale, mood, energy].filter(Boolean).join(" ");
}

function formatStateDelta(stateDelta: PipelineTrace["stateDelta"]) {
  return [
    ...stateDelta.concernChanges.map((change) => "心事：" + change),
    ...stateDelta.relationshipChanges.map((change) => "关系：" + change),
    ...stateDelta.memoryWrites.map((change) => "记忆：" + change),
    ...stateDelta.runtimeChanges.map((change) => "信号：" + change),
  ].join("\n") || "没有明显变化。";
}
