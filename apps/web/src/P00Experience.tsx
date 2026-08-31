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
const INTRO_DURATION_MS = 6500;
const mediaBase = `${import.meta.env.BASE_URL}assets/p00/`;

type P00ExperienceProps = {
  settleRequested: boolean;
};

type SceneStatus = "checking" | "loading" | "active" | "fallback";

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
  const artRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<P00SceneController | null>(null);
  const introTimerRef = useRef<number | undefined>(undefined);
  const [level, setLevel] = useState<ExperienceLevel>("static");
  const [status, setStatus] = useState<SceneStatus>("checking");
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [performanceSample, setPerformanceSample] = useState<PerformanceSample | null>(null);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [sequence, setSequence] = useState(0);

  const beginIntroMotion = () => {
    setIntroPlaying(true);
    if (introTimerRef.current !== undefined) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = window.setTimeout(() => setIntroPlaying(false), INTRO_DURATION_MS);
  };

  useEffect(() => {
    const nextLevel = getInitialLevel();
    const playIntro =
      new URLSearchParams(location.search).get("p00-intro") === "replay" || !readIntroSeen();
    setLevel(nextLevel);
    if (playIntro && nextLevel === "full") beginIntroMotion();
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
          playIntro,
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
      if (introTimerRef.current !== undefined) window.clearTimeout(introTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (level !== "full") return;
    const art = artRef.current;
    if (!art) return;
    const onPointerMove = (event: PointerEvent) => {
      art.style.setProperty("--parallax-x", `${(event.clientX / window.innerWidth - 0.5) * -6}px`);
      art.style.setProperty("--parallax-y", `${(event.clientY / window.innerHeight - 0.5) * -4}px`);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [level]);

  useEffect(() => {
    if (settleRequested) {
      controllerRef.current?.settle();
      setIntroPlaying(false);
    }
  }, [settleRequested]);

  const replay = () => {
    controllerRef.current?.replay();
    setSequence((current) => current + 1);
    beginIntroMotion();
    saveIntroSeen();
  };

  return (
    <>
      <div
        ref={artRef}
        className="scene-art-frame"
        aria-hidden="true"
        data-experience-level={level}
        data-intro-playing={introPlaying}
        data-scene-status={status}
      >
        <picture key={sequence}>
          <source
            media="(max-width: 47.99rem)"
            srcSet={`${mediaBase}p00-dunhuang-mobile.webp`}
            type="image/webp"
          />
          <source
            media="(max-width: 47.99rem)"
            srcSet={`${mediaBase}p00-dunhuang-mobile.jpg`}
            type="image/jpeg"
          />
          <source srcSet={`${mediaBase}p00-dunhuang-desktop.webp`} type="image/webp" />
          <img
            src={`${mediaBase}p00-dunhuang-desktop.jpg`}
            alt=""
            width="1672"
            height="941"
            fetchPriority="high"
          />
        </picture>
      </div>
      <canvas
        ref={canvasRef}
        className="three-experience"
        aria-hidden="true"
        data-experience-level={level}
        data-geometries={performanceSample?.geometries}
        data-draw-calls={performanceSample?.drawCalls}
        data-paused={paused}
        data-triangles={performanceSample?.triangles}
        data-first-frame-ms={firstFrameMs ?? undefined}
      />
      {level === "full" && status === "active" ? (
        <button className="replay-control" type="button" onClick={replay}>
          重看序章
        </button>
      ) : null}
    </>
  );
}
