import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LocalApiError } from "./local-api";
import { invalidateLocalTask, localTaskData, type LocalTaskData } from "./local-task-data";
import { localSources } from "./local-view-model";
import { sourceFixture } from "./source-discovery";
import { TaskUnavailable } from "./WorkbenchShell";

const LocalTaskContext = createContext<LocalTaskData | null>(null);
export function useLocalTask() { return useContext(LocalTaskContext); }
export function useTaskSources() { const task = useLocalTask(); return task ? localSources(task) : sourceFixture; }

export function LocalTaskBoundary({ taskId, onBack, onNewTask, children }: { taskId: string; onBack: () => void; onNewTask: () => void; children: ReactNode }) {
  const [data, setData] = useState<LocalTaskData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void localTaskData(taskId).then(value => { if (active) { setData(value); setError(null); } }, reason => { if (active) { setData(null); setError(reason instanceof Error ? reason : new Error("无法读取本地任务。")); } });
    return () => { active = false; };
  }, [taskId, attempt]);
  if (error instanceof LocalApiError && error.code === "RESOURCE_NOT_FOUND") return <TaskUnavailable onBack={onBack} onNewTask={onNewTask} />;
  if (error) return <main className="route-loading" role="alert"><p>{error.message}</p><button type="button" onClick={() => { invalidateLocalTask(taskId); setError(null); setAttempt(value => value + 1); }}>重新读取</button><button type="button" onClick={onBack}>返回首页</button></main>;
  if (!data || data.task.id !== taskId) return <main className="route-loading" aria-busy="true">正在读取本地备课…</main>;
  return <LocalTaskContext.Provider value={data}>{children}</LocalTaskContext.Provider>;
}
