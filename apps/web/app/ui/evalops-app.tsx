"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Database, KeyRound, Layers3, Link2, Loader2, LogOut, Play, RefreshCw, ShieldCheck, TerminalSquare, Trash2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type MePayload = {
  user: { id: string; name: string; email: string };
  workspaces: Workspace[];
};

type Dataset = {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
};

type TestCase = {
  id: string;
  input: string;
  expectedOutput: string;
  evaluationType: string;
  category: string;
  difficulty: string;
};

type PromptVersion = {
  id: string;
  name: string;
  version: number;
  model: string;
  modelProvider: string;
  temperature: string;
  createdAt: string;
};

type Run = {
  id: string;
  status: string;
  score: string | null;
  regressionDetected: boolean;
  costCents: number;
  latencyMs: number;
  errorCount?: number;
  failureReason?: string | null;
  createdAt: string;
  datasetName: string;
  promptName: string;
  promptVersion: number;
};

type Overview = {
  metrics: {
    datasets: number;
    testCases: number;
    prompts: number;
    runs: number;
    avgScore: number | null;
    totalCost: number;
    avgLatency: number;
  };
  recentRuns: Run[];
  runSeries: Array<{ id: string; score: string | null; latencyMs: number; costCents: number; createdAt: string }>;
  openAlerts: Array<{ id: string; title: string; description: string; severity: string; createdAt: string }>;
  apiKeys: Array<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string }>;
  providerKeys: Array<{ id: string; provider: string; name: string; keyPreview: string; baseUrl: string; lastUsedAt: string | null; createdAt: string }>;
};

const nav = [
  { id: "dashboard", label: "Inicio", icon: BarChart3 },
  { id: "keys", label: "Conexiones", icon: Link2 },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "prompts", label: "Prompts", icon: Layers3 },
  { id: "runs", label: "Runs", icon: Play },
  { id: "alerts", label: "Alertas", icon: AlertTriangle }
] as const;

type View = (typeof nav)[number]["id"];

const defaultProfessionalPrompt = `<personalidad>
Eres un especialista senior en soporte al cliente para productos SaaS. Respondes con precisión, criterio operativo y lenguaje claro, sin inventar políticas ni asumir información que no esté en el contexto.
</personalidad>

<objetivo>
Resolver la consulta del usuario usando únicamente la evidencia entregada y producir una respuesta lista para enviar al cliente.
</objetivo>

<contexto>
{{context}}
</contexto>

<consulta_del_usuario>
{{input}}
</consulta_del_usuario>

<ejecucion>
1. Identifica la regla o política aplicable dentro del contexto.
2. Determina si la solicitud del cliente cumple las condiciones descritas.
3. Explica la respuesta de forma directa, amable y accionable.
4. Si falta evidencia para decidir, indícalo explícitamente y pide el dato mínimo necesario.
</ejecucion>

<criterios_de_calidad>
- No contradigas el contexto.
- No prometas beneficios, reembolsos, descuentos o excepciones que no estén documentados.
- Mantén la respuesta breve, profesional y orientada a la siguiente acción.
- Usa fechas, umbrales o condiciones exactas cuando estén disponibles.
</criterios_de_calidad>

<formato_de_salida>
Respuesta:
<texto final para el cliente>

Motivo:
<regla o evidencia usada en una frase>
</formato_de_salida>`;

const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
};

