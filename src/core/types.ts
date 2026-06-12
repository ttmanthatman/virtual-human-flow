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

export type ReplyRhythm = "none" | "single" | "multi_turn" | "burst";

export type RuntimeSignalKey = "energy" | "mood" | "valence" | "arousal";

export interface PersonalityFacet {
  label: string;
  summary: string;
  evidence: string[];
  tension: string;
  expression: string;
}

export interface RuntimeSignalProfile {
  label: string;
  summary: string;
  considerations: string[];
  cognitiveNarrative: string;
}

export interface RuntimeSignalEvaluationResult {
  narrative?: string;
  energy: number;
  derivedMood: {
    valence: number;
    arousal: number;
    label: string;
  };
  signalProfiles: Record<RuntimeSignalKey, RuntimeSignalProfile>;
  rationale: string;
}

export interface LifeEvent {
  id: string;
  lifeStage: "childhood" | "adolescence" | "early_adulthood" | "adulthood" | "recent";
  ageRange: string;
  title: string;
  summary: string;
  psychologicalChange: string;
  relationshipChange: string;
  relatedPeople: string[];
  emotionalValence: number;
  importance: number;
}

export interface ProfileSceneConsistencyResult {
  compatible: boolean;
  confidence: number;
  severity: "none" | "soft_mismatch" | "hard_mismatch";
  summary: string;
  mismatchReasons: string[];
  requiresDistortionPassword: boolean;
}

export interface CharacterProfile {
  id: string;
  name: string;
  age?: number;
  displaySummary: string;
  background: string;
  socialPersonaPattern?: string;
  fullLifeStory?: string;
  lifeEvents: LifeEvent[];
  personalityTraits: string[];
  personalitySummary: string;
  personalityFacets: PersonalityFacet[];
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
  sourceEventId?: string;
}

export interface RelationshipMemory {
  id: string;
  targetUserId: string;
  targetUserName: string;
  impressionSummary: string;
  relationshipSummary: string;
  evidence: string[];
  lastInteractionSummary: string;
  updatedAt: string;
  history: {
    id: string;
    summary: string;
    createdAt: string;
    sourceEventId?: string;
  }[];
}

export interface RuntimeState {
  attentionFocus?: string;
  energy: number;
  derivedMood: {
    valence: number;
    arousal: number;
    label: string;
  };
  signalProfiles: Record<RuntimeSignalKey, RuntimeSignalProfile>;
  activeConcernIds: string[];
  lastActiveAt: string;
}

export interface CharacterLocation {
  label: string;
  address: string;
  region: string;
  coordinate?: {
    lng: number;
    lat: number;
  };
  speedKmh: number;
  headingDeg: number;
  headingLabel: string;
  motionState: "stationary" | "walking" | "riding" | "driving" | "unknown";
  mapContext?: {
    nearbyRoads: string[];
    nearbyPlaces: string[];
    nearbyBuildings: string[];
    environmentSummary: string;
    source: "seed" | "manual" | "map_service" | "temporal_progression";
    resolvedAt: string;
  };
  updatedAt: string;
  source: "seed" | "manual" | "map_service" | "temporal_progression";
}

export interface CharacterState {
  profile: CharacterProfile;
  concerns: Concern[];
  relationships: Record<string, Relationship>;
  shortTermMemory: ShortTermMemory[];
  longTermMemory: LongTermMemory[];
  relationshipMemory: RelationshipMemory[];
  runtime: RuntimeState;
  scene?: SceneState;
  location?: CharacterLocation;
}

export interface PersonaDossier {
  id: string;
  title: string;
  groupName: string;
  state: CharacterState;
  dossierDescription: string;
  sceneDescription: string;
  previewSummary?: string;
  previewGeneratedAt?: string;
  previewStatus?: "pending" | "generating" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
  isBuiltin?: boolean;
}

