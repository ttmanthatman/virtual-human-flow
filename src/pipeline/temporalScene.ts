import { CharacterLocation, CharacterState, EventActivityResult, EventInput, RuntimeCurrentActivity, SceneState, TemporalSceneProgression } from "../core/types";
import { makeId } from "../core/utils";

type SchedulePhase = TemporalSceneProgression["schedulePhase"];
type PersonaArchetype =
  | "food_service"
  | "driver"
  | "software"
  | "student_delivery"
  | "market_vendor"
  | "maintenance"
  | "station_security"
  | "cleaner"
  | "ancient"
  | "freelance"
  | "default";

interface LocalClock {
  hour: number;
  minute: number;
  label: string;
  weekday: string;
}

interface SceneTarget {
  phase: SchedulePhase;
  title: string;
  description: string;
  atmosphere: string;
  visibleCues: string[];
  activeObjects: string[];
  sensoryProfile: string;
  interactionPressure: string;
  cognitiveNarrative: string;
  locationLabel: string;
  address: string;
  motionState: CharacterLocation["motionState"];
  speedKmh: number;
  headingLabel: string;
  headingDeg: number;
  reason: string;
  plausibility: string;
  blocked?: boolean;
  preserveLocationUpdatedAt?: boolean;
}

export function advanceSceneForCurrentTime(
  state: CharacterState,
  event: EventInput,
  now: Date = new Date(),
): { nextState: CharacterState; progression: TemporalSceneProgression } {
  void event;
  const timezone = inferTimezone(state);
  const localClock = getLocalClock(now, timezone);
  const archetype = inferArchetype(state);
  const scheduledPhase = chooseScheduledPhase(archetype, localClock.hour);
  const currentActivity = getActiveCurrentActivity(state, now);
  const target = currentActivity ? buildCurrentActivitySceneTarget(state, archetype, localClock, currentActivity, now) : buildScheduledSceneTarget(state, archetype, scheduledPhase, localClock);
  const previousSceneTitle = state.scene?.title;
  const nextScene = buildScene(state, target, localClock);
  const nextLocation = buildLocation(state, target, now);
  const changed =
    target.blocked ||
    previousSceneTitle !== nextScene.title ||
    state.location?.label !== nextLocation.label ||
    state.location?.motionState !== nextLocation.motionState ||
    state.location?.source !== "temporal_progression";

  const progression: TemporalSceneProgression = {
    changed,
    localTimeLabel: localClock.label,
    timezone,
    schedulePhase: target.phase,
    reason: target.reason,
    previousSceneTitle,
    nextSceneTitle: nextScene.title,
    locationPlausibility: target.plausibility,
  };

  return {
    nextState: {
      ...state,
      scene: nextScene,
      location: nextLocation,
      runtime: {
        ...state.runtime,
        attentionFocus: refineAttentionFocus(state, target),
        currentActivity,
      },
    },
    progression,
  };
}

