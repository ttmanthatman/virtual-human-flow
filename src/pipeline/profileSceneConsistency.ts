import { CharacterState, LlmConfig, ProfileSceneConsistencyResult } from "../core/types";
import { clamp, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

export async function evaluateProfileSceneConsistency(
  state: CharacterState,
  llmConfig: LlmConfig,
): Promise<ProfileSceneConsistencyResult> {
  const fallback = buildFallbackConsistencyResult(state);
  const trace = await runCognitiveModule<ProfileSceneConsistencyResult>(
    {
      moduleName: "profile_scene_consistency",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是人物档案和场景一致性检测模块。你不写角色台词，只判断人物档案与场景是否能在同一世界观、时代、技术水平和社会语境下成立。",
        "如果人物档案明显属于现代现实，而场景属于古代、仙侠、赛博、太空、末世或其他不连续时空，判为 hard_mismatch。",
        "如果只是氛围不同但能解释成创作、戏剧、梦境、拍摄、角色扮演或清楚的架空设定，可以判为 soft_mismatch 或 compatible。",
        "如果存在 hard_mismatch，requiresDistortionPassword 必须为 true。否则为 false。",
        `人物姓名：${state.profile.name}`,
        `人物展示摘要：${state.profile.displaySummary}`,
        `人物背景：${state.profile.background}`,
        `人物性格摘要：${state.profile.personalitySummary}`,
        `场景标题：${state.scene?.title ?? "无场景"}`,
        `场景描述：${state.scene?.description ?? "无场景描述"}`,
        `场景氛围：${state.scene?.atmosphere ?? "无场景氛围"}`,
        `场景认知叙述：${state.scene?.cognitiveNarrative ?? "无场景叙述"}`,
      ].join("\n\n"),
      outputContract:
        "Return JSON: { compatible: boolean, confidence: number, severity: 'none' | 'soft_mismatch' | 'hard_mismatch', summary: string, mismatchReasons: string[], requiresDistortionPassword: boolean }",
    },
    llmConfig,
    fallback,
  );

  return normalizeProfileSceneConsistency(trace.output, fallback);
}

function normalizeProfileSceneConsistency(
  result: ProfileSceneConsistencyResult,
  fallback: ProfileSceneConsistencyResult,
): ProfileSceneConsistencyResult {
  const severity = result.severity === "hard_mismatch" || result.severity === "soft_mismatch" || result.severity === "none" ? result.severity : fallback.severity;
  const requiresDistortionPassword = severity === "hard_mismatch" || Boolean(result.requiresDistortionPassword);

  return {
    compatible: severity === "hard_mismatch" ? false : Boolean(result.compatible ?? fallback.compatible),
    confidence: round(clamp(Number(result.confidence) || fallback.confidence, 0, 1)),
    severity,
    summary: compactText(result.summary, fallback.summary, 90),
    mismatchReasons: normalizeStringList(result.mismatchReasons, fallback.mismatchReasons, 4, 46),
    requiresDistortionPassword,
  };
}

function buildFallbackConsistencyResult(state: CharacterState): ProfileSceneConsistencyResult {
  const profileText = [state.profile.displaySummary, state.profile.background, state.profile.personalitySummary].join(" ");
  const sceneText = [state.scene?.title, state.scene?.description, state.scene?.atmosphere, state.scene?.cognitiveNarrative].filter(Boolean).join(" ");
  const profileModern = /现代|自由|插画|摄影|手机|电脑|项目|甲方|咖啡|城市|邮件/.test(profileText);
  const sceneNonModern = /古代|皇宫|江湖|仙侠|修真|王朝|剑客|太空|星舰|赛博|末世|中世纪/.test(sceneText);
  const hardMismatch = profileModern && sceneNonModern;

  return {
    compatible: !hardMismatch,
    confidence: hardMismatch ? 0.72 : 0.55,
    severity: hardMismatch ? "hard_mismatch" : "none",
    summary: hardMismatch ? "人物档案与场景存在明显时代或世界观断裂。" : "人物档案与场景没有明显硬冲突。",
    mismatchReasons: hardMismatch ? ["现代人物档案与非现代场景并置", "缺少梦境、拍摄或架空设定解释"] : [],
    requiresDistortionPassword: hardMismatch,
  };
}

function compactText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function normalizeStringList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
  const items = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? compactText(item, "", maxLength) : "")).filter(Boolean)
    : [];
  return items.length > 0 ? Array.from(new Set(items)).slice(0, maxItems) : fallback;
}
