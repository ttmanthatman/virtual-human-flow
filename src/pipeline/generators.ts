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
  };
}
