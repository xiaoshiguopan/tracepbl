import { useEffect, useRef, useState } from "react";
import { P00Experience } from "./P00Experience";

const SOUND_PREFERENCE_KEY = "tracepbl:ambient-sound:v1";
const ambientSoundUrl = `${import.meta.env.BASE_URL}assets/p00/p00-cave-ambience.wav`;

const boundaryCopy =
  "教学情境和操作结果为合成演示；史料来自所列权威公开来源。数据只保存在当前浏览器，未连接在线 AI 或数据库。请勿输入真实学生或敏感信息。";

export function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [soundState, setSoundState] = useState<"off" | "playing" | "waiting">(
    soundEnabled ? "waiting" : "off",
  );
  const [showBoundary, setShowBoundary] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.06;

    const play = () => {
      if (!soundEnabled || document.hidden) return;
      void audio.play().then(
        () => setSoundState("playing"),
        () => setSoundState("waiting"),
      );
    };
    const onVisibilityChange = () => {
      if (document.hidden) audio.pause();
      else play();
    };

    if (soundEnabled) play();
    else {
      audio.pause();
      audio.currentTime = 0;
      setSoundState("off");
    }

    document.addEventListener("pointerdown", play, { once: true });
    document.addEventListener("keydown", play, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [soundEnabled]);

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    setSoundEnabled(nextEnabled);
    if (nextEnabled && audioRef.current) {
      audioRef.current.volume = 0.06;
      void audioRef.current.play().then(
        () => setSoundState("playing"),
        () => setSoundState("waiting"),
      );
    }
    try {
      localStorage.setItem(SOUND_PREFERENCE_KEY, nextEnabled ? "on" : "off");
    } catch {
      // Sound remains controllable when storage is unavailable.
    }
  };

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
          <button
            className="sound-control"
            type="button"
            aria-pressed={soundEnabled}
            data-sound-state={soundState}
            onClick={toggleSound}
          >
            环境声：{soundEnabled ? "开" : "关"}
          </button>
          <audio ref={audioRef} src={ambientSoundUrl} loop preload="none" />
        </div>
      </header>

      <main id="main-content" className="hero" tabIndex={-1}>
        <P00Experience settleRequested={showBoundary} />

        <section className="hero-copy" aria-labelledby="hero-title">
          <p className="year">1900 · 敦煌藏经洞</p>
          <h1 id="hero-title">让沉睡千年的证据重新开口</h1>
          <p className="lede">
            从一份材料，到一条可核验、可质疑、可用于课堂的历史解释。
          </p>

          <div className="hero-actions">
            <button
              className="primary-action"
              type="button"
              aria-expanded={showBoundary}
              aria-controls="demo-boundary"
              onClick={() => setShowBoundary(true)}
            >
              开始证据探究
              <span aria-hidden="true">→</span>
            </button>
            <button
              className="secondary-action"
              type="button"
              aria-expanded={showBoundary}
              aria-controls="demo-boundary"
              onClick={() => setShowBoundary((visible) => !visible)}
            >
              查看演示边界
            </button>
          </div>

          <p className="art-label">艺术化演绎，不是历史照片或可引用史料</p>

          {showBoundary ? (
            <aside id="demo-boundary" className="boundary-note" aria-live="polite">
              <strong>演示与数据边界</strong>
              <p>{boundaryCopy}</p>
            </aside>
          ) : null}
        </section>

        <p className="scene-caption" aria-hidden="true">
          灯火将历史的纵深，收束为一条可核验的证据路径。
        </p>
      </main>
    </div>
  );
}

export { boundaryCopy };
