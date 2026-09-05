import { pendingInlineStep } from "./InlineAi";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { P00Experience } from "./P00Experience";
import { TaskDrawer, TaskUnavailable, WorkbenchProvider, WorkbenchShell, taskSteps } from "./WorkbenchShell";
import { listTasks, markTaskReached, prepareNewTask } from "./teaching-context-store";
import { syntheticFixture } from "./teaching-context";
import { isLocalMode } from "./runtime-mode";
const LocalTaskBoundary = lazy(() => import("./LocalTaskBoundary").then(module => ({ default: module.LocalTaskBoundary })));

const TeachingContextPage = lazy(() => import("./TeachingContextPage").then((module) => ({ default: module.TeachingContextPage })));
const QuestionWorkspacePage = lazy(() => import("./QuestionWorkspacePage").then((module) => ({ default: module.QuestionWorkspacePage })));
const SourceDiscoveryPage = lazy(() => import("./SourceDiscoveryPage").then((module) => ({ default: module.SourceDiscoveryPage })));
const EvidenceMapPage = lazy(() => import("./EvidenceMapPage").then((module) => ({ default: module.EvidenceMapPage })));
const LessonDesignPage = lazy(() => import("./LessonDesignPage").then((module) => ({ default: module.LessonDesignPage })));
const RubricDesignPage = lazy(() => import("./RubricDesignPage").then((module) => ({ default: module.RubricDesignPage })));
const DesignAuditPage = lazy(() => import("./DesignAuditPage").then((module) => ({ default: module.DesignAuditPage })));
const FinalReviewPage = lazy(() => import("./FinalReviewPage").then((module) => ({ default: module.FinalReviewPage })));

export const boundaryCopy = "教学情境与系统建议为公开演示内容；史料来自所列权威公开来源。数据只保存在当前浏览器，未连接在线 AI 或数据库。请勿输入真实学生或敏感信息。";

function DemoEntry({ onStart, onNewTask, onOpenTask, creating = false, error = "" }: { onStart: () => void; onNewTask: () => void; onOpenTask: (taskId: string, step?: number) => void; creating?: boolean; error?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="demo-entry">
      <a className="skip-link" href="#main-content">跳至主要内容</a>
      <header className="topbar" aria-label="首页导航">
        <a className="brand" href="./" aria-label="史证工坊首页"><span className="brand-mark" aria-hidden="true">史</span><span><strong>史证工坊</strong><small>TracePBL</small></span></a>
        <div className="topbar-actions"><button type="button" onClick={onNewTask}>＋ 新建备课</button><button type="button" onClick={() => setDrawerOpen(true)}>我的备课</button><details className="demo-disclosure"><summary>{isLocalMode ? "本地完整模式" : "公开演示"}</summary><div><strong>{isLocalMode ? "本地数据库 · 仅本机访问" : "游客模式 · 数据仅存本机"}</strong><p>{isLocalMode ? "数据通过本地 API 存入本机数据库，不进入公开 Demo。本阶段只使用合成或公开许可材料及模拟 AI，不调用付费模型。" : boundaryCopy}</p></div></details></div>
      </header>
      <main id="main-content" className="hero" tabIndex={-1}>
        <P00Experience />
        <section className="hero-rail" aria-labelledby="hero-title">
          <h1 id="hero-title"><span>让沉睡千年的证据</span><span>重新开口</span></h1>
          <p className="hero-purpose">面向历史教师的<br />可追溯史料探究工作台</p>
          <button className="primary-action" type="button" onClick={onStart} disabled={isLocalMode && creating} aria-busy={isLocalMode && creating}><span>{isLocalMode && creating ? "正在打开本地工作台…" : "进入史料工作台"}</span><span aria-hidden="true">↗</span></button>
          {isLocalMode && error ? <p className="local-entry-error" role="alert">{error} 可以再次点击进入重试。</p> : null}
        </section>
      </main>
      <TaskDrawer open={drawerOpen} currentTaskId="" onClose={() => setDrawerOpen(false)} onNewTask={onNewTask} onOpenTask={onOpenTask} />
    </div>
  );
}

export type Route = "demo" | "context" | "question" | "sources" | "evidence" | "lesson" | "rubric" | "audit" | "review" | "unavailable";
const stepPaths = ["context", "question", "sources", "evidence-map", "lesson", "rubric", "audit", "review"];
const routeMap = { context: "context", question: "question", sources: "sources", "evidence-map": "evidence", lesson: "lesson", rubric: "rubric", audit: "audit", review: "review" } as const;