export function deriveCurrentActivityFromEventActivity(
  state: CharacterState,
  event: EventInput,
  activity: EventActivityResult,
  now: Date = new Date(),
): RuntimeCurrentActivity {
  const text = [event.content, activity.psychologicalActivity, activity.action, activity.movement, activity.memoryNote, activity.externalOutput].filter(Boolean).join(" ");
  const startedAt = now.toISOString();
  const urgentWorkDemand = /领导|排班|班表|岗位|工作|安检|上班/.test(text) && /快|马上|立刻|赶|到岗|顶班|缺人/.test(text);
  const workCall = /领导|排班|班表|岗位|工作|安检|上班/.test(text) && /电话|来电|手机|屏幕|接听|铃声|震动/.test(text);
  const movement = /出门|离开|往外|走到|下楼|路上|赶去|去上班|去工作|通勤/.test(text);
  const resting = /睡|躺|休息|关灯|床/.test(text);
  const region = state.location?.region || "当前区域";

  if (urgentWorkDemand) {
    return {
      id: makeId("activity"),
      status: "going_to_work",
      summary: "接到工作催促后，她正在从停滞里抽出来，准备确认班表、拿手机钥匙并往工作方向动。",
      detail: compactActivityText(text),
      startedAt,
      expectedUntil: addMinutes(now, 360).toISOString(),
      sourceEventId: event.id,
      locationLabel: `${region}住处准备出门`,
      motionState: "walking",
      speedKmh: 2,
      headingLabel: "准备去上班",
    };
  }

  if (workCall) {
    return {
      id: makeId("activity"),
      status: "handling_event",
      summary: "她正在处理领导来电带来的排班压力，注意力被工作和休息日被打断的烦躁占住。",
      detail: compactActivityText(text),
      startedAt,
      expectedUntil: addMinutes(now, 20).toISOString(),
      sourceEventId: event.id,
      locationLabel: state.location?.label,
      motionState: state.location?.motionState ?? "stationary",
      speedKmh: state.location?.speedKmh ?? 0,
      headingLabel: state.location?.headingLabel ?? "原地",
    };
  }

  if (movement) {
    return {
      id: makeId("activity"),
      status: "moving",
      summary: "她已经离开原来的停顿点，正在按现场发生的事移动。",
      detail: compactActivityText(text),
      startedAt,
      expectedUntil: addMinutes(now, 30).toISOString(),
      sourceEventId: event.id,
      locationLabel: `${region}附近移动中`,
      motionState: "walking",
      speedKmh: 4,
      headingLabel: "同城移动",
    };
  }

  if (resting) {
    return {
      id: makeId("activity"),
      status: "resting",
      summary: "她把注意力收回身体和休息里，短时间内不太想处理外界互动。",
      detail: compactActivityText(text),
      startedAt,
      expectedUntil: addMinutes(now, 60).toISOString(),
      sourceEventId: event.id,
      locationLabel: state.location?.label,
      motionState: "stationary",
      speedKmh: 0,
      headingLabel: "原地",
    };
  }

  return {
    id: makeId("activity"),
    status: "handling_event",
    summary: activity.action || activity.psychologicalActivity || "她正在处理刚刚发生的现场事件。",
    detail: compactActivityText(text),
    startedAt,
    expectedUntil: addMinutes(now, 10).toISOString(),
    sourceEventId: event.id,
    locationLabel: state.location?.label,
    motionState: state.location?.motionState ?? "stationary",
    speedKmh: state.location?.speedKmh ?? 0,
    headingLabel: state.location?.headingLabel ?? "原地",
  };
}

export function formatCurrentActivitySnapshot(state: CharacterState, progression: TemporalSceneProgression) {
  const activity = state.runtime.currentActivity;
  const location = state.location;
  const motion = location ? `${formatMotionState(location.motionState)}，约 ${location.speedKmh} km/h，${location.headingLabel}` : "位置未设定";
  const content = activity?.summary
    ? `${state.profile.name}现在在${location?.label ?? "当前场景"}，${motion}。${activity.summary}`
    : `${state.profile.name}现在在${location?.label ?? state.scene?.title ?? "当前场景"}，${motion}。${state.runtime.attentionFocus ? `注意力在：${state.runtime.attentionFocus}` : "没有额外活动记录。"}`;
  return {
    content,
    details: [
      `时间：${progression.localTimeLabel}`,
      `场景：${state.scene?.title ?? "未设定"}。${state.scene?.description ?? ""}`,
      `位置：${location ? `${location.label}，${location.address}，${location.region}` : "未设定"}`,
      `移动：${motion}`,
      activity ? `当前活动：${activity.summary}` : "当前活动：没有额外持续活动，按真实时间和作息校准。",
      activity?.detail ? `活动来源：${activity.detail}` : "",
      `校准理由：${progression.reason}`,
    ].filter(Boolean),
  };
}

function inferTimezone(state: CharacterState) {
  const text = [state.location?.region, state.location?.address, state.profile.background, state.scene?.description].filter(Boolean).join(" ");
  if (/耶路撒冷|约旦|犹太|耶利哥|加利利|比利亚|古代/.test(text)) return "Asia/Jerusalem";
  return "Asia/Shanghai";
}

function getLocalClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const rawHour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  return {
    hour,
    minute,
    weekday,
    label: `${weekday} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function inferArchetype(state: CharacterState): PersonaArchetype {
  const text = [
    state.profile.displaySummary,
    state.profile.background,
    state.profile.socialPersonaPattern,
    state.profile.speakingStyle,
    state.scene?.title,
    state.scene?.description,
    state.location?.label,
  ]
    .filter(Boolean)
    .join(" ");

  if (/古代|法利赛|耶利哥|门徒|财主|约旦|犹太|加利利/.test(text)) return "ancient";
  if (/保洁|清洁|打扫|阿姨/.test(text)) return "cleaner";
  if (/奶茶|餐饮|店长|收银|外卖单|开门/.test(text)) return "food_service";
  if (/网约车|司机|跑车|接单|高铁站/.test(text)) return "driver";
  if (/软件|测试|报警|上线|园区|工位/.test(text)) return "software";
  if (/大学|学生|外卖|送餐|电动车|宿舍/.test(text)) return "student_delivery";
  if (/菜市场|摊主|摊位|豆腐|早市/.test(text)) return "market_vendor";
  if (/物业|维修|电梯|机房|门禁|水管/.test(text)) return "maintenance";
  if (/安检|进站口|高铁|东站|轮班/.test(text)) return "station_security";
  if (/插画|自由职业|画稿|工作室/.test(text)) return "freelance";
  return "default";
}

function chooseScheduledPhase(archetype: PersonaArchetype, hour: number): SchedulePhase {
  switch (archetype) {
    case "market_vendor":
      if (hour >= 21 || hour < 3) return "sleep";
      if (hour >= 3 && hour < 6) return "commute";
      if (hour >= 6 && hour < 12) return "work";
      if (hour >= 12 && hour < 16) return "home";
      return "errand";
    case "cleaner":
      if (hour >= 21 || hour < 5) return "sleep";
      if ((hour >= 5 && hour < 11) || (hour >= 14 && hour < 18)) return "work";
      if (hour >= 11 && hour < 14) return "home";
      return "commute";
    case "food_service":
      if (hour >= 23 || hour < 7) return "sleep";
      if (hour >= 7 && hour < 10) return "commute";
      if (hour >= 10 && hour < 22) return "work";
      return "home";
    case "driver":
      if (hour >= 2 && hour < 8) return "sleep";
      if (hour >= 8 && hour < 10) return "home";
      return "work";
    case "software":
      if (hour >= 0 && hour < 7) return "sleep";
      if (hour >= 9 && hour < 18) return "work";
      if (hour >= 19 && hour < 23) return "work";
      return "home";
    case "student_delivery":
      if (hour >= 0 && hour < 7) return "sleep";
      if (hour >= 8 && hour < 16) return "work";
      if (hour >= 17 && hour < 22) return "work";
      return "home";
    case "maintenance":
      if (hour >= 23 || hour < 6) return "sleep";
      if (hour >= 8 && hour < 18) return "work";
      return "home";
    case "station_security":
      if (hour >= 23 || hour < 5) return "sleep";
      if ((hour >= 6 && hour < 10) || (hour >= 16 && hour < 22)) return "work";
      return "home";
    case "ancient":
      if (hour >= 21 || hour < 5) return "sleep";
      if (hour >= 6 && hour < 18) return "work";
      return "home";
    case "freelance":
      if (hour >= 2 && hour < 9) return "sleep";
      if (hour >= 10 && hour < 19) return "work";
      if (hour >= 21 || hour < 2) return "work";
      return "home";
    default:
      if (hour >= 23 || hour < 7) return "sleep";
      if (hour >= 9 && hour < 18) return "work";
      if (hour === 8 || hour === 18) return "commute";
      return "home";
  }
}

function buildScheduledSceneTarget(
  state: CharacterState,
  archetype: PersonaArchetype,
  phase: SchedulePhase,
  localClock: LocalClock,
): SceneTarget {
  const region = state.location?.region || "当前区域";
  const workplace = inferWorkplaceLabel(state);
  const home = inferHomeLabel(state, archetype);
  const archetypeLabel = formatArchetype(archetype);

  if (phase === "sleep") {
    return {
      phase,
      title: `${home}夜里`,
      description: `${localClock.label}，按${region}当地时间，这个时段更接近${state.profile.name}的睡眠或闭门休息。`,
      atmosphere: "低声、昏暗，回复可能慢半拍",
      visibleCues: ["手机微光", "床边物件", "窗外夜色"],
      activeObjects: ["手机", "被子"],
      sensoryProfile: "夜里声音被压低，身体疲惫会让她更难长时间解释。",
      interactionPressure: "如果被消息叫醒，她会先带着困意、警觉或烦躁理解对方。",
      cognitiveNarrative: `${state.profile.name}不是固定站在旧场景里；当地时间已到休息段，她的注意力从外部任务退回身体疲惫和私密空间。`,
      locationLabel: home,
      address: `${region}内与人物经历相符的住处`,
      motionState: "stationary",
      speedKmh: 0,
      headingLabel: "原地",
      headingDeg: 0,
      reason: `当地时间 ${localClock.label} 进入休息段，场景从固定档案现场推进到住处。`,
      plausibility: `仍在${region}，只从工作/公共场景回到同区域住处。`,
    };
  }

  if (phase === "work") {
    const isAlreadyAtWorkplace = state.location?.label === workplace;
    return {
      phase,
      title: workplace,
      description: `${localClock.label}，按${archetypeLabel}的生活节奏，她此刻更可能在工作或承担主要现实任务。`,
      atmosphere: state.scene?.atmosphere || "被手头事情牵着走",
      visibleCues: state.scene?.visibleCues?.length ? state.scene.visibleCues : ["手机", "工作物件", "人流"],
      activeObjects: state.scene?.activeObjects?.length ? state.scene.activeObjects : ["手机", "手边工具"],
      sensoryProfile: state.scene?.sensoryProfile || "现场的声音、气味和时间压力会进入她的表达。",
      interactionPressure: state.scene?.interactionPressure || "她很难把对话和手头责任完全切开。",
      cognitiveNarrative: `${localClock.label} 的当地时间让她处在${workplace}这类工作现场；她说话会被职业责任、场地声音和现实压力牵动。`,
      locationLabel: workplace,
      address: isAlreadyAtWorkplace && state.location?.address ? state.location.address : `${region}内的工作现场`,
      motionState: isAlreadyAtWorkplace && state.location?.motionState && state.location.motionState !== "unknown" ? state.location.motionState : "stationary",
      speedKmh: isAlreadyAtWorkplace ? (state.location?.speedKmh ?? 0) : 0,
      headingLabel: isAlreadyAtWorkplace ? (state.location?.headingLabel ?? "原地") : "已到工作现场",
      headingDeg: state.location?.headingDeg ?? 0,
      reason: `当地时间 ${localClock.label} 属于${archetypeLabel}的工作/主要任务段。`,
      plausibility: `沿用档案里的${region}工作位置，不改变城市或世界观。`,
    };
  }

  if (phase === "commute") {
    return {
      phase,
      title: `${region}通勤路上`,
      description: `${localClock.label}，她更像在同区域内从住处和工作点之间移动。`,
      atmosphere: "路上、分心，消息和现实动线交错",
      visibleCues: ["路口", "手机", "人流"],
      activeObjects: ["手机", "随身物品"],
      sensoryProfile: "路声、步伐或车流会让回复更碎，也更贴近现实时间。",
      interactionPressure: "她可以回消息，但注意力会被下一步去哪里打断。",
      cognitiveNarrative: `${state.profile.name}在${region}内移动，不会突然跨城；对话会被通勤距离和现实动线切成几段。`,
      locationLabel: `${region}通勤路上`,
      address: `${region}内，从住处和${workplace}之间的路上`,
      motionState: "walking",
      speedKmh: 4,
      headingLabel: "沿同城路线移动",
      headingDeg: state.location?.headingDeg ?? 0,
      reason: `当地时间 ${localClock.label} 更像通勤或准备开工的过渡段。`,
      plausibility: `只在${region}内移动，保留原人物地理约束。`,
    };
  }

  const title = phase === "errand" ? `${region}附近办事` : home;
  return {
    phase,
    title,
    description:
      phase === "errand"
        ? `${localClock.label}，她暂时离开主要工作点，在${region}附近处理生活杂事。`
        : `${localClock.label}，她回到${region}的住处或相对私人的生活空间。`,
    atmosphere: phase === "errand" ? "现实琐事夹着一点赶时间" : "收回到私人生活里",
    visibleCues: phase === "errand" ? ["路边店铺", "手机", "来往的人"] : ["手机", "桌面杂物", "室内灯光"],
    activeObjects: phase === "errand" ? ["手机", "随身物品"] : ["手机", "杯子"],
    sensoryProfile: phase === "errand" ? "街边声音和时间安排会让她回复更具体。" : "室内声音更低，情绪比公共场合更容易露出一点。",
    interactionPressure: phase === "errand" ? "她边处理事情边回应，不太会展开空泛解释。" : "私人空间让她有余地说得更真实，但也更容易被戳中。",
    cognitiveNarrative:
      phase === "errand"
        ? `${state.profile.name}仍在${region}内处理生活动线，场景变换来自真实时间推移。`
        : `${state.profile.name}从固定工作/公共场景退回${region}内更私人的位置，回复会更受疲惫和关系距离影响。`,
    locationLabel: title,
    address: `${region}内与人物档案相符的位置`,
    motionState: phase === "errand" ? "walking" : "stationary",
    speedKmh: phase === "errand" ? 4 : 0,
    headingLabel: phase === "errand" ? "同城移动" : "原地",
    headingDeg: state.location?.headingDeg ?? 0,
    reason: `当地时间 ${localClock.label} 让场景从固定初始点推进到${phase === "errand" ? "生活办事" : "住处"}。`,
    plausibility: `位置仍限定在${region}，没有跳出档案地理范围。`,
  };
}

function buildCurrentActivitySceneTarget(
  state: CharacterState,
  archetype: PersonaArchetype,
  localClock: LocalClock,
  activity: RuntimeCurrentActivity,
  now: Date,
): SceneTarget {
  const elapsedMinutes = Math.max(0, (now.getTime() - new Date(activity.startedAt).getTime()) / 60000);
  if (activity.status === "going_to_work") {
    if (elapsedMinutes >= 35) return buildActivityWorkTarget(state, archetype, localClock, activity);
    if (elapsedMinutes >= 3) return buildActivityCommuteTarget(state, localClock, activity);
    return buildActivityPreparingTarget(state, localClock, activity);
  }
  if (activity.status === "working") return buildActivityWorkTarget(state, archetype, localClock, activity);
  if (activity.status === "moving") return buildActivityCommuteTarget(state, localClock, activity);
  if (activity.status === "resting") return buildActivityRestTarget(state, localClock, activity);
  return buildActivityHandlingTarget(state, localClock, activity);
}

function getActiveCurrentActivity(state: CharacterState, now: Date) {
  const activity = state.runtime.currentActivity;
  if (!activity) return undefined;
  const startedAt = new Date(activity.startedAt);
  if (!Number.isFinite(startedAt.getTime())) return undefined;
  const expectedUntil = activity.expectedUntil ? new Date(activity.expectedUntil) : addMinutes(startedAt, 20);
  if (Number.isFinite(expectedUntil.getTime()) && now.getTime() > expectedUntil.getTime()) return undefined;
  return activity;
}

function buildActivityPreparingTarget(state: CharacterState, localClock: LocalClock, activity: RuntimeCurrentActivity): SceneTarget {
  const region = state.location?.region || "当前区域";
  const home = inferHomeLabel(state, inferArchetype(state));
  return {
    phase: "commute",
    title: `${home}准备出门`,
    description: `${localClock.label}，她没有继续钉在原地；刚发生的事把她推向下一步，正在从住处往出门动作里过渡。`,
    atmosphere: "匆忙、压低火气，现实动作开始接管",
    visibleCues: ["手机", "钥匙", "门口鞋柜", "随身包"],
    activeObjects: ["手机", "钥匙", "外套"],
    sensoryProfile: "室内声响和手机震动还在，但身体已经开始进入移动前的整理。",
    interactionPressure: "如果这时收到消息，她会边准备边短促回应，很难展开解释。",
    cognitiveNarrative: `${state.profile.name}正在承接持续活动：${activity.summary}`,
    locationLabel: `${home}准备出门`,
    address: `${region}住处门口到楼道之间`,
    motionState: "walking",
    speedKmh: activity.speedKmh ?? 2,
    headingLabel: activity.headingLabel ?? "准备出门",
    headingDeg: state.location?.headingDeg ?? 0,
    reason: `持续活动优先于普通作息：${activity.summary}`,
    plausibility: `仍在${region}内，只是从住处静止转入准备出门。`,
  };
}

function buildActivityCommuteTarget(state: CharacterState, localClock: LocalClock, activity: RuntimeCurrentActivity): SceneTarget {
  const region = state.location?.region || "当前区域";
  const workplace = inferWorkplaceLabel(state);
  return {
    phase: "commute",
    title: `${region}通勤路上`,
    description: `${localClock.label}，她正在同一区域内往${workplace}方向移动。`,
    atmosphere: "路上、分心、带着被催动后的紧绷",
    visibleCues: ["手机", "路口", "人流"],
    activeObjects: ["手机", "钥匙", "随身物品"],
    sensoryProfile: "路声和脚步会把回复切短，现实动线会打断对话。",
    interactionPressure: "她能看到消息，但注意力会被路线、时间和工作压力分走。",
    cognitiveNarrative: `${state.profile.name}没有停在旧场景里；持续活动正在把她推向工作地点。${activity.summary}`,
    locationLabel: `${region}通勤路上`,
    address: `${region}内，从住处去${workplace}的路上`,
    motionState: "walking",
    speedKmh: activity.speedKmh && activity.speedKmh > 2 ? activity.speedKmh : 4,
    headingLabel: activity.headingLabel ?? "往工作地点移动",
    headingDeg: state.location?.headingDeg ?? 0,
    reason: `持续活动优先于普通作息：${activity.summary}`,
    plausibility: `只在${region}内移动，不跨城、不瞬移。`,
  };
}

function buildActivityWorkTarget(state: CharacterState, archetype: PersonaArchetype, localClock: LocalClock, activity: RuntimeCurrentActivity): SceneTarget {
  const scheduled = buildScheduledSceneTarget(state, archetype, "work", localClock);
  return {
    ...scheduled,
    title: inferWorkplaceLabel(state),
    reason: `持续活动已经把她带回工作责任里：${activity.summary}`,
    cognitiveNarrative: `${scheduled.cognitiveNarrative} 这不是单纯按时钟切换，而是前一事件留下的行动惯性。`,
  };
}

function buildActivityHandlingTarget(state: CharacterState, localClock: LocalClock, activity: RuntimeCurrentActivity): SceneTarget {
  const region = state.location?.region || "当前区域";
  const label = activity.locationLabel || state.location?.label || state.scene?.title || `${region}当前现场`;
  return {
    phase: "home",
    title: label,
    description: `${localClock.label}，她还在处理刚才发生的现场事件。${activity.summary}`,
    atmosphere: state.scene?.atmosphere || "被刚才的事牵住",
    visibleCues: state.scene?.visibleCues?.length ? state.scene.visibleCues : ["手机", "手边物件"],
    activeObjects: state.scene?.activeObjects?.length ? state.scene.activeObjects : ["手机"],
    sensoryProfile: state.scene?.sensoryProfile || "刚发生的事还在影响身体和注意力。",
    interactionPressure: state.scene?.interactionPressure || "回复会被当前活动打断。",
    cognitiveNarrative: `${state.profile.name}正在承接持续活动：${activity.summary}`,
    locationLabel: label,
    address: state.location?.address || `${region}内当前现场`,
    motionState: activity.motionState ?? state.location?.motionState ?? "stationary",
    speedKmh: activity.speedKmh ?? state.location?.speedKmh ?? 0,
    headingLabel: activity.headingLabel ?? state.location?.headingLabel ?? "原地",
    headingDeg: state.location?.headingDeg ?? 0,
    reason: `持续活动优先于普通作息：${activity.summary}`,
    plausibility: `仍在${region}内承接上一事件，没有跨地理范围移动。`,
  };
}

function buildActivityRestTarget(state: CharacterState, localClock: LocalClock, activity: RuntimeCurrentActivity): SceneTarget {
  const region = state.location?.region || "当前区域";
  const home = inferHomeLabel(state, inferArchetype(state));
  return {
    phase: "home",
    title: home,
    description: `${localClock.label}，她把注意力收回身体和休息里。${activity.summary}`,
    atmosphere: "低声、疲惫、把外界推远",
    visibleCues: ["手机", "室内灯光", "随身物品"],
    activeObjects: ["手机"],
    sensoryProfile: "身体疲惫会让她更短、更慢地回应。",
    interactionPressure: "外界消息会打断她的休息感。",
    cognitiveNarrative: `${state.profile.name}正在承接休息活动：${activity.summary}`,
    locationLabel: home,
    address: `${region}内与人物档案相符的住处`,
    motionState: "stationary",
    speedKmh: 0,
    headingLabel: "原地",
    headingDeg: state.location?.headingDeg ?? 0,
    reason: `持续活动优先于普通作息：${activity.summary}`,
    plausibility: `仍在${region}内，没有跳出档案地理范围。`,
  };
}

function buildScene(state: CharacterState, target: SceneTarget, localClock: LocalClock): SceneState {
  return {
    id: state.scene?.id ?? makeId("scene"),
    title: target.title,
    description: target.description,
    atmosphere: target.atmosphere,
    visibleCues: target.visibleCues,
    activeObjects: target.activeObjects,
    sensoryProfile: target.sensoryProfile,
    interactionPressure: target.interactionPressure,
    cognitiveNarrative: `${target.cognitiveNarrative} 当前当地时间是${localClock.label}。`,
  };
}

function buildLocation(state: CharacterState, target: SceneTarget, now: Date): CharacterLocation {
  const fallbackContext = state.location?.mapContext;
  const timestamp = now.toISOString();
  const updatedAt = target.preserveLocationUpdatedAt && state.location?.updatedAt ? state.location.updatedAt : timestamp;
  const resolvedAt = target.preserveLocationUpdatedAt && fallbackContext?.resolvedAt ? fallbackContext.resolvedAt : timestamp;
  return {
    label: target.locationLabel,
    address: target.address,
    region: state.location?.region || target.address,
    coordinate: state.location?.coordinate,
    speedKmh: target.speedKmh,
    headingDeg: target.headingDeg,
    headingLabel: target.headingLabel,
    motionState: target.motionState,
    mapContext: {
      nearbyRoads: fallbackContext?.nearbyRoads ?? [],
      nearbyPlaces: fallbackContext?.nearbyPlaces ?? [],
      nearbyBuildings: fallbackContext?.nearbyBuildings ?? [],
      environmentSummary: target.plausibility,
      source: "temporal_progression",
      resolvedAt,
    },
    updatedAt,
    source: "temporal_progression",
  };
}

function refineAttentionFocus(state: CharacterState, target: SceneTarget) {
  if (target.phase === "blocked") return "对方提出的地点不符合现实距离";
  if (target.phase === "sleep") return "被消息打断后的身体疲惫和安全感";
  if (target.phase === "commute") return "同城移动中的下一步去向";
  if (target.phase === "errand") return "临时事项和对方意图";
  if (target.phase === "home") return "私人空间里的余波";
  return state.runtime.attentionFocus ?? target.title;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function compactActivityText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 420);
}

function formatMotionState(motionState: CharacterLocation["motionState"]) {
  switch (motionState) {
    case "stationary":
      return "停留";
    case "walking":
      return "步行";
    case "riding":
      return "骑行";
    case "driving":
      return "驾车";
    default:
      return "移动状态未知";
  }
}

function inferWorkplaceLabel(state: CharacterState) {
  const current = state.location?.label || state.scene?.title;
  if (current && !/住处|家里|夜里|睡|通勤|路上|附近办事/.test(current)) return current;
  return `${state.profile.name}的工作现场`;
}

function inferHomeLabel(state: CharacterState, archetype: PersonaArchetype) {
  const region = state.location?.region || "当前区域";
  if (archetype === "ancient") return `${region}客舍或院角`;
  return `${region}住处`;
}

function formatArchetype(archetype: PersonaArchetype) {
  const labels: Record<PersonaArchetype, string> = {
    food_service: "餐饮门店",
    driver: "网约车司机",
    software: "软件从业者",
    student_delivery: "学生兼职跑单",
    market_vendor: "早市摊主",
    maintenance: "物业维修",
    station_security: "车站安检",
    cleaner: "保洁工作者",
    ancient: "古代行路和作息",
    freelance: "自由职业创作者",
    default: "普通城市生活",
  };
  return labels[archetype];
}
