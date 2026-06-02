import { AppraisalResult, CharacterState, CognitiveModuleTrace, EventInput, LlmConfig, Relationship } from "../core/types";
import { clamp, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function runAppraisal(
  event: EventInput,
  state: CharacterState,
  llmConfig: LlmConfig,
  onStream?: (output: string) => void,
): Promise<CognitiveModuleTrace<AppraisalResult>> {
  const speakerRelationship = event.speakerId ? state.relationships[event.speakerId] : undefined;

  const activatedConcerns = state.concerns
    .filter((concern) => concern.status === "active")
    .map((concern) => {
      const matchedTriggers = concern.triggers.filter((trigger) => event.content.includes(trigger));
      const objectMatched = concern.object ? event.content.includes(concern.object) : false;
      const relationshipBoost = speakerRelationship?.targetName === concern.object ? 0.18 : 0;
      const activationScore = clamp(
        matchedTriggers.length * 0.22 + (objectMatched ? 0.25 : 0) + relationshipBoost + concern.intensity * 0.18,
        0,
        1,
      );

      return {
        concernId: concern.id,
        activationScore: round(activationScore),
        matchedTriggers,
        reason:
          matchedTriggers.length > 0
            ? `命中触发词：${matchedTriggers.join("、")}。`
            : "没有直接触发词，仅保留背景强度。",
      };
    })
    .filter((item) => item.activationScore >= 0.18)
    .sort((a, b) => b.activationScore - a.activationScore);

  const strongest = activatedConcerns[0]?.activationScore ?? 0;
  const relationshipWeight = speakerRelationship ? speakerRelationship.familiarity * 0.12 + speakerRelationship.tension * 0.18 : 0;
  const eventSalience = round(clamp(strongest * 0.72 + relationshipWeight + event.content.length / 300, 0, 1));

  const mockOutput = {
    eventId: event.id,
    speakerRelationship,
    activatedConcerns,
    eventSalience,
    appraisalSummary:
      activatedConcerns.length > 0
        ? `这条事件触发了 ${activatedConcerns.length} 个关切，最高激活度 ${activatedConcerns[0].activationScore}。`
        : "这条事件没有明显触发核心关切，按普通互动处理。",
  };

  const trace = await runCognitiveModule<AppraisalResult>(
    {
      moduleName: "appraisal",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是虚拟人大脑里的事件评估区。你只负责判断这件事触到了角色什么在意的东西。",
        `角色当前心事：${state.concerns.map((concern) => `「${concern.title}」：${concern.description}`).join("；")}`,
        `说话者：${event.speakerName ?? "未知"}。内容：「${event.content}」`,
        "请判断：这件事跟她有没有关系、触到了哪件心事、为什么、强度大概如何。",
      ].join("\n\n"),
      outputContract:
        "Return JSON: { eventId, speakerRelationship, activatedConcerns: [{ concernId, activationScore, matchedTriggers, reason }], eventSalience, appraisalSummary }",
    },
    llmConfig,
    mockOutput,
    { onStream },
  );

  return {
    ...trace,
    output: normalizeAppraisalResult(trace.output, mockOutput, event, state),
  };
}

function normalizeAppraisalResult(
  result: unknown,
  fallback: AppraisalResult,
  event: EventInput,
  state: CharacterState,
): AppraisalResult {
  const rawResult = isRecord(result) ? result : {};
  const knownConcernIds = new Set(state.concerns.map((concern) => concern.id));
  const rawActivatedConcerns = Array.isArray(rawResult.activatedConcerns) ? rawResult.activatedConcerns : [];
  const activatedConcerns = rawActivatedConcerns
    .map((item) => {
      if (!isRecord(item)) return undefined;
      const concernId = typeof item?.concernId === "string" ? item.concernId : "";
      if (!knownConcernIds.has(concernId)) return undefined;
      const matchedTriggers = normalizeStringList(item.matchedTriggers);

      return {
        concernId,
        activationScore: round(clamp(typeof item.activationScore === "number" ? item.activationScore : 0, 0, 1)),
        matchedTriggers,
        reason: typeof item.reason === "string" && item.reason.trim() ? item.reason : "模型未给出明确原因，已保留为低强度触发。",
      };
    })
    .filter((item): item is AppraisalResult["activatedConcerns"][number] => Boolean(item));

  return {
    eventId: event.id,
    speakerRelationship: normalizeSpeakerRelationship(rawResult.speakerRelationship, fallback.speakerRelationship, event, state),
    activatedConcerns: activatedConcerns.length > 0 ? activatedConcerns : fallback.activatedConcerns,
    eventSalience: round(clamp(typeof rawResult.eventSalience === "number" ? rawResult.eventSalience : fallback.eventSalience, 0, 1)),
    appraisalSummary:
      typeof rawResult.appraisalSummary === "string" && rawResult.appraisalSummary.trim()
        ? rawResult.appraisalSummary
        : fallback.appraisalSummary,
  };
}

function normalizeSpeakerRelationship(
  value: unknown,
  fallback: Relationship | undefined,
  event: EventInput,
  state: CharacterState,
) {
  const eventRelationship = event.speakerId ? state.relationships[event.speakerId] : undefined;
  if (!isRecord(value)) return eventRelationship ?? fallback;

  const targetId = typeof value.targetId === "string" && value.targetId.trim() ? value.targetId : event.speakerId;
  if (!targetId) return eventRelationship ?? fallback;
  const existing = state.relationships[targetId];

  return {
    targetId,
    targetName:
      typeof value.targetName === "string" && value.targetName.trim()
        ? value.targetName
        : existing?.targetName ?? event.speakerName ?? targetId,
    familiarity: round(clamp(typeof value.familiarity === "number" ? value.familiarity : existing?.familiarity ?? 0.2, 0, 1)),
    trust: round(clamp(typeof value.trust === "number" ? value.trust : existing?.trust ?? 0.2, 0, 1)),
    affection: round(clamp(typeof value.affection === "number" ? value.affection : existing?.affection ?? 0, -1, 1)),
    tension: round(clamp(typeof value.tension === "number" ? value.tension : existing?.tension ?? 0, 0, 1)),
    lastInteractionAt: typeof value.lastInteractionAt === "string" ? value.lastInteractionAt : existing?.lastInteractionAt,
    recentTone: typeof value.recentTone === "string" && value.recentTone.trim() ? value.recentTone : existing?.recentTone ?? "新关系",
    unresolvedIssues: normalizeStringList(value.unresolvedIssues, existing?.unresolvedIssues ?? []),
    notes: normalizeStringList(value.notes, existing?.notes ?? []),
  };
}

function normalizeStringList(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[；;、,\n]/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
