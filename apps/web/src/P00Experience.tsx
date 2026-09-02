import { useEffect, useState } from "react";

const mediaBase = `${import.meta.env.BASE_URL}assets/p00/`;
const filmMediaQuery = "(min-width: 48rem) and (prefers-reduced-motion: no-preference)";

function canPlayFilm() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(filmMediaQuery).matches;
}

/**
 * Static fallback for the approved pre-rendered-film direction.
 * Camera motion belongs in the final film, not in a CSS imitation of one.
 */
export function P00Experience() {
  const [filmEnabled, setFilmEnabled] = useState(canPlayFilm);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia(filmMediaQuery);
    const syncFilm = () => setFilmEnabled(query.matches);
    syncFilm();
    query.addEventListener("change", syncFilm);
    return () => query.removeEventListener("change", syncFilm);
  }, []);

  return (
    <div className="cinematic-media" aria-hidden="true">
      {filmEnabled ? (
        <video
          autoPlay
          className="cinematic-film"
          disablePictureInPicture
          muted
          playsInline
          poster={`${mediaBase}p00-film-keyframe-reveal-v1.webp`}
          preload="auto"
        >
          <source src={`${mediaBase}p00-cinematic-h3-v1.mp4`} type="video/mp4" />
        </video>
      ) : null}
      <picture>
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
        <img
          src={`${mediaBase}p00-film-keyframe-reveal-v1.webp`}
          alt=""
          width="1672"
          height="941"
          fetchPriority="high"
        />
      </picture>
    </div>
  );
}
