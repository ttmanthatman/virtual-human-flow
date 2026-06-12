import type { CharacterState, ConversationChannel, EventInput } from "./types";

export const conversationChannelOptions: { value: ConversationChannel; label: string; description: string }[] = [
  { value: "wechat", label: "微信", description: "手机文字消息，对方不在现场。" },
  { value: "sms", label: "短信", description: "手机短信，对方不在现场。" },
  { value: "phone", label: "电话", description: "语音通话，声音来自手机。" },
  { value: "face_to_face", label: "面对面", description: "对方在她能看见或听见的现实位置。" },
  { value: "outside_door", label: "门外", description: "声音、敲门或动静来自门外。" },
];

export function getConversationChannelLabel(channel: ConversationChannel | undefined, fallback = "微信") {
  if (channel === "scene_event") return "现场事件";
  return conversationChannelOptions.find((option) => option.value === channel)?.label ?? fallback;
}

export function describeConversationChannelForPrompt(event: EventInput, state: CharacterState) {
  const channel = event.channel ?? "wechat";
  const label = event.channelLabel || getConversationChannelLabel(channel);
  const privacy = describeScenePrivacy(state);
  const base = `渠道：${label}。`;

  if (channel === "wechat") {
    return `${base}这是手机微信消息，不代表对方出现在她身边；她应该按自己当前时间、地点和手机可达性来反应。`;
  }
  if (channel === "sms") {
    return `${base}这是手机短信，不代表对方出现在她身边；她可能延迟查看，回复也应像短信语境。`;
  }
  if (channel === "phone") {
    return `${base}这是电话或语音通话，声音来自手机；她可以接、挂断、沉默、压低声音或受当前场景打断。`;
  }
  if (channel === "outside_door") {
    return `${base}对方在门外或隔着门制造声音，不是在房间里；如果她在${privacy.locationLabel}，她会先判断门外是谁、安不安全、要不要开门。`;
  }
  if (channel === "face_to_face") {
    const sensitive = privacy.isPrivate ? "当前场景偏私密/住处。如果上下文没有解释对方为何在场，她不能自然当作普通聊天；她会先惊讶、警觉、质问来源，甚至把突然出现的声音当成异常。" : "对方应在她能看见或听见的现实位置；如果场景不支持共同在场，她需要先处理这个不合理感。";
    return `${base}这是面对面或同一空间内的声音，不是聊天软件。${sensitive}`;
  }
  if (channel === "scene_event") {
    return `${base}这是现场环境事件，不是某个人对她说话；她不需要强行聊天回复，而要按当前场景产生心理、动作、位移或外显反应。`;
  }
  return `${base}请根据这个渠道判断对方是否真的在场、声音从哪里来、她能不能即时回复。`;
}

function describeScenePrivacy(state: CharacterState) {
  const text = [state.scene?.title, state.scene?.description, state.location?.label, state.location?.address, state.location?.region].filter(Boolean).join(" ");
  const isPrivate = /家|住处|卧室|床|夜里|休息|私人|屋里|房间/.test(text);
  return {
    isPrivate,
    locationLabel: state.location?.label || state.scene?.title || "当前场景",
  };
}
