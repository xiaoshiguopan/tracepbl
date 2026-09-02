import type { ReactNode } from "react";

export const taskSteps = [
  "教学情境",
  "探究问题",
  "查找史料",
  "组织证据",
  "设计活动",
  "评价量规",
  "设计检查",
  "最终确认与导出",
];

type StepCopy = Partial<Record<number, string>>;

function StepRail({ currentStep, reachedStep, stepActionLabels, stepHints, onNavigateStep }: { currentStep: number; reachedStep: number; stepActionLabels?: StepCopy; stepHints?: StepCopy; onNavigateStep?: (step: number) => void }) {
  const visibleSteps = taskSteps.slice(0, Math.min(Math.max(currentStep, reachedStep) + 2, taskSteps.length));
  return (
    <nav className="step-rail" aria-label="证据脉络">
      <p>证据脉络</p>
      <ol className="visible-steps">
        {visibleSteps.map((step, index) => {
          const state = index === currentStep ? "current" : index <= reachedStep ? "complete" : "next";
          return (
            <li className={state} key={step}>
              <span aria-hidden="true">{index + 1}</span>
              {state === "complete" && onNavigateStep ? (
                <button type="button" className="step-link" aria-label={stepActionLabels?.[index] || `返回${step}`} onClick={() => onNavigateStep(index)}>{step}<small>{stepHints?.[index] || "已确认 · 可返回"}</small></button>
              ) : (
                <strong aria-current={state === "current" ? "step" : undefined}>{step}<small>{state === "current" ? "当前步骤" : "下一步"}</small></strong>
              )}
            </li>
          );
        })}
      </ol>
      {visibleSteps.length < taskSteps.length ? (
        <details className="future-steps">
          <summary>查看后续 {taskSteps.length - visibleSteps.length} 步</summary>
          <ol start={visibleSteps.length + 1}>
            {taskSteps.slice(visibleSteps.length).map((step, index) => (
              <li key={step}><span aria-hidden="true">{visibleSteps.length + index + 1}</span><strong>{step}</strong></li>
            ))}
          </ol>
        </details>
      ) : null}
      <p className="permission-note">此处状态只帮助导航，不代表安全授权。</p>
    </nav>
  );
}

export function TaskUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <main className="unavailable-state" id="main-content" tabIndex={-1}>
      <p className="eyebrow">无法打开任务</p>
      <h1>此任务不可使用</h1>
      <p>它可能已过期、已清除，或不属于当前访问。为保护内容，我们不会显示更多信息。</p>
      <button className="context-primary" type="button" onClick={onBack}>返回演示首页</button>
    </main>
  );
}

export function WorkbenchShell({
  children,
  currentStep,
  currentLabel,
  nextLabel,
  reachedStep = currentStep,
  onBack,
  onNavigateStep,
  stepActionLabels,
  stepHints,
}: {
  children: ReactNode;
  currentStep: number;
  currentLabel: string;
  nextLabel: string;
  reachedStep?: number;
  onBack: () => void;
  onNavigateStep?: (step: number) => void;
  stepActionLabels?: StepCopy;
  stepHints?: StepCopy;
}) {
  const mobileTarget = currentStep < reachedStep ? currentStep + 1 : currentStep > 0 ? currentStep - 1 : null;
  return (
    <div className="workbench-shell">
      <a className="workbench-skip" href="#main-content">跳至主要内容</a>
      <header className="workbench-topbar">
        <button className="workbench-brand" type="button" onClick={onBack} aria-label="返回史证工坊首页">
          <span aria-hidden="true">史</span><strong>史证工坊</strong>
        </button>
        <div><span className="workbench-badge">公开演示</span><span className="local-data">仅存本机</span></div>
      </header>
      <div className="mobile-step">
        <span>第 {currentStep + 1}/{taskSteps.length} 步 · {currentLabel}</span>
        <strong>下一步：{nextLabel}</strong>
        {mobileTarget !== null && onNavigateStep ? <button type="button" onClick={() => onNavigateStep(mobileTarget)}>{stepActionLabels?.[mobileTarget] || `返回${taskSteps[mobileTarget]}`}</button> : null}
      </div>
      <div className="workbench-layout">
        <StepRail currentStep={currentStep} reachedStep={reachedStep} stepActionLabels={stepActionLabels} stepHints={stepHints} onNavigateStep={onNavigateStep} />
        {children}
      </div>
    </div>
  );
}
