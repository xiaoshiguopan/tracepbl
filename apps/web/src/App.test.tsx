import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, boundaryCopy } from "./App";

describe("P00 安全首屏", () => {
  it("在没有媒体和浏览器 API 时仍输出主任务与诚实边界", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("让沉睡千年的证据重新开口");
    expect(html).toContain("开始证据探究");
    expect(html).toContain("艺术化演绎，不是历史照片或可引用史料");
    expect(boundaryCopy).toContain("未连接在线 AI 或数据库");
  });

  it("声音控制公开可访问的开关状态", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("环境声偏好：开");
  });
});
