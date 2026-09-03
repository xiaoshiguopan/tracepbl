import { lazy, Suspense, useEffect, useState } from "react";
import { P00Experience } from "./P00Experience";
import { TaskDrawer, TaskUnavailable, WorkbenchProvider, WorkbenchShell, taskSteps } from "./WorkbenchShell";
import { listTasks, markTaskReached, prepareNewTask } from "./teaching-context-store";
import { syntheticFixture } from "./teaching-context";

const TeachingContextPage = lazy(() => import("./TeachingContextPage").then((module) => ({ default: module.TeachingContextPage })));
const QuestionWorkspacePage = lazy(() => import("./QuestionWorkspacePage").then((module) => ({ default: module.QuestionWorkspacePage })));
const SourceDiscoveryPage = lazy(() => import("./SourceDiscoveryPage").then((module) => ({ default: module.SourceDiscoveryPage })));
const EvidenceMapPage = lazy(() => import("./EvidenceMapPage").then((module) => ({ default: module.EvidenceMapPage })));
const LessonDesignPage = lazy(() => import("./LessonDesignPage").then((module) => ({ default: module.LessonDesignPage })));
const RubricDesignPage = lazy(() => import("./RubricDesignPage").then((module) => ({ default: module.RubricDesignPage })));
const DesignAuditPage = lazy(() => import("./DesignAuditPage").then((module) => ({ default: module.DesignAuditPage })));
const FinalReviewPage = lazy(() => import("./FinalReviewPage").then((module) => ({ default: module.FinalReviewPage })));

export const boundaryCopy = "教学情境与系统建议为公开演示内容；史料来自所列权威公开来源。数据只保存在当前浏览器，未连接在线 AI 或数据库。请勿输入真实学生或敏感信息。";

function DemoEntry({ onStart, onNewTask, onOpenTask }: { onStart: () => void; onNewTask: () => void; onOpenTask: (taskId: string, step?: number) => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="demo-entry">
      <a className="skip-link" href="#main-content">跳至主要内容</a>
      <header className="topbar" aria-label="首页导航">
        <a className="brand" href="./" aria-label="史证工坊首页"><span className="brand-mark" aria-hidden="true">史</span><span><strong>史证工坊</strong><small>TracePBL</small></span></a>
        <div className="topbar-actions"><button type="button" onClick={onNewTask}>＋ 新建备课</button><button type="button" onClick={() => setDrawerOpen(true)}>我的备课</button><details className="demo-disclosure"><summary>公开演示</summary><div><strong>游客模式 · 数据仅存本机</strong><p>{boundaryCopy}</p></div></details></div>
      </header>
      <main id="main-content" className="hero" tabIndex={-1}>
        <P00Experience />
        <section className="hero-rail" aria-labelledby="hero-title">
          <h1 id="hero-title"><span>让沉睡千年的证据</span><span>重新开口</span></h1>
          <p className="hero-purpose">面向历史教师的<br />可追溯史料探究工作台</p>
          <button className="primary-action" type="button" onClick={onStart}><span>进入史料工作台</span><span aria-hidden="true">↗</span></button>
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

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    void listTasks().then((tasks) => setKnownTasks(new Set(tasks.map((task) => task.id))));
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    window.history.pushState({}, "", `${base}${path}`);
    setLocation(currentLocation());
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openTask = (taskId: string, step = 0) => navigate(`tasks/${encodeURIComponent(taskId)}/${stepPaths[Math.min(step, 7)]}`);
  const newTask = () => {
    const taskId = crypto.randomUUID();
    sessionStorage.setItem("tracepbl-pending-task", taskId);
    void prepareNewTask(taskId, syntheticFixture).finally(() => openTask(taskId, 0));
  };
  const defaultTask = () => openTask("demo-tang-45m", 0);
  const goStep = (step: number) => {
    if (!location.taskId) return;
    void markTaskReached(location.taskId, step);
    openTask(location.taskId, step);
  };

  if (location.route === "demo") return <DemoEntry onStart={defaultTask} onNewTask={newTask} onOpenTask={openTask} />;
  const pendingTask = sessionStorage.getItem("tracepbl-pending-task");
  const allowed = location.taskId === "demo-tang-45m" || location.taskId === pendingTask || knownTasks?.has(location.taskId);
  if (location.route === "unavailable" || (knownTasks && !allowed)) return <TaskUnavailable onBack={() => navigate("")} onNewTask={newTask} />;
  if (!knownTasks) return <main className="route-loading" aria-busy="true">正在读取本机备课…</main>;

  const page = (() => {
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
  return <WorkbenchProvider taskId={location.taskId} onNewTask={newTask} onOpenTask={openTask}><Suspense fallback={<WorkbenchShell currentStep={routeStep} reachedStep={routeStep} currentLabel={taskSteps[routeStep]} nextLabel="" onBack={() => navigate("")}><main className="context-main route-loading" id="main-content" aria-busy="true"><span className="route-loading-mark" />正在打开备课…</main></WorkbenchShell>}>{page}</Suspense></WorkbenchProvider>;
}
