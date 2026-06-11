import { CharacterLocation, CharacterState, EventInput, SceneState, TemporalSceneProgression } from "../core/types";
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
  const target = buildScheduledSceneTarget(state, archetype, scheduledPhase, localClock);
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
      },
    },
    progression,
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
      locationLabel: state.location?.label || workplace,
      address: state.location?.address || `${region}内的工作现场`,
      motionState: state.location?.motionState && state.location.motionState !== "unknown" ? state.location.motionState : "stationary",
      speedKmh: state.location?.speedKmh ?? 0,
      headingLabel: state.location?.headingLabel ?? "原地",
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
