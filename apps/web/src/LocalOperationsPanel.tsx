import { useEffect, useRef, useState } from "react";
import { JobEventSchema, JobEventTypeSchema, type OperationStatus } from "@tracepbl/contracts";
import { cancelLocalOperation, createLocalOperation, listLocalOperations } from "./local-operations";
import { invalidateLocalTask } from "./local-task-data";

const states = { queued: "排队中", running: "处理中", partial: "部分完成", succeeded: "已完成", failed: "失败", cancelled: "已取消" };
/** Deterministic checks and export progress live beside their own page content. */
export function LocalOperationsPanel({ taskId, step }: { taskId: string; step: number }) {
  const [operations, setOperations] = useState<OperationStatus[]>([]);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const runPending = useRef(false); const key = useRef(crypto.randomUUID());
  const kind = step === 6 ? "audit" : "export";
  useEffect(() => {
    let active = true; let stream: EventSource | undefined; let reconnect: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => void listLocalOperations(taskId).then(items => { if (active) setOperations(items.filter(item => item.kind === kind)); }, error => { if (active) setMessage(error.message); });
    const connect = () => {
      if (!active || !navigator.onLine) return;
      stream?.close(); stream = new EventSource(`/api/v1/tasks/${taskId}/events`);
      stream.onopen = () => { setConnected(true); refresh(); };
      stream.onerror = () => { if (active) { setConnected(false); if (stream?.readyState === EventSource.CLOSED) reconnect = setTimeout(connect, 3000); } };
      for (const type of JobEventTypeSchema.options) stream.addEventListener(type, event => {
        try { const parsed = JobEventSchema.parse(JSON.parse((event as MessageEvent).data)); if (parsed.type === "task.deleted") { stream?.close(); setMessage("任务已删除，不能继续操作。"); } refresh(); } catch { setMessage("进度格式不一致，请刷新同一版本页面。"); }
      });
    };
    const offline = () => { clearTimeout(reconnect); stream?.close(); setConnected(false); };
    const online = () => { clearTimeout(reconnect); connect(); };
    window.addEventListener("offline", offline); window.addEventListener("online", online); connect(); refresh();
    return () => { active = false; window.removeEventListener("offline", offline); window.removeEventListener("online", online); clearTimeout(reconnect); stream?.close(); };
  }, [taskId, kind]);
  const act = async (action: () => Promise<unknown>) => {
    if (runPending.current) return;
    runPending.current = true; setBusy(true); setMessage("");
    try { await action(); setOperations((await listLocalOperations(taskId)).filter(item => item.kind === kind)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成。"); }
    finally { runPending.current = false; setBusy(false); }
  };
  const renderOperation = (operation: OperationStatus) => <li key={operation.id}><span>{kind === "audit" ? "设计检查" : "文件导出"} · {states[operation.status]} · 尝试 {operation.attempt}</span>{operation.error ? <p>{operation.error.message}</p> : null}{operation.canCancel ? <button className="ui-button quiet" disabled={busy} onClick={() => void act(() => cancelLocalOperation(taskId, operation.id, `cancel-${operation.id}`))}>取消</button> : null}</li>;
  return <section className="local-operations" data-connection={connected ? "connected" : "reconnecting"} aria-label="本地后台任务">
    <div className="local-operation-toolbar"><div className="local-assistant-intro"><strong>{kind === "audit" ? "检查当前教学设计" : "导出进度"}</strong><p>{kind === "audit" ? "按课程、引用与版本规则检查；处理定位的问题后再签发。" : "确认签发后，在下方选择文件格式。"}</p></div><div className="local-operation-actions">
      {kind === "audit" ? <button id="local-operation-run" className="ui-button primary" disabled={busy || operations.some(item => ["queued", "running"].includes(item.status))} onClick={() => void act(async () => { await createLocalOperation(taskId, "audit", key.current); key.current = crypto.randomUUID(); })}>运行设计检查</button> : null}
      <button className="ui-button quiet" aria-label="载入服务器最新内容" onClick={() => { invalidateLocalTask(taskId); window.location.reload(); }}>更新内容</button>
    </div></div>
    {!connected ? <p role="status">正在恢复进度连接，已有内容保留。</p> : null}{message ? <p role="alert">{message}</p> : null}
    {operations.length ? <div className="local-operation-history"><ul>{operations.slice(0, 1).map(renderOperation)}</ul>{kind === "audit" && operations[0]?.status === "succeeded" ? <p>检查已完成，点击“更新内容”查看定位与处理建议。</p> : null}{operations.length > 1 ? <details><summary>较早任务 · {operations.length - 1}</summary><ul>{operations.slice(1).map(renderOperation)}</ul></details> : null}</div> : null}
  </section>;
}
