import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./UiControls";

const mediaBase = `${import.meta.env.BASE_URL}assets/p00/`;
const filmMediaQuery = "(min-width: 48rem) and (prefers-reduced-motion: no-preference)";

function canPlayFilm() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(filmMediaQuery).matches;
}

/** Camera motion belongs in the approved film, not in a CSS imitation of one. */
export function P00Experience() {
  const [filmEnabled, setFilmEnabled] = useState(canPlayFilm);
  const [playback, setPlayback] = useState<"playing" | "ended">("playing");
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const moveGlow = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = rectRef.current;
    if (!rect) return;
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      mediaRef.current?.style.setProperty("--glow-x", `${pointerRef.current.x}px`);
      mediaRef.current?.style.setProperty("--glow-y", `${pointerRef.current.y}px`);
      frameRef.current = null;
    });
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia(filmMediaQuery);
    const syncFilm = () => setFilmEnabled(query.matches);
    syncFilm();
    query.addEventListener("change", syncFilm);
    return () => {
      query.removeEventListener("change", syncFilm);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const holdLastFrame = () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.max(0, video.duration - 0.04);
    video?.pause();
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setPlayback("playing");
    void video.play();
  };

  return (
    <div ref={mediaRef} className="cinematic-media" onPointerEnter={(event) => { rectRef.current = event.currentTarget.getBoundingClientRect(); }} onPointerMove={moveGlow}>
      {filmEnabled ? (
        <video
          ref={videoRef}
          aria-hidden="true"
          tabIndex={-1}
          autoPlay
          className="cinematic-film"
          disablePictureInPicture
          muted
          playsInline
          preload="auto"
          onError={() => setFilmEnabled(false)}
          onEnded={() => {
            setPlayback("ended");
            holdLastFrame();
          }}
        >
          <source src={`${mediaBase}p00-cinematic-h3-v2.mp4`} type="video/mp4" />
        </video>
      ) : null}
      <picture aria-hidden="true" className={filmEnabled ? "film-static-fallback" : undefined}>
        <img
          src={`${mediaBase}p00-cinematic-h3-v2-poster.webp`}
          alt=""
          width="1344"
          height="768"
          fetchPriority="high"
        />
      </picture>
      <span className="cursor-lantern" />
      {filmEnabled && playback === "ended" ? <button className="film-replay" type="button" tabIndex={0} aria-hidden="false" aria-label="重新播放首页影片" onClick={replay}><UiIcon name="replay" /><span>重新播放</span></button> : null}
    </div>
  );
}
