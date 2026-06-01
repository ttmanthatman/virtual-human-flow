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
  MessageSquare,
  Network,
  Play,
  RefreshCcw,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { ChatMessage, CharacterState, ExpressionLlmRequest, LlmConfig, PipelineTrace, ReplyOutput } from "./core/types";
import { makeId, nowIso } from "./core/utils";
import { defaultLlmConfig, seedMessages, seedState } from "./data/seedState";
import { runConversationPipeline } from "./pipeline/conversationPipeline";
import { generateDossierFromDescription, generateSceneFromDescription } from "./pipeline/generators";

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

export function App() {
  const [state, setState] = useState<CharacterState>(seedState);
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [input, setInput] = useState("周末一起去爬山吗？");
  const [dossierDescription, setDossierDescription] = useState("林安，27岁，自由插画师，刚结束一段关系，性格克制敏感，不喜欢直接表达脆弱。");
  const [sceneDescription, setSceneDescription] = useState("雨夜的私人工作室，窗外有雨，桌上放着未完成的画稿和一杯快冷掉的茶。");
  const [dossierPreview, setDossierPreview] = useState<CharacterState | undefined>();
  const [scenePreview, setScenePreview] = useState<CharacterState["scene"] | undefined>();
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(defaultLlmConfig);
  const [activeTrace, setActiveTrace] = useState<PipelineTrace | undefined>();
  const [activeStep, setActiveStep] = useState<keyof PipelineTrace>("event");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekStatus, setDeepseekStatus] = useState("DeepSeek 密钥尚未检查");

  const selectedTraceData = activeTrace ? activeTrace[activeStep] : undefined;
  const traceDisplay = formatTraceDisplay(activeStep, selectedTraceData);
  const activeConcernTitles = useMemo(
    () => state.concerns.filter((concern) => state.runtime.activeConcernIds.includes(concern.id)).map((concern) => concern.title),
    [state.concerns, state.runtime.activeConcernIds],
  );

  useEffect(() => {
    fetch("/api/deepseek-config")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("无法读取 DeepSeek 配置"))))
      .then((config: { apiKeySaved: boolean; endpoint?: string; model?: string }) => {
        setDeepseekStatus(config.apiKeySaved ? "DeepSeek 密钥已保存在项目根目录" : "DeepSeek 密钥尚未保存");
        setLlmConfig((current) => ({
          ...current,
          endpoint: current.endpoint || config.endpoint || "/api/deepseek-chat",
          model: current.model === "local-mock-llm" && config.model ? config.model : current.model,
        }));
      })
      .catch(() => setDeepseekStatus("DeepSeek 配置接口不可用"));
  }, []);

  function handleProviderChange(provider: LlmConfig["provider"]) {
    setLlmConfig((current) => ({
      ...current,
      provider,
      endpoint: provider === "external" ? current.endpoint || "/api/deepseek-chat" : current.endpoint,
      model: provider === "external" && current.model === "local-mock-llm" ? "deepseek-v4-flash" : current.model,
    }));
  }

  async function handleSaveDeepseekConfig() {
    if (!deepseekApiKey.trim()) {
      setDeepseekStatus("请输入 DeepSeek 密钥后再保存");
      return;
    }

    setDeepseekStatus("正在保存 DeepSeek 密钥...");
    const response = await fetch("/api/deepseek-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: deepseekApiKey.trim(),
        model: llmConfig.model,
        endpoint: llmConfig.endpoint || "/api/deepseek-chat",
      }),
    });

    if (!response.ok) {
      setDeepseekStatus("DeepSeek 密钥保存失败");
      return;
    }

    setDeepseekApiKey("");
    setDeepseekStatus("DeepSeek 密钥已保存在项目根目录");
    setLlmConfig((current) => ({ ...current, provider: "external", endpoint: current.endpoint || "/api/deepseek-chat" }));
  }

  async function handleTestDeepseekConfig() {
    setDeepseekStatus("正在测试 DeepSeek 连接...");
    const response = await fetch(llmConfig.endpoint || "/api/deepseek-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: llmConfig.model || "deepseek-v4-flash",
        moduleName: "reply_generation",
        inputMode: "natural_language",
        outputMode: "natural_language",
        prompt: "请只回复：连接成功",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      setDeepseekStatus(`DeepSeek 连接失败：${response.status} ${detail.slice(0, 80)}`);
      return;
    }

    const data = (await response.json()) as { reply?: string };
    setDeepseekStatus(data.reply ? `DeepSeek 连接成功：${data.reply}` : "DeepSeek 连接成功");
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || isRunning) return;
    setIsRunning(true);
    setError("");

    const userMessage: ChatMessage = {
      id: makeId("msg"),
      speaker: "user",
      speakerName: "当前对话者",
      content: input.trim(),
      timestamp: nowIso(),
    };
    setMessages((items) => [...items, userMessage]);

    try {
      const result = await runConversationPipeline({ content: input.trim(), state, llmConfig });
      setState(result.nextState);
      setActiveTrace(result.trace);
      setActiveStep("event");

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
      setError(caught instanceof Error ? caught.message : "流程运行失败");
    } finally {
      setIsRunning(false);
    }
  }

  function handleGenerateDossier() {
    const preview = generateDossierFromDescription(dossierDescription, state);
    setDossierPreview(preview);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "人物档案",
        content: `已生成 ${preview.profile.name} 的人物档案预览：${preview.concerns.map((concern) => concern.title).join("、")}`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleApplyDossier() {
    if (!dossierPreview) return;
    setState(dossierPreview);
    setDossierPreview(undefined);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "人物档案",
        content: `已应用 ${dossierPreview.profile.name} 的人物档案。`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleGenerateScene() {
    const scene = generateSceneFromDescription(sceneDescription);
    setScenePreview(scene);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "场景",
        content: `已生成场景预览：${scene.title}。${scene.atmosphere}`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleApplyScene() {
    if (!scenePreview) return;
    setState((current) => ({ ...current, scene: scenePreview }));
    setScenePreview(undefined);
    setMessages((items) => [
      ...items,
      {
        id: makeId("msg"),
        speaker: "system",
        speakerName: "场景",
        content: `已应用场景：${scenePreview.title}。`,
        timestamp: nowIso(),
      },
    ]);
  }

  function handleReset() {
    setState(seedState);
    setMessages(seedMessages);
    setActiveTrace(undefined);
    setActiveStep("event");
    setInput("周末一起去爬山吗？");
    setDossierPreview(undefined);
    setScenePreview(undefined);
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
          <label className="provider-control">
            <span>语言模型</span>
            <select
              value={llmConfig.provider}
              onChange={(event) => handleProviderChange(event.target.value as LlmConfig["provider"])}
            >
              <option value="simulated">模拟语言模型</option>
              <option value="external">外部接口</option>
            </select>
          </label>
          <button className="icon-button" type="button" onClick={handleReset} title="重置">
            <RefreshCcw size={17} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel state-panel">
          <PanelTitle icon={UserRound} title="状态" />

          <div className="persona-card">
            <div>
              <strong>{state.profile.name}</strong>
              <span>{state.profile.age} / {state.profile.personalityTraits.slice(0, 3).join("、")}</span>
            </div>
            <p>{state.profile.background}</p>
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
            <textarea value={dossierDescription} onChange={(event) => setDossierDescription(event.target.value)} />
            <button className="primary-button" type="button" onClick={handleGenerateDossier}>
              <Eye size={16} /> 预览人物档案
            </button>
            {dossierPreview ? <DossierPreviewCard preview={dossierPreview} onApply={handleApplyDossier} /> : null}
          </section>

          <section className="subsection">
            <h2>场景</h2>
            <textarea value={sceneDescription} onChange={(event) => setSceneDescription(event.target.value)} />
            <button className="secondary-button" type="button" onClick={handleGenerateScene}>
              <Eye size={16} /> 预览场景
            </button>
            {scenePreview ? <ScenePreviewCard preview={scenePreview} onApply={handleApplyScene} /> : null}
          </section>
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
                  disabled={!activeTrace}
                >
                  <Icon size={15} />
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>

          <div className="llm-settings">
            <label>
              <span>模型</span>
              <input value={llmConfig.model} onChange={(event) => setLlmConfig((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <label>
              <span>接口地址</span>
              <input
                value={llmConfig.endpoint}
                onChange={(event) => setLlmConfig((current) => ({ ...current, endpoint: event.target.value }))}
                placeholder="https://your-model-endpoint"
              />
            </label>
            {llmConfig.provider === "external" ? (
              <>
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
              </>
            ) : null}
          </div>

          <div className="json-view">
            <div className="json-head">
              <strong>{traceSteps.find((step) => step.key === activeStep)?.label ?? "追踪"}</strong>
              <span>{activeTrace ? "实时" : "等待中"}</span>
            </div>
            <pre>{traceDisplay}</pre>
          </div>
        </aside>
      </section>
    </main>
  );
}

function formatTraceDisplay(activeStep: keyof PipelineTrace, selectedTraceData: PipelineTrace[keyof PipelineTrace] | undefined) {
  if (!selectedTraceData) {
    return JSON.stringify({ hint: "发送一条消息后，这里显示每一步调用数据。" }, null, 2);
  }

  if (activeStep === "llmRequest") {
    const request = selectedTraceData as ExpressionLlmRequest;
    return request.prompt;
  }

  if (activeStep === "llmOutput") {
    const output = selectedTraceData as ReplyOutput;
    return output.reply || "（林安看见了，但没有回复。）";
  }

  return JSON.stringify(selectedTraceData, null, 2);
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
  return (
    <details className="metric" title={detail.summary}>
      <summary>
        <span>{label}</span>
        <strong>{value}</strong>
      </summary>
      <p>{detail.summary}</p>
      <ul>
        {detail.considerations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <small>{detail.cognitiveNarrative}</small>
    </details>
  );
}

function DossierPreviewCard({ preview, onApply }: { preview: CharacterState; onApply: () => void }) {
  return (
    <div className="preview-card">
      <div className="preview-head">
        <strong>{preview.profile.name} 预览</strong>
        <button type="button" onClick={onApply}>
          <Check size={14} /> 应用
        </button>
      </div>
      <p>{preview.profile.personalitySummary}</p>
      <small>性格摘要：{preview.profile.personalityTraits.slice(0, 4).join("、")}</small>
      <small>关切：{preview.concerns.map((concern) => concern.title).join("、")}</small>
    </div>
  );
}

function ScenePreviewCard({ preview, onApply }: { preview: NonNullable<CharacterState["scene"]>; onApply: () => void }) {
  return (
    <div className="preview-card">
      <div className="preview-head">
        <strong>{preview.title} 预览</strong>
        <button type="button" onClick={onApply}>
          <Check size={14} /> 应用
        </button>
      </div>
      <p>{preview.cognitiveNarrative}</p>
      <small>{preview.sensoryProfile}</small>
      <small>{preview.interactionPressure}</small>
    </div>
  );
}
