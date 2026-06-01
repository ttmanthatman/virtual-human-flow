import {
  CharacterProfile,
  CharacterState,
  Concern,
  LlmConfig,
  LongTermMemory,
  PersonalityFacet,
  RuntimeSignalKey,
  RuntimeSignalProfile,
  SceneState,
} from "../core/types";
import { clamp, makeId, nowIso, round } from "../core/utils";
import { runCognitiveModule } from "./cognitiveModuleClient";

interface GeneratedConcern {
  title: string;
  object?: string;
  type: string;
  description: string;
  intensity: number;
  valence: number;
  arousal: number;
  triggers: string[];
  possibleResolutions: string[];
}

interface GeneratedMemory {
  summary: string;
  relatedPeople: string[];
  relatedConcernTitles?: string[];
  emotionalValence: number;
  emotionalIntensity: number;
  importance: number;
}

interface DossierInterpretationResult {
  name: string;
  age?: number;
  displaySummary: string;
  stableBackground: string;
  personalityTraits: string[];
  personalitySummary: string;
  personalityFacets: PersonalityFacet[];
  speakingStyle: string;
  values: string[];
  boundaries: string[];
  examples: { situation: string; expectedReply: string }[];
  concerns: GeneratedConcern[];
  longTermMemories: GeneratedMemory[];
  attentionFocus: string;
  derivedMood: {
    valence: number;
    arousal: number;
    label: string;
  };
  signalProfiles: Record<RuntimeSignalKey, RuntimeSignalProfile>;
}

interface SceneInterpretationResult {
  scene: Omit<SceneState, "id">;
  newConcerns: GeneratedConcern[];
  longTermMemories: GeneratedMemory[];
  personalityTraitTags: string[];
  personalityFacetUpdates: PersonalityFacet[];
  attentionFocus: string;
  derivedMood: {
    valence: number;
    arousal: number;
    label: string;
  };
  signalProfiles: Record<RuntimeSignalKey, RuntimeSignalProfile>;
}

const runtimeSignalKeys: RuntimeSignalKey[] = ["energy", "mood", "valence", "arousal"];

export async function generateDossierFromDescription(description: string, current: CharacterState, llmConfig: LlmConfig): Promise<CharacterState> {
  const source = description.trim();
  const fallback = buildFallbackDossier(source, current);
  const trace = await runCognitiveModule<DossierInterpretationResult>(
    {
      moduleName: "dossier_interpretation",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是人物档案解读模块。用户输入的是素材，不是最终档案。你必须重新解读、归类、摘要，不能把原文整段照抄到展示字段。",
        "把素材分成四类：需要写入长期记忆的事实或余波；稳定的人性和人格部分；给左侧 UI 的短标签；当下状态信号。",
        "个人展示只能是短摘要。displaySummary 不超过 45 个中文字符，stableBackground 不超过 90 个中文字符，personalitySummary 不超过 120 个中文字符。",
        "长期记忆只写已经足够稳定、之后会影响反应的内容；不要把所有输入都塞进记忆。",
        `当前人物：${current.profile.name}。当前摘要：${current.profile.displaySummary || current.profile.background}`,
        `用户素材：${source}`,
      ].join("\n\n"),
      outputContract:
        "Return JSON: { name, age, displaySummary, stableBackground, personalityTraits: string[], personalitySummary, personalityFacets: [{ label, summary, evidence, tension, expression }], speakingStyle, values: string[], boundaries: string[], examples: [{ situation, expectedReply }], concerns: [{ title, object, type, description, intensity, valence, arousal, triggers, possibleResolutions }], longTermMemories: [{ summary, relatedPeople, relatedConcernTitles, emotionalValence, emotionalIntensity, importance }], attentionFocus, derivedMood: { valence, arousal, label }, signalProfiles: { energy, mood, valence, arousal } }",
    },
    llmConfig,
    fallback,
  );

  return applyDossierInterpretation(source, current, trace.output);
}

