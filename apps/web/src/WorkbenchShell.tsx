import { isLocalMode } from "./runtime-mode";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { deleteTask, duplicateTask, listTasks, restoreTask, subscribeTaskChanges, type TaskSummary } from "./teaching-context-store";
import { IconButton, InlineNotice, UiIcon } from "./UiControls";



export const taskSteps = ["教学情境", "探究问题", "查找史料", "组织证据", "设计活动", "评价量规", "设计检查", "最终确认与导出"];

type StepCopy = Partial<Record<number, string>>;
type WorkbenchActions = { taskId: string; onNewTask: () => void; onOpenTask: (taskId: string, step?: number) => void };
const WorkbenchActionsContext = createContext<WorkbenchActions | null>(null);

export function WorkbenchProvider({ children, ...actions }: WorkbenchActions & { children: ReactNode }) {
  return <WorkbenchActionsContext.Provider value={actions}>{children}</WorkbenchActionsContext.Provider>;
}

function StepList({ currentStep, reachedStep, stepHints, onNavigateStep, mobile = false }: {
  currentStep: number; reachedStep: number; stepActionLabels?: StepCopy; stepHints?: StepCopy; onNavigateStep?: (step: number) => void; mobile?: boolean;
}) {
  return (
    <ol className={mobile ? "mobile-step-list" : "step-list"}>
      {taskSteps.map((step, index) => {
        const hint = stepHints?.[index];
        const state = index === currentStep ? "current" : index <= reachedStep ? (hint?.includes("修改") ? "review" : "complete") : "future";
        const available = index <= reachedStep && Boolean(onNavigateStep);
        return (
          <li className={state} key={step}>
            <span className="step-number" aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
            {available ? (
              <button type="button" className="step-link" aria-current={state === "current" ? "step" : undefined} onClick={() => onNavigateStep?.(index)}>
                <strong>{step}</strong><small>{hint || (state === "current" ? "当前步骤" : state === "review" ? "需要复核" : "已完成 · 可查看")}</small>
              </button>
            ) : <span className="step-label"><strong>{step}</strong><small>尚未开始</small></span>}
          </li>
        );
      })}
    </ol>
  );
}

