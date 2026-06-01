import { CharacterProfile, CharacterState, Concern, SceneState } from "../core/types";
import { makeId, nowIso } from "../core/utils";

export function generateDossierFromDescription(description: string, current: CharacterState): CharacterState {
  const nameMatch = description.match(/叫([\u4e00-\u9fa5A-Za-z]{1,8})|名叫([\u4e00-\u9fa5A-Za-z]{1,8})/);
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? current.profile.name;
  const isLonely = /孤独|失恋|分手|前任|想念|结束一段关系|旧关系|关系/.test(description);
  const isCareer = /工作|项目|创作|画|写作|事业/.test(description);

  const profile: CharacterProfile = {
    ...current.profile,
    name,
    background: description || current.profile.background,
    personalityTraits: Array.from(new Set([...current.profile.personalityTraits, isLonely ? "念旧" : "谨慎", isCareer ? "有创作压力" : "慢热"])).slice(0, 6),
    personalitySummary: buildPersonalitySummary(description, isLonely, isCareer),
    personalityFacets: buildPersonalityFacets(isLonely, isCareer),
    speakingStyle: isLonely ? "克制、轻声，常把真正的情绪藏在简短句子里。" : current.profile.speakingStyle,
  };

  const concerns: Concern[] = [
    {
      id: makeId("concern"),
      title: isLonely ? "一段没有放下的关系" : "害怕被误解",
      object: isLonely ? "旧关系" : undefined,
      type: isLonely ? "loss_unresolved_hope" : "identity_pressure",
      description: isLonely ? "角色仍在处理一段关系的余波，某些日常话题会突然触发她。" : "角色担心自己的真实想法被粗暴理解。",
      intensity: isLonely ? 0.78 : 0.48,
      valence: isLonely ? -0.62 : -0.2,
      arousal: isLonely ? 0.58 : 0.35,
      triggers: isLonely ? ["周末", "前任", "复合", "孤独", "约会", "爬山"] : ["误会", "解释", "你怎么", "为什么"],
      possibleResolutions: isLonely ? ["说清楚", "接受结束", "重新建立生活"] : ["被理解", "保持边界"],
      createdAt: nowIso(),
      decayRate: 0.015,
      status: "active",
    },
  ];

  if (isCareer) {
    concerns.push({
      id: makeId("concern"),
      title: "创作结果等待确认",
      type: "career_uncertainty",
      description: "角色在等待一个重要反馈，容易被工作话题牵动。",
      intensity: 0.52,
      valence: -0.28,
      arousal: 0.44,
      triggers: ["工作", "项目", "反馈", "稿子", "创作"],
      possibleResolutions: ["得到确认", "收到拒绝", "修改完成"],
      createdAt: nowIso(),
      decayRate: 0.02,
      status: "active",
    });
  }

  return {
    ...current,
    profile,
    concerns,
    runtime: {
      ...current.runtime,
      activeConcernIds: concerns.map((concern) => concern.id),
      attentionFocus: concerns[0].title,
      derivedMood: {
        valence: concerns[0].valence,
        arousal: concerns[0].arousal,
        label: isLonely ? "被旧关系牵动" : "谨慎观察中",
      },
      signalProfiles: buildRuntimeSignalProfiles(isLonely, isCareer),
    },
  };
}

export function generateSceneFromDescription(description: string): SceneState {
  const rainy = /雨|潮湿|夜/.test(description);
  const cafe = /咖啡|店|街/.test(description);
  const studio = /工作|画|房间|书桌/.test(description);

  return {
    id: makeId("scene"),
    title: cafe ? "街角咖啡店" : studio ? "私人工作室" : rainy ? "雨夜窗边" : "安静房间",
    description,
    atmosphere: rainy ? "潮湿、低声、容易让旧事浮现" : cafe ? "有环境声，但适合轻松对话" : "稳定、私密、适合观察细节",
    visibleCues: [
      rainy ? "窗上的雨痕" : "柔和灯光",
      cafe ? "咖啡杯碰撞声" : "桌面物件",
      studio ? "未完成的创作" : "手机提示",
      "人物停顿时的细小动作",
    ],
    activeObjects: [cafe ? "咖啡杯" : "茶杯", studio ? "画稿" : "手机", rainy ? "雨伞" : "台灯"],
    sensoryProfile: rainy
      ? "潮湿空气和窗外雨声会放大安静感，人物更容易把话说短。"
      : cafe
        ? "背景人声和杯碟声让对话不至于太暴露，适合把真正情绪藏在日常话里。"
        : "环境稳定、声响少，人物的停顿和视线变化会更明显。",
    interactionPressure: cafe
      ? "公共空间会让角色更收敛，不容易直接说破脆弱。"
      : studio
        ? "私人创作空间降低了社交压力，但会让未完成的事持续在场。"
        : "安静空间会让对话更靠近内心，但也更容易触发回避。",
    llmContext: `${description} 这个场景不只是背景，它会影响角色说话的长度、停顿和回避方式。`,
  };
}

