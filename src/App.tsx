import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Brain,
  Braces,
  ChevronsRight,
  Check,
  Database,
  Eye,
  FileText,
  LogIn,
  LogOut,
  Lock,
  MapPin,
  MessageSquare,
  Network,
  Navigation,
  Play,
  Plus,
  RefreshCcw,
  Save,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ChatMessage, CharacterState, GenerationMonitorStep, LlmConfig, PersonaDossier, PipelineStepProgress, PipelineTrace, ProfileSceneConsistencyResult } from "./core/types";
import { makeId, nowIso } from "./core/utils";
import { defaultLlmConfig, seedMessages, seedState } from "./data/seedState";
import { runConversationPipeline } from "./pipeline/conversationPipeline";
import { generateDossierFromDescription, generateSceneFromDescription } from "./pipeline/generators";
import { evaluateProfileSceneConsistency } from "./pipeline/profileSceneConsistency";
import packageInfo from "../package.json";

const githubRepositoryUrl = "https://github.com/ttmanthatman/virtual-human-flow";
const appVersionLabel = `v${packageInfo.version}`;

const traceSteps: { key: keyof PipelineTrace; label: string; icon: typeof Activity }[] = [
  { key: "event", label: "事件", icon: Play },
  { key: "appraisal", label: "评估", icon: Brain },
  { key: "memoryRecall", label: "记忆召回", icon: Database },
  { key: "decision", label: "回应决策", icon: ChevronsRight },
  { key: "llmRequest", label: "回应提示词", icon: FileText },
  { key: "llmOutput", label: "回应输出", icon: MessageSquare },
  { key: "stateUpdate", label: "状态更新", icon: Braces },
  { key: "runtimeSignalEvaluation", label: "信号评估", icon: Activity },
  { key: "stateDelta", label: "状态变化", icon: Network },
];

const generationSteps: { key: GenerationMonitorStep; label: string; icon: typeof Activity }[] = [
  { key: "dossierSummaryGeneration", label: "短预览生成", icon: Sparkles },
  { key: "dossierGeneration", label: "人物档案生成", icon: UserRound },
  { key: "sceneGeneration", label: "场景生成", icon: MapPin },
];

const concernStatusLabels = {
  active: "活跃",
  dormant: "休眠",
  resolved: "已解决",
};

const motionStateLabels: Record<NonNullable<CharacterState["location"]>["motionState"], string> = {
  stationary: "停留",
  walking: "步行",
  riding: "骑行",
  driving: "驾车",
  unknown: "未知",
};

type MonitorStepKey = keyof PipelineTrace | GenerationMonitorStep;
type TraceDisplayState = Partial<Record<MonitorStepKey, PipelineStepProgress>>;
type ConsistencyGate = {
  candidate: CharacterState;
  result: ProfileSceneConsistencyResult;
  target: "dossier" | "scene";
  password: string;
};
type AuthUser = {
  userId: number;
  username: string;
  nickname: string;
  avatar: string;
  isAdmin: boolean;
};
type ConversationAuditEntry = {
  id: string;
  createdAt: string;
  username: string;
  nickname: string;
  dossierTitle: string;
  userInput: string;
  personaOutput: string;
  status: "completed" | "failed";
  error?: string;
};
type AppUpdateStatus = {
  configured: boolean;
  available: boolean;
  branch: string;
  currentVersion: string;
  currentCommit: string;
  remoteCommit: string;
  checkedAt: string;
  message: string;
};
type AppUpdateLogEntry = {
  id: string;
  type: string;
  text: string;
  stream?: string;
};

const distortionPassword = "扭曲时空密码";
const authTokenStorageKey = "virtualHumanFlowAuthToken";
const conversationHistoryStoragePrefix = "virtualHumanFlowConversationHistory";
const maxConversationHistoryMessages = 160;

type ConversationHistoryMap = Record<string, ChatMessage[]>;
type MessageUpdater = ChatMessage[] | ((items: ChatMessage[]) => ChatMessage[]);

function createConversationHistoryKey(user: AuthUser | undefined, dossierId: string) {
  const userPart = user ? `user-${user.userId || user.username}` : "guest";
  return `${userPart}::dossier-${dossierId || "none"}`;
}

function createConversationSpeaker(user: AuthUser | undefined) {
  const stableId = user ? `user:${user.userId || user.username}` : "user:guest";
  const displayName = user?.nickname || user?.username || "当前对话者";
  return { id: stableId, name: displayName };
}