export function TaskDrawer({ open, currentTaskId, onClose, onNewTask, onOpenTask }: {
  open: boolean; currentTaskId: string; onClose: () => void; onNewTask: () => void; onOpenTask: (taskId: string, step?: number) => void;
}) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [query, setQuery] = useState("");
  const [backup, setBackup] = useState<Awaited<ReturnType<typeof deleteTask>>>(undefined);
  const [showAll, setShowAll] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => void listTasks().then(setTasks, reason => setError(reason.message));
  const mutate = async (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(""); try { await action(); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作未完成。"); } finally { setBusy(false); } };
  useEffect(() => { if (open) refresh(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => (drawerRef.current?.querySelector<HTMLElement>(focusableSelector) || drawerRef.current)?.focus();
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [open]);
  if (!open) return null;
  const matches = tasks.filter((task) => task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visible = showAll || query ? matches : matches.slice(0, 5);

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={drawerRef} className={`task-drawer ${showAll ? "show-all" : ""}`} aria-label="我的备课" aria-modal="true" role="dialog" tabIndex={-1}>
        <header><div><p className="eyebrow">仅存本机</p><h2>我的备课</h2></div><IconButton icon="close" label="关闭我的备课" onClick={onClose} /></header>
        <button className="drawer-new ui-button secondary" type="button" onClick={onNewTask}><UiIcon name="add" />新建备课</button>
        <label className="task-search"><span>查找备课</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入课次或主题" /></label>
        {visible.length ? <ul className="task-list">{visible.map((task) => (
          <li className={task.id === currentTaskId ? "active" : ""} key={task.id}>
            <button className="task-open" type="button" onClick={() => onOpenTask(task.id, task.reachedStep)}>
              <strong>{task.title}</strong><span>{task.minutes ? `${task.minutes} 分钟 · ` : ""}已到第 {task.reachedStep + 1} 步</span><time>{new Date(task.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
            </button>
            <div className="task-row-actions"><button type="button" disabled={busy} onClick={() => void mutate(() => duplicateTask(task.id, crypto.randomUUID()))}>复制</button><button type="button" disabled={busy} onClick={() => { if (!isLocalMode || window.confirm("删除后任务内容立即不可使用，24小时内可撤销；到期后后台会清除其数据和历史。确认删除？")) void mutate(async () => { setBackup(await deleteTask(task.id)); }); }}>删除</button></div>
          </li>
        ))}</ul> : <div className="task-empty"><strong>这里还没有匹配的备课</strong><p>新建后，填写第一组有效课程信息就会自动保存在这里。</p></div>}
        {tasks.length > 5 && !query ? <button className="drawer-all" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "收起完整列表" : `查看全部 ${tasks.length} 份备课`}</button> : null}
        {error ? <p role="alert">{error}</p> : null}
        <p className="local-boundary">{isLocalMode ? "内容保存在本地数据库；删除后有24小时撤销窗口，不跨设备同步。" : "这些内容不会上传或跨设备同步。清理浏览器数据后可能无法恢复。"}</p>
        {backup ? <InlineNotice actionLabel="撤销" onAction={() => void mutate(async () => { await restoreTask(backup); setBackup(undefined); })}>已删除“{backup.task.title}”</InlineNotice> : null}
      </aside>
    </div>
  );
}

export function TaskUnavailable({ onBack, onNewTask }: { onBack: () => void; onNewTask?: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return (
    <div className="task-unavailable-page"><a className="workbench-skip" href="#main-content">跳至主要内容</a><main className="unavailable-state" id="main-content">
      <header><p className="eyebrow">安全返回</p><h1 ref={headingRef} tabIndex={-1}>此任务不可使用</h1><p className="unavailable-intro">它可能已过期、已清除，或不属于当前浏览器。这里不会泄露其他任务的信息。</p></header>
      <div className="unavailable-grid"><section className="protected-folio"><div><h2>内容已保护性隐藏</h2><p>请从“我的备课”重新打开，或创建一份新备课。</p></div></section><aside className="safe-next-step"><p className="eyebrow">下一步</p><button className="unavailable-primary" type="button" onClick={onNewTask}>新建备课</button><button className="unavailable-secondary" type="button" onClick={onBack}>返回首页</button></aside></div>
    </main></div>
  );
}

export function WorkbenchShell({ children, currentStep, currentLabel, reachedStep = currentStep, onBack, onNavigateStep, stepActionLabels, stepHints }: {
  children: ReactNode; currentStep: number; currentLabel: string; nextLabel: string; reachedStep?: number; onBack: () => void; onNavigateStep?: (step: number) => void; stepActionLabels?: StepCopy; stepHints?: StepCopy;
}) {
  const actions = useContext(WorkbenchActionsContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [taskTitle, setTaskTitle] = useState("当前备课");
  const taskId = actions?.taskId;
  useEffect(() => taskId ? subscribeTaskChanges(taskId, () => setExternalChange(true)) : undefined, [taskId]);
  useEffect(() => {
    if (!taskId) return;
    const refreshTitle = () => void listTasks().then((tasks) => setTaskTitle(tasks.find((task) => task.id === taskId)?.title || "新建备课"), () => setExternalChange(true));
    const onSaved = (event: Event) => { if ((event as CustomEvent<{ taskId: string }>).detail.taskId === taskId) refreshTitle(); };
    refreshTitle(); window.addEventListener("tracepbl-task-saved", onSaved);
    return () => window.removeEventListener("tracepbl-task-saved", onSaved);
  }, [taskId, currentStep]);

  return (
    <div className="workbench-shell"><a className="workbench-skip" href="#main-content">跳至主要内容</a>
      <header className="workbench-topbar">
        <button className="workbench-brand" type="button" onClick={onBack} aria-label="返回史证工坊首页"><span aria-hidden="true">史</span><strong>史证工坊</strong></button>
        <p className="current-task-title">{taskTitle}</p>
        <div className="workbench-actions"><button type="button" onClick={actions?.onNewTask}><UiIcon name="add" />新建备课</button><button type="button" onClick={() => setDrawerOpen(true)}>我的备课</button><span className="local-data">仅存本机</span></div>
      </header>
      {externalChange ? <div className="external-change" role="alert"><span>这份备课已在另一个标签页修改。为避免覆盖，请载入较新内容。</span><button type="button" onClick={() => window.location.reload()}>载入较新内容</button><button type="button" onClick={() => setExternalChange(false)}>保留本页查看</button></div> : null}
      <details className="mobile-steps"><summary>第 {currentStep + 1}/8 步 · {currentLabel}</summary><nav aria-label="备课步骤"><StepList mobile currentStep={currentStep} reachedStep={reachedStep} stepActionLabels={stepActionLabels} stepHints={stepHints} onNavigateStep={onNavigateStep} /></nav></details>
      <div className="workbench-layout"><nav className="step-rail" aria-label="备课步骤"><p>备课路径</p><StepList currentStep={currentStep} reachedStep={reachedStep} stepActionLabels={stepActionLabels} stepHints={stepHints} onNavigateStep={onNavigateStep} /><p className="permission-note">步骤状态用于导航，不代表安全授权。</p></nav>{children}</div>
      {actions ? <TaskDrawer open={drawerOpen} currentTaskId={actions.taskId} onClose={() => setDrawerOpen(false)} onNewTask={actions.onNewTask} onOpenTask={actions.onOpenTask} /> : null}
    </div>
  );
}
