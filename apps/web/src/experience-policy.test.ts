import { describe, expect, it } from "vitest";
import { chooseExperienceLevel, parseForcedLevel } from "./experience-policy";

const capableDesktop = {
  hasWebGl2: true,
  narrowViewport: false,
  reducedMotion: false,
  saveData: false,
};

describe("P00 体验等级", () => {
  it("只让满足条件的桌面设备进入完整 3D", () => {
    expect(chooseExperienceLevel(capableDesktop)).toBe("full");
    expect(chooseExperienceLevel({ ...capableDesktop, narrowViewport: true })).toBe("light");
    expect(chooseExperienceLevel({ ...capableDesktop, saveData: true })).toBe("light");
  });

  it("减少动态和 WebGL2 缺失始终安全降级", () => {
    expect(chooseExperienceLevel({ ...capableDesktop, reducedMotion: true })).toBe("static");
    expect(chooseExperienceLevel({ ...capableDesktop, hasWebGl2: false })).toBe("static");
    expect(
      chooseExperienceLevel({ ...capableDesktop, forcedLevel: "full", reducedMotion: true }),
    ).toBe("static");
  });

  it("只接受公开的故障注入等级", () => {
    expect(parseForcedLevel("safe")).toBe("safe");
    expect(parseForcedLevel("unknown")).toBeUndefined();
  });
});