export async function generateSceneFromDescription(description: string, current: CharacterState, llmConfig: LlmConfig): Promise<CharacterState> {
  const source = description.trim();
  const fallback = buildFallbackScene(source, current);
  const trace = await runCognitiveModule<SceneInterpretationResult>(
    {
      moduleName: "scene_interpretation",
      inputMode: "structured_context",
      outputMode: "structured_json",
      prompt: [
        "你是场景解读模块。用户输入的是场景素材，不是最终展示文案。你必须重新解读、归类、摘要，不能把原文整段照抄到展示字段。",
        "把素材分成三类：场景本身；会改变当前状态的压力、身体感、注意力；可能影响人物长期反应的事实或记忆。",
        "场景展示只能是短摘要。scene.description 不超过 70 个中文字符，atmosphere 不超过 35 个中文字符，cognitiveNarrative 不超过 120 个中文字符。",
        "如果场景会影响人物，请通过 newConcerns、longTermMemories、personalityTraitTags 或 personalityFacetUpdates 表达。不要只更新 scene 字段。",
        `当前人物摘要：${current.profile.displaySummary || current.profile.background}`,
        `当前关切：${current.concerns.map((concern) => `${concern.title}：${concern.description}`).join("；")}`,
        `用户场景素材：${source}`,
      ].join("\n\n"),
      outputContract:
        "Return JSON: { scene: { title, description, atmosphere, visibleCues, activeObjects, sensoryProfile, interactionPressure, cognitiveNarrative }, newConcerns: [{ title, object, type, description, intensity, valence, arousal, triggers, possibleResolutions }], longTermMemories: [{ summary, relatedPeople, relatedConcernTitles, emotionalValence, emotionalIntensity, importance }], personalityTraitTags: string[], personalityFacetUpdates: [{ label, summary, evidence, tension, expression }], attentionFocus, derivedMood: { valence, arousal, label }, signalProfiles: { energy, mood, valence, arousal } }",
    },
    llmConfig,
    fallback,
  );

  return applySceneInterpretation(source, current, trace.output);
}

function applyDossierInterpretation(source: string, current: CharacterState, result: DossierInterpretationResult): CharacterState {
  const concerns = normalizeGeneratedConcerns(result.concerns, current.concerns, source);
  const profile: CharacterProfile = {
    ...current.profile,
    name: compactText(result.name, current.profile.name, 16, source),
    age: normalizeAge(result.age, current.profile.age),
    displaySummary: compactText(result.displaySummary, current.profile.displaySummary || current.profile.background, 60, source),
    background: compactText(result.stableBackground, current.profile.background, 120, source),
    personalityTraits: normalizeStringList(result.personalityTraits, current.profile.personalityTraits, 6, 12),
    personalitySummary: compactText(result.personalitySummary, current.profile.personalitySummary, 160, source),
    personalityFacets: normalizePersonalityFacets(result.personalityFacets, current.profile.personalityFacets, source),
    speakingStyle: compactText(result.speakingStyle, current.profile.speakingStyle, 90, source),
    values: normalizeStringList(result.values, current.profile.values, 5, 16),
    boundaries: normalizeStringList(result.boundaries, current.profile.boundaries, 5, 30),
    examples: normalizeExamples(result.examples, current.profile.examples, source),
  };

  return {
    ...current,
    profile,
    concerns,
    longTermMemory: [...current.longTermMemory, ...normalizeGeneratedMemories(result.longTermMemories, concerns, source)].slice(-30),
    runtime: {
      ...current.runtime,
      activeConcernIds: concerns.filter((concern) => concern.status === "active").map((concern) => concern.id),
      attentionFocus: compactText(result.attentionFocus, concerns[0]?.title ?? current.runtime.attentionFocus ?? "重新观察人物状态", 60, source),
      derivedMood: normalizeDerivedMood(result.derivedMood, current.runtime.derivedMood, source),
      signalProfiles: normalizeSignalProfiles(result.signalProfiles, current.runtime.signalProfiles, source),
      lastActiveAt: nowIso(),
    },
  };
}

