import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Braces,
  ChevronsRight,
  Check,
  Database,
  Eye,
  FileText,
  Lock,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { ChatMessage, CharacterState, LlmConfig, PersonaDossier, PipelineStepProgress, PipelineTrace, ProfileSceneConsistencyResult } from "./core/types";
import { makeId, nowIso } from "./core/utils";
import { defaultLlmConfig, seedMessages, seedState } from "./data/seedState";
import { runConversationPipeline } from "./pipeline/conversationPipeline";
import { generateDossierFromDescription, generateSceneFromDescription } from "./pipeline/generators";
import { evaluateProfileSceneConsistency } from "./pipeline/profileSceneConsistency";

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

const concernStatusLabels = {
  active: "活跃",
  dormant: "休眠",
  resolved: "已解决",
};

type TraceDisplayState = Partial<Record<keyof PipelineTrace, PipelineStepProgress>>;
type ConsistencyGate = {
  candidate: CharacterState;
  result: ProfileSceneConsistencyResult;
  target: "dossier" | "scene";
  password: string;
};

const distortionPassword = "扭曲时空密码";

function createPersonaDossier(state: CharacterState, dossierDescription: string, sceneDescription: string, title?: string): PersonaDossier {
  const timestamp = nowIso();
  return {
    id: makeId("dossier"),
    title: title ?? state.profile.name,
    state,
    dossierDescription,
    sceneDescription,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function App() {
  const initialDossierDescription = "林安，27岁，自由插画师，刚结束一段关系，性格克制敏感，不喜欢直接表达脆弱。";
  const initialSceneDescription = "雨夜的私人工作室，窗外有雨，桌上放着未完成的画稿和一杯快冷掉的茶。";
  const initialDossier = createPersonaDossier(seedState, initialDossierDescription, initialSceneDescription);
  const [dossiers, setDossiers] = useState<PersonaDossier[]>([initialDossier]);
  const [activeDossierId, setActiveDossierId] = useState(initialDossier.id);
  const [state, setState] = useState<CharacterState>(initialDossier.state);
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [input, setInput] = useState("周末一起去爬山吗？");
  const [dossierDescription, setDossierDescription] = useState(initialDossierDescription);
  const [sceneDescription, setSceneDescription] = useState(initialSceneDescription);
  const [dossierPreview, setDossierPreview] = useState<CharacterState | undefined>();
  const [scenePreview, setScenePreview] = useState<CharacterState | undefined>();
  const [consistencyGate, setConsistencyGate] = useState<ConsistencyGate | undefined>();
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(defaultLlmConfig);
  const [activeTrace, setActiveTrace] = useState<PipelineTrace | undefined>();
  const [liveTrace, setLiveTrace] = useState<TraceDisplayState>({});
  const [activeStep, setActiveStep] = useState<keyof PipelineTrace>("event");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekStatus, setDeepseekStatus] = useState("正在检查 DeepSeek 连接");
  const [deepseekConnected, setDeepseekConnected] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);

  const selectedTraceData = liveTrace[activeStep] ?? buildCompletedTraceProgress(activeStep, activeTrace);
  const traceDisplay = formatTraceDisplay(selectedTraceData);
  const activeConcernTitles = useMemo(
    () => state.concerns.filter((concern) => state.runtime.activeConcernIds.includes(concern.id)).map((concern) => concern.title),
    [state.concerns, state.runtime.activeConcernIds],
  );
  const activeDossier = useMemo(() => dossiers.find((dossier) => dossier.id === activeDossierId) ?? dossiers[0], [activeDossierId, dossiers]);

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

  function updateActiveDossier(patch: Partial<Pick<PersonaDossier, "state" | "dossierDescription" | "sceneDescription" | "title">>) {
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
    setActiveDossierId(dossier.id);
    setState(dossier.state);
    setDossierDescription(dossier.dossierDescription);
    setSceneDescription(dossier.sceneDescription);
    setDossierPreview(undefined);
    setScenePreview(undefined);
    setConsistencyGate(undefined);
    setError("");
  }

  function handleCreateDossier() {
    const nextState: CharacterState = {
      ...seedState,
      profile: {
        ...seedState.profile,
        id: makeId("persona"),
        name: `新档案 ${dossiers.length + 1}`,
        displaySummary: "等待 LLM 解读人物素材后生成摘要。",
        background: "等待用户输入人物素材。",
        personalityTraits: ["待解读"],
      },
      concerns: [],
      shortTermMemory: [],
      longTermMemory: [],
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
    };
    const nextDossier = createPersonaDossier(nextState, "", "", nextState.profile.name);
    setDossiers((items) => [...items, nextDossier]);
    handleSelectDossier(nextDossier);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "档案",
        content: `已新建 ${nextDossier.title}，人物档案和场景将作为一组保存。`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleDeleteDossier(id: string) {
    if (dossiers.length <= 1) {
      setError("至少保留一个档案。");
      return;
    }

    const removingActive = id === activeDossierId;
    const nextItems = dossiers.filter((dossier) => dossier.id !== id);
    setDossiers(nextItems);
    if (removingActive) {
      const nextActive = nextItems[0];
      setActiveDossierId(nextActive.id);
      setState(nextActive.state);
      setDossierDescription(nextActive.dossierDescription);
      setSceneDescription(nextActive.sceneDescription);
      setDossierPreview(undefined);
      setScenePreview(undefined);
      setConsistencyGate(undefined);
    }
  }

  function handleDossierDescriptionChange(value: string) {
    setDossierDescription(value);
    updateActiveDossier({ dossierDescription: value });
  }

  function handleSceneDescriptionChange(value: string) {
    setSceneDescription(value);
    updateActiveDossier({ sceneDescription: value });
  }

  async function handleSaveDeepseekConfig() {
    if (!deepseekApiKey.trim()) {
      setDeepseekConnected(false);
      setDeepseekStatus("请输入 DeepSeek 密钥后再保存");
      return;
    }

    setDeepseekStatus("正在保存 DeepSeek 密钥...");
    const response = await fetch("/api/deepseek-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    setDeepseekStatus("正在测试 DeepSeek 连接...");
    const response = await fetch("/api/deepseek-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    if (!input.trim() || isRunning) return;
    setIsRunning(true);
    setError("");
    setActiveTrace(undefined);
    setLiveTrace({});

    const userMessage: ChatMessage = {
      id: makeId("msg"),
      speaker: "user",
      speakerName: "当前对话者",
      content: input.trim(),
      timestamp: nowIso(),
    };
    setMessages((items) => [...items, userMessage]);

    try {
      const result = await runConversationPipeline({
        content: input.trim(),
        state,
        llmConfig,
        onProgress: (progress) => {
          setActiveStep(progress.step);
          setLiveTrace((current) => ({
            ...current,
            [progress.step]: {
              ...current[progress.step],
              ...progress,
            },
          }));
        },
      });
      setState(result.nextState);
      updateActiveDossier({ state: result.nextState, title: result.nextState.profile.name });
      setActiveTrace(result.trace);

      const reply = result.trace.llmOutput.reply || "（林安看见了，但没有回复。）";
      setMessages((items) => [
        ...items,
        {
          id: makeId("msg"),
          speaker: result.trace.llmOutput.reply ? "persona" : "system",
          speakerName: result.trace.llmOutput.reply ? result.nextState.profile.name : "沉默",
          content: reply,
          timestamp: nowIso(),
          trace: result.trace,
        },
      ]);
      setInput("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "流程运行失败";
      setError(message);
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
    if (!dossierDescription.trim() || isGeneratingDossier) return;
    setIsGeneratingDossier(true);
    setError("");

    try {
      const preview = await generateDossierFromDescription(dossierDescription, state, llmConfig);
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
    } finally {
      setIsGeneratingDossier(false);
    }
  }

  async function handleApplyDossier() {
    if (!dossierPreview) return;
    await applyCandidateState(dossierPreview, "dossier");
  }

  async function handleGenerateScene() {
    if (!sceneDescription.trim() || isGeneratingScene) return;
    setIsGeneratingScene(true);
    setError("");

    try {
      const preview = await generateSceneFromDescription(sceneDescription, state, llmConfig);
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
    } finally {
      setIsGeneratingScene(false);
    }
  }

  async function handleApplyScene() {
    if (!scenePreview) return;
    await applyCandidateState(scenePreview, "scene");
  }

  async function applyCandidateState(candidate: CharacterState, target: "dossier" | "scene", bypassDistortionPassword = false) {
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
    setState(candidate);
    updateActiveDossier({ state: candidate, title: candidate.profile.name });
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
    if (!consistencyGate) return;
    if (consistencyGate.password.trim() !== distortionPassword) {
      setError("扭曲时空密码不正确。");
      return;
    }

    commitCandidateState(consistencyGate.candidate, consistencyGate.target, consistencyGate.result);
  }

  function handleReset() {
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
            <p>事件驱动 + 状态机 + 语言模型表达器</p>
          </div>
        </div>
        <div className="topbar-actions">
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
            <div className="dossier-tabs">
              {dossiers.map((dossier) => (
                <button
                  className={dossier.id === activeDossierId ? "dossier-tab selected" : "dossier-tab"}
                  key={dossier.id}
                  type="button"
                  onClick={() => handleSelectDossier(dossier)}
                >
                  <span>{dossier.title}</span>
                  <small>{dossier.state.scene?.title ?? "未设场景"}</small>
                </button>
              ))}
            </div>
            <button className="secondary-button danger-button" type="button" onClick={() => handleDeleteDossier(activeDossierId)} disabled={dossiers.length <= 1}>
              <Trash2 size={15} /> 删除当前档案
            </button>
          </section>

          <div className="persona-card">
            <div>
              <strong>{state.profile.name}</strong>
              <span>{state.profile.age} / {state.profile.personalityTraits.slice(0, 3).join("、")}</span>
            </div>
            <p>{state.profile.displaySummary}</p>
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
          </div>

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
            <textarea value={dossierDescription} onChange={(event) => handleDossierDescriptionChange(event.target.value)} />
            <button className="primary-button" type="button" onClick={handleGenerateDossier} disabled={isGeneratingDossier}>
              <Eye size={16} /> {isGeneratingDossier ? "解读中" : "预览人物档案"}
            </button>
            {dossierPreview ? <DossierPreviewCard preview={dossierPreview} onApply={handleApplyDossier} /> : null}
          </section>

          <section className="subsection">
            <h2>场景</h2>
            <textarea value={sceneDescription} onChange={(event) => handleSceneDescriptionChange(event.target.value)} />
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
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入一句话，观察多模块语言模型数据流" />
            <button type="submit" disabled={isRunning}>
              <Send size={17} /> {isRunning ? "运行中" : "发送"}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <aside className="panel trace-panel">
          <PanelTitle icon={Activity} title="流程追踪" />

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
                  placeholder="输入后保存到项目根目录"
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

          <div className="json-view">
            <div className="json-head">
              <strong>{traceSteps.find((step) => step.key === activeStep)?.label ?? "追踪"}</strong>
              <span>{selectedTraceData ? traceStatusLabel(selectedTraceData.status) : "等待中"}</span>
            </div>
            {traceDisplay}
          </div>
        </aside>
      </section>
    </main>
  );
}

function formatTraceDisplay(progress: PipelineStepProgress | undefined) {
  if (!progress) {
    return <pre>{JSON.stringify({ hint: "发送一条消息后，这里显示每一步的输入、输出和状态。" }, null, 2)}</pre>;
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

  const cognitiveTrace = data as { request?: { prompt: string; outputContract?: string }; output?: unknown; transport?: PipelineStepProgress["transport"] };
  return {
    step,
    status: "completed",
    input: [cognitiveTrace.request?.prompt, cognitiveTrace.request?.outputContract ? `\n\n输出契约：${cognitiveTrace.request.outputContract}` : ""].filter(Boolean).join(""),
    output: JSON.stringify(cognitiveTrace.output, null, 2),
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
