import { useEffect, useRef, useState } from "react";
import {
  chooseExperienceLevel,
  parseForcedLevel,
  type ExperienceLevel,
} from "./experience-policy";
import type { P00SceneController } from "./three-scene";
import type { PerformanceSample } from "./three-scene";

const INTRO_SEEN_KEY = "tracepbl:intro:v1";
const LOAD_TIMEOUT_MS = 2500;

type P00ExperienceProps = {
  settleRequested: boolean;
};

type PrototypeStatus = "checking" | "loading" | "active" | "fallback";

function supportsWebGl2() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2"));
}

function readIntroSeen() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "seen";
  } catch {
    return true;
  }
}

function saveIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "seen");
  } catch {
    // The sequence remains usable without persisted preference.
  }
}

function getInitialLevel() {
  const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
  const forcedLevel = parseForcedLevel(new URLSearchParams(location.search).get("p00-mode"));
  const narrowViewport = matchMedia("(max-width: 47.99rem)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = connection.connection?.saveData === true;
  const shouldProbeWebGl =
    !reducedMotion && !narrowViewport && !saveData && forcedLevel !== "safe" &&
    forcedLevel !== "light" && forcedLevel !== "static";
  return chooseExperienceLevel({
    forcedLevel,
    hasWebGl2: shouldProbeWebGl && supportsWebGl2(),
    narrowViewport,
    reducedMotion,
    saveData,
  });
}

function loadWithTimeout() {
  return new Promise<typeof import("./three-scene")>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("three-load-timeout")), LOAD_TIMEOUT_MS);
    import("./three-scene").then(
      (module) => {
        window.clearTimeout(timeout);
        resolve(module);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function P00Experience({ settleRequested }: P00ExperienceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<P00SceneController | null>(null);
  const [level, setLevel] = useState<ExperienceLevel>("safe");
  const [status, setStatus] = useState<PrototypeStatus>("checking");
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [performanceSample, setPerformanceSample] = useState<PerformanceSample | null>(null);

  useEffect(() => {
    const nextLevel = getInitialLevel();
    setLevel(nextLevel);
    if (nextLevel !== "full") {
      setStatus(nextLevel === "safe" ? "fallback" : "active");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let idleId: number | undefined;
    setStatus("loading");

    const start = async () => {
      try {
        if (new URLSearchParams(location.search).get("p00-failure") === "load") {
          throw new Error("forced-three-load-failure");
        }
        const { createP00Scene } = await loadWithTimeout();
        if (cancelled) return;
        const controller = createP00Scene({
          canvas,
          onContextLost: () => {
            controllerRef.current?.dispose();
            controllerRef.current = null;
            setLevel("static");
            setStatus("fallback");
          },
          onFirstFrame: (elapsedMs) => {
            setFirstFrameMs(Math.round(elapsedMs));
            setStatus("active");
            saveIntroSeen();
          },
          onPerformanceSample: (sample) => {
            setPerformanceSample(sample);
            if (sample.fps < 24) {
              controllerRef.current?.dispose();
              controllerRef.current = null;
              setLevel("static");
              setStatus("fallback");
            }
          },
          playIntro:
            new URLSearchParams(location.search).get("p00-intro") === "replay" ||
            !readIntroSeen(),
        });
        controllerRef.current = controller;
        if (new URLSearchParams(location.search).get("p00-failure") === "context") {
          window.setTimeout(() => controller.loseContextForTest(), 200);
        }
      } catch {
        if (cancelled) return;
        setLevel("static");
        setStatus("fallback");
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => void start(), { timeout: 600 });
    } else {
      idleId = window.setTimeout(() => void start(), 0);
    }

    const onVisibilityChange = () => {
      controllerRef.current?.setPaused(document.hidden);
      setPaused(document.hidden);
    };
    const onScroll = () => {
      if (window.scrollY > 16) controllerRef.current?.settle();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelled = true;
      if (idleId !== undefined) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
        else window.clearTimeout(idleId);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onScroll);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (settleRequested) controllerRef.current?.settle();
  }, [settleRequested]);

  const replay = () => {
    controllerRef.current?.replay();
    saveIntroSeen();
  };

  const levelLabel = {
    full: "完整 3D",
    light: "轻量动态",
    safe: "纯色安全层",
    static: "静态终帧",
  }[level];

  return (
    <>
      <canvas
        ref={canvasRef}
        className="three-experience"
        aria-hidden="true"
        data-experience-level={level}
        data-geometries={performanceSample?.geometries}
        data-draw-calls={performanceSample?.drawCalls}
        data-paused={paused}
        data-triangles={performanceSample?.triangles}
      />
      <div className="prototype-status" aria-live="polite">
        <span>技术原型 · {status === "loading" ? "正在增强" : levelLabel}</span>
        {firstFrameMs !== null ? <small>首帧 {firstFrameMs}ms</small> : null}
        {performanceSample !== null ? (
          <small>
            {performanceSample.fps}fps · {performanceSample.slowFrames} 慢帧
          </small>
        ) : null}
        {paused ? <small>后台暂停</small> : null}
        <small>音频待最终资产</small>
        {level === "full" && status === "active" ? (
          <button type="button" onClick={replay}>
            重看序章
          </button>
        ) : null}
      </div>
    </>
  );
}