function applySceneInterpretation(source: string, current: CharacterState, result: SceneInterpretationResult): CharacterState {
  const scene: SceneState = {
    id: makeId("scene"),
    title: compactText(result.scene?.title, current.scene?.title ?? "新场景", 32, source),
    description: compactText(result.scene?.description, current.scene?.description ?? "场景已被重新整理为可参与反应的语境。", 90, source),
    atmosphere: compactText(result.scene?.atmosphere, current.scene?.atmosphere ?? "安静但有压力", 50, source),
    visibleCues: normalizeStringList(result.scene?.visibleCues, current.scene?.visibleCues ?? [], 6, 18),
    activeObjects: normalizeStringList(result.scene?.activeObjects, current.scene?.activeObjects ?? [], 5, 14),
    sensoryProfile: compactText(result.scene?.sensoryProfile, current.scene?.sensoryProfile ?? "环境细节会影响身体感和停顿。", 120, source),
    interactionPressure: compactText(result.scene?.interactionPressure, current.scene?.interactionPressure ?? "这个场景会改变她愿意暴露多少。", 120, source),
    cognitiveNarrative: compactText(result.scene?.cognitiveNarrative, current.scene?.cognitiveNarrative ?? "场景会改变注意力、身体松紧和关系距离感。", 160, source),
  };
  const newConcerns = normalizeGeneratedConcerns(result.newConcerns, [], source);
  const concerns = mergeConcerns(current.concerns, newConcerns);
  const profile = {
    ...current.profile,
    personalityTraits: normalizeStringList([...current.profile.personalityTraits, ...normalizeStringList(result.personalityTraitTags, [], 4, 12)], current.profile.personalityTraits, 8, 12),
    personalityFacets: mergePersonalityFacets(current.profile.personalityFacets, normalizePersonalityFacets(result.personalityFacetUpdates, [], source)),
  };

  return {
    ...current,
    profile,
    scene,
    concerns,
    longTermMemory: [...current.longTermMemory, ...normalizeGeneratedMemories(result.longTermMemories, concerns, source)].slice(-30),
    runtime: {
      ...current.runtime,
      activeConcernIds: concerns.filter((concern) => concern.status === "active" && concern.intensity > 0.15).map((concern) => concern.id),
      attentionFocus: compactText(result.attentionFocus, scene.title, 60, source),
      derivedMood: normalizeDerivedMood(result.derivedMood, current.runtime.derivedMood, source),
      signalProfiles: normalizeSignalProfiles(result.signalProfiles, current.runtime.signalProfiles, source),
      lastActiveAt: nowIso(),
    },
  };
}

function buildFallbackDossier(description: string, current: CharacterState): DossierInterpretationResult {
  const isLonely = /孤独|失恋|分手|前任|想念|结束一段关系|旧关系|关系/.test(description);
  const isCareer = /工作|项目|创作|画|写作|事业/.test(description);

  return {
    name: current.profile.name,
    age: current.profile.age,
    displaySummary: isLonely ? "克制念旧的人，关系余波会影响她的停顿和边界。" : "慢热谨慎的人，会先观察对方是否安全再表达。",
    stableBackground: isCareer ? "她在创作和关系之间维持体面，外界反馈会牵动自我评价。" : "她习惯把真实反应放在心里，先确认边界再慢慢靠近。",
    personalityTraits: Array.from(new Set([...current.profile.personalityTraits, isLonely ? "念旧" : "谨慎", isCareer ? "有创作压力" : "慢热"])).slice(0, 6),
    personalitySummary: isLonely ? "她的克制不是冷淡，而是关系余波和自我保护叠在一起。" : "她的谨慎来自对边界和误解的在意，会先观察再表达。",
    personalityFacets: current.profile.personalityFacets,
    speakingStyle: current.profile.speakingStyle,
    values: current.profile.values,
    boundaries: current.profile.boundaries,
    examples: current.profile.examples,
    concerns: [
      {
        title: isLonely ? "一段没有放下的关系" : "害怕被误解",
        object: isLonely ? "旧关系" : undefined,
        type: isLonely ? "loss_unresolved_hope" : "identity_pressure",
        description: isLonely ? "她仍在处理关系结束后的余波，日常话题可能触发停顿。" : "她担心真实想法被粗暴理解。",
        intensity: isLonely ? 0.78 : 0.48,
        valence: isLonely ? -0.62 : -0.2,
        arousal: isLonely ? 0.58 : 0.35,
        triggers: isLonely ? ["周末", "前任", "复合", "孤独", "约会"] : ["误会", "解释", "为什么"],
        possibleResolutions: isLonely ? ["接受结束", "重新建立生活"] : ["被理解", "保持边界"],
      },
    ],
    longTermMemories: [
      {
        summary: isLonely ? "她对刚结束的关系仍有余波，这会影响亲密话题里的反应。" : "她对被误解保持警觉，会先确认对方意图。",
        relatedPeople: [],
        relatedConcernTitles: [],
        emotionalValence: isLonely ? -0.45 : -0.18,
        emotionalIntensity: isLonely ? 0.62 : 0.32,
        importance: 0.55,
      },
    ],
    attentionFocus: isLonely ? "关系余波和自我保护" : "边界和对方意图",
    derivedMood: {
      valence: isLonely ? -0.42 : -0.12,
      arousal: isLonely ? 0.5 : 0.32,
      label: isLonely ? "被关系余波牵动" : "谨慎观察中",
    },
    signalProfiles: buildFallbackSignalProfiles(isLonely, isCareer),
  };
}

