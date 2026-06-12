import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "vhf-temporal-scene-and-reply-segments");
rmSync(outDir, { recursive: true, force: true });

execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/pipeline/temporalScene.ts",
    "src/pipeline/eventActivity.ts",
    "src/pipeline/cognitiveModuleClient.ts",
    "src/pipeline/conversationContext.ts",
    "src/pipeline/memoryRetrieval.ts",
    "src/pipeline/llmClient.ts",
    "src/data/seedState.ts",
    "src/core/types.ts",
    "src/core/utils.ts",
    "--ignoreConfig",
    "--module",
    "commonjs",
    "--target",
    "ES2022",
    "--moduleResolution",
    "node",
    "--ignoreDeprecations",
    "6.0",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--noEmit",
    "false",
  ],
  { stdio: "inherit" },
);

const require = createRequire(import.meta.url);
const { advanceSceneForCurrentTime, deriveCurrentActivityFromEventActivity, deriveCurrentActivityFromStateUpdateNarrative, formatCurrentActivitySnapshot } = require(join(outDir, "pipeline/temporalScene.js"));
const { runEventActivity, formatEventActivityDetails } = require(join(outDir, "pipeline/eventActivity.js"));
const { runLlm } = require(join(outDir, "pipeline/llmClient.js"));
const { seedState } = require(join(outDir, "data/seedState.js"));

const zhengzhouCleanerState = {
  ...seedState,
  profile: {
    ...seedState.profile,
    id: "persona_zz_cleaner",
    name: "周姨",
    displaySummary: "郑州金水区写字楼保洁阿姨，早晚都要赶楼层卫生。",
    background: "她住在郑州市金水区老小区，平时在附近写字楼做保洁，凌晨和下午最忙。",
    speakingStyle: "郑州生活口语，直接、操心，累了会短句。",
  },
  scene: {
    ...seedState.scene,
    id: "scene_zz_cleaner_work",
    title: "金水区写字楼走廊",
    description: "拖把桶放在楼道口，电梯门一开一合。",
  },
  location: {
    ...seedState.location,
    label: "金水区写字楼",
    address: "郑州市金水区花园路附近写字楼",
    region: "郑州市金水区",
    coordinate: { lng: 113.681, lat: 34.789 },
    source: "manual",
    mapContext: {
      ...seedState.location.mapContext,
      source: "manual",
      environmentSummary: "楼下是郑州金水区普通街道和公交站。",
    },
  },
};

const ordinaryEvent = {
  id: "event_time_tick",
  type: "user_message",
  timestamp: "2026-06-10T02:30:00.000Z",
  speakerId: "user:1",
  speakerName: "用户",
  content: "你现在在干嘛？",
};

const workResult = advanceSceneForCurrentTime(zhengzhouCleanerState, ordinaryEvent, new Date("2026-06-10T02:30:00.000Z"));
if (workResult.progression.schedulePhase !== "work") {
  throw new Error(`Expected cleaner to be working at Zhengzhou 10:30, got ${workResult.progression.schedulePhase}.`);
}
if (!workResult.nextState.location.region.includes("郑州")) {
  throw new Error("Expected work scene to stay in Zhengzhou.");
}

const sleepResult = advanceSceneForCurrentTime(zhengzhouCleanerState, ordinaryEvent, new Date("2026-06-10T16:30:00.000Z"));
if (sleepResult.progression.schedulePhase !== "sleep") {
  throw new Error(`Expected cleaner to sleep at Zhengzhou 00:30, got ${sleepResult.progression.schedulePhase}.`);
}
if (!sleepResult.nextState.scene.title.includes("住处") || !sleepResult.nextState.location.region.includes("郑州")) {
  throw new Error("Expected sleep scene to move to a plausible Zhengzhou residence.");
}

const futureInviteResult = advanceSceneForCurrentTime(
  zhengzhouCleanerState,
  { ...ordinaryEvent, content: "周末一起去爬山吗？" },
  new Date("2026-06-10T02:30:00.000Z"),
);
if (/山|白宫/.test(futureInviteResult.nextState.scene.title)) {
  throw new Error("Expected future hiking invite not to teleport the persona to a mountain or remote place.");
}
if (futureInviteResult.progression.schedulePhase !== "work") {
  throw new Error("Expected future hiking invite not to change the time-based work phase.");
}

