import { CharacterState, EventInput } from "../core/types";

const childTerms = /女儿|孩子|小孩|娃|闺女|儿子/;
const safetyTerms = /在家|家里|回家|写完作业|没事|安全|平安|能看到|看得到|回去.*看到|回去.*看见|已经.*作业|已经.*在/;
const recentThreatTerms = /威胁|控制|绑|不见|看不见|安全|恐惧|崩溃|警报|失控|背叛|戏弄|女儿|孩子/;
const casualInviteTerms = /周末|爬山|邀|约|一起|出去|玩|吃饭|喝|电影|逛|聚|安排|上班|工作|单|项目/;

export function isChildSafetyClarification(content: string) {
  const normalized = content.trim();
  return childTerms.test(normalized) && safetyTerms.test(normalized);
}

export function hasChildSafetyCrisisContext(state: CharacterState) {
  const context = [
    ...state.concerns.map((concern) => [concern.title, concern.object, concern.description, concern.triggers.join("、")].filter(Boolean).join(" ")),
    ...state.shortTermMemory.slice(-8).map((memory) => memory.content),
    ...(state.relationshipMemory ?? []).flatMap((memory) => [
      memory.impressionSummary,
      memory.relationshipSummary,
      memory.lastInteractionSummary,
      ...memory.evidence,
      ...memory.history.slice(-3).map((item) => item.summary),
    ]),
    state.runtime.derivedMood.label,
    ...Object.values(state.runtime.signalProfiles).flatMap((profile) => [profile.label, profile.summary, profile.cognitiveNarrative]),
  ].join(" ");

  return childTerms.test(context) && recentThreatTerms.test(context);
}

export function hasRecentChildSafetyClarification(state: CharacterState, speakerId?: string) {
  return state.shortTermMemory
    .slice(-8)
    .some((memory) => (!speakerId || memory.speakerId === speakerId) && isChildSafetyClarification(memory.content));
}

export function isCasualSocialDiscontinuity(content: string) {
  return casualInviteTerms.test(content);
}

export function shouldApplyChildSafetyClarification(event: EventInput, state: CharacterState) {
  return isChildSafetyClarification(event.content) && hasChildSafetyCrisisContext(state);
}

export function shouldAvoidChildSafetyDangerLoop(event: EventInput, state: CharacterState) {
  if (shouldApplyChildSafetyClarification(event, state)) return true;
  return hasRecentChildSafetyClarification(state, event.speakerId) && hasChildSafetyCrisisContext(state) && isCasualSocialDiscontinuity(event.content);
}

export function buildChildSafetyContinuityNarrative(event: EventInput, state: CharacterState) {
  if (!shouldAvoidChildSafetyDangerLoop(event, state)) return "";
  return [
    "事实层已经变成：刚才出现过孩子在家或已经安全的澄清。",
    "她的愤怒主要落在被戏弄、失信、需要亲眼确认和关系边界被踩破上，而不是继续把孩子当作眼前车里的未知危险。",
  ].join(" ");
}