function buildFallbackScene(description: string, current: CharacterState): SceneInterpretationResult {
  const rainy = /雨|潮湿|夜/.test(description);
  const studio = /工作|画|房间|书桌|画稿/.test(description);

  return {
    scene: {
      title: studio ? "创作空间" : rainy ? "雨夜空间" : "安静场景",
      description: studio ? "带有未完成事项的私人空间，容易让注意力回到作品和自我评价。" : "环境较安静，会放大停顿、身体感和关系距离。",
      atmosphere: rainy ? "潮湿安静，旧事容易浮起" : "稳定私密，适合观察细节",
      visibleCues: [rainy ? "雨声" : "柔和灯光", studio ? "未完成画稿" : "桌面物件", "手机提示"],
      activeObjects: [studio ? "画稿" : "手机", rainy ? "雨伞" : "台灯"],
      sensoryProfile: rainy ? "雨声和潮湿空气会让房间更窄，身体感更向内收。" : "稳定空间会让停顿和视线变化更明显。",
      interactionPressure: studio ? "未完成的创作会持续占据注意力，让她更在意外界评价。" : "安静空间降低社交压力，也会让回避更明显。",
      cognitiveNarrative: "这个场景会改变她的注意力落点、身体松紧和关系距离感。",
    },
    newConcerns: studio
      ? [
          {
            title: "未完成作品带来的压力",
            type: "scene_work_pressure",
            description: "场景里的未完成作品让她更容易把对话和自我评价联系起来。",
            intensity: 0.42,
            valence: -0.2,
            arousal: 0.38,
            triggers: ["画稿", "项目", "工作", "评价"],
            possibleResolutions: ["完成作品", "得到明确反馈"],
          },
        ]
      : [],
    longTermMemories: [],
    personalityTraitTags: studio ? ["自我要求高"] : [],
    personalityFacetUpdates: [],
    attentionFocus: studio ? "未完成作品和对方意图" : current.runtime.attentionFocus ?? "场景里的关系距离",
    derivedMood: {
      valence: studio ? -0.22 : current.runtime.derivedMood.valence,
      arousal: studio ? 0.42 : current.runtime.derivedMood.arousal,
      label: studio ? "被未完成事项牵动" : current.runtime.derivedMood.label,
    },
    signalProfiles: current.runtime.signalProfiles,
  };
}

function normalizeGeneratedConcerns(items: GeneratedConcern[] | undefined, fallback: Concern[], source: string): Concern[] {
  const sourceItems = Array.isArray(items) && items.length > 0 ? items : [];
  const normalized = sourceItems.slice(0, 5).map((item) => ({
    id: makeId("concern"),
    title: compactText(item.title, "未命名关切", 28, source),
    object: item.object ? compactText(item.object, "", 24, source) : undefined,
    type: compactText(item.type, "interpreted_concern", 36, source),
    description: compactText(item.description, "模型提炼出一个会影响反应的关切。", 100, source),
    intensity: round(clamp(Number(item.intensity) || 0.35, 0, 1)),
    valence: round(clamp(Number(item.valence) || 0, -1, 1)),
    arousal: round(clamp(Number(item.arousal) || 0.3, 0, 1)),
    triggers: normalizeStringList(item.triggers, [], 6, 14),
    possibleResolutions: normalizeStringList(item.possibleResolutions, ["被理解"], 4, 18),
    createdAt: nowIso(),
    decayRate: 0.018,
    status: "active" as const,
  }));

  return normalized.length > 0 ? normalized : fallback;
}