export function routeForPath(rawPath: string, base: string): Route {
  const pathname = rawPath.split(/[?#]/, 1)[0];
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (/^\/task-unavailable\/?$/.test(path)) return "unavailable";
  const match = path.match(/^\/tasks\/[^/]+\/(context|question|sources|evidence-map|lesson|rubric|audit|review)\/?$/);
  if (!match) return "demo";
  return routeMap[match[1] as keyof typeof routeMap];
}

function taskIdForPath(rawPath: string, base: string) {
  const pathname = rawPath.split(/[?#]/, 1)[0];
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return decodeURIComponent(path.match(/^\/tasks\/([^/]+)\//)?.[1] || "");
}

function currentLocation() {
  if (typeof window === "undefined") return { route: "demo" as Route, taskId: "" };
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return { route: routeForPath(window.location.pathname, base), taskId: taskIdForPath(window.location.pathname, base) };
}

export function App() {
  const [location, setLocation] = useState(currentLocation);
  const [knownTasks, setKnownTasks] = useState<Set<string> | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const creationPending = useRef(false);
  const creationKey = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    if (!isLocalMode) void listTasks().then((tasks) => setKnownTasks(new Set(tasks.map((task) => task.id))), () => setError("浏览器存储不可用，请检查本机存储设置。"));
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    if (isLocalMode && !window.dispatchEvent(new Event("tracepbl-before-navigate", { cancelable: true }))) return;
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    window.history.pushState({}, "", `${base}${path}`);
    setLocation(currentLocation());
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openTask = (taskId: string, step = 0) => navigate(`tasks/${encodeURIComponent(taskId)}/${stepPaths[Math.min(step, 7)]}`);
  const newTask = () => {
    if (isLocalMode && creationPending.current) return;
    const taskId = isLocalMode ? creationKey.current ?? crypto.randomUUID() : crypto.randomUUID();
    if (isLocalMode) { creationKey.current = taskId; creationPending.current = true; setCreating(true); setError(""); }
    sessionStorage.setItem("tracepbl-pending-task", taskId);
    void prepareNewTask(taskId, syntheticFixture).then((id) => { creationKey.current = null; openTask(id || taskId, 0); }, () => setError("本地服务暂时不可用，未能确认创建结果。" )).finally(() => { creationPending.current = false; setCreating(false); });
  };
  const defaultTask = () => isLocalMode ? newTask() : openTask("demo-tang-45m", 0);
  const goStep = (step: number) => {
    if (!location.taskId) return;
    void markTaskReached(location.taskId, step);
    openTask(location.taskId, step);
  };

  if (location.route === "demo") return <>{error && !isLocalMode ? <div role="alert" className="status-banner warning">{error}</div> : null}<DemoEntry onStart={defaultTask} onNewTask={newTask} onOpenTask={openTask} creating={creating} error={error} /></>;
  const pendingTask = sessionStorage.getItem("tracepbl-pending-task");
  const allowed = location.taskId === "demo-tang-45m" || location.taskId === pendingTask || knownTasks?.has(location.taskId);
  if (location.route === "unavailable" || (!isLocalMode && knownTasks && !allowed)) return <TaskUnavailable onBack={() => navigate("")} onNewTask={newTask} />;
  if (!isLocalMode && !knownTasks) return <main className="route-loading" aria-busy={!error}>{error || "正在读取本机备课…"}</main>;

  const page = (() => {
    const pending = isLocalMode ? pendingInlineStep(location.taskId) : undefined;
    if (pending && ["audit", "review"].includes(location.route)) return <main className="context-main" id="main-content"><h1>先确认栏目修改</h1><p>本窗口还有生成后尚未确认的内容。请返回确认或撤销，再检查和导出。</p><button className="ui-button primary" onClick={() => goStep(({questionGuidance:1,evidenceAnalysis:3,lesson:4,rubric:5})[pending])}>返回待确认栏目</button></main>;
    if (location.route === "context") return <TeachingContextPage taskId={location.taskId} onBack={() => navigate("")} onNext={() => goStep(1)} />;
    if (location.route === "question") return <QuestionWorkspacePage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onNext={() => goStep(2)} />;
    if (location.route === "sources") return <SourceDiscoveryPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onNext={() => goStep(3)} />;
    if (location.route === "evidence") return <EvidenceMapPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onReturnSources={() => goStep(2)} onNext={() => goStep(4)} />;
    if (location.route === "lesson") return <LessonDesignPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onReturnSources={() => goStep(2)} onReturnEvidence={() => goStep(3)} onNext={() => goStep(5)} />;
    if (location.route === "rubric") return <RubricDesignPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onReturnSources={() => goStep(2)} onReturnEvidence={() => goStep(3)} onReturnLesson={() => goStep(4)} onNext={() => goStep(6)} />;
    if (location.route === "audit") return <DesignAuditPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onReturnSources={() => goStep(2)} onReturnEvidence={() => goStep(3)} onReturnLesson={() => goStep(4)} onReturnRubric={() => goStep(5)} onNext={() => goStep(7)} />;
    return <FinalReviewPage taskId={location.taskId} onBack={() => navigate("")} onReturnContext={() => goStep(0)} onReturnQuestion={() => goStep(1)} onReturnSources={() => goStep(2)} onReturnEvidence={() => goStep(3)} onReturnLesson={() => goStep(4)} onReturnRubric={() => goStep(5)} onReturnAudit={() => goStep(6)} />;
  })();
  const routeStep = Math.max(0, (["context", "question", "sources", "evidence", "lesson", "rubric", "audit", "review"] as Route[]).indexOf(location.route));
  return <WorkbenchProvider taskId={location.taskId} onNewTask={newTask} onOpenTask={openTask}><Suspense fallback={<WorkbenchShell currentStep={routeStep} reachedStep={routeStep} currentLabel={taskSteps[routeStep]} nextLabel="" onBack={() => navigate("")}><main className="context-main route-loading" id="main-content" aria-busy="true"><span className="route-loading-mark" />正在打开备课…</main></WorkbenchShell>}>{isLocalMode ? <LocalTaskBoundary key={`${location.taskId}:${location.route}`} taskId={location.taskId} onBack={() => navigate("")} onNewTask={newTask}>{page}</LocalTaskBoundary> : page}</Suspense></WorkbenchProvider>;
}