function readStoredConversationHistory(historyKey: string) {
  try {
    const raw = localStorage.getItem(`${conversationHistoryStoragePrefix}:${historyKey}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredConversationHistory(historyKey: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(`${conversationHistoryStoragePrefix}:${historyKey}`, JSON.stringify(messages.slice(-maxConversationHistoryMessages)));
  } catch {
    // History persistence is best-effort; the active in-memory history still updates.
  }
}

function createPersonaDossier(state: CharacterState, dossierDescription: string, sceneDescription: string, title?: string): PersonaDossier {
  const timestamp = nowIso();
  return {
    id: makeId("dossier"),
    title: title ?? state.profile.name,
    groupName: "未分组",
    state,
    dossierDescription,
    sceneDescription,
    previewStatus: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function App() {
  const initialDossierDescription = "林安，27岁，自由插画师，刚结束一段关系，性格克制敏感，不喜欢直接表达脆弱。";
  const initialSceneDescription = "雨夜的私人工作室，窗外有雨，桌上放着未完成的画稿和一杯快冷掉的茶。";
  const initialDossier = createPersonaDossier(seedState, initialDossierDescription, initialSceneDescription);
  const initialConversationHistoryKey = createConversationHistoryKey(undefined, initialDossier.id);
  const [dossiers, setDossiers] = useState<PersonaDossier[]>([initialDossier]);
  const [activeDossierId, setActiveDossierId] = useState(initialDossier.id);
  const [state, setState] = useState<CharacterState>(initialDossier.state);
  const [conversationHistories, setConversationHistories] = useState<ConversationHistoryMap>(() => ({
    [initialConversationHistoryKey]: readStoredConversationHistory(initialConversationHistoryKey) ?? seedMessages,
  }));
  const [input, setInput] = useState("周末一起去爬山吗？");
  const [dossierDescription, setDossierDescription] = useState(initialDossierDescription);
  const [sceneDescription, setSceneDescription] = useState(initialSceneDescription);
  const [dossierPreview, setDossierPreview] = useState<CharacterState | undefined>();
  const [scenePreview, setScenePreview] = useState<CharacterState | undefined>();
  const [consistencyGate, setConsistencyGate] = useState<ConsistencyGate | undefined>();
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(defaultLlmConfig);
  const [activeTrace, setActiveTrace] = useState<PipelineTrace | undefined>();
  const [liveTrace, setLiveTrace] = useState<TraceDisplayState>({});
  const [activeStep, setActiveStep] = useState<MonitorStepKey>("event");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekStatus, setDeepseekStatus] = useState("正在检查 DeepSeek 连接");
  const [deepseekConnected, setDeepseekConnected] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(authTokenStorageKey) || "");
  const [authUser, setAuthUser] = useState<AuthUser | undefined>();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [dossierSyncStatus, setDossierSyncStatus] = useState("登录后读取后台共享档案");
  const [auditEntries, setAuditEntries] = useState<ConversationAuditEntry[]>([]);
  const [auditPanelOpen, setAuditPanelOpen] = useState(false);
  const [auditStatus, setAuditStatus] = useState("管理员可查看用户输入输出");
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | undefined>();
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updatePanelOpen, setUpdatePanelOpen] = useState(false);
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateLogs, setUpdateLogs] = useState<AppUpdateLogEntry[]>([]);
  const generatingPreviewIds = useRef(new Set<string>());

  const selectedTraceData = liveTrace[activeStep] ?? (isPipelineTraceStep(activeStep) ? buildCompletedTraceProgress(activeStep, activeTrace) : undefined);
  const traceDisplay = formatTraceDisplay(selectedTraceData);
  const isAuthenticated = Boolean(authToken && authUser);
  const isAdmin = Boolean(authUser?.isAdmin);
  const activeConcernTitles = useMemo(
    () => state.concerns.filter((concern) => state.runtime.activeConcernIds.includes(concern.id)).map((concern) => concern.title),
    [state.concerns, state.runtime.activeConcernIds],
  );
  const activeDossier = useMemo(() => dossiers.find((dossier) => dossier.id === activeDossierId) ?? dossiers[0], [activeDossierId, dossiers]);
  const activeConversationHistoryKey = useMemo(() => createConversationHistoryKey(authUser, activeDossierId), [authUser, activeDossierId]);
  const activeConversationSpeaker = useMemo(() => createConversationSpeaker(authUser), [authUser]);
  const activeRelationshipMemory = useMemo(
    () => (state.relationshipMemory ?? []).find((memory) => memory.targetUserId === activeConversationSpeaker.id),
    [activeConversationSpeaker.id, state.relationshipMemory],
  );
  const messages = conversationHistories[activeConversationHistoryKey] ?? seedMessages;
  const groupedDossiers = useMemo(() => {
    const groups = new Map<string, PersonaDossier[]>();
    for (const dossier of dossiers) {
      const groupName = dossier.groupName || "未分组";
      groups.set(groupName, [...(groups.get(groupName) ?? []), dossier]);
    }
    return Array.from(groups.entries());
  }, [dossiers]);
  const updateStatusLabel = isCheckingUpdate
    ? "检查中"
    : appUpdateStatus?.available
      ? "有新版本"
      : appUpdateStatus && !appUpdateStatus.configured
        ? "更新未配置"
        : appUpdateStatus
          ? "已是最新"
          : "检查更新";

  useEffect(() => {
    const cachedMessages = readStoredConversationHistory(activeConversationHistoryKey);
    setConversationHistories((current) => {
      if (current[activeConversationHistoryKey]) return current;
      return {
        ...current,
        [activeConversationHistoryKey]: cachedMessages ?? seedMessages,
      };
    });
    if (isAuthenticated && activeDossierId) {
      void loadConversationHistory(activeDossierId, activeConversationHistoryKey, cachedMessages);
    }
  }, [activeConversationHistoryKey, activeDossierId, isAuthenticated]);

  useEffect(() => {
    if (!activeDossier || !isAuthenticated || !deepseekConnected) return;
    if (activeDossier.previewSummary || generatingPreviewIds.current.has(activeDossier.id)) return;
    void ensureDossierPreview(activeDossier);
  }, [activeDossier?.id, activeDossier?.previewSummary, isAuthenticated, deepseekConnected]);

  useEffect(() => {
    fetch("/api/deepseek-config")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("无法读取 DeepSeek 配置"))))
      .then((config: { apiKeySaved: boolean; endpoint?: string; model?: string }) => {
        setDeepseekConnected(config.apiKeySaved);
        setDeepseekStatus(config.apiKeySaved ? "DeepSeek 已连接" : "DeepSeek 密钥尚未保存");
        setLlmConfig((current) => ({
          ...current,
          provider: "external",
          endpoint: config.endpoint || "/api/deepseek-chat",
          model: normalizeDeepseekModel(config.model || current.model || "deepseek-v4-flash"),
        }));
      })
      .catch(() => {
        setDeepseekConnected(false);
        setDeepseekStatus("DeepSeek 配置接口不可用");
      });
  }, []);

  useEffect(() => {
    void checkAppUpdate();
    const timer = window.setInterval(() => void checkAppUpdate(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLlmConfig((current) => ({ ...current, authToken }));
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    fetch("/api/auth/session", { headers: authHeaders(authToken) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("登录态不可用"))))
      .then((session: { authenticated: boolean; user?: AuthUser | null }) => {
        if (!session.authenticated || !session.user) {
          clearLocalAuth();
          return;
        }
        setAuthUser(session.user);
        void loadSharedDossiers(authToken);
      })
      .catch(() => {
        clearLocalAuth();
      });
  }, []);

  function authHeaders(token = authToken, extra: Record<string, string> = {}) {
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  function setMessages(updater: MessageUpdater) {
    setMessagesForHistory(activeConversationHistoryKey, updater);
  }

  function setMessagesForHistory(historyKey: string, updater: MessageUpdater) {
    setConversationHistories((current) => {
      const existing = current[historyKey] ?? readStoredConversationHistory(historyKey) ?? seedMessages;
      const nextMessages = typeof updater === "function" ? updater(existing) : updater;
      const trimmedMessages = nextMessages.slice(-maxConversationHistoryMessages);
      writeStoredConversationHistory(historyKey, trimmedMessages);
      return {
        ...current,
        [historyKey]: trimmedMessages,
      };
    });
  }

  function clearLocalAuth() {
    localStorage.removeItem(authTokenStorageKey);
    setAuthToken("");
    setAuthUser(undefined);
    setLlmConfig((current) => ({ ...current, authToken: "" }));
    setDossierSyncStatus("登录后读取后台共享档案");
  }

  function requireLogin(action: string) {
    if (isAuthenticated) return true;
    setLoginModalOpen(true);
    setLoginError("");
    setError(`${action}需要先登录。`);
    return false;
  }

  function requireAdmin(action: string) {
    if (!requireLogin(action)) return false;
    if (isAdmin) return true;
    setError("只有管理员可以添加或修改档案。");
    return false;
  }

  async function loadSharedDossiers(token = authToken) {
    if (!token) return;
    setDossierSyncStatus("正在读取后台共享档案...");
    try {
      const response = await fetch("/api/persona-dossiers", { headers: authHeaders(token) });
      if (!response.ok) {
        setDossierSyncStatus(response.status === 401 ? "登录后读取后台共享档案" : "后台共享档案读取失败");
        return;
      }
      const data = (await response.json()) as { dossiers?: PersonaDossier[] };
      if (Array.isArray(data.dossiers) && data.dossiers.length > 0) {
        setDossiers(data.dossiers);
        const nextActive = data.dossiers[0];
        setActiveDossierId(nextActive.id);
        setState(nextActive.state);
        setDossierDescription(nextActive.dossierDescription);
        setSceneDescription(nextActive.sceneDescription);
      }
      setDossierSyncStatus(data.dossiers?.length ? "已读取后台共享档案" : "后台暂无共享档案，管理员可保存当前档案");
    } catch {
      setDossierSyncStatus("后台共享档案读取失败");
    }
  }

  async function persistPersonaDossier(dossier = activeDossier) {
    if (!dossier || !requireAdmin("保存档案")) return;
    setDossierSyncStatus("正在保存后台档案...");
    const response = await fetch("/api/persona-dossiers", {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ dossier }),
    });
    if (!response.ok) {
      const detail = await response.text();
      setDossierSyncStatus(`保存失败：${detail.slice(0, 80)}`);
      return;
    }
    const data = (await response.json()) as { dossier?: PersonaDossier };
    if (data.dossier) {
      setDossiers((items) => items.map((item) => (item.id === data.dossier?.id ? data.dossier : item)));
    }
    setDossierSyncStatus("后台档案已保存");
  }

  async function ensureDossierPreview(dossier: PersonaDossier) {
    generatingPreviewIds.current.add(dossier.id);
    setDossiers((items) => items.map((item) => (item.id === dossier.id ? { ...item, previewStatus: "generating" } : item)));
    try {
      const detail = formatDossierDetailForPreview(dossier);
      const prompt = [
        "请为下面这个虚拟人物档案生成一段给左侧列表使用的中文预览。",
        "只输出预览文本本身，不要标题、编号、解释或引号。",
        "预览控制在 45 到 70 个中文字符之间，要体现此人的社会角色、核心张力和区别于其他人的气质。",
        detail,
      ].join("\n\n");
      updateMonitorProgress({
        step: "dossierSummaryGeneration",
        status: "running",
        input: prompt,
        output: "等待 DeepSeek 生成短预览...",
      });
      const response = await fetch("/api/deepseek-chat", {
        method: "POST",
        headers: authHeaders(authToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          moduleName: "dossier_summary_generation",
          inputMode: "natural_language",
          outputMode: "natural_language",
          prompt,
          stream: true,
        }),
      });
      if (!response.ok) throw new Error("DeepSeek 预览生成失败");
      const previewSummary = (await readNaturalLanguageEventStream(response, (output) =>
        updateMonitorProgress({
          step: "dossierSummaryGeneration",
          status: "streaming",
          output,
        }),
      )).trim();
      if (!previewSummary) throw new Error("DeepSeek 没有返回预览文本");

      const saveResponse = await fetch(`/api/persona-dossiers/${encodeURIComponent(dossier.id)}/preview`, {
        method: "POST",
        headers: authHeaders(authToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ previewSummary }),
      });
      const saveData = (await saveResponse.json()) as { dossier?: PersonaDossier; error?: string };
      if (!saveResponse.ok || !saveData.dossier) throw new Error(saveData.error || "预览全局保存失败");
      setDossiers((items) => items.map((item) => (item.id === dossier.id ? saveData.dossier! : item)));
      updateMonitorProgress({
        step: "dossierSummaryGeneration",
        status: "completed",
        input: prompt,
        output: previewSummary,
        transport: "external_llm",
      });
      setDossierSyncStatus("人物预览已由 DeepSeek 生成并全局保存");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "人物预览生成失败";
      setDossiers((items) => items.map((item) => (item.id === dossier.id ? { ...item, previewStatus: "pending" } : item)));
      updateMonitorProgress({
        step: "dossierSummaryGeneration",
        status: "failed",
        error: message,
      });
      setDossierSyncStatus(message);
    } finally {
      generatingPreviewIds.current.delete(dossier.id);
    }
  }

  async function syncConversationState(nextState: CharacterState, interaction: { userInput: string; personaOutput: string }) {
    const response = await fetch(`/api/persona-dossiers/${encodeURIComponent(activeDossierId)}/conversation-state`, {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ state: nextState, interaction }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { dossier?: PersonaDossier; dossiers?: PersonaDossier[] };
    if (Array.isArray(data.dossiers) && data.dossiers.length > 0) {
      setDossiers(data.dossiers);
      const active = data.dossiers.find((dossier) => dossier.id === activeDossierId);
      if (active) setState(active.state);
      return;
    }
    if (data.dossier) {
      setDossiers((items) => items.map((item) => (item.id === data.dossier?.id ? data.dossier : item)));
      if (data.dossier.id === activeDossierId) setState(data.dossier.state);
    }
  }

  async function loadConversationHistory(dossierId: string, historyKey: string, cachedMessages?: ChatMessage[]) {
    const response = await fetch(`/api/persona-dossiers/${encodeURIComponent(dossierId)}/conversation-history`, { headers: authHeaders() }).catch(() => undefined);
    if (!response?.ok) return;
    const data = (await response.json()) as { messages?: ChatMessage[] };
    const remoteMessages = Array.isArray(data.messages) ? data.messages : [];
    if (remoteMessages.length > 0) {
      setMessagesForHistory(historyKey, remoteMessages);
      return;
    }
    if (cachedMessages && cachedMessages.length > 0 && cachedMessages !== seedMessages) {
      void persistConversationHistoryMessages(dossierId, cachedMessages);
    }
  }

  async function persistConversationHistoryMessages(dossierId: string, messagesToSave: ChatMessage[]) {
    if (!authToken || messagesToSave.length === 0) return;
    await fetch(`/api/persona-dossiers/${encodeURIComponent(dossierId)}/conversation-history`, {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ messages: messagesToSave }),
    }).catch(() => undefined);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError("请输入用户名和密码");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      const data = (await response.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!response.ok || !data.token || !data.user) {
        setLoginError(data.error || "登录失败");
        return;
      }

      const loggedInUser = data.user;
      localStorage.setItem(authTokenStorageKey, data.token);
      setAuthToken(data.token);
      setAuthUser(loggedInUser);
      setLoginPassword("");
      setLoginModalOpen(false);
      setError("");
      setMessagesForHistory(createConversationHistoryKey(loggedInUser, activeDossierId), (items) => [
        ...items,
        {
          id: makeId("msg"),
          speaker: "system",
          speakerName: "登录",
          content: `已登录为 ${loggedInUser.nickname || loggedInUser.username}${loggedInUser.isAdmin ? "（管理员）" : ""}。`,
          timestamp: nowIso(),
        },
      ]);
      await loadSharedDossiers(data.token);
    } catch {
      setLoginError("登录失败");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    if (authToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: authHeaders(),
      }).catch(() => undefined);
    }
    clearLocalAuth();
    setAuditPanelOpen(false);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "登录",
        content: "已退出登录。界面仍可查看，操作前需要重新登录。",
        timestamp: nowIso(),
      },
    ]);
  }

  async function recordConversationAudit(entry: Pick<ConversationAuditEntry, "dossierTitle" | "userInput" | "personaOutput" | "status" | "error"> & { dossierId: string }) {
    if (!authToken) return;
    await fetch("/api/conversation-audits", {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify(entry),
    }).catch(() => undefined);
  }

  async function loadConversationAudits() {
    if (!requireAdmin("查看审计记录")) return;
    setAuditStatus("正在读取审计记录...");
    const response = await fetch("/api/conversation-audits", { headers: authHeaders() });
    if (!response.ok) {
      const detail = await response.text();
      setAuditStatus(`审计读取失败：${detail.slice(0, 80)}`);
      return;
    }
    const data = (await response.json()) as { entries?: ConversationAuditEntry[] };
    setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
    setAuditPanelOpen(true);
    setAuditStatus(data.entries?.length ? "已读取用户输入输出" : "暂无用户输入输出记录");
  }

  async function deleteConversationAuditEntry(auditId: string) {
    if (!requireAdmin("删除审计记录")) return;
    const response = await fetch(`/api/conversation-audits/${encodeURIComponent(auditId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const detail = await response.text();
      setAuditStatus(`审计删除失败：${detail.slice(0, 80)}`);
      return;
    }
    setAuditEntries((items) => items.filter((entry) => entry.id !== auditId));
    setAuditStatus("已删除一条用户输入输出记录");
  }

  async function clearConversationAuditEntries() {
    if (!requireAdmin("清空审计记录")) return;
    if (auditEntries.length > 0 && !window.confirm("确定清空所有用户输入输出记录吗？")) return;
    const response = await fetch("/api/conversation-audits", {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const detail = await response.text();
      setAuditStatus(`审计清空失败：${detail.slice(0, 80)}`);
      return;
    }
    setAuditEntries([]);
    setAuditStatus("已清空用户输入输出记录");
  }

  async function checkAppUpdate() {
    setIsCheckingUpdate(true);
    try {
      const response = await fetch("/api/app-update/status");
      if (!response.ok) throw new Error("版本检查失败");
      const data = (await response.json()) as AppUpdateStatus;
      setAppUpdateStatus(data);
    } catch {
      setAppUpdateStatus({
        configured: false,
        available: false,
        branch: "main",
        currentVersion: packageInfo.version,
        currentCommit: "",
        remoteCommit: "",
        checkedAt: nowIso(),
        message: "无法检查服务器版本",
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  async function handleRunAppUpdate() {
    if (!requireAdmin("更新服务器")) return;
    setUpdatePanelOpen(true);
    setIsUpdatingApp(true);
    setUpdateProgress(2);
    setUpdateLogs([{ id: makeId("update"), type: "step", text: "开始连接服务器更新通道" }]);

    try {
      const response = await fetch("/api/app-update/run", {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail.slice(0, 160) || "服务器拒绝更新请求");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) consumeUpdateEvent(event);
      }
      if (buffer.trim()) consumeUpdateEvent(buffer);
      void checkAppUpdate();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "更新失败";
      appendUpdateLog({ type: "error", text: message });
      setError(message);
      setUpdateProgress(100);
    } finally {
      setIsUpdatingApp(false);
    }
  }

  function consumeUpdateEvent(event: string) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;

    try {
      const payload = JSON.parse(data) as { type?: string; label?: string; message?: string; text?: string; stream?: string; progress?: number; status?: string };
      if (typeof payload.progress === "number") setUpdateProgress(payload.progress);
      if (payload.type === "done") {
        appendUpdateLog({ type: "done", text: payload.message || payload.label || "更新完成" });
        return;
      }
      if (payload.type === "error") {
        appendUpdateLog({ type: "error", text: payload.message || payload.label || "更新失败" });
        return;
      }
      if (payload.type === "log") {
        appendUpdateLog({ type: "log", text: payload.text || "", stream: payload.stream });
        return;
      }
      appendUpdateLog({ type: payload.type || "step", text: `${payload.label || "更新步骤"}${payload.status ? `：${traceStatusLabel(payload.status as PipelineStepProgress["status"])}` : ""}` });
    } catch {
      appendUpdateLog({ type: "log", text: data });
    }
  }

  function appendUpdateLog(entry: Omit<AppUpdateLogEntry, "id">) {
    if (!entry.text.trim()) return;
    setUpdateLogs((items) => [...items, { ...entry, id: makeId("update") }].slice(-120));
  }

  function updateMonitorProgress(progress: PipelineStepProgress) {
    setActiveStep(progress.step);
    setLiveTrace((current) => ({
      ...current,
      [progress.step]: {
        ...current[progress.step],
        ...progress,
      },
    }));
  }

  function updateActiveDossier(patch: Partial<Pick<PersonaDossier, "state" | "dossierDescription" | "sceneDescription" | "title" | "groupName">>) {
    setDossiers((items) =>
      items.map((item) =>
        item.id === activeDossierId
          ? {
              ...item,
              ...patch,
              updatedAt: nowIso(),
            }
          : item,
      ),
    );
  }

  function handleSelectDossier(dossier: PersonaDossier) {
    if (!requireLogin("切换档案")) return;
    setActiveDossierId(dossier.id);
    setState(dossier.state);
    setDossierDescription(dossier.dossierDescription);
    setSceneDescription(dossier.sceneDescription);
    setDossierPreview(undefined);
    setScenePreview(undefined);
    setConsistencyGate(undefined);
    setError("");
  }

  async function handleCreateDossier() {
    if (!requireAdmin("新建档案")) return;
    const nextState: CharacterState = {
      ...seedState,
      profile: {
        ...seedState.profile,
        id: makeId("persona"),
        name: `新档案 ${dossiers.length + 1}`,
        displaySummary: "等待 LLM 解读人物素材后生成摘要。",
        background: "等待用户输入人物素材。",
        socialPersonaPattern: "等待 LLM 判断此人在社会性格分布中的位置。",
        fullLifeStory: "等待 LLM 根据人物素材整理从小到大的经历和心理变化。",
        lifeEvents: [],
        personalityTraits: ["待解读"],
      },
      concerns: [],
      shortTermMemory: [],
      longTermMemory: [],
      relationshipMemory: [],
      runtime: {
        ...seedState.runtime,
        activeConcernIds: [],
        attentionFocus: "等待人物和场景配置",
        derivedMood: {
          valence: 0,
          arousal: 0.2,
          label: "待配置",
        },
      },
      scene: {
        ...seedState.scene!,
        id: makeId("scene"),
        title: "待配置场景",
        description: "等待用户输入场景素材。",
        atmosphere: "待配置",
        visibleCues: [],
        activeObjects: [],
        sensoryProfile: "等待 LLM 解读场景素材。",
        interactionPressure: "等待 LLM 判断场景压力。",
        cognitiveNarrative: "人物和场景尚未形成配套语境。",
      },
      location: {
        ...seedState.location!,
        label: "待配置位置",
        address: "等待管理员填写或未来地图服务解析",
        region: "未分组区域",
        coordinate: undefined,
        speedKmh: 0,
        headingDeg: 0,
        headingLabel: "原地",
        motionState: "stationary",
        mapContext: {
          nearbyRoads: [],
          nearbyPlaces: [],
          nearbyBuildings: [],
          environmentSummary: "地图服务尚未接入，当前仅保留可手动维护的位置字段。",
          source: "manual",
          resolvedAt: nowIso(),
        },
        updatedAt: nowIso(),
        source: "manual",
      },
    };
    const nextDossier = createPersonaDossier(nextState, "", "", nextState.profile.name);
    setDossiers((items) => [...items, nextDossier]);
    handleSelectDossier(nextDossier);
    await persistPersonaDossier(nextDossier);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "档案",
      content: `已新建 ${nextDossier.title}，人物档案、成长故事和场景将作为一组保存。`,
        timestamp: nowIso(),
      },
    ]);
  }

  async function handleDeleteDossier(id: string) {
    if (!requireAdmin("删除档案")) return;

    const response = await fetch(`/api/persona-dossiers/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const detail = await response.text();
      setError(`后台删除失败：${detail.slice(0, 80)}`);
      return;
    }

    const removingActive = id === activeDossierId;
    const nextItems = dossiers.filter((dossier) => dossier.id !== id);
    setDossiers(nextItems);
    if (removingActive) {
      const nextActive = nextItems[0];
      if (nextActive) {
        setActiveDossierId(nextActive.id);
        setState(nextActive.state);
        setDossierDescription(nextActive.dossierDescription);
        setSceneDescription(nextActive.sceneDescription);
      } else {
        setActiveDossierId("");
        setState(seedState);
        setDossierDescription("");
        setSceneDescription("");
      }
      setDossierPreview(undefined);
      setScenePreview(undefined);
      setConsistencyGate(undefined);
    }
  }

  function handleDossierDescriptionChange(value: string) {
    if (!isAdmin) {
      if (!isAuthenticated) setLoginModalOpen(true);
      setError(isAuthenticated ? "只有管理员可以修改人物档案。" : "修改人物档案需要先登录。");
      return;
    }
    setDossierDescription(value);
    updateActiveDossier({ dossierDescription: value });
  }

  function handleSceneDescriptionChange(value: string) {
    if (!isAdmin) {
      if (!isAuthenticated) setLoginModalOpen(true);
      setError(isAuthenticated ? "只有管理员可以修改场景。" : "修改场景需要先登录。");
      return;
    }
    setSceneDescription(value);
    updateActiveDossier({ sceneDescription: value });
  }

  function handleDossierGroupChange(value: string) {
    if (!isAdmin) {
      if (!isAuthenticated) setLoginModalOpen(true);
      setError(isAuthenticated ? "只有管理员可以修改档案分组。" : "修改档案分组需要先登录。");
      return;
    }
    updateActiveDossier({ groupName: value });
  }

  async function handleSaveDeepseekConfig() {
    if (!requireAdmin("保存 DeepSeek 密钥")) return;
    if (!deepseekApiKey.trim()) {
      setDeepseekConnected(false);
      setDeepseekStatus("请输入 DeepSeek 密钥后再保存");
      return;
    }

    setDeepseekStatus("正在保存 DeepSeek 密钥...");
    const response = await fetch("/api/deepseek-config", {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        apiKey: deepseekApiKey.trim(),
        model: "deepseek-v4-flash",
        endpoint: "/api/deepseek-chat",
      }),
    });

    if (!response.ok) {
      setDeepseekConnected(false);
      setDeepseekStatus("DeepSeek 密钥保存失败");
      return;
    }

    setDeepseekApiKey("");
    setDeepseekConnected(true);
    setDeepseekStatus("DeepSeek 已连接");
    setLlmConfig((current) => ({ ...current, provider: "external", model: "deepseek-v4-flash", endpoint: "/api/deepseek-chat" }));
  }

  async function handleTestDeepseekConfig() {
    if (!requireLogin("测试 DeepSeek 连接")) return;
    setDeepseekStatus("正在测试 DeepSeek 连接...");
    const response = await fetch("/api/deepseek-chat", {
      method: "POST",
      headers: authHeaders(authToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        moduleName: "reply_generation",
        inputMode: "natural_language",
        outputMode: "natural_language",
        prompt: "请只回复：连接成功",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      setDeepseekConnected(false);
      setDeepseekStatus(`DeepSeek 连接失败：${response.status} ${detail.slice(0, 80)}`);
      return;
    }

    const data = (await response.json()) as { reply?: string };
    setDeepseekConnected(true);
    setDeepseekStatus(data.reply ? `DeepSeek 已连接：${data.reply}` : "DeepSeek 已连接");
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!requireLogin("发送消息")) return;
    if (!input.trim() || isRunning) return;
    const sendingDossierId = activeDossierId;
    const sendingHistoryKey = activeConversationHistoryKey;
    setIsRunning(true);
    setError("");
    setActiveTrace(undefined);
    setLiveTrace({});

    const userMessage: ChatMessage = {
      id: makeId("msg"),
      speaker: "user",
      speakerName: activeConversationSpeaker.name,
      content: input.trim(),
      timestamp: nowIso(),
    };
    setMessagesForHistory(sendingHistoryKey, (items) => [...items, userMessage]);

    try {
      const result = await runConversationPipeline({
        content: input.trim(),
        state,
        llmConfig,
        speaker: activeConversationSpeaker,
        onProgress: (progress) => {
          updateMonitorProgress(progress);
        },
      });
      setState(result.nextState);
      updateActiveDossier({ state: result.nextState, title: result.nextState.profile.name });
      setActiveTrace(result.trace);

      const reply = result.trace.llmOutput.reply || "（林安看见了，但没有回复。）";
      const replyMessage: ChatMessage = {
        id: makeId("msg"),
        speaker: result.trace.llmOutput.reply ? "persona" : "system",
        speakerName: result.trace.llmOutput.reply ? result.nextState.profile.name : "沉默",
        content: reply,
        timestamp: nowIso(),
        trace: result.trace,
      };
      setMessagesForHistory(sendingHistoryKey, (items) => [...items, replyMessage]);
      await persistConversationHistoryMessages(sendingDossierId, [userMessage, replyMessage]);
      await syncConversationState(result.nextState, {
        userInput: userMessage.content,
        personaOutput: reply,
      });
      await recordConversationAudit({
        dossierId: activeDossierId,
        dossierTitle: result.nextState.profile.name,
        userInput: userMessage.content,
        personaOutput: reply,
        status: "completed",
      });
      setInput("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "流程运行失败";
      setError(message);
      await persistConversationHistoryMessages(sendingDossierId, [userMessage]);
      await recordConversationAudit({
        dossierId: activeDossierId,
        dossierTitle: activeDossier?.title ?? state.profile.name,
        userInput: userMessage.content,
        personaOutput: "",
        status: "failed",
        error: message,
      });
      setLiveTrace((current) => ({
        ...current,
        [activeStep]: {
          ...current[activeStep],
          step: activeStep,
          status: "failed",
          error: message,
        },
      }));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleGenerateDossier() {
    if (!requireAdmin("预览人物档案")) return;
    if (!dossierDescription.trim() || isGeneratingDossier) return;
    setIsGeneratingDossier(true);
    setError("");

    try {
      const preview = await generateDossierFromDescription(dossierDescription, state, llmConfig, updateMonitorProgress);
      setDossierPreview(preview);
      setMessages((items) => [
        ...items,
        {
          id: makeId("msg"),
          speaker: "system",
          speakerName: "人物档案",
          content: `LLM 已重新解读 ${preview.profile.name} 的人物档案：${preview.profile.displaySummary}`,
          timestamp: nowIso(),
        },
      ]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "人物档案预览失败";
      setError(message);
      updateMonitorProgress({
        step: "dossierGeneration",
        status: "failed",
        error: message,
      });
    } finally {
      setIsGeneratingDossier(false);
    }
  }

  async function handleApplyDossier() {
    if (!requireAdmin("应用人物档案")) return;
    if (!dossierPreview) return;
    await applyCandidateState(dossierPreview, "dossier");
  }

  async function handleGenerateScene() {
    if (!requireAdmin("预览场景")) return;
    if (!sceneDescription.trim() || isGeneratingScene) return;
    setIsGeneratingScene(true);
    setError("");

    try {
      const preview = await generateSceneFromDescription(sceneDescription, state, llmConfig, updateMonitorProgress);
      setScenePreview(preview);
      setMessages((items) => [
        ...items,
        {
          id: makeId("msg"),
          speaker: "system",
          speakerName: "场景",
          content: `LLM 已重新解读场景：${preview.scene?.title ?? "新场景"}。状态焦点：${preview.runtime.attentionFocus ?? "已更新"}`,
          timestamp: nowIso(),
        },
      ]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "场景预览失败";
      setError(message);
      updateMonitorProgress({
        step: "sceneGeneration",
        status: "failed",
        error: message,
      });
    } finally {
      setIsGeneratingScene(false);
    }
  }

  async function handleApplyScene() {
    if (!requireAdmin("应用场景")) return;
    if (!scenePreview) return;
    await applyCandidateState(scenePreview, "scene");
  }

  async function applyCandidateState(candidate: CharacterState, target: "dossier" | "scene", bypassDistortionPassword = false) {
    if (!requireAdmin("应用档案变更")) return;
    setError("");
    const consistency = await evaluateProfileSceneConsistency(candidate, llmConfig);

    if (consistency.requiresDistortionPassword && !bypassDistortionPassword) {
      setConsistencyGate({
        candidate,
        result: consistency,
        target,
        password: "",
      });
      setMessages((items) => [
        ...items,
        {
          id: makeId("msg"),
          speaker: "system",
          speakerName: "时空检测",
          content: `LLM 判断人物档案和场景不匹配：${consistency.summary}`,
          timestamp: nowIso(),
        },
      ]);
      return;
    }

    commitCandidateState(candidate, target, consistency);
  }

  function commitCandidateState(candidate: CharacterState, target: "dossier" | "scene", consistency?: ProfileSceneConsistencyResult) {
    setError("");
    const nextDossier: PersonaDossier = {
      ...activeDossier,
      state: candidate,
      title: candidate.profile.name,
      updatedAt: nowIso(),
    };
    setState(candidate);
    setDossiers((items) => items.map((item) => (item.id === activeDossierId ? nextDossier : item)));
    void persistPersonaDossier(nextDossier);
    if (target === "dossier") setDossierPreview(undefined);
    if (target === "scene") setScenePreview(undefined);
    setConsistencyGate(undefined);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: target === "dossier" ? "人物档案" : "场景",
        content:
          target === "dossier"
            ? `已应用 ${candidate.profile.name} 的人物档案。${consistency?.summary ? `一致性检测：${consistency.summary}` : ""}`
            : `已应用场景：${candidate.scene?.title ?? "新场景"}。${consistency?.summary ? `一致性检测：${consistency.summary}` : ""}`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleDistortionPasswordChange(value: string) {
    setConsistencyGate((current) => (current ? { ...current, password: value } : current));
  }

  function handleConfirmDistortionPassword() {
    if (!requireAdmin("应用档案变更")) return;
    if (!consistencyGate) return;
    if (consistencyGate.password.trim() !== distortionPassword) {
      setError("扭曲时空密码不正确。");
      return;
    }

    commitCandidateState(consistencyGate.candidate, consistencyGate.target, consistencyGate.result);
  }

  function handleReset() {
    if (!requireLogin("重置工作台")) return;
    const resetDossierDescription = "林安，27岁，自由插画师，刚结束一段关系，性格克制敏感，不喜欢直接表达脆弱。";
    const resetSceneDescription = "雨夜的私人工作室，窗外有雨，桌上放着未完成的画稿和一杯快冷掉的茶。";
    const resetDossier = createPersonaDossier(seedState, resetDossierDescription, resetSceneDescription);
    setState(seedState);
    setMessages(seedMessages);
    setActiveTrace(undefined);
    setLiveTrace({});
    setActiveStep("event");
    setInput("周末一起去爬山吗？");
    setDossierDescription(resetDossierDescription);
    setSceneDescription(resetSceneDescription);
    setDossierPreview(undefined);
    setScenePreview(undefined);
    setConsistencyGate(undefined);
    setDossiers([resetDossier]);
    setActiveDossierId(resetDossier.id);
    if (authToken) void loadSharedDossiers(authToken);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>虚拟人心流工作台</h1>
            <p>
              <span>事件驱动 + 状态机 + 语言模型表达器</span>
              <a className="version-link" href={githubRepositoryUrl} target="_blank" rel="noreferrer" title="打开 GitHub 仓库">
                {appVersionLabel} · GitHub
              </a>
              <button
                className={appUpdateStatus?.available ? "update-status-button available" : "update-status-button"}
                type="button"
                onClick={() => {
                  setUpdatePanelOpen(true);
                  void checkAppUpdate();
                }}
                title="检查服务器更新"
              >
                <RefreshCcw size={12} />
                {updateStatusLabel}
              </button>
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={isAuthenticated ? "auth-pill signed-in" : "auth-pill"}>
            {isAuthenticated ? <ShieldCheck size={15} /> : <LogIn size={15} />}
            <div>
              <strong>{isAuthenticated ? authUser?.nickname || authUser?.username : "未登录"}</strong>
              <span>{isAdmin ? "管理员" : isAuthenticated ? "普通用户" : "只可查看界面"}</span>
            </div>
          </div>
          {isAuthenticated ? (
            <button className="icon-button" type="button" onClick={handleLogout} title="退出登录">
              <LogOut size={17} />
            </button>
          ) : (
            <button className="secondary-button topbar-login" type="button" onClick={() => setLoginModalOpen(true)}>
              <LogIn size={15} /> 登录
            </button>
          )}
          <div className={deepseekConnected ? "connection-pill connected" : "connection-pill"}>
            <Check size={15} />
            <div>
              <strong>{deepseekConnected ? "DeepSeek 已连接" : "DeepSeek 未连接"}</strong>
              <span>{deepseekConnected ? "连接可用" : "等待配置"}</span>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={handleReset} title="重置">
            <RefreshCcw size={17} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel state-panel">
          <PanelTitle icon={UserRound} title="状态" />

          <section className="subsection dossier-manager">
            <div className="subsection-head">
              <h2>多人档案</h2>
              <button className="icon-button compact" type="button" onClick={handleCreateDossier} title="新建档案">
                <Plus size={15} />
              </button>
            </div>
            <small className="sync-status">{dossierSyncStatus}</small>
            <div className="dossier-tabs">
              {groupedDossiers.map(([groupName, groupDossiers]) => (
                <section className="dossier-group" key={groupName}>
                  <div className="dossier-group-title">
                    <span>{groupName}</span>
                    <small>{groupDossiers.length}</small>
                  </div>
                  {groupDossiers.map((dossier) => {
                    const previewIsGenerating = !dossier.previewSummary || dossier.previewStatus === "generating";
                    return (
                      <button
                        className={["dossier-tab", dossier.id === activeDossierId ? "selected" : "", previewIsGenerating ? "generating" : ""].filter(Boolean).join(" ")}
                        key={dossier.id}
                        type="button"
                        onClick={() => handleSelectDossier(dossier)}
                      >
                        <div className="dossier-tab-head">
                          <span>{dossier.title}</span>
                          {previewIsGenerating ? <Sparkles className="generating-icon" size={13} /> : null}
                        </div>
                        <small className={previewIsGenerating ? "preview-summary generating" : "preview-summary"}>{dossier.previewSummary ?? "预览生成中"}</small>
                        {dossier.state.location ? <small>{dossier.state.location.label}</small> : null}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
            <div className="dossier-actions">
              <label className="group-field">
                <span>分组</span>
                <input
                  value={activeDossier?.groupName ?? "未分组"}
                  onChange={(event) => handleDossierGroupChange(event.target.value)}
                  onFocus={() => {
                    if (!isAuthenticated) setLoginModalOpen(true);
                    if (!isAdmin) setError(isAuthenticated ? "只有管理员可以修改档案分组。" : "修改档案分组需要先登录。");
                  }}
                  disabled={!activeDossierId}
                  readOnly={!isAdmin}
                />
              </label>
              <button className="secondary-button" type="button" onClick={() => persistPersonaDossier()} disabled={!activeDossierId}>
                <Save size={15} /> 保存后台档案
              </button>
              <button className="secondary-button danger-button" type="button" onClick={() => handleDeleteDossier(activeDossierId)} disabled={!activeDossierId}>
                <Trash2 size={15} /> 删除当前档案
              </button>
            </div>
          </section>

          <div className="persona-card">
            <div>
              <strong>{state.profile.name}</strong>
              <span>{state.profile.age} / {state.profile.personalityTraits.slice(0, 3).join("、")}</span>
            </div>
            <p>{activeDossier?.previewSummary ?? "预览生成中"}</p>
            <details className="detail-disclosure">
              <summary>详细人物档案</summary>
              <p>{state.profile.displaySummary}</p>
              {state.profile.socialPersonaPattern ? <small>{state.profile.socialPersonaPattern}</small> : null}
              {state.profile.fullLifeStory ? <p>{state.profile.fullLifeStory}</p> : null}
              {(state.profile.lifeEvents ?? []).length > 0 ? (
                <div className="detail-list life-event-list">
                  {(state.profile.lifeEvents ?? []).map((event) => (
                    <div key={event.id}>
                      <strong>{event.ageRange} · {event.title}</strong>
                      <span>{event.summary}</span>
                      <small>心理变化：{event.psychologicalChange}</small>
                      <small>关系变化：{event.relationshipChange}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <small>成长经历等待 LLM 解读。</small>
              )}
            </details>
            <details className="detail-disclosure">
              <summary>性格由哪些特性综合而来</summary>
              <p>{state.profile.personalitySummary}</p>
              <div className="detail-list">
                {state.profile.personalityFacets.map((facet) => (
                  <div key={facet.label}>
                    <strong>{facet.label}</strong>
                    <span>{facet.summary}</span>
                    <small>{facet.tension}</small>
                    <small>{facet.expression}</small>
                  </div>
                ))}
              </div>
            </details>
            <details className="detail-disclosure">
              <summary>人物关系</summary>
              <div className="detail-list">
                {Object.values(state.relationships).map((relationship) => (
                  <div key={relationship.targetId}>
                    <strong>{relationship.targetName}</strong>
                    <span>熟悉 {relationship.familiarity.toFixed(2)} / 信任 {relationship.trust.toFixed(2)} / 张力 {relationship.tension.toFixed(2)}</span>
                    <small>{relationship.recentTone}</small>
                    {relationship.notes.slice(-2).map((note) => (
                      <small key={note}>{note}</small>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </div>

          <LocationCard location={state.location} />

          <div className="metric-grid">
            <RuntimeMetric label="能量" value={state.runtime.energy.toFixed(2)} detail={state.runtime.signalProfiles.energy} />
            <RuntimeMetric label="情绪" value={state.runtime.derivedMood.label} detail={state.runtime.signalProfiles.mood} />
            <RuntimeMetric label="情绪倾向" value={state.runtime.derivedMood.valence.toFixed(2)} detail={state.runtime.signalProfiles.valence} />
            <RuntimeMetric label="唤醒度" value={state.runtime.derivedMood.arousal.toFixed(2)} detail={state.runtime.signalProfiles.arousal} />
          </div>

          <section className="subsection">
            <h2>关切</h2>
            <div className="list-stack">
              {state.concerns.map((concern) => (
                <div className="mini-card" key={concern.id}>
                  <div className="mini-card-head">
                    <strong>{concern.title}</strong>
                    <span className={concern.status === "active" ? "status-active" : "status-muted"}>{concernStatusLabels[concern.status]}</span>
                  </div>
                  <p>{concern.description}</p>
                  <div className="meter">
                    <span style={{ width: `${concern.intensity * 100}%` }} />
                  </div>
                  <small>触发词：{concern.triggers.slice(0, 5).join(" / ")}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="subsection">
            <h2>人物档案</h2>
            <textarea
              value={dossierDescription}
              onChange={(event) => handleDossierDescriptionChange(event.target.value)}
              onFocus={() => {
                if (!isAuthenticated) setLoginModalOpen(true);
                if (!isAdmin) setError(isAuthenticated ? "只有管理员可以修改人物档案。" : "修改人物档案需要先登录。");
              }}
              readOnly={!isAdmin}
            />
            <button className="primary-button" type="button" onClick={handleGenerateDossier} disabled={isGeneratingDossier}>
              <Eye size={16} /> {isGeneratingDossier ? "解读中" : "预览人物档案"}
            </button>
            {dossierPreview ? <DossierPreviewCard preview={dossierPreview} onApply={handleApplyDossier} /> : null}
          </section>

          <section className="subsection">
            <h2>场景</h2>
            <textarea
              value={sceneDescription}
              onChange={(event) => handleSceneDescriptionChange(event.target.value)}
              onFocus={() => {
                if (!isAuthenticated) setLoginModalOpen(true);
                if (!isAdmin) setError(isAuthenticated ? "只有管理员可以修改场景。" : "修改场景需要先登录。");
              }}
              readOnly={!isAdmin}
            />
            <button className="secondary-button" type="button" onClick={handleGenerateScene} disabled={isGeneratingScene}>
              <Eye size={16} /> {isGeneratingScene ? "解读中" : "预览场景"}
            </button>
            {scenePreview ? <ScenePreviewCard preview={scenePreview} onApply={handleApplyScene} /> : null}
          </section>

          {consistencyGate ? (
            <div className="distortion-gate">
              <div className="distortion-head">
                <Lock size={15} />
                <strong>需要扭曲时空密码</strong>
              </div>
              <p>{consistencyGate.result.summary}</p>
              {consistencyGate.result.mismatchReasons.length > 0 ? <small>{consistencyGate.result.mismatchReasons.join("；")}</small> : null}
              <input
                value={consistencyGate.password}
                onChange={(event) => handleDistortionPasswordChange(event.target.value)}
                placeholder="输入：扭曲时空密码"
                type="password"
              />
              <button className="primary-button" type="button" onClick={handleConfirmDistortionPassword}>
                <Lock size={15} /> 继续应用
              </button>
            </div>
          ) : null}
        </aside>

        <section className="panel chat-panel">
          <PanelTitle icon={MessageSquare} title="对话" />
          <div className="scene-strip">
            <strong>{state.scene?.title}</strong>
            <span>{state.scene?.atmosphere}</span>
          </div>
          <div className="active-context">
            {activeConcernTitles.map((title) => (
              <span key={title}>{title}</span>
            ))}
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <article className={`message ${message.speaker}`} key={message.id}>
                <div>
                  <strong>{message.speakerName}</strong>
                  <time>{new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => {
                if (!isAuthenticated) setLoginModalOpen(true);
              }}
              placeholder="输入一句话，观察多模块语言模型数据流"
            />
            <button type="submit" disabled={isRunning}>
              <Send size={17} /> {isRunning ? "运行中" : "发送"}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <aside className="panel trace-panel">
          <PanelTitle icon={Activity} title="流程追踪" />

          <div className="flow-group-label">对话流程</div>
          <div className="flow-rail">
            {traceSteps.map((step) => {
              const Icon = step.icon;
              return (
                <button
                  className={activeStep === step.key ? "flow-step selected" : "flow-step"}
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  disabled={!activeTrace && !liveTrace[step.key]}
                >
                  <Icon size={15} />
                  <span>{step.label}</span>
                  <small>{traceStatusLabel(liveTrace[step.key]?.status ?? (activeTrace ? "completed" : "pending"))}</small>
                </button>
              );
            })}
          </div>

          <div className="flow-group-label">生成监视</div>
          <div className="flow-rail generation-rail">
            {generationSteps.map((step) => {
              const Icon = step.icon;
              const progress = liveTrace[step.key];
              return (
                <button
                  className={activeStep === step.key ? "flow-step selected" : "flow-step"}
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  disabled={!progress}
                >
                  <Icon size={15} />
                  <span>{step.label}</span>
                  <small>{traceStatusLabel(progress?.status ?? "pending")}</small>
                </button>
              );
            })}
          </div>

          <section className="relationship-memory-card">
            <div className="relationship-memory-head">
              <div>
                <strong>对当前用户的印象</strong>
                <span>{activeConversationSpeaker.name}</span>
              </div>
              <Eye size={16} />
            </div>
            {activeRelationshipMemory ? (
              <div className="relationship-memory-body">
                <div>
                  <span>印象</span>
                  <p>{activeRelationshipMemory.impressionSummary}</p>
                </div>
                <div>
                  <span>关系</span>
                  <p>{activeRelationshipMemory.relationshipSummary}</p>
                </div>
                <div>
                  <span>最近互动</span>
                  <p>{activeRelationshipMemory.lastInteractionSummary}</p>
                </div>
                {activeRelationshipMemory.evidence.length > 0 ? (
                  <ul>
                    {activeRelationshipMemory.evidence.slice(-4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="relationship-memory-empty">还没有形成稳定印象；发送几轮后会写入这个用户专属的关系记忆。</p>
            )}
          </section>

          {deepseekConnected ? (
            <div className="llm-settings connected-summary">
              <small>{deepseekStatus}</small>
              <button className="secondary-button" type="button" onClick={handleTestDeepseekConfig}>
                测试连接
              </button>
            </div>
          ) : (
            <div className="llm-settings">
              <label>
                <span>DeepSeek 密钥</span>
                <input
                  value={deepseekApiKey}
                  onChange={(event) => setDeepseekApiKey(event.target.value)}
                  onFocus={() => {
                    if (!isAuthenticated) setLoginModalOpen(true);
                    if (!isAdmin) setError(isAuthenticated ? "只有管理员可以保存 DeepSeek 密钥。" : "保存 DeepSeek 密钥需要先登录。");
                  }}
                  placeholder="输入后保存到项目根目录"
                  readOnly={!isAdmin}
                  type="password"
                />
              </label>
              <div className="llm-key-actions">
                <button className="secondary-button" type="button" onClick={handleSaveDeepseekConfig}>
                  保存密钥
                </button>
                <button className="secondary-button" type="button" onClick={handleTestDeepseekConfig}>
                  测试连接
                </button>
              </div>
              <small>{deepseekStatus}</small>
            </div>
          )}

          <div className="audit-box">
            <div>
              <strong>输入输出审计</strong>
              <small>{auditStatus}</small>
            </div>
            <button className="secondary-button" type="button" onClick={loadConversationAudits}>
              <ScrollText size={15} /> 查看记录
            </button>
          </div>

          <div className="json-view">
            <div className="json-head">
              <strong>{[...traceSteps, ...generationSteps].find((step) => step.key === activeStep)?.label ?? "追踪"}</strong>
              <span>{selectedTraceData ? traceStatusLabel(selectedTraceData.status) : "等待中"}</span>
            </div>
            {traceDisplay}
          </div>
        </aside>
      </section>

      {loginModalOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLoginModalOpen(false)}>
          <form className="login-modal" onSubmit={handleLogin}>
            <div className="modal-head">
              <div>
                <strong>登录后使用</strong>
                <span>使用配置的聊天室账号和原密码</span>
              </div>
              <button className="icon-button compact" type="button" onClick={() => setLoginModalOpen(false)} title="关闭">
                <X size={15} />
              </button>
            </div>
            <label>
              <span>用户名</span>
              <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" autoFocus />
            </label>
            <label>
              <span>密码</span>
              <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" type="password" />
            </label>
            {loginError ? <p className="error-text">{loginError}</p> : null}
            <button className="primary-button" type="submit" disabled={isLoggingIn}>
              <LogIn size={15} /> {isLoggingIn ? "登录中" : "登录"}
            </button>
          </form>
        </div>
      ) : null}

      {updatePanelOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !isUpdatingApp && setUpdatePanelOpen(false)}>
          <section className="update-modal">
            <div className="modal-head">
              <div>
                <strong>服务器更新</strong>
                <span>{appUpdateStatus?.message || "正在读取服务器版本"}</span>
              </div>
              <button className="icon-button compact" type="button" onClick={() => setUpdatePanelOpen(false)} title="关闭" disabled={isUpdatingApp}>
                <X size={15} />
              </button>
            </div>

            <div className="update-summary-grid">
              <div>
                <span>当前版本</span>
                <strong>{appUpdateStatus?.currentVersion ? `v${appUpdateStatus.currentVersion}` : appVersionLabel}</strong>
              </div>
              <div>
                <span>当前提交</span>
                <strong>{shortCommit(appUpdateStatus?.currentCommit)}</strong>
              </div>
              <div>
                <span>远端提交</span>
                <strong>{shortCommit(appUpdateStatus?.remoteCommit)}</strong>
              </div>
              <div>
                <span>分支</span>
                <strong>{appUpdateStatus?.branch || "main"}</strong>
              </div>
            </div>

            <div className="update-progress">
              <span style={{ width: `${Math.max(0, Math.min(100, updateProgress))}%` }} />
            </div>

            <pre className="update-log-window">
              {updateLogs.length
                ? updateLogs.map((entry) => `${entry.type === "error" ? "!" : entry.type === "done" ? "✓" : entry.stream === "stderr" ? ">" : "$"} ${entry.text}`).join("\n")
                : "等待检查结果"}
            </pre>

            <div className="update-actions">
              <button className="secondary-button" type="button" onClick={checkAppUpdate} disabled={isCheckingUpdate || isUpdatingApp}>
                <RefreshCcw size={15} /> {isCheckingUpdate ? "检查中" : "重新检查"}
              </button>
              <button className="primary-button" type="button" onClick={handleRunAppUpdate} disabled={!isAdmin || !appUpdateStatus?.available || isUpdatingApp}>
                <RefreshCcw size={15} /> {isUpdatingApp ? "更新中" : "更新服务器"}
              </button>
            </div>
            {!isAdmin ? <p className="update-note">只有管理员可以执行服务器更新。</p> : null}
          </section>
        </div>
      ) : null}

      {auditPanelOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAuditPanelOpen(false)}>
          <section className="audit-modal">
            <div className="modal-head">
              <div>
                <strong>用户输入输出</strong>
                <span>仅管理员可见，后台保留最近 1000 条</span>
              </div>
              <div className="modal-actions">
                <button className="secondary-button danger-button compact-text-button" type="button" onClick={clearConversationAuditEntries}>
                  <Trash2 size={14} /> 清空
                </button>
                <button className="icon-button compact" type="button" onClick={() => setAuditPanelOpen(false)} title="关闭">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="audit-list">
              {auditEntries.length ? (
                auditEntries.map((entry) => (
                  <article className="audit-entry" key={entry.id}>
                    <div className="audit-entry-head">
                      <strong>{entry.nickname || entry.username}</strong>
                      <div className="audit-entry-actions">
                        <span>{new Date(entry.createdAt).toLocaleString("zh-CN")}</span>
                        <button className="icon-button compact" type="button" onClick={() => deleteConversationAuditEntry(entry.id)} title="删除这条记录">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <small>{entry.dossierTitle || "未记录档案"} · {entry.status === "failed" ? "失败" : "完成"}</small>
                    <section>
                      <h3>输入</h3>
                      <p>{entry.userInput}</p>
                    </section>
                    <section>
                      <h3>输出</h3>
                      <p>{entry.status === "failed" ? entry.error || "流程失败" : entry.personaOutput}</p>
                    </section>
                  </article>
                ))
              ) : (
                <p className="empty-audit">暂无记录。</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function formatTraceDisplay(progress: PipelineStepProgress | undefined) {
  if (!progress) {
    return <pre>{JSON.stringify({ hint: "发送消息或触发档案、场景生成后，这里显示对应模块的输入、输出和状态。" }, null, 2)}</pre>;
  }

  return (
    <div className="trace-io">
      <section>
        <h3>输入</h3>
        <pre>{progress.input || "暂无输入"}</pre>
      </section>
      <section>
        <h3>输出</h3>
        <pre>{progress.error ? `错误：${progress.error}` : progress.output || "等待输出..."}</pre>
      </section>
      <section>
        <h3>状态</h3>
        <pre>{JSON.stringify({ status: progress.status, transport: progress.transport ?? "pending" }, null, 2)}</pre>
      </section>
    </div>
  );
}

async function readNaturalLanguageEventStream(response: Response, onStream?: (output: string) => void) {
  if (!response.headers.get("Content-Type")?.includes("text/event-stream")) {
    const data = await response.json();
    if (typeof data === "string") return data;
    if (typeof data?.reply === "string") return data.reply;
    return JSON.stringify(data);
  }

  if (!response.body) {
    throw new Error("外部接口没有返回可读取的流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalText = "";

  const consumeEvent = (event: string) => {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const parsed = JSON.parse(data) as { delta?: string; final?: string | { reply?: string }; error?: string };
    if (parsed.error) throw new Error(parsed.error);
    if (typeof parsed.delta === "string") {
      accumulated += parsed.delta;
      onStream?.(accumulated);
    }
    if (typeof parsed.final === "string") {
      finalText = parsed.final;
    } else if (typeof parsed.final?.reply === "string") {
      finalText = parsed.final.reply;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) consumeEvent(event);
  }
  if (buffer.trim()) consumeEvent(buffer);

  return finalText || accumulated;
}

function isPipelineTraceStep(step: MonitorStepKey): step is keyof PipelineTrace {
  return traceSteps.some((item) => item.key === step);
}

function buildCompletedTraceProgress(step: keyof PipelineTrace, trace: PipelineTrace | undefined): PipelineStepProgress | undefined {
  if (!trace) return undefined;
  const data = trace[step];

  if (step === "event") {
    return {
      step,
      status: "completed",
      input: trace.event.content,
      output: JSON.stringify(trace.event, null, 2),
      transport: "local",
    };
  }

  if (step === "llmRequest") {
    return {
      step,
      status: "completed",
      input: JSON.stringify({ event: trace.event, decision: trace.decision.output }, null, 2),
      output: trace.llmRequest.prompt,
      transport: "local",
    };
  }

  if (step === "llmOutput") {
    return {
      step,
      status: "completed",
      input: trace.llmRequest.prompt,
      output: trace.llmOutput.reply || "（林安看见了，但没有回复。）",
      transport: "external_llm",
    };
  }

  if (step === "stateDelta") {
    return {
      step,
      status: "completed",
      input: JSON.stringify({ stateUpdate: trace.stateUpdate.output, runtimeSignalEvaluation: trace.runtimeSignalEvaluation.output }, null, 2),
      output: JSON.stringify(trace.stateDelta, null, 2),
      transport: "local",
    };
  }

  const cognitiveTrace = data as { request?: { prompt: string; outputContract?: string }; output?: unknown; transport?: PipelineStepProgress["transport"]; fallbackReason?: string };
  return {
    step,
    status: "completed",
    input: [cognitiveTrace.request?.prompt, cognitiveTrace.request?.outputContract ? `\n\n输出契约：${cognitiveTrace.request.outputContract}` : ""].filter(Boolean).join(""),
    output: JSON.stringify(cognitiveTrace.fallbackReason ? { fallbackReason: cognitiveTrace.fallbackReason, output: cognitiveTrace.output } : cognitiveTrace.output, null, 2),
    transport: cognitiveTrace.transport,
  };
}

function traceStatusLabel(status: PipelineStepProgress["status"]) {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "输入已发送";
    case "streaming":
      return "生成中";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
  }
}

function shortCommit(commit: string | undefined) {
  return commit ? commit.slice(0, 7) : "未知";
}

function normalizeDeepseekModel(model: string) {
  return model.trim() === "deepseek-reasoner" ? "deepseek-v4-flash" : model;
}

function PanelTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) {
  return (
    <div className="panel-title">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
  );
}

function LocationCard({ location }: { location: CharacterState["location"] }) {
  if (!location) {
    return (
      <section className="location-card">
        <div className="location-card-head">
          <MapPin size={15} />
          <strong>位置未设定</strong>
        </div>
        <p>当前角色还没有明确物理位置。</p>
      </section>
    );
  }

  const context = location.mapContext;
  return (
    <section className="location-card">
      <div className="location-card-head">
        <MapPin size={15} />
        <div>
          <strong>{location.label}</strong>
          <span>{location.region}</span>
        </div>
      </div>
      <p>{location.address}</p>
      <div className="location-grid">
        <div>
          <Navigation size={14} />
          <span>{motionStateLabels[location.motionState]}</span>
          <strong>{location.speedKmh.toFixed(1)} km/h</strong>
        </div>
        <div>
          <Navigation size={14} />
          <span>方向</span>
          <strong>{location.headingLabel} · {location.headingDeg}°</strong>
        </div>
      </div>
      {context ? (
        <div className="location-context">
          <small>道路：{context.nearbyRoads.length ? context.nearbyRoads.slice(0, 4).join(" / ") : "未记录"}</small>
          <small>地点：{context.nearbyPlaces.length ? context.nearbyPlaces.slice(0, 4).join(" / ") : "未记录"}</small>
          <small>建筑：{context.nearbyBuildings.length ? context.nearbyBuildings.slice(0, 4).join(" / ") : "未记录"}</small>
          <p>{context.environmentSummary}</p>
        </div>
      ) : null}
    </section>
  );
}

function RuntimeMetric({ label, value, detail }: { label: string; value: string; detail: CharacterState["runtime"]["signalProfiles"]["energy"] }) {
  const considerations = Array.isArray(detail.considerations) ? detail.considerations : [String(detail.considerations || "暂无补充考量")];

  return (
    <details className="metric" title={detail.summary}>
      <summary>
        <span>{label}</span>
        <strong>{value}</strong>
      </summary>
      <p>{detail.summary}</p>
      <ul>
        {considerations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <small>{detail.cognitiveNarrative}</small>
    </details>
  );
}

function formatDossierDetailForPreview(dossier: PersonaDossier) {
  const profile = dossier.state.profile;
  const lifeEvents = (profile.lifeEvents ?? [])
    .map((event) => `${event.ageRange}${event.title}：${event.summary} 心理变化：${event.psychologicalChange} 关系变化：${event.relationshipChange}`)
    .join("\n");
  const relationships = Object.values(dossier.state.relationships ?? {})
    .map((relationship) => `${relationship.targetName}：熟悉${relationship.familiarity}，信任${relationship.trust}，张力${relationship.tension}，${relationship.recentTone}`)
    .join("\n");
  return [
    `姓名：${profile.name}`,
    `年龄：${profile.age ?? "未知"}`,
    `社会人格位置：${profile.socialPersonaPattern ?? "未记录"}`,
    `稳定背景：${profile.background}`,
    `完整故事：${profile.fullLifeStory ?? "未记录"}`,
    `阶段经历：\n${lifeEvents || "未记录"}`,
    `性格摘要：${profile.personalitySummary}`,
    `人物关系：\n${relationships || "未记录"}`,
  ].join("\n");
}

function DossierPreviewCard({ preview, onApply }: { preview: CharacterState; onApply: () => void }) {
  const previewMemories = preview.longTermMemory.slice(-3).map((memory) => memory.summary);

  return (
    <div className="preview-card">
      <div className="preview-head">
        <strong>{preview.profile.name} 预览</strong>
        <button type="button" onClick={onApply}>
          <Check size={14} /> 应用
        </button>
      </div>
      <p>{preview.profile.displaySummary}</p>
      <small>性格摘要：{preview.profile.personalityTraits.slice(0, 4).join("、")}</small>
      <small>关切：{preview.concerns.map((concern) => concern.title).join("、")}</small>
      {previewMemories.length > 0 ? <small>长期记忆：{previewMemories.join("；")}</small> : null}
    </div>
  );
}

function ScenePreviewCard({ preview, onApply }: { preview: CharacterState; onApply: () => void }) {
  const scene = preview.scene;
  if (!scene) return null;
  const newConcernTitles = preview.concerns.map((concern) => concern.title).join("、");
  const latestMemory = preview.longTermMemory.at(-1)?.summary;

  return (
    <div className="preview-card">
      <div className="preview-head">
        <strong>{scene.title} 预览</strong>
        <button type="button" onClick={onApply}>
          <Check size={14} /> 应用
        </button>
      </div>
      <p>{scene.description}</p>
      <small>状态焦点：{preview.runtime.attentionFocus ?? scene.title}</small>
      <small>场景压力：{scene.atmosphere}。{scene.interactionPressure}</small>
      <small>关切更新：{newConcernTitles}</small>
      {latestMemory ? <small>长期记忆：{latestMemory}</small> : null}
    </div>
  );
}