function mergeConcerns(existing: Concern[], additions: Concern[]) {
  const titles = new Set(existing.map((concern) => concern.title));
  return [...existing, ...additions.filter((concern) => !titles.has(concern.title))].slice(-8);
}

function normalizeGeneratedMemories(items: GeneratedMemory[] | undefined, concerns: Concern[], source: string): LongTermMemory[] {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item?.summary)
    .slice(0, 5)
    .map((item) => {
      const relatedConcernIds = new Set<string>();
      for (const title of item.relatedConcernTitles ?? []) {
        const concern = concerns.find((candidate) => candidate.title === title || candidate.title.includes(title) || title.includes(candidate.title));
        if (concern) relatedConcernIds.add(concern.id);
      }

      return {
        id: makeId("ltm"),
        summary: compactText(item.summary, "模型提炼出一条会影响后续反应的长期记忆。", 110, source),
        relatedPeople: normalizeStringList(item.relatedPeople, [], 4, 20),
        relatedConcerns: Array.from(relatedConcernIds),
        emotionalValence: round(clamp(Number(item.emotionalValence) || 0, -1, 1)),
        emotionalIntensity: round(clamp(Number(item.emotionalIntensity) || 0.25, 0, 1)),
        createdAt: nowIso(),
        importance: round(clamp(Number(item.importance) || 0.3, 0, 1)),
      };
    });
}

function normalizeSignalProfiles(
  signalProfiles: Partial<Record<RuntimeSignalKey, RuntimeSignalProfile>> | undefined,
  fallback: Record<RuntimeSignalKey, RuntimeSignalProfile>,
  source: string,
) {
  return runtimeSignalKeys.reduce(
    (result, key) => {
      const incoming = signalProfiles?.[key];
      const current = fallback[key];
      result[key] = {
        label: compactText(incoming?.label, current.label, 28, source),
        summary: compactText(incoming?.summary, current.summary, 90, source),
        considerations: normalizeStringList(incoming?.considerations, current.considerations, 4, 36),
        cognitiveNarrative: compactText(incoming?.cognitiveNarrative, current.cognitiveNarrative, 130, source),
      };
      return result;
    },
    {} as Record<RuntimeSignalKey, RuntimeSignalProfile>,
  );
}

function normalizeDerivedMood(
  derivedMood: DossierInterpretationResult["derivedMood"] | SceneInterpretationResult["derivedMood"] | undefined,
  fallback: CharacterState["runtime"]["derivedMood"],
  source: string,
) {
  return {
    valence: round(clamp(Number(derivedMood?.valence) || fallback.valence, -1, 1)),
    arousal: round(clamp(Number(derivedMood?.arousal) || fallback.arousal, 0, 1)),
    label: compactText(derivedMood?.label, fallback.label, 32, source),
  };
}

function normalizePersonalityFacets(items: PersonalityFacet[] | undefined, fallback: PersonalityFacet[], source: string) {
  const normalized = Array.isArray(items)
    ? items
        .filter((item) => item?.label && item?.summary)
        .slice(0, 5)
        .map((item) => ({
          label: compactText(item.label, "性格面", 16, source),
          summary: compactText(item.summary, "这部分会影响她如何理解关系和表达自己。", 90, source),
          evidence: normalizeStringList(item.evidence, [], 4, 30),
          tension: compactText(item.tension, "她在靠近和保护自己之间保持张力。", 80, source),
          expression: compactText(item.expression, "这会影响她的停顿、观察和表达量。", 80, source),
        }))
    : [];

  return normalized.length > 0 ? normalized : fallback;
}

