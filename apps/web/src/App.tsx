import { lazy, Suspense, useEffect, useState } from "react";
import { P00Experience } from "./P00Experience";

const TeachingContextPage = lazy(() =>
  import("./TeachingContextPage").then((module) => ({ default: module.TeachingContextPage })),
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

function isContextRoute() {
  if (typeof window === "undefined") return false;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  return /^\/tasks\/[^/]+\/context\/?$/.test(path);
}

export function App() {
  const [contextRoute, setContextRoute] = useState(isContextRoute);

  useEffect(() => {
    const onPopState = () => setContextRoute(isContextRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const updateRoute = () => {
      window.history.pushState({}, "", `${base}${path}`);
      setContextRoute(isContextRoute());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    updateRoute();
  };

  return contextRoute ? (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在打开教学情境…</main>}>
      <TeachingContextPage onBack={() => navigate("")} />
    </Suspense>
  ) : (
    <DemoEntry onStart={() => navigate("tasks/demo-tang-45m/context")} />
  );
}

export { boundaryCopy };
