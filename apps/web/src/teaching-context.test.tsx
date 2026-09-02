import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeachingContextPage } from "./TeachingContextPage";
import { WorkbenchShell } from "./WorkbenchShell";
import {
  getContextConflict,
  isSameTeachingContext,
  normalizeTeachingContextDraft,
  syntheticFixture,
  validateTeachingContext,
  type TeachingContextDraft,
} from "./teaching-context";

describe("P01 教学情境", () => {
  it("只呈现当前决策所需字段和一个确认动作", () => {
    const html = renderToStaticMarkup(<TeachingContextPage onBack={() => undefined} onNext={() => undefined} />);

    expect(html).toContain("合成示范课 · 可自由编辑");
    expect(html).toContain("请勿填写个人或敏感信息");
    expect(html).toContain("确认教学情境");
    expect(html).not.toContain("生成任务简报");
    expect(html).not.toContain("确认并进入探究问题");
    expect(html).not.toContain('name="sourceUses"');
    expect(html).not.toContain('name="sourceCount"');
    expect(html).not.toContain('name="readingLevel"');
    expect(html).not.toContain('name="abilities"');
    expect(html).not.toContain("期望产物");
    expect(html).not.toContain("敦煌序章不是本课史料");
    expect(html).toContain("依据哪些史料，我们可以把唐朝前期称为");
    expect(html).toContain("不代表安全授权");
    expect(html).toContain("下一步");
    expect(html).toContain("探究问题");
    expect(html).toContain("查看后续 6 步");
  });

  it("接受已批准的 45 分钟合成情境", () => {
    expect(validateTeachingContext(syntheticFixture)).toEqual({});
    expect(getContextConflict(syntheticFixture)).toBeNull();
  });

  it("拒绝课时边界值和当前页面可见字段中的个人信息", () => {
    const invalid: TeachingContextDraft = {
      ...syntheticFixture,
      minutes: "0",
      inquiryQuestion: "请分析学生姓名张某的观点",
    };
    const errors = validateTeachingContext(invalid);

    expect(errors.minutes).toContain("1—180");
    expect(errors.inquiryQuestion).toContain("个人信息");
  });

  it("对短课时微型 PBL 给出取舍提示而非伪造成功", () => {
    const conflict = getContextConflict({ ...syntheticFixture, minutes: "20" });
    expect(conflict).toContain("缩小探究范围");
  });

  it("兼容旧草稿但不沿用抽象期望产物", () => {
    const legacy = {
      ...syntheticFixture,
      sourceUses: ["比较不同来源"],
      readingLevel: "一般",
      expectedProduct: "证据判定书",
    } as unknown as TeachingContextDraft;

    const migrated = normalizeTeachingContextDraft(legacy);
    expect("sourceUses" in migrated).toBe(false);
    expect("readingLevel" in migrated).toBe(false);
    expect("expectedProduct" in migrated).toBe(false);
    expect(validateTeachingContext(migrated)).toEqual({});
  });

  it("不让后续步骤字段阻塞教学情境确认", () => {
    const migrated = normalizeTeachingContextDraft({
      ...syntheticFixture,
      inquiryQuestion: "",
      sourceCount: "",
      sourceNeeds: [],
      sourceUses: [],
      abilities: [],
      readingLevel: "",
    } as unknown as TeachingContextDraft);

    expect(validateTeachingContext(migrated)).toEqual({});
  });

  it("只把真实字段变化视为需要重新确认", () => {
    expect(isSameTeachingContext(syntheticFixture, { ...syntheticFixture, lessonTypes: [...syntheticFixture.lessonTypes] })).toBe(true);
    expect(isSameTeachingContext(syntheticFixture, { ...syntheticFixture, minutes: "40" })).toBe(false);
  });

  it("当前位置和已到达进度分开，返回 P01 后仍能直接切回 P02", () => {
    const html = renderToStaticMarkup(
      <WorkbenchShell currentStep={0} reachedStep={1} currentLabel="教学情境" nextLabel="探究问题" onBack={() => undefined} onNavigateStep={() => undefined}>
        <main>内容</main>
      </WorkbenchShell>,
    );

    expect(html).toContain("返回探究问题");
    expect(html).toContain("已确认 · 可返回");
  });
});