function mergePersonalityFacets(existing: PersonalityFacet[], additions: PersonalityFacet[]) {
  const labels = new Set(existing.map((facet) => facet.label));
  return [...existing, ...additions.filter((facet) => !labels.has(facet.label))].slice(-6);
}

function normalizeExamples(
  examples: CharacterProfile["examples"] | undefined,
  fallback: CharacterProfile["examples"],
  source: string,
) {
  const normalized = Array.isArray(examples)
    ? examples
        .filter((example) => example?.situation && example?.expectedReply)
        .slice(0, 3)
        .map((example) => ({
          situation: compactText(example.situation, "类似情境", 40, source),
          expectedReply: compactText(example.expectedReply, "我先想一下。", 60, source),
        }))
    : [];

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeStringList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
  const items = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .map((item) => (item.length > maxLength ? `${item.slice(0, maxLength)}...` : item))
    : [];
  const unique = Array.from(new Set(items)).slice(0, maxItems);
  return unique.length > 0 ? unique : fallback.slice(0, maxItems);
}

function normalizeAge(age: unknown, fallback: number | undefined) {
  if (typeof age !== "number" || Number.isNaN(age)) return fallback;
  return Math.round(clamp(age, 1, 120));
}

function compactText(value: unknown, fallback: string, maxLength: number, source?: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  if (isRawCopy(trimmed, source)) return fallback;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function isRawCopy(value: string, source?: string) {
  if (!source) return false;
  const normalizedValue = value.replace(/\s+/g, "");
  const normalizedSource = source.trim().replace(/\s+/g, "");
  return normalizedSource.length > 30 && (normalizedValue === normalizedSource || normalizedValue.includes(normalizedSource));
}

function buildFallbackSignalProfiles(isLonely: boolean, isCareer: boolean): Record<RuntimeSignalKey, RuntimeSignalProfile> {
  return {
    energy: {
      label: isLonely ? "能回应，但会保留" : "能量平稳，先观察",
      summary: isLonely ? "她有礼貌回应的余力，但不想把旧关系摊开。" : "她并不抗拒对话，只是需要先确认边界。",
      considerations: [isLonely ? "关系余波会消耗她" : "陌生关系让她保持余量", isCareer ? "工作反馈会分走注意力" : "环境稳定时更容易开口"],
      cognitiveNarrative: isLonely ? "她有回应余力，但心理预算会先留给自我保护。" : "她的能量没有明显被抽走，只是保留观察距离。",
    },
    mood: {
      label: isLonely ? "被关系余波牵动" : "谨慎观察中",
      summary: isLonely ? "她不是全局低落，而是特定话题会带回关系余波。" : "她的情绪主要来自对场合和对方意图的判断。",
      considerations: [isLonely ? "亲密和约定会触发旧记忆" : "被误解会触发防御", "明确善意会让她稍微松一点"],
      cognitiveNarrative: isLonely ? "情绪低点来自具体触发物和未完成心事。" : "她会先观察对方意图，再产生更明确的情绪方向。",
    },
    valence: {
      label: isLonely ? "局部偏负面" : "中性偏防备",
      summary: isLonely ? "负面感受主要绑定旧关系和未完成约定。" : "她不一定难过，但会避免太快进入亲密表达。",
      considerations: [isLonely ? "旧关系降低情绪色彩" : "边界被尊重时情绪会稳定", isCareer ? "工作反馈可能放大自我怀疑" : "轻松闲聊可缓和"],
      cognitiveNarrative: "这个情绪方向由当前触发物、关系对象和未完成心事共同形成。",
    },
    arousal: {
      label: isLonely ? "内在被牵动" : "外表平稳，内部观察",
      summary: isLonely ? "她内在波动比外在表达更强。" : "她主要在观察，不急着反应。",
      considerations: [isLonely ? "被触发时会停顿" : "信息不足时会慢一点", "关系越近，越可能露出真实波动"],
      cognitiveNarrative: isLonely ? "波动先发生在注意力和停顿里，外表会努力维持体面。" : "内部主要在收集信息，身体和语气都还没有被明显推高。",
    },
  };
}