function buildPersonalitySummary(description: string, isLonely: boolean, isCareer: boolean) {
  const base = description || "这个角色需要由生活经历、关系压力和表达习惯共同推导。";
  const relationshipLayer = isLonely ? "她的克制来自关系余波，不是冷淡；敏感来自仍会被旧话题牵动。" : "她的谨慎来自对边界和误解的在意。";
  const workLayer = isCareer ? "创作或工作压力让她更看重反馈，也更容易把自我价值和外界评价绑定。" : "她会先观察环境和对方，再决定表达多少。";
  return `${base} ${relationshipLayer} ${workLayer}`;
}

function buildPersonalityFacets(isLonely: boolean, isCareer: boolean) {
  return [
    {
      label: isLonely ? "念旧" : "谨慎",
      summary: isLonely ? "她不会一直谈过去，但过去会在日常词语里突然浮现。" : "她不急着暴露自己，会先判断对方是否安全。",
      evidence: isLonely ? ["关系刚结束", "对周末、约会、复合等词敏感", "用短句遮住真实波动"] : ["不喜欢被粗暴理解", "会保持礼貌距离", "需要确认边界"],
      tension: isLonely ? "想放下和仍有期待同时存在。" : "想被理解和害怕被看穿同时存在。",
      expression: isLonely ? "被戳中时短回避，之后可能把内心活动写入记忆。" : "回应先平稳，再慢慢给出更多细节。",
    },
    {
      label: isCareer ? "自我要求高" : "观察力强",
      summary: isCareer ? "她容易把作品反馈理解成对自己的判断。" : "她会从语气、场景和关系远近判断该怎么回应。",
      evidence: isCareer ? ["等待项目反馈", "在意创作结果", "容易被工作话题牵动"] : ["能记住对方随口说过的事", "常借环境物件转移话题"],
      tension: isCareer ? "想被认可，但不愿显得太需要认可。" : "观察越细，越难真正放松。",
      expression: isCareer ? "谈到工作会更谨慎，可能先轻描淡写。" : "台词里会出现细节，但不会像旁白一样解释自己。",
    },
  ];
}

function buildRuntimeSignalProfiles(isLonely: boolean, isCareer: boolean) {
  return {
    energy: {
      label: isLonely ? "能回应，但不想解释太多" : "能量平稳，保留观察",
      summary: isLonely ? "她有礼貌回应的余力，但不想把精力花在摊开旧关系上。" : "她并不抗拒对话，只是会先看对方怎么靠近。",
      considerations: [isLonely ? "旧关系余波会消耗她" : "陌生关系让她保持余量", isCareer ? "工作反馈等待会分走注意力" : "环境稳定时更容易开口"],
      llmContext: isLonely ? "回复应短、轻、避开解释。" : "回复可以自然，但不要过度热情。",
    },
    mood: {
      label: isLonely ? "被旧关系牵动" : "谨慎观察中",
      summary: isLonely ? "她不是全局低落，而是特定话题会把她带回旧关系。" : "她的情绪主要来自对场合和对方意图的判断。",
      considerations: [isLonely ? "周末、约会、复合会触发旧记忆" : "被误解会触发防御", "明确善意会让她稍微松一点"],
      llmContext: isLonely ? "让情绪绑定具体触发物，不要写成泛泛低沉。" : "让她先保留，再根据对方语气微调。",
    },
    valence: {
      label: isLonely ? "局部偏负面" : "中性偏防备",
      summary: isLonely ? "负面感受主要绑定旧关系和未完成约定。" : "她不一定难过，但会避免太快进入亲密表达。",
      considerations: [isLonely ? "旧关系相关内容降低情绪色彩" : "边界被尊重时情绪会稳定", isCareer ? "工作反馈可能放大自我怀疑" : "轻松闲聊可缓和"],
      llmContext: "不要把这个显示结果当作全局情绪，只把它作为当前触发物的语境。",
    },
    arousal: {
      label: isLonely ? "心里被牵动，外表压低" : "外表平稳，内部观察",
      summary: isLonely ? "她内在波动比外在表达更强。" : "她主要在观察，不急着反应。",
      considerations: [isLonely ? "被触发时会停顿" : "信息不足时会慢一点", "关系越近，越可能露出真实波动"],
      llmContext: isLonely ? "用短停顿和转开话题体现波动。" : "用平稳语气体现观察。",
    },
  };
}
