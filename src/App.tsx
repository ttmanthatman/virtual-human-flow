import { FormEvent, useMemo, useState } from "react";
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
  { key: "event", label: "Event", icon: Play },
  { key: "appraisal", label: "Appraisal", icon: Brain },
  { key: "memoryRecall", label: "Memory Recall", icon: Database },
  { key: "decision", label: "Decision", icon: ChevronsRight },
  { key: "llmRequest", label: "Reply Prompt", icon: FileText },
  { key: "llmOutput", label: "Reply Output", icon: MessageSquare },
  { key: "stateUpdate", label: "State Update LLM", icon: Braces },
  { key: "stateDelta", label: "State Delta", icon: Network },
];

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

  const selectedTraceData = activeTrace ? activeTrace[activeStep] : undefined;
  const traceDisplay = formatTraceDisplay(activeStep, selectedTraceData);
  const activeConcernTitles = useMemo(
    () => state.concerns.filter((concern) => state.runtime.activeConcernIds.includes(concern.id)).map((concern) => concern.title),
    [state.concerns, state.runtime.activeConcernIds],
  );

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || isRunning) return;
    setIsRunning(true);
    setError("");

    const userMessage: ChatMessage = {
      id: makeId("msg"),
      speaker: "user",
      speakerName: "B",
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
          speakerName: result.trace.llmOutput.reply ? result.nextState.profile.name : "Silence",
          content: reply,
          timestamp: nowIso(),
          trace: result.trace,
        },
      ]);
      setInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pipeline failed");
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
        speakerName: "Dossier",
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
        speakerName: "Dossier",
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
        speakerName: "Scene",
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
        speakerName: "Scene",
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
            <h1>Persona Studio</h1>
            <p>事件驱动 + 状态机 + LLM 表达器</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="provider-control">
            <span>LLM</span>
            <select
              value={llmConfig.provider}
              onChange={(event) => setLlmConfig((current) => ({ ...current, provider: event.target.value as LlmConfig["provider"] }))}
            >
              <option value="simulated">Mock LLM</option>
              <option value="external">External Endpoint</option>
            </select>
          </label>
          <button className="icon-button" type="button" onClick={handleReset} title="Reset">
            <RefreshCcw size={17} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel state-panel">
          <PanelTitle icon={UserRound} title="State" />

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
            <RuntimeMetric label="Energy" value={state.runtime.energy.toFixed(2)} detail={state.runtime.signalProfiles.energy} />
            <RuntimeMetric label="Mood" value={state.runtime.derivedMood.label} detail={state.runtime.signalProfiles.mood} />
            <RuntimeMetric label="Valence" value={state.runtime.derivedMood.valence.toFixed(2)} detail={state.runtime.signalProfiles.valence} />
            <RuntimeMetric label="Arousal" value={state.runtime.derivedMood.arousal.toFixed(2)} detail={state.runtime.signalProfiles.arousal} />
          </div>

          <section className="subsection">
            <h2>Concerns</h2>
            <div className="list-stack">
              {state.concerns.map((concern) => (
                <div className="mini-card" key={concern.id}>
                  <div className="mini-card-head">
                    <strong>{concern.title}</strong>
                    <span className={concern.status === "active" ? "status-active" : "status-muted"}>{concern.status}</span>
                  </div>
                  <p>{concern.description}</p>
                  <div className="meter">
                    <span style={{ width: `${concern.intensity * 100}%` }} />
                  </div>
                  <small>triggers: {concern.triggers.slice(0, 5).join(" / ")}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="subsection">
            <h2>Dossier</h2>
            <textarea value={dossierDescription} onChange={(event) => setDossierDescription(event.target.value)} />
            <button className="primary-button" type="button" onClick={handleGenerateDossier}>
              <Eye size={16} /> Preview Dossier
            </button>
            {dossierPreview ? <DossierPreviewCard preview={dossierPreview} onApply={handleApplyDossier} /> : null}
          </section>

          <section className="subsection">
            <h2>Scene</h2>
            <textarea value={sceneDescription} onChange={(event) => setSceneDescription(event.target.value)} />
            <button className="secondary-button" type="button" onClick={handleGenerateScene}>
              <Eye size={16} /> Preview Scene
            </button>
            {scenePreview ? <ScenePreviewCard preview={scenePreview} onApply={handleApplyScene} /> : null}
          </section>
        </aside>

        <section className="panel chat-panel">
          <PanelTitle icon={MessageSquare} title="Chat" />
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
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入一句话，观察多模块 LLM 数据流" />
            <button type="submit" disabled={isRunning}>
              <Send size={17} /> {isRunning ? "Running" : "Send"}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <aside className="panel trace-panel">
          <PanelTitle icon={Activity} title="Pipeline Trace" />

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
              <span>Model</span>
              <input value={llmConfig.model} onChange={(event) => setLlmConfig((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <label>
              <span>Endpoint</span>
              <input
                value={llmConfig.endpoint}
                onChange={(event) => setLlmConfig((current) => ({ ...current, endpoint: event.target.value }))}
                placeholder="https://your-llm-endpoint"
              />
            </label>
          </div>

          <div className="json-view">
            <div className="json-head">
              <strong>{traceSteps.find((step) => step.key === activeStep)?.label ?? "Trace"}</strong>
              <span>{activeTrace ? "live" : "waiting"}</span>
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
          <Check size={14} /> Apply
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
          <Check size={14} /> Apply
        </button>
      </div>
      <p>{preview.cognitiveNarrative}</p>
      <small>{preview.sensoryProfile}</small>
      <small>{preview.interactionPressure}</small>
    </div>
  );
}