const remoteCommandResult = advanceSceneForCurrentTime(
  zhengzhouCleanerState,
  { ...ordinaryEvent, content: "你现在马上去白宫找我。" },
  new Date("2026-06-10T02:30:00.000Z"),
);
if (remoteCommandResult.progression.schedulePhase !== "work") {
  throw new Error("Expected remote command not to override the time-based work phase.");
}
if (/白宫/.test(remoteCommandResult.nextState.scene.title + remoteCommandResult.nextState.location.label)) {
  throw new Error("Expected remote command not to put the persona at the White House.");
}

const goHomeCommandResult = advanceSceneForCurrentTime(
  zhengzhouCleanerState,
  { ...ordinaryEvent, content: "你现在先回家休息吧。" },
  new Date("2026-06-10T02:30:00.000Z"),
);
if (goHomeCommandResult.progression.schedulePhase !== "work") {
  throw new Error("Expected go-home wording not to move the persona outside the time-based phase.");
}
if (goHomeCommandResult.nextState.location.label !== workResult.nextState.location.label) {
  throw new Error("Expected go-home wording not to change location through local keyword logic.");
}

const zhengzhouStationSecurityHomeState = {
  ...seedState,
  profile: {
    ...seedState.profile,
    id: "persona_sun_xiaoya",
    name: "孙小雅",
    displaySummary: "郑州东站安检员，带着孩子生活，轮班和临时顶班会直接压到她身上。",
    background: "她住在郑州市郑东新区，平时在郑州东站做安检，轮班、顶岗和领导临时电话都会打乱她回家的节奏。",
    speakingStyle: "郑州生活口语，紧绷、克制，忙起来句子短。",
  },
  scene: {
    ...seedState.scene,
    id: "scene_sun_home",
    title: "郑州市郑东新区住处",
    description: "她刚回到家，站在玄关鞋柜旁，钥匙还攥在手里。",
    atmosphere: "刚进门的安静和被工作打断的疲惫叠在一起",
  },
  location: {
    ...seedState.location,
    label: "郑州市郑东新区住处",
    address: "郑州市郑东新区一处出租屋",
    region: "郑州市郑东新区",
    coordinate: { lng: 113.78, lat: 34.76 },
    speedKmh: 0,
    headingLabel: "原地",
    motionState: "stationary",
    source: "manual",
    mapContext: {
      ...seedState.location.mapContext,
      environmentSummary: "普通住宅小区，离郑州东站有一段同城通勤距离。",
      source: "manual",
    },
  },
};

const urgentWorkEvent = {
  ...ordinaryEvent,
  id: "urgent_work_call",
  type: "room_event",
  timestamp: "2026-06-12T06:54:00.000Z",
  speakerId: "system:room_event",
  speakerName: "现场事件",
  channel: "scene_event",
  channelLabel: "现场事件",
  content: "领导打电话给她，说岗位缺人，让她快来上班！",
};
const urgentActivity = {
  psychologicalActivity: "领导催她快来上班，那种刚回家就被叫回去的烦躁和责任感一起压上来。",
  action: "她看了一眼手机，抓紧钥匙和包，开始确认班表。",
  movement: "她没有继续站在鞋柜旁边，身体已经往门口和楼道方向动。",
  relationshipShift: "她对领导更烦，但也知道岗位缺人不是一句不去就能解决。",
  memoryNote: "这通电话留下了被临时顶班催走的余波。",
  externalOutput: "",
};
const currentActivity = deriveCurrentActivityFromEventActivity(zhengzhouStationSecurityHomeState, urgentWorkEvent, urgentActivity, new Date("2026-06-12T06:54:00.000Z"));
if (currentActivity.status !== "going_to_work") {
  throw new Error(`Expected urgent work event to create going_to_work activity, got ${currentActivity.status}.`);
}
const movingState = {
  ...zhengzhouStationSecurityHomeState,
  runtime: {
    ...zhengzhouStationSecurityHomeState.runtime,
    currentActivity,
  },
};
const preparingResult = advanceSceneForCurrentTime(movingState, urgentWorkEvent, new Date("2026-06-12T06:55:00.000Z"));
if (preparingResult.progression.schedulePhase !== "commute" || !preparingResult.nextState.scene.title.includes("准备出门")) {
  throw new Error("Expected urgent work activity to override routine home phase and move into preparing-to-leave state.");
}
if (preparingResult.nextState.location.motionState === "stationary" || /鞋柜旁/.test(preparingResult.nextState.scene.description)) {
  throw new Error("Expected urgent work activity not to leave the persona standing at the shoe cabinet.");
}
const commuteResult = advanceSceneForCurrentTime(movingState, urgentWorkEvent, new Date("2026-06-12T06:59:00.000Z"));
if (commuteResult.progression.schedulePhase !== "commute" || !commuteResult.nextState.scene.title.includes("通勤路上")) {
  throw new Error("Expected sustained work activity to progress from preparing to commute after a few minutes.");
}
const arrivedWorkResult = advanceSceneForCurrentTime(movingState, urgentWorkEvent, new Date("2026-06-12T07:35:00.000Z"));
if (arrivedWorkResult.progression.schedulePhase !== "work" || /住处/.test(arrivedWorkResult.nextState.location.label)) {
  throw new Error("Expected sustained work activity to reach a work scene without leaving the location label at home.");
}
const activitySnapshot = formatCurrentActivitySnapshot(preparingResult.nextState, preparingResult.progression);
if (!activitySnapshot.content.includes("准备") || !activitySnapshot.details.some((detail) => detail.includes("当前活动"))) {
  throw new Error("Expected current-activity snapshot to report what the persona is doing now.");
}
const expiredActivityState = {
  ...movingState,
  runtime: {
    ...movingState.runtime,
    currentActivity: {
      ...currentActivity,
      expectedUntil: "2026-06-12T06:55:00.000Z",
    },
  },
};
const expiredActivityResult = advanceSceneForCurrentTime(expiredActivityState, urgentWorkEvent, new Date("2026-06-12T07:20:00.000Z"));
if (expiredActivityResult.nextState.runtime.currentActivity) {
  throw new Error("Expected expired current activity to be cleared before routine scene progression.");
}

