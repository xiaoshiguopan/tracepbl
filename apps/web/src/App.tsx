import { lazy, Suspense, useEffect, useState } from "react";
import { P00Experience } from "./P00Experience";

const TeachingContextPage = lazy(() =>
  import("./TeachingContextPage").then((module) => ({ default: module.TeachingContextPage })),
);
const QuestionWorkspacePage = lazy(() =>
  import("./QuestionWorkspacePage").then((module) => ({ default: module.QuestionWorkspacePage })),
);
const SourceDiscoveryPage = lazy(() =>
  import("./SourceDiscoveryPage").then((module) => ({ default: module.SourceDiscoveryPage })),
);
const EvidenceMapPage = lazy(() =>
  import("./EvidenceMapPage").then((module) => ({ default: module.EvidenceMapPage })),
);
const LessonDesignPage = lazy(() =>
  import("./LessonDesignPage").then((module) => ({ default: module.LessonDesignPage })),
);

const boundaryCopy =
  "教学情境和操作结果为合成演示；史料来自所列权威公开来源。数据只保存在当前浏览器，未连接在线 AI 或数据库。请勿输入真实学生或敏感信息。";

function DemoEntry({ onStart }: { onStart: () => void }) {
  return (
    <div className="demo-entry">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>

      <header className="topbar" aria-label="演示导航">
        <a className="brand" href="./" aria-label="史证工坊首页">
          <span className="brand-mark" aria-hidden="true">
            史
          </span>
          <span>
            <strong>史证工坊</strong>
            <small>TracePBL</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="demo-badge">作品集演示模式</span>
          <details className="demo-disclosure">
            <summary>演示说明</summary>
            <div>
              <strong>画面为艺术化演绎</strong>
              <p>{boundaryCopy}</p>
            </div>
          </details>
        </div>
      </header>

      <main id="main-content" className="hero" tabIndex={-1}>
        <P00Experience />

        <section className="hero-rail" aria-labelledby="hero-title">
          <h1 id="hero-title">
            <span>让沉睡千年的证据</span>
            <span>重新开口</span>
          </h1>
          <p className="hero-purpose">
            面向历史教师的
            <br />
            可追溯史料探究工作台
          </p>
          <button className="primary-action" type="button" onClick={onStart}>
            <span>进入史料工作台</span>
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      </main>
    </div>
  );
}

type Route = "demo" | "context" | "question" | "sources" | "evidence" | "lesson";

function readRoute(): Route {
  if (typeof window === "undefined") return "demo";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  if (/^\/tasks\/[^/]+\/context\/?$/.test(path)) return "context";
  if (/^\/tasks\/[^/]+\/question\/?$/.test(path)) return "question";
  if (/^\/tasks\/[^/]+\/sources\/?$/.test(path)) return "sources";
  if (/^\/tasks\/[^/]+\/evidence-map\/?$/.test(path)) return "evidence";
  if (/^\/tasks\/[^/]+\/lesson\/?$/.test(path)) return "lesson";
  return "demo";
}

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const updateRoute = () => {
      window.history.pushState({}, "", `${base}${path}`);
      setRoute(readRoute());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    updateRoute();
  };

  if (route === "context") return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开教学情境…</main>}>
      <TeachingContextPage onBack={() => navigate("")} onNext={() => navigate("tasks/demo-tang-45m/question")} />
    </Suspense>
  );
  if (route === "question") return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开探究问题…</main>}>
      <QuestionWorkspacePage onBack={() => navigate("")} onReturnContext={() => navigate("tasks/demo-tang-45m/context")} onNext={() => navigate("tasks/demo-tang-45m/sources")} />
    </Suspense>
  );
  if (route === "sources") return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开史料阅览台…</main>}>
      <SourceDiscoveryPage onBack={() => navigate("")} onReturnContext={() => navigate("tasks/demo-tang-45m/context")} onReturnQuestion={() => navigate("tasks/demo-tang-45m/question")} onNext={() => navigate("tasks/demo-tang-45m/evidence-map")} />
    </Suspense>
  );
  if (route === "evidence") return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开证据关系…</main>}>
      <EvidenceMapPage onBack={() => navigate("")} onReturnContext={() => navigate("tasks/demo-tang-45m/context")} onReturnQuestion={() => navigate("tasks/demo-tang-45m/question")} onReturnSources={() => navigate("tasks/demo-tang-45m/sources")} onNext={() => navigate("tasks/demo-tang-45m/lesson")} />
    </Suspense>
  );
  if (route === "lesson") return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开课堂排演稿…</main>}>
      <LessonDesignPage onBack={() => navigate("")} onReturnContext={() => navigate("tasks/demo-tang-45m/context")} onReturnQuestion={() => navigate("tasks/demo-tang-45m/question")} onReturnSources={() => navigate("tasks/demo-tang-45m/sources")} onReturnEvidence={() => navigate("tasks/demo-tang-45m/evidence-map")} />
    </Suspense>
  );
  return <DemoEntry onStart={() => navigate("tasks/demo-tang-45m/context")} />;
}

export { boundaryCopy };
