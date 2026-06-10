import { CharacterState, EventInput, ExpressionLlmRequest } from "../core/types";

export function generateNaturalPromptRequest(
  event: EventInput,
  state: CharacterState,
  appraisalNarrative: string,
  memoryRecallNarrative: string,
  decisionNarrative: string,
  provider: "external",
  model: string,
): ExpressionLlmRequest {
  const concernNarrative = "事件触发的心事：" + appraisalNarrative;

  const relationshipMemory = (state.relationshipMemory ?? []).find((memory) => memory.targetUserId === event.speakerId);
  const relationshipNarrative = relationshipMemory
    ? [
        `说话的人是 ${relationshipMemory.targetUserName}。`,
        `她对这个用户的印象是：${relationshipMemory.impressionSummary}`,
        `她和这个用户的当前关系是：${relationshipMemory.relationshipSummary}`,
        `最近一次互动留下的关系余波是：${relationshipMemory.lastInteractionSummary}`,
        relationshipMemory.evidence.length > 0 ? `形成这个印象的依据包括：${relationshipMemory.evidence.join("；")}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : event.speakerId && state.relationships[event.speakerId]
      ? `说话的人是 ${state.relationships[event.speakerId].targetName}。最近的互动气氛是「${state.relationships[event.speakerId].recentTone}」。她会参考这些自然语言备注判断距离：${state.relationships[event.speakerId].notes.slice(-3).join("；") || "没有更多备注"}。`
      : "说话的人没有明确关系档案，她会保持礼貌距离，并在这次互动后开始形成对这个用户的印象。";

  const memoryNarrative = "此刻浮现的记忆：" + memoryRecallNarrative;

  const recentConversationNarrative =
    state.shortTermMemory.length > 0
      ? state.shortTermMemory.slice(-4).map((memory) => `${memory.speakerName}刚才说过：「${memory.content}」`).join(" ")
      : "刚才没有太多直接上下文。";

  const responseModeNarrative = "这一轮她的反应倾向：" + decisionNarrative;
  const personalityNarrative = [
    state.profile.personalitySummary,
    ...state.profile.personalityFacets.map((facet) => `她的「${facet.label}」表现为：${facet.summary}${facet.tension ? ` ${facet.tension}` : ""} ${facet.expression}`),
  ].join(" ");
  const lifeNarrative = [
    state.profile.socialPersonaPattern ? `她在人群中的性格位置：${state.profile.socialPersonaPattern}` : "",
    state.profile.fullLifeStory ? `她从小到大的故事脉络：${state.profile.fullLifeStory}` : "",
    ...(state.profile.lifeEvents ?? []).map(
      (item) => `${item.ageRange}的「${item.title}」：${item.summary} 这带来的心理变化是：${item.psychologicalChange} 关系变化是：${item.relationshipChange}`,
    ),
  ]
    .filter(Boolean)
    .join(" ");
  const valuesNarrative = state.profile.values.length > 0 ? state.profile.values.join("、") : "没有明确列出的价值取向";
  const boundariesNarrative = state.profile.boundaries.length > 0 ? state.profile.boundaries.join("；") : "没有明确列出的边界";
  const exampleNarrative =
    state.profile.examples.length > 0
      ? state.profile.examples.map((example) => `在「${example.situation}」里，她可能会说：「${example.expectedReply}」`).join(" ")
      : "没有可参考的表达样本。";
  const runtimeNarrative = Object.values(state.runtime.signalProfiles)
    .map((signal) => `${signal.label}：${signal.summary} ${signal.considerations.join("；")}。${signal.cognitiveNarrative}`)
    .join(" ");
  const sceneNarrative = state.scene
    ? `${state.scene.title}：${state.scene.cognitiveNarrative} ${state.scene.sensoryProfile} ${state.scene.interactionPressure}`
    : "当前没有明确场景，按普通私聊处理。";
  const locationNarrative = state.location
    ? [
        `她现在的位置是「${state.location.label}」，地址/范围是「${state.location.address}」，所在区域是「${state.location.region}」。`,
        `移动状态是${describeMotionState(state.location.motionState)}，速度约 ${state.location.speedKmh} km/h，方向是${state.location.headingLabel}（${state.location.headingDeg}度）。`,
        state.location.mapContext
          ? `附近道路包括${formatMapList(state.location.mapContext.nearbyRoads)}，附近地点包括${formatMapList(state.location.mapContext.nearbyPlaces)}，附近建筑包括${formatMapList(state.location.mapContext.nearbyBuildings)}。现场地图语境是：${state.location.mapContext.environmentSummary}`
          : "当前还没有可用的周边地图语境。",
      ].join(" ")
    : "当前没有明确物理位置，不能假装知道她身边的街道或建筑。";

  const prompt = [
    `现在进入 ${state.profile.name} 的表达时刻。下面是一段自然语言语境，不是规则清单。`,
    `${state.profile.name} 的稳定背景是：${state.profile.background}`,
    lifeNarrative ? `她的成长经历和关系变化是：${lifeNarrative}` : "",
    `先把她的性格完整过一遍：${personalityNarrative}`,
    `她看重的东西包括：${valuesNarrative}。她在关系里的边界包括：${boundariesNarrative}。`,
    `她平常的说话质感是：${state.profile.speakingStyle}`,
    `类似情境里的表达样本是：${exampleNarrative}`,
    `此刻的场景语境是：${sceneNarrative}`,
    `此刻的物理位置语境是：${locationNarrative}`,
    `界面上的能量、情绪、情绪倾向和唤醒度只是给人看的观察摘要。她内部真正参与反应的是这些自然语言状态：${runtimeNarrative}`,
    `${event.speakerName ?? "对方"}刚刚对她说：「${event.content}」`,
    concernNarrative,
    relationshipNarrative,
    memoryNarrative,
    recentConversationNarrative,
    `综合她的性格、场景、关系、记忆和当下状态，${responseModeNarrative}`,
    `如果她此刻真的会连续补充、追问、解释或短句失控，就让屏幕上的话像真实聊天那样自然分成几条，每条另起一行；如果她已经崩溃或被击穿，不要把反应压缩成一句礼貌短答。`,
    `最终出现在屏幕上的，只是 ${state.profile.name} 此刻会自然说出口的话；分析、标签和背景说明都留在她没有说出口的内在过程里。`,
  ].join("\n\n");

  return {
    provider,
    model,
    prompt,
  };
}

function formatMapList(items: string[]) {
  return items.length > 0 ? `「${items.join("、")}」` : "未记录";
}

function describeMotionState(motionState: NonNullable<CharacterState["location"]>["motionState"]) {
  switch (motionState) {
    case "stationary":
      return "停留";
    case "walking":
      return "步行";
    case "riding":
      return "骑行";
    case "driving":
      return "驾车";
    case "unknown":
      return "未知";
  }
}