const barbecueMeetupState = {
  ...movingState,
  shortTermMemory: [
    {
      id: "stm_bbq_1",
      timestamp: "2026-06-12T10:13:00.000Z",
      speakerId: "user:qoo",
      speakerName: "Qoo",
      content: "微信：我把你女儿接回来了，在路上我们买了一些你爱吃的烧烤，快来一起吃呀",
      eventId: "bbq_invite",
    },
    {
      id: "stm_bbq_2",
      timestamp: "2026-06-12T10:16:00.000Z",
      speakerId: "user:qoo",
      speakerName: "Qoo",
      content: "面对面：就在小区门口右手边第一家，店名叫“大腰子烧烤”",
      eventId: "bbq_location",
    },
  ],
};
const barbecueEvent = {
  ...ordinaryEvent,
  id: "bbq_turn",
  type: "user_message",
  timestamp: "2026-06-12T10:17:00.000Z",
  speakerId: "user:qoo",
  speakerName: "Qoo",
  channel: "wechat",
  channelLabel: "微信",
  content: "没有点辣的，你放心吧，我照顾你女儿你就把心放到肚子里吧",
};
const barbecueActivity = deriveCurrentActivityFromStateUpdateNarrative(
  barbecueMeetupState,
  barbecueEvent,
  { reply: "嗯，我出门了。" },
  "她确认女儿已经被接到，注意力从上班催促转到小区门口的烧烤店和女儿身上。她说自己出门了，接下来是在小区附近去和他们会合。",
  new Date("2026-06-12T10:17:00.000Z"),
);
if (!barbecueActivity || barbecueActivity.status !== "moving" || /上班|工作|通勤/.test(barbecueActivity.summary + barbecueActivity.headingLabel)) {
  throw new Error("Expected barbecue meetup dialogue to replace stale going-to-work activity with nearby meetup movement.");
}
const barbecueScene = advanceSceneForCurrentTime(
  {
    ...barbecueMeetupState,
    runtime: {
      ...barbecueMeetupState.runtime,
      currentActivity: barbecueActivity,
    },
  },
  barbecueEvent,
  new Date("2026-06-12T10:18:00.000Z"),
);
if (/上班|工作|通勤/.test(barbecueScene.nextState.scene.title + barbecueScene.nextState.runtime.attentionFocus)) {
  throw new Error("Expected barbecue meetup activity not to render as commuting to work.");
}
const reconciledBarbecueScene = advanceSceneForCurrentTime(
  barbecueMeetupState,
  {
    ...barbecueEvent,
    id: "bbq_activity_check",
    type: "internal_trigger",
    speakerId: "system:activity_check",
    speakerName: "当前活动",
    channel: "scene_event",
    channelLabel: "当前活动",
    content: "查看人物现在在干什么",
  },
  new Date("2026-06-12T10:18:00.000Z"),
);
if (/上班|工作|通勤/.test(reconciledBarbecueScene.nextState.scene.title + reconciledBarbecueScene.nextState.runtime.attentionFocus)) {
  throw new Error("Expected current-activity check to reconcile stale work activity from recent meetup dialogue.");
}