export interface SceneState {
  id: string;
  title: string;
  description: string;
  atmosphere: string;
  visibleCues: string[];
  activeObjects: string[];
  sensoryProfile: string;
  interactionPressure: string;
  cognitiveNarrative: string;
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

export interface TemporalSceneProgression {
  changed: boolean;
  localTimeLabel: string;
  timezone: string;
  schedulePhase: "sleep" | "home" | "work" | "commute" | "errand" | "blocked";
  reason: string;
  previousSceneTitle?: string;
  nextSceneTitle?: string;
  locationPlausibility: string;
}

export interface AppraisalResult {
  narrative?: string;
  eventId: string;
  speakerRelationship?: Relationship;
  dangerState: {
    isInDanger: boolean;
    level: number;
    sources: string[];
    rationale: string;
  };
  awarenessState: {
    isClearHeaded: boolean;
    controlLevel: number;
    rationale: string;
  };
  responseNeed: {
    shouldRespond: boolean;
    rationale: string;
  };
  replyRhythm: ReplyRhythm;
  emotionalImpact: {
    level: number;
    touchedCore: string[];
    rationale: string;
  };
  composureRisk: {
    shouldLoseComposure: boolean;
    level: number;
    rationale: string;
  };
  personaBreakRisk: {
    shouldBreakPersona: boolean;
    level: number;
    rationale: string;
  };
  activatedConcerns: {
    concernId: string;
    activationScore: number;
    matchedTriggers: string[];
    reason: string;
  }[];
  eventSalience: number;
  appraisalSummary: string;
}

export type MemoryRecallSource = "sync_response" | "async_life";

export type MemoryRecallFactorName =
  | "natural_language_relevance"
  | "concern_affinity"
  | "relationship_affinity"
  | "affective_salience"
  | "recency"
  | "lexical_hint";

export interface MemoryRecallFactor {
  name: MemoryRecallFactorName;
  score: number;
  reason: string;
}

export interface MemoryRecallResult {
  narrative?: string;
  source?: MemoryRecallSource;
  retrievalMode?: "hybrid_relevance";
  naturalLanguageQuery?: string;
  shortTermContext: ShortTermMemory[];
  longTermMemories: {
    memoryId: string;
    summary: string;
    score: number;
    reason: string;
    factors?: MemoryRecallFactor[];
  }[];
}

export interface ResponseDecision {
  narrative?: string;
  shouldRespond: boolean;
  responseMode: ResponseMode;
  replyRhythm: ReplyRhythm;
  shouldLoseComposure: boolean;
  shouldBreakPersona: boolean;
  delaySeconds?: number;
  rationale: string;
}

export interface RoleTurnResult {
  narrative?: string;
  innerStateNarrative: string;
  memoryNarrative: string;
  decisionNarrative: string;
  replyOutput: ReplyOutput;
}

export interface RoleTurnProbeResult {
  narrative?: string;
  decisionPath: string;
  psychologicalEvidence: string;
  labelLockRisk: string;
  contextNoise: string;
  suggestedTrim: string;
}

export type CognitiveModuleName =
  | "role_turn"
  | "role_turn_probe"
  | "event_activity"
  | "appraisal"
  | "memory_retrieval"
  | "response_decision"
  | "reply_generation"
  | "state_update"
  | "runtime_signal_evaluation"
  | "dossier_interpretation"
  | "scene_interpretation"
  | "dossier_summary_generation"
  | "profile_scene_consistency";

export interface CognitiveModuleRequest {
  moduleName: CognitiveModuleName;
  inputMode: "natural_language" | "structured_context";
  outputMode: "natural_language" | "structured_json";
  prompt: string;
  outputContract?: string;
}

export interface CognitiveModuleTrace<TOutput> {
  moduleName: CognitiveModuleName;
  request: CognitiveModuleRequest;
  output: TOutput;
  transport: "mock_llm" | "external_llm" | "local";
  fallbackReason?: string;
}

export type PipelineStepStatus = "pending" | "running" | "streaming" | "completed" | "failed";

export type GenerationMonitorStep = "dossierSummaryGeneration" | "dossierGeneration" | "sceneGeneration";

export type MindFlowPhase = "pre_speech" | "post_speech";

export type MindFlowKind = "scene" | "internal_state" | "memory" | "relationship" | "action" | "speech" | "settle";

export interface EventActivityResult {
  narrative?: string;
  psychologicalActivity: string;
  action: string;
  movement: string;
  relationshipShift: string;
  memoryNote: string;
  externalOutput: string;
}

export interface MindFlowFrame {
  id: string;
  eventId: string;
  phase: MindFlowPhase;
  kind: MindFlowKind;
  sequence: number;
  title: string;
  content: string;
  relatedStep: keyof PipelineTrace;
  status: PipelineStepStatus;
  timestamp: string;
}

export interface PipelineStepProgress {
  step: keyof PipelineTrace | GenerationMonitorStep;
  status: PipelineStepStatus;
  input?: string;
  output?: string;
  error?: string;
  transport?: CognitiveModuleTrace<unknown>["transport"] | "local";
  mindFlow?: MindFlowFrame;
  replyOutput?: ReplyOutput;
}

export interface ExpressionLlmRequest {
  provider: "external";
  model: string;
  prompt: string;
}

export interface ReplyOutput {
  reply: string;
  segments?: string[];
}

export interface StateUpdatePlan {
  narrative?: string;
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
  userRelationshipMemory?: {
    targetUserId: string;
    targetUserName: string;
    impressionSummary: string;
    relationshipSummary: string;
    evidence: string[];
    lastInteractionSummary: string;
  };
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
  sceneContext: TemporalSceneProgression;
  mindFlow: MindFlowFrame[];
  roleTurn: CognitiveModuleTrace<RoleTurnResult>;
  roleTurnProbe?: CognitiveModuleTrace<RoleTurnProbeResult>;
  appraisal: CognitiveModuleTrace<AppraisalResult>;
  memoryRecall: CognitiveModuleTrace<MemoryRecallResult>;
  decision: CognitiveModuleTrace<ResponseDecision>;
  llmRequest: ExpressionLlmRequest;
  llmOutput: ReplyOutput;
  stateUpdate: CognitiveModuleTrace<StateUpdatePlan>;
  runtimeSignalEvaluation: CognitiveModuleTrace<RuntimeSignalEvaluationResult>;
  stateDelta: StateDelta;
}

export interface ChatMessage {
  id: string;
  speaker: "user" | "persona" | "system";
  speakerName: string;
  content: string;
  timestamp: string;
  trace?: PipelineTrace;
  messageType?: "normal" | "mind_flow" | "event_activity";
  transient?: boolean;
  collapsed?: boolean;
  details?: string[];
  mindFlow?: Pick<MindFlowFrame, "id" | "phase" | "kind" | "status">;
}

export interface LlmConfig {
  provider: "external";
  model: string;
  endpoint: string;
  authToken?: string;
}
