export type ConcernStatus = "active" | "dormant" | "resolved";

export type ResponseMode =
  | "warm_reply"
  | "neutral_reply"
  | "short_avoidance"
  | "topic_shift"
  | "question_back"
  | "silence"
  | "delayed_reply"
  | "emotional_outburst";

export interface CharacterProfile {
  id: string;
  name: string;
  age?: number;
  background: string;
  personalityTraits: string[];
  speakingStyle: string;
  values: string[];
  boundaries: string[];
  examples: { situation: string; expectedReply: string }[];
}

export interface Concern {
  id: string;
  title: string;
  object?: string;
  type: string;
  description: string;
  intensity: number;
  valence: number;
  arousal: number;
  triggers: string[];
  possibleResolutions: string[];
  lastActivatedAt?: string;
  createdAt: string;
  decayRate: number;
  status: ConcernStatus;
}

export interface Relationship {
  targetId: string;
  targetName: string;
  familiarity: number;
  trust: number;
  affection: number;
  tension: number;
  lastInteractionAt?: string;
  recentTone: string;
  unresolvedIssues: string[];
  notes: string[];
}

export interface ShortTermMemory {
  id: string;
  timestamp: string;
  speakerId: string;
  speakerName: string;
  content: string;
  eventId: string;
}

export interface LongTermMemory {
  id: string;
  summary: string;
  relatedPeople: string[];
  relatedConcerns: string[];
  emotionalValence: number;
  emotionalIntensity: number;
  createdAt: string;
  lastAccessedAt?: string;
  importance: number;
}

export interface RuntimeState {
  attentionFocus?: string;
  energy: number;
  derivedMood: {
    valence: number;
    arousal: number;
    label: string;
  };
  activeConcernIds: string[];
  lastActiveAt: string;
}

export interface CharacterState {
  profile: CharacterProfile;
  concerns: Concern[];
  relationships: Record<string, Relationship>;
  shortTermMemory: ShortTermMemory[];
  longTermMemory: LongTermMemory[];
  runtime: RuntimeState;
  scene?: SceneState;
}

export interface SceneState {
  id: string;
  title: string;
  description: string;
  atmosphere: string;
  visibleCues: string[];
  activeObjects: string[];
}

export interface EventInput {
  id: string;
  type: "user_message" | "system_tick" | "mention" | "room_event" | "internal_trigger";
  timestamp: string;
  speakerId?: string;
  speakerName?: string;
  roomId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AppraisalResult {
  eventId: string;
  speakerRelationship?: Relationship;
  activatedConcerns: {
    concernId: string;
    activationScore: number;
    matchedTriggers: string[];
    reason: string;
  }[];
  eventSalience: number;
  appraisalSummary: string;
}

export interface MemoryRecallResult {
  shortTermContext: ShortTermMemory[];
  longTermMemories: {
    memoryId: string;
    summary: string;
    score: number;
    reason: string;
  }[];
}

export interface ResponseDecision {
  shouldRespond: boolean;
  responseMode: ResponseMode;
  delaySeconds?: number;
  rationale: string;
}

export interface LlmRequest {
  provider: "simulated" | "external";
  model: string;
  prompt: string;
  outputContract: string;
  generatorNotes: string[];
}

export interface LlmOutput {
  reply: string;
  concernUpdates: {
    concernId: string;
    intensityDelta?: number;
    valenceDelta?: number;
    arousalDelta?: number;
    status?: ConcernStatus;
    note: string;
  }[];
  relationshipUpdates: {
    targetId: string;
    familiarityDelta?: number;
    trustDelta?: number;
    affectionDelta?: number;
    tensionDelta?: number;
    note: string;
  }[];
  newConcerns: {
    title: string;
    description: string;
    intensity: number;
    valence: number;
    arousal: number;
    triggers: string[];
  }[];
  internalStateNote: string;
}

export interface StateDelta {
  concernChanges: string[];
  relationshipChanges: string[];
  memoryWrites: string[];
  runtimeChanges: string[];
}

export interface PipelineTrace {
  event: EventInput;
  appraisal: AppraisalResult;
  memoryRecall: MemoryRecallResult;
  decision: ResponseDecision;
  llmRequest: LlmRequest;
  llmOutput: LlmOutput;
  stateDelta: StateDelta;
}

export interface ChatMessage {
  id: string;
  speaker: "user" | "persona" | "system";
  speakerName: string;
  content: string;
  timestamp: string;
  trace?: PipelineTrace;
}

export interface LlmConfig {
  provider: "simulated" | "external";
  model: string;
  endpoint: string;
}
