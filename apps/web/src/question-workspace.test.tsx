import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionWorkspacePage } from "./QuestionWorkspacePage";
import { WorkbenchShell } from "./WorkbenchShell";
import { createQuestionDraft, createQuestionGuidance, normalizeQuestionDraft, validateQuestionConfirmation, validateQuestionInput } from "./question-workspace";
import { syntheticFixture } from "./teaching-context";

describe("P02 探究问题", () => {
  it("复用教学情境页的双栏模板呈现精简决策和即时摘要", () => {
    const html = renderToStaticMarkup(<QuestionWorkspacePage onBack={() => undefined} onReturnContext={() => undefined} onNext={() => undefined} />);

    expect(html).toContain("探究问题");
    expect(html).toContain("当前探究问题");
    expect(html).toContain('class="context-columns question-columns"');
    expect(html).toContain('class="question-form form-section"');
    expect(html).toContain('class="brief-panel question-brief desktop-brief"');
    expect(html).toContain("我理解你想探究的是");
    expect(html).toContain("中心问题");
    expect(html).toContain("学生如何使用证据");
    expect(html).toContain("课堂边界");
    expect(html).toContain("修改中心问题");
    expect(html).toContain("合成示范建议");
    expect(html).toContain("本页不包含史料");
    expect(html).toContain("不代表安全授权");
    expect(html).not.toContain("诊断这个输入");
    expect(html).not.toContain("先看成果，再决定是否调整");
    expect(html).not.toContain("question-thesis");
    expect(html).not.toContain("为什么这样收束");
    expect(html).not.toContain("本课范围边界");
    expect(html).not.toContain("查看权威来源候选");
    expect(html).not.toContain("上传史料");
    expect(html).not.toContain("在线 AI");
    expect(html).not.toContain("<audio");
  });

  it("为已批准示范情境直接形成一份首选方案和可选替代角度", () => {
    const draft = createQuestionDraft(syntheticFixture);
    const result = createQuestionGuidance(draft.originalInput, syntheticFixture);

    expect(result.inputType).toBe("观点");
    expect(result.primary.question).toBe("依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？");
    expect(result.primary.fitReason).toContain("45 分钟");
    expect(result.alternative.question).not.toBe(result.primary.question);
    expect(draft.centralQuestion).toBe(result.primary.question);
    expect(draft.contextSnapshot).toEqual(syntheticFixture);
  });

  it("已完成步骤在证据脉络中是可返回的按钮", () => {
    const html = renderToStaticMarkup(
      <WorkbenchShell currentStep={1} currentLabel="探究问题" nextLabel="查找史料" onBack={() => undefined} onNavigateStep={() => undefined}>
        <main>内容</main>
      </WorkbenchShell>,
    );

    expect(html).toContain('<button type="button" class="step-link"');
    expect(html).toContain("返回教学情境");
  });

  it("拒绝空、无意义、超长和含个人信息的原始输入", () => {
    expect(validateQuestionInput("").originalInput).toContain("请写下");
    expect(validateQuestionInput("?").originalInput).toContain("实际含义");
    expect(validateQuestionInput("史".repeat(1001)).originalInput).toContain("1000");
    expect(validateQuestionInput("分析学生姓名张某").originalInput).toContain("个人信息");
  });

  it("确认前要求开放问题和证据回答，但范围约束由系统派生", () => {
    const draft = {
      ...createQuestionDraft(syntheticFixture),
      inputType: "观点" as const,
      centralQuestion: "当然应该证明这个观点正确",
      evidenceOutcome: "",
    };
    const errors = validateQuestionConfirmation(draft, syntheticFixture);

    expect(errors.centralQuestion).toContain("预设了答案");
    expect(errors.evidenceOutcome).toContain("证据产物");
    expect(errors.scopeBoundary).toBeUndefined();
  });

  it("接受教师确认系统形成且仍可编辑的轻量方案", () => {
    const proposal = createQuestionGuidance(syntheticFixture.inquiryQuestion, syntheticFixture).primary;
    const draft = {
      ...createQuestionDraft(syntheticFixture),
      inputType: "观点" as const,
      typeReason: "合成诊断",
      centralQuestion: proposal.question,
      evidenceOutcome: proposal.evidenceOutcome,
      scopeBoundary: proposal.scopeBoundary,
    };

    expect(validateQuestionConfirmation(draft, syntheticFixture)).toEqual({});
  });

  it("只迁移旧版默认问题，不覆盖教师自己修改的问题", () => {
    const legacy = { ...createQuestionDraft(syntheticFixture), centralQuestion: "依据政治运行、经济发展与社会生活等不同类型的史料，“盛世”能在多大程度上概括唐朝前期？" };
    expect(normalizeQuestionDraft(legacy, syntheticFixture).centralQuestion).toBe("依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？");
    expect(normalizeQuestionDraft({ ...legacy, centralQuestion: "教师自定义问题？" }, syntheticFixture).centralQuestion).toBe("教师自定义问题？");
  });
});
