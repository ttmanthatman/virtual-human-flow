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
const { advanceSceneForCurrentTime } = require(join(outDir, "pipeline/temporalScene.js"));
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

const blockedResult = advanceSceneForCurrentTime(
  zhengzhouCleanerState,
  { ...ordinaryEvent, content: "你现在马上去白宫找我。" },
  new Date("2026-06-10T02:30:00.000Z"),
);
if (blockedResult.progression.schedulePhase !== "blocked") {
  throw new Error("Expected impossible remote destination to be blocked.");
}
if (!blockedResult.progression.locationPlausibility.includes("郑州市金水区")) {
  throw new Error("Expected blocked scene to preserve original Zhengzhou geography.");
}

const goingHomeResult = advanceSceneForCurrentTime(
  zhengzhouCleanerState,
  { ...ordinaryEvent, content: "你现在先回家休息吧。" },
  new Date("2026-06-10T02:30:00.000Z"),
);
const heldHomeResult = advanceSceneForCurrentTime(
  goingHomeResult.nextState,
  { ...ordinaryEvent, content: "到了吗？" },
  new Date("2026-06-10T02:35:00.000Z"),
);
if (heldHomeResult.nextState.location.label !== goingHomeResult.nextState.location.label) {
  throw new Error("Expected recently triggered homeward scene to persist instead of snapping back to routine work.");
}
if (!heldHomeResult.progression.reason.includes("上一轮对话触发")) {
  throw new Error("Expected persistence reason to explain the held conversation-triggered scene.");
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

console.log("temporal scene progression and reply segments verified");