export function EvalOpsApp() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const workspace = me?.workspaces.find((item) => item.id === workspaceId) ?? me?.workspaces[0];

  const refresh = async (activeWorkspaceId = workspace?.id) => {
    if (!activeWorkspaceId) return;
    setNotice(null);
    const [overviewPayload, datasetPayload, promptPayload, runPayload] = await Promise.all([
      requestJson<Overview>(`/api/overview?workspaceId=${activeWorkspaceId}`),
      requestJson<{ datasets: Dataset[] }>(`/api/datasets?workspaceId=${activeWorkspaceId}`),
      requestJson<{ prompts: PromptVersion[] }>(`/api/prompts?workspaceId=${activeWorkspaceId}`),
      requestJson<{ runs: Run[] }>(`/api/runs?workspaceId=${activeWorkspaceId}`)
    ]);
    setOverview(overviewPayload);
    setDatasets(datasetPayload.datasets);
    setPrompts(promptPayload.prompts);
    setRuns(runPayload.runs);

    const datasetId = selectedDatasetId || datasetPayload.datasets[0]?.id || "";
    setSelectedDatasetId(datasetId);
    if (datasetId) {
      const casesPayload = await requestJson<{ testCases: TestCase[] }>(`/api/test-cases?datasetId=${datasetId}`);
      setTestCases(casesPayload.testCases);
    } else {
      setTestCases([]);
    }
  };

  const reloadAccount = async (preferredWorkspaceId?: string) => {
    const payload = await requestJson<MePayload>("/api/auth/me");
    const nextWorkspaceId = payload.workspaces.some((item) => item.id === preferredWorkspaceId)
      ? preferredWorkspaceId
      : payload.workspaces[0]?.id;

    setMe(payload);
    setWorkspaceId(nextWorkspaceId ?? "");
    await refresh(nextWorkspaceId);
  };

  useEffect(() => {
    requestJson<MePayload>("/api/auth/me")
      .then((payload) => {
        setMe(payload);
        setWorkspaceId(payload.workspaces[0]?.id ?? "");
        return refresh(payload.workspaces[0]?.id);
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) return;
    requestJson<{ testCases: TestCase[] }>(`/api/test-cases?datasetId=${selectedDatasetId}`)
      .then((payload) => setTestCases(payload.testCases))
      .catch((error) => setNotice(error.message));
  }, [selectedDatasetId]);

  const runChartData = useMemo(() => overview?.runSeries.map((run) => ({
    name: new Date(run.createdAt).toLocaleDateString(),
    score: run.score ? Number(run.score) : 0,
    latency: run.latencyMs
  })) ?? [], [overview]);

  if (loading) return <div className="auth-page"><div className="notice">Cargando EvalOps Hub...</div></div>;
  if (!me) return <AuthScreen onAuthenticated={async () => {
    const payload = await requestJson<MePayload>("/api/auth/me");
    setMe(payload);
    setWorkspaceId(payload.workspaces[0]?.id ?? "");
    await refresh(payload.workspaces[0]?.id);
  }} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="flex items-center gap-3 mb-8">
          <div className="brand-mark"><Activity size={21} /></div>
          <div>
            <div className="font-bold">EvalOps Hub</div>
            <div className="text-sm muted">{workspace?.name}</div>
          </div>
        </div>
        <nav className="grid gap-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button className="nav-button" data-active={view === item.id} key={item.id} onClick={() => setView(item.id)}>
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-8 grid gap-3">
          <select className="select" value={workspaceId} onChange={(event) => {
            setWorkspaceId(event.target.value);
            void refresh(event.target.value);
          }}>
            {me.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="button ghost" onClick={() => refresh()}><RefreshCw size={16} /> Refrescar</button>
          <button className="button ghost" onClick={async () => {
            await requestJson("/api/auth/logout", { method: "POST" });
            setMe(null);
          }}><LogOut size={16} /> Salir</button>
        </div>
      </aside>

      <main className="main">
        {busyMessage ? <ProgressOverlay message={busyMessage} /> : null}
        {notice ? <div className="notice mb-4">{notice}</div> : null}
        {overview && overview.providerKeys.length === 0 ? (
          <div className="notice mb-4">
            Conecta OpenRouter en Conexiones antes de crear prompts o ejecutar runs.
          </div>
        ) : null}
        {view === "dashboard" && <Dashboard overview={overview} chartData={runChartData} onNavigate={setView} />}
        {view === "datasets" && <Datasets datasets={datasets} testCases={testCases} selectedDatasetId={selectedDatasetId} setSelectedDatasetId={setSelectedDatasetId} workspaceId={workspaceId} onDone={refresh} onError={setNotice} setBusy={setBusyMessage} />}
        {view === "prompts" && <Prompts prompts={prompts} workspaceId={workspaceId} hasProviderKey={(overview?.providerKeys.length ?? 0) > 0} onDone={refresh} onError={setNotice} setBusy={setBusyMessage} />}
        {view === "runs" && <Runs datasets={datasets} prompts={prompts} runs={runs} workspaceId={workspaceId} hasProviderKey={(overview?.providerKeys.length ?? 0) > 0} onDone={refresh} onError={setNotice} setBusy={setBusyMessage} />}
        {view === "alerts" && <Alerts overview={overview} />}
        {view === "keys" && (
          <Connections
            workspaceId={workspaceId}
            workspaceName={workspace?.name ?? ""}
            canDeleteWorkspace={(me?.workspaces.length ?? 0) > 1}
            overview={overview}
            onDone={refresh}
            onWorkspaceChanged={reloadAccount}
            onError={setNotice}
            setBusy={setBusyMessage}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await requestJson(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      });
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div>
          <div className="brand-mark mb-6"><ShieldCheck size={22} /></div>
          <p className="eyebrow">LLM evaluation operations</p>
          <h1 className="hero-title">Measure model quality before it reaches users.</h1>
          <p className="hero-copy">Datasets, prompt versions, CI gates, regression alerts, cost tracking and latency visibility in one production-oriented control plane.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-8">
          {["Quality gates", "Cost control", "Traceability"].map((item) => <div className="panel" key={item}>{item}</div>)}
        </div>
      </section>
      <section className="auth-panel">
        <div className="flex gap-2 mb-4">
          <button className={`button ${mode === "register" ? "primary" : ""}`} onClick={() => setMode("register")}>Crear cuenta</button>
          <button className={`button ${mode === "login" ? "primary" : ""}`} onClick={() => setMode("login")}>Ingresar</button>
        </div>
        <form className="grid gap-3" onSubmit={submit}>
          {mode === "register" ? <Field name="name" label="Nombre" required /> : null}
          <Field name="email" label="Email" type="email" required />
          <Field name="password" label="Contraseña" type="password" required minLength={12} />
          {mode === "register" ? <Field name="workspaceName" label="Workspace" required /> : null}
          {error ? <div className="notice">{error}</div> : null}
          <button className="button primary" disabled={submitting}>{submitting ? "Procesando..." : mode === "register" ? "Crear workspace" : "Entrar"}</button>
        </form>
      </section>
    </div>
  );
}

function Dashboard({ overview, chartData, onNavigate }: { overview: Overview | null; chartData: Array<{ name: string; score: number; latency: number }>; onNavigate: (view: View) => void }) {
  const metrics = overview?.metrics;
  const steps = [
    { label: "Conectar OpenRouter", done: (overview?.providerKeys.length ?? 0) > 0, view: "keys" as const },
    { label: "Crear dataset", done: (metrics?.datasets ?? 0) > 0, view: "datasets" as const },
    { label: "Agregar casos", done: (metrics?.testCases ?? 0) > 0, view: "datasets" as const },
    { label: "Versionar prompt", done: (metrics?.prompts ?? 0) > 0, view: "prompts" as const },
    { label: "Ejecutar run", done: (metrics?.runs ?? 0) > 0, view: "runs" as const }
  ];
  return (
    <>
      <Header title="Inicio" description="Flujo recomendado: conecta proveedor, prepara dataset, versiona prompt y ejecuta runs." />
      <section className="workflow-panel mb-4">
        {steps.map((step, index) => (
          <button className="workflow-step" data-done={step.done} key={step.label} onClick={() => onNavigate(step.view)}>
            {step.done ? <CheckCircle2 size={18} /> : <span className="step-index">{index + 1}</span>}
            <span>{step.label}</span>
          </button>
        ))}
      </section>
      <div className="grid-metrics mb-4">
        <Metric label="Score promedio" value={metrics?.avgScore === null || metrics?.avgScore === undefined ? "n/a" : `${Math.round(metrics.avgScore * 100)}%`} />
        <Metric label="Runs" value={metrics?.runs ?? 0} />
        <Metric label="Costo total" value={`${metrics?.totalCost ?? 0}¢`} />
        <Metric label="Latencia media" value={`${metrics?.avgLatency ?? 0} ms`} />
      </div>
      <div className="content-grid">
        <section className="panel">
          <h2 className="text-lg font-bold mb-4">Score trend</h2>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#57d68d" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#57d68d" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(211,241,226,.12)" />
                <XAxis dataKey="name" stroke="#92a69c" />
                <YAxis stroke="#92a69c" domain={[0, 1]} />
                <Tooltip contentStyle={{ background: "#0f1a17", border: "1px solid rgba(211,241,226,.16)" }} />
                <Area type="monotone" dataKey="score" stroke="#57d68d" fill="url(#score)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty text="Ejecuta el primer run para ver tendencias de score." />}
        </section>
        <section className="panel">
          <h2 className="text-lg font-bold mb-4">Alertas abiertas</h2>
          {overview?.openAlerts.length ? overview.openAlerts.map((alert) => (
            <div className="panel mb-3" key={alert.id}>
              <span className="pill bad">{alert.severity}</span>
              <div className="font-bold mt-2">{alert.title}</div>
              <p className="muted text-sm">{alert.description}</p>
            </div>
          )) : <Empty text="No hay alertas abiertas." />}
        </section>
      </div>
    </>
  );
}

function Datasets(props: {
  datasets: Dataset[];
  testCases: TestCase[];
  selectedDatasetId: string;
  setSelectedDatasetId: (id: string) => void;
  workspaceId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
  setBusy: (message: string | null) => void;
}) {
  const submitDataset = submitJson("/api/datasets", () => props.onDone(), props.onError, { workspaceId: props.workspaceId }, props.setBusy, "Creando dataset...");
  const submitCase = submitJson("/api/test-cases", () => props.onDone(), props.onError, { datasetId: props.selectedDatasetId }, props.setBusy, "Guardando caso de prueba...");
  return (
    <>
      <Header title="Datasets" description="Administra casos reales de evaluación por categoría, criterio y dificultad." />
      <div className="content-grid">
        <section className="panel">
          <div className="section-header">
            <h2 className="text-lg font-bold">Datasets</h2>
            <select className="select max-w-xs" value={props.selectedDatasetId} onChange={(event) => props.setSelectedDatasetId(event.target.value)}>
              {props.datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
            </select>
          </div>
          {props.datasets.length ? <DataTable headers={["Nombre", "Slug", "Descripción"]} rows={props.datasets.map((dataset) => [dataset.name, dataset.slug, dataset.description || "Sin descripción"])} /> : <Empty text="Crea un dataset para empezar a evaluar." />}
          <h3 className="font-bold mt-5 mb-3">Casos del dataset seleccionado</h3>
          {props.testCases.length ? <DataTable headers={["Input", "Tipo", "Categoría", "Dificultad"]} rows={props.testCases.map((testCase) => [testCase.input, testCase.evaluationType, testCase.category, testCase.difficulty])} /> : <Empty text="Este dataset todavía no tiene casos." />}
        </section>
        <section className="grid gap-4">
          <FormPanel title="Nuevo dataset" onSubmit={submitDataset}>
            <Field name="name" label="Nombre" required />
            <TextArea name="description" label="Descripción" />
            <button className="button primary"><Database size={16} /> Crear dataset</button>
          </FormPanel>
          <FormPanel title="Nuevo caso" onSubmit={submitCase}>
            <TextArea name="input" label="Input" required />
            <TextArea name="context" label="Contexto" />
            <TextArea name="expectedOutput" label="Output esperado" required />
            <Select name="evaluationType" label="Tipo" options={["exact_match", "json_schema", "rubric", "security", "tool_call", "manual"]} />
            <Field name="category" label="Categoría" defaultValue="general" />
            <Field name="difficulty" label="Dificultad" defaultValue="medium" />
            <Field name="tags" label="Tags separados por coma" />
            <TextArea name="criteria" label="Criterios JSON" defaultValue="{}" />
            <button className="button primary" disabled={!props.selectedDatasetId}><ClipboardCheck size={16} /> Crear caso</button>
          </FormPanel>
        </section>
      </div>
    </>
  );
}

function Prompts({ prompts, workspaceId, hasProviderKey, onDone, onError, setBusy }: { prompts: PromptVersion[]; workspaceId: string; hasProviderKey: boolean; onDone: () => Promise<void>; onError: (message: string) => void; setBusy: (message: string | null) => void }) {
  const submit = submitJson("/api/prompts", onDone, onError, { workspaceId }, setBusy, "Guardando versión de prompt...");
  return (
    <>
      <Header title="Prompts" description="Versiona instrucciones, selecciona modelo OpenRouter y conserva trazabilidad por run." />
      <div className="content-grid">
        <section className="panel">
          {prompts.length ? <DataTable headers={["Nombre", "Versión", "Modelo", "Temperatura"]} rows={prompts.map((prompt) => [prompt.name, `v${prompt.version}`, prompt.model, prompt.temperature])} /> : <Empty text="Crea la primera versión de prompt." />}
        </section>
        <FormPanel title="Nueva versión" onSubmit={submit}>
          {!hasProviderKey ? <div className="notice">Agrega una key de OpenRouter en Conexiones para cargar modelos y ejecutar prompts.</div> : null}
          <Field name="name" label="Nombre" required />
          <TextArea name="template" label="Template" required defaultValue={defaultProfessionalPrompt} />
          <Field name="variables" label="Variables separadas por coma" defaultValue="input,context" />
          <input type="hidden" name="modelProvider" value="openrouter" />
          <OpenRouterModelSelect workspaceId={workspaceId} disabled={!hasProviderKey} />
          <Field name="temperature" label="Temperatura" type="number" step="0.1" defaultValue="0.2" />
          <TextArea name="notes" label="Notas de cambio" />
          <button className="button primary" disabled={!hasProviderKey}><Layers3 size={16} /> Guardar versión</button>
        </FormPanel>
      </div>
    </>
  );
}

function Runs({ datasets, prompts, runs, workspaceId, hasProviderKey, onDone, onError, setBusy }: { datasets: Dataset[]; prompts: PromptVersion[]; runs: Run[]; workspaceId: string; hasProviderKey: boolean; onDone: () => Promise<void>; onError: (message: string) => void; setBusy: (message: string | null) => void }) {
  const submit = submitJson("/api/runs", onDone, onError, { workspaceId }, setBusy, "Ejecutando evaluación...");
  return (
    <>
      <Header title="Runs" description="Ejecuta evaluaciones y compara resultados contra un baseline." />
      <div className="content-grid">
        <section className="panel">
          {runs.length ? <DataTable headers={["Run", "Dataset", "Prompt", "Score", "Estado"]} rows={runs.map((run) => [
            run.id.slice(0, 8),
            run.datasetName,
            `${run.promptName} v${run.promptVersion}`,
            run.score ? `${Math.round(Number(run.score) * 100)}%` : "n/a",
            run.regressionDetected ? "regresión" : run.status
          ])} /> : <Empty text="No hay runs todavía." />}
        </section>
        <FormPanel title="Ejecutar evaluación" onSubmit={submit}>
          {!hasProviderKey ? <div className="notice">Conecta OpenRouter antes de ejecutar una evaluación.</div> : null}
          <Select name="datasetId" label="Dataset" options={datasets.map((dataset) => ({ label: dataset.name, value: dataset.id }))} />
          <Select name="promptVersionId" label="Prompt" options={prompts.map((prompt) => ({ label: `${prompt.name} v${prompt.version}`, value: prompt.id }))} />
          <Select name="baselineRunId" label="Baseline opcional" options={[{ label: "Sin baseline", value: "" }, ...runs.filter((run) => run.status === "completed").map((run) => ({ label: `${run.datasetName} ${run.id.slice(0, 8)}`, value: run.id }))]} />
          <button className="button primary" disabled={!hasProviderKey || !datasets.length || !prompts.length}><Play size={16} /> Ejecutar</button>
          <p className="muted text-sm">Usa la key OpenRouter guardada en Conexiones para el workspace actual.</p>
        </FormPanel>
      </div>
    </>
  );
}

function Alerts({ overview }: { overview: Overview | null }) {
  return (
    <>
      <Header title="Alertas" description="Regresiones, errores de proveedor y umbrales operativos." />
      <section className="panel">
        {overview?.openAlerts.length ? overview.openAlerts.map((alert) => (
          <div className="panel mb-3" key={alert.id}>
            <span className="pill bad">{alert.severity}</span>
            <h3 className="font-bold mt-2">{alert.title}</h3>
            <p className="muted">{alert.description}</p>
          </div>
        )) : <Empty text="No hay alertas abiertas." />}
      </section>
    </>
  );
}

function Connections({
  workspaceId,
  workspaceName,
  canDeleteWorkspace,
  overview,
  onDone,
  onWorkspaceChanged,
  onError,
  setBusy
}: {
  workspaceId: string;
  workspaceName: string;
  canDeleteWorkspace: boolean;
  overview: Overview | null;
  onDone: () => Promise<void>;
  onWorkspaceChanged: (preferredWorkspaceId?: string) => Promise<void>;
  onError: (message: string) => void;
  setBusy: (message: string | null) => void;
}) {
  const submitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("Creando workspace...");
    try {
      const payload = await requestJson<{ workspace: Workspace }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name") })
      });
      formElement.reset();
      await onWorkspaceChanged(payload.workspace.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create workspace");
    } finally {
      setBusy(null);
    }
  };

  const deleteWorkspace = async () => {
    if (!canDeleteWorkspace) {
      onError("Crea otro workspace antes de eliminar este.");
      return;
    }

    setBusy("Eliminando workspace...");
    try {
      await requestJson("/api/workspaces", {
        method: "DELETE",
        body: JSON.stringify({ workspaceId })
      });
      await onWorkspaceChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not delete workspace");
    } finally {
      setBusy(null);
    }
  };

  const submitProviderKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("Guardando conexión OpenRouter...");
    try {
      await requestJson("/api/provider-keys", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          provider: "openrouter",
          name: form.get("name"),
          apiKey: form.get("apiKey"),
          baseUrl: form.get("baseUrl")
        })
      });
      formElement.reset();
      await onDone();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not store provider key");
    } finally {
      setBusy(null);
    }
  };

  const submitCiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scopes = form.getAll("scopes").map(String);
    setBusy("Creando credencial CI...");
    try {
      await requestJson("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ workspaceId, name: form.get("name"), scopes })
      });
      formElement.reset();
      await onDone();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create API key");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Header title="Conexiones" description="Primero conecta OpenRouter. Las credenciales se guardan cifradas y no se muestran después de guardarlas." />
      <div className="content-grid">
        <section className="grid gap-4">
          <div className="panel">
            <h2 className="text-lg font-bold mb-3">Workspace actual</h2>
            <div className="workspace-row">
              <div>
                <div className="font-bold">{workspaceName}</div>
                <p className="muted text-sm">Separa datasets, prompts, runs y credenciales por proyecto o cliente.</p>
              </div>
              <button className="button danger" disabled={!canDeleteWorkspace} onClick={deleteWorkspace} type="button">
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
            {!canDeleteWorkspace ? <p className="muted text-sm mt-3">No puedes eliminar el único workspace de la cuenta.</p> : null}
          </div>
          <div className="panel">
            <h2 className="text-lg font-bold mb-3">OpenRouter</h2>
            {overview?.providerKeys.length ? (
              <DataTable headers={["Nombre", "Proveedor", "Key", "Base URL"]} rows={overview.providerKeys.map((key) => [key.name, key.provider, key.keyPreview, key.baseUrl])} />
            ) : <Empty text="No hay proveedor conectado. Agrega tu key de OpenRouter para cargar modelos y ejecutar runs." />}
          </div>
          <div className="panel">
            <h2 className="text-lg font-bold mb-3">CI/CD e ingestión</h2>
            {overview?.apiKeys.length ? <DataTable headers={["Nombre", "Prefijo", "Scopes"]} rows={overview.apiKeys.map((key) => [key.name, key.prefix, key.scopes.join(", ")])} /> : <Empty text="No hay API keys operativas para CI/CD." />}
          </div>
        </section>
        <section className="grid gap-4">
          <FormPanel title="Crear workspace" onSubmit={submitWorkspace}>
            <Field name="name" label="Nombre" required />
            <button className="button"><Database size={16} /> Crear workspace</button>
          </FormPanel>
          <FormPanel title="Conectar OpenRouter" onSubmit={submitProviderKey}>
            <Field name="name" label="Nombre" defaultValue="OpenRouter" required />
            <Field name="apiKey" label="OpenRouter API key" type="password" autoComplete="off" required />
            <Field name="baseUrl" label="Base URL" defaultValue="https://openrouter.ai/api/v1" required />
            <button className="button primary"><KeyRound size={16} /> Guardar conexión</button>
          </FormPanel>
          <FormPanel title="Crear key para CI/CD" onSubmit={submitCiKey}>
            <Field name="name" label="Nombre" required />
            <label className="flex gap-2 items-center"><input name="scopes" type="checkbox" value="evaluations:run" defaultChecked /> evaluations:run</label>
            <label className="flex gap-2 items-center"><input name="scopes" type="checkbox" value="results:read" /> results:read</label>
            <label className="flex gap-2 items-center"><input name="scopes" type="checkbox" value="traces:write" /> traces:write</label>
            <button className="button"><TerminalSquare size={16} /> Crear credencial</button>
            <p className="muted text-sm">La credencial operativa se registra para el workspace y no se muestra en pantalla.</p>
          </FormPanel>
        </section>
      </div>
    </>
  );
}

