export type ExperienceLevel = "full" | "light" | "static" | "safe";

export type ExperienceConditions = {
  forcedLevel?: ExperienceLevel;
  hasWebGl2: boolean;
  narrowViewport: boolean;
  reducedMotion: boolean;
  saveData: boolean;
};

export function chooseExperienceLevel({
  forcedLevel,
  hasWebGl2,
  narrowViewport,
  reducedMotion,
  saveData,
}: ExperienceConditions): ExperienceLevel {
  if (forcedLevel === "safe") return "safe";
  if (reducedMotion || forcedLevel === "static") return "static";
  if (narrowViewport || saveData || forcedLevel === "light") return "light";
  return hasWebGl2 ? "full" : "static";
}

export function parseForcedLevel(value: string | null): ExperienceLevel | undefined {
  return value === "full" || value === "light" || value === "static" || value === "safe"
    ? value
    : undefined;
}
