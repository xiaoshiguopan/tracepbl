import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, boundaryCopy } from "./App";

describe("P00 安全首屏", () => {
  it("在没有媒体和浏览器 API 时仍输出主任务与诚实边界", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("让沉睡千年的证据");
    expect(html).toContain("重新开口");
    expect(html).toContain("面向历史教师的");
    expect(html).toContain("可追溯史料探究工作台");
    expect(html).toContain("进入史料工作台");
    expect(html).toContain("画面为艺术化演绎");
    expect(html).toContain("演示说明");
    expect(html).not.toContain("1900 · 敦煌藏经洞");
    expect(html).toContain("p00-film-keyframe-reveal-v1.webp");
    expect(html).not.toContain("three-experience");
    expect(html).not.toContain("scroll-threshold");
    expect(html).not.toContain("技术原型");
    expect(html).not.toContain("cave-glint");
    expect(html).not.toContain("从一份材料，到一条可核验");
    expect(boundaryCopy).toContain("未连接在线 AI 或数据库");
  });

  it("保持无声并提供低干扰演示边界", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).not.toContain("环境声");
    expect(html).not.toContain("<audio");
    expect(html).toContain("演示说明");
  });
});