function OpenRouterModelSelect({ workspaceId, disabled }: { workspaceId: string; disabled: boolean }) {
  const [models, setModels] = useState<Array<{ id: string; name: string; contextLength: number | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled || !workspaceId) return;
    let cancelled = false;

    const loadModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await requestJson<{ models: Array<{ id: string; name: string; contextLength: number | null }> }>(`/api/openrouter/models?workspaceId=${workspaceId}`);
        if (!cancelled) setModels(payload.models);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [disabled, workspaceId]);

  if (disabled) {
    return <Field name="model" label="Modelo" defaultValue="mistralai/mistral-small-3.2-24b-instruct" required disabled />;
  }

  return (
    <div className="field">
      <label htmlFor="model">Modelo OpenRouter</label>
      <select className="select" id="model" name="model" required disabled={loading || models.length === 0}>
        {loading ? <option value="">Cargando modelos...</option> : null}
        {!loading && models.length === 0 ? <option value="">Sin modelos disponibles</option> : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.id}{model.contextLength ? ` · ${model.contextLength.toLocaleString()} ctx` : ""}
          </option>
        ))}
      </select>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

function ProgressOverlay({ message }: { message: string }) {
  return (
    <div className="progress-banner" role="status" aria-live="polite">
      <Loader2 size={18} className="spin" />
      <span>{message}</span>
    </div>
  );
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="section-header">
      <div>
        <p className="eyebrow">EvalOps Hub</p>
        <h1 className="text-3xl font-black mt-1">{title}</h1>
        <p className="muted mt-2">{description}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric-card"><div className="muted text-sm mb-5">{label}</div><div className="metric-value">{value}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-card">
      <table className="table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function FormPanel({ title, onSubmit, children }: { title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return <form className="panel grid gap-3" onSubmit={onSubmit}><h2 className="text-lg font-bold">{title}</h2>{children}</form>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return <div className="field"><label htmlFor={props.name}>{label}</label><input className="input" id={props.name} {...inputProps} /></div>;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
  const { label, ...textareaProps } = props;
  return <div className="field"><label htmlFor={props.name}>{label}</label><textarea className="textarea" id={props.name} {...textareaProps} /></div>;
}

function Select({ label, name, options }: { label: string; name: string; options: Array<string | { label: string; value: string }> }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select className="select" id={name} name={name}>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const text = typeof option === "string" ? option : option.label;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    </div>
  );
}

const submitJson = (url: string, onDone: () => Promise<void>, onError: (message: string) => void, extra: Record<string, string>, setBusy: (message: string | null) => void, busyMessage: string) => async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const body: Record<string, unknown> = { ...extra, ...Object.fromEntries(form.entries()) };

  if (typeof body.tags === "string") body.tags = body.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (typeof body.variables === "string") body.variables = body.variables.split(",").map((variable) => variable.trim()).filter(Boolean);
  if (typeof body.criteria === "string") {
    try {
      body.criteria = JSON.parse(body.criteria);
    } catch {
      onError("Criteria must be valid JSON");
      return;
    }
  }
  if (body.baselineRunId === "") delete body.baselineRunId;

  try {
    setBusy(busyMessage);
    await requestJson(url, { method: "POST", body: JSON.stringify(body) });
    formElement.reset();
    await onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : "Request failed");
  } finally {
    setBusy(null);
  }
};