const streamedEventActivity = [];
const eventActivityPrompts = [];
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  eventActivityPrompts.push(body.prompt);
  return (
  createSseResponse([
    { delta: "心理活动：杯子落地的声音让她肩膀先紧了一下。\n" },
    { delta: "动作：她把拖把靠到墙边，停了半秒。\n" },
    {
      final:
        "心理活动：杯子落地的声音让她肩膀先紧了一下。\n动作：她把拖把靠到墙边，停了半秒。\n位移：还在金水区写字楼走廊，没有离开工作现场。\n关系变化：这不是某个人在逼近她，但房间里的人之后会感到她更忙、更短。\n记忆变化：这一刻会留下“杯子突然掉了”的余味。\n外显输出：（无）",
    },
  ])
  );
};
const eventActivity = await runEventActivity(
  { ...ordinaryEvent, type: "room_event", speakerId: "system:room_event", speakerName: "现场事件", channel: "scene_event", channelLabel: "现场事件", content: "杯子掉了" },
  workResult.nextState,
  workResult.progression,
  { provider: "external", endpoint: "http://fake.local/event-activity", model: "fixture" },
  (output) => streamedEventActivity.push(output),
);
if (streamedEventActivity.length < 2) {
  throw new Error("Expected event activity to stream partial natural-language output.");
}
if (!eventActivity.output.psychologicalActivity.includes("杯子") || !eventActivity.output.action.includes("拖把")) {
  throw new Error("Expected event activity to parse psychological and action sections.");
}
if (!eventActivityPrompts[0]?.includes("杯子掉了") || !eventActivityPrompts[0]?.includes("现场环境事件")) {
  throw new Error("Expected event activity prompt to describe a text room event rather than a time trigger.");
}
const eventDetails = formatEventActivityDetails(eventActivity.output);
if (eventDetails.length < 5 || eventDetails.some((detail) => detail.includes("JSON"))) {
  throw new Error("Expected event activity details to be display-ready natural-language rows.");
}

const decisionBase = {
  shouldRespond: true,
  responseMode: "neutral_reply",
  shouldLoseComposure: false,
  shouldBreakPersona: false,
  rationale: "fixture",
};

const multiTurnOutput = await runLlm(
  { provider: "external", model: "fixture", prompt: "fixture" },
  { provider: "external", endpoint: "", model: "fixture" },
  {
    event: ordinaryEvent,
    state: zhengzhouCleanerState,
    decision: { ...decisionBase, replyRhythm: "multi_turn" },
  },
);
if (!Array.isArray(multiTurnOutput.segments) || multiTurnOutput.segments.length < 3) {
  throw new Error("Expected multi_turn reply to expose multiple message segments.");
}

const burstOutput = await runLlm(
  { provider: "external", model: "fixture", prompt: "fixture" },
  { provider: "external", endpoint: "", model: "fixture" },
  {
    event: ordinaryEvent,
    state: zhengzhouCleanerState,
    decision: { ...decisionBase, responseMode: "emotional_outburst", replyRhythm: "burst", shouldLoseComposure: true, shouldBreakPersona: true },
  },
);
if (!Array.isArray(burstOutput.segments) || burstOutput.segments.length < 2) {
  throw new Error("Expected burst reply to split short emotional sentences into separate segments.");
}

globalThis.fetch = async () => createSseResponse([{ final: { reply: "（低头揉了揉眉心）周末不行，我得带孩子。", segments: ["（低头揉了揉眉心）周末不行，我得带孩子。"] } }]);
const sanitizedOutput = await runLlm(
  { provider: "external", model: "fixture", prompt: "fixture" },
  { provider: "external", endpoint: "http://fake.local/reply", model: "fixture" },
  {
    event: ordinaryEvent,
    state: zhengzhouCleanerState,
    decision: { ...decisionBase, replyRhythm: "single" },
  },
);
if (sanitizedOutput.reply.includes("揉了揉眉心") || sanitizedOutput.reply.includes("（")) {
  throw new Error("Expected reply output normalization to strip stage directions from spoken text.");
}
if (sanitizedOutput.reply !== "周末不行，我得带孩子。") {
  throw new Error(`Unexpected sanitized reply: ${sanitizedOutput.reply}`);
}

console.log("temporal scene progression and reply segments verified");

function createSseResponse(events) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}
