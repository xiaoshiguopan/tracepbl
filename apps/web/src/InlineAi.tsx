import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { JobEventSchema, JobEventTypeSchema, type OperationStatus } from "@tracepbl/contracts";
import { isLocalMode } from "./runtime-mode";
import { useLocalTask } from "./LocalTaskBoundary";
import { localSession } from "./local-api";
import { adoptLocalProposal, cancelLocalOperation, createLocalOperation, listLocalOperations, readLocalProposal, type ProposalPurpose } from "./local-operations";
import { localTaskData } from "./local-task-data";
import { generatedInlineDraft, inlineScope, mergeInlineDraft, restoreInlineDraft, reviewedInlineContent, type InlineDraft, type InlineTarget } from "./inline-ai-draft";

type Proposal = Awaited<ReturnType<typeof readLocalProposal>>;
type Undo = { before: InlineDraft; target: InlineTarget; previous: Proposal | null };
type Memory = { draft: InlineDraft; proposal: Proposal | null; history: Undo[]; version: number };
const drafts = new Map<string, Memory>();
export function pendingInlineStep(taskId: string) { return (["questionGuidance", "evidenceAnalysis", "lesson", "rubric"] as const).find(purpose => drafts.has(`${taskId}:${purpose}`)); }

export function useInlineAi<T extends InlineDraft>(taskId: string, purpose: ProposalPurpose, draft: T, setDraft: Dispatch<SetStateAction<T>>, loading: boolean) {
  const data = useLocalTask(); const memoryKey = `${taskId}:${purpose}`;
  const [execution, setExecution] = useState("disabled"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null); const [history, setHistory] = useState<Undo[]>([]);
  const [operation, setOperation] = useState<OperationStatus | null>(null);
  const [late, setLate] = useState<{ proposal: Proposal; target: InlineTarget } | null>(null);
  const [connected, setConnected] = useState(true);
  const latest = useRef(draft); latest.current = draft;
  const pending = useRef(proposal); pending.current = proposal;
  const restored = useRef(false); const locked = useRef(false); const generation = useRef(0);
  const target = useRef<InlineTarget>({ id: "all", label: "本页内容" }); const fingerprint = useRef(""); const requestKey = useRef(crypto.randomUUID());
  const confirmation = useRef<{ fingerprint: string; key: string } | null>(null);
  const jobId = operation?.id;
  const demoExample = useRef<T | null>(null);
  useEffect(() => { if (!isLocalMode && !loading && !demoExample.current) demoExample.current = structuredClone(draft); }, [loading, draft]);
  useEffect(() => { if (isLocalMode) void localSession().then(runtime => setExecution(runtime.ai.execution), error => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!isLocalMode || loading || restored.current || !data) return;
    restored.current = true; const saved = drafts.get(memoryKey);
    if (saved) { setDraft(saved.draft as T); setProposal(saved.proposal); setHistory(saved.history); setMessage(saved.version === data.task.lockVersion ? "已恢复本窗口中尚未确认的修改。" : "已保留旧草稿，但服务器内容已变化；请核对并重新生成，旧建议不能确认。"); }

  }, [loading, data, memoryKey, setDraft]);
  useEffect(() => {
    if (proposal) drafts.set(memoryKey, { draft, proposal, history, version: proposal.baseLockVersion });
  }, [draft, proposal, history, memoryKey]);
  useEffect(() => {
    if (!isLocalMode) return;
    const leave = (event: BeforeUnloadEvent) => { if (drafts.size || locked.current || document.querySelector("[data-inline-editing=true]")) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: Event) => { if (locked.current || document.querySelector("[data-inline-editing=true]")) { event.preventDefault(); setMessage("请先完成栏目修改，或取消正在生成的任务，再离开本页。"); } };
    window.addEventListener("tracepbl-before-navigate", navigate); window.addEventListener("beforeunload", leave); return () => { window.removeEventListener("tracepbl-before-navigate", navigate); window.removeEventListener("beforeunload", leave); };
  }, []);
  const fill = async (result: Proposal, chosen: InlineTarget) => {
    const base = await localTaskData(taskId);
    if (result.purpose !== purpose || result.baseLockVersion !== base.task.lockVersion) throw new Error("建议已过期或不属于当前栏目，请重新生成。");
    const generated = generatedInlineDraft(purpose, result.snapshot.proposal, base) as T;
    const before = latest.current;
    setHistory(items => [...items, { before, target: chosen, previous: pending.current }]);
    setDraft(mergeInlineDraft(purpose, before, generated, chosen.id)); setProposal(result); setLate(null);
    setMessage(`已填入${chosen.label}，可直接修改或撤销；确认后才保存。${execution === "fake" ? "当前为合成示例，重新生成可能相同。" : ""}`);
  };
  const fillRef = useRef(fill); fillRef.current = fill;
  useEffect(() => {
    if (!isLocalMode || loading || !data || drafts.has(memoryKey)) return;
    let active = true;
    void (async () => {
      const waiting = (await listLocalOperations(taskId)).filter(item => item.phase === "waitingForTeacher");
      for (const item of waiting) {
        const result = await readLocalProposal(taskId, item);
        if (!active || locked.current || pending.current) return;
        if (result.purpose === purpose && result.baseLockVersion === data.task.lockVersion) {
          setLate({ proposal: result, target: { id: "all", label: "本页内容" } });
          setMessage("有一份尚未确认的生成结果。可填入本页后修改，也可继续手工编辑；不会自动覆盖输入。");
          return;
        }
      }
    })().catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [loading, data, memoryKey, purpose, taskId]);
  useEffect(() => {
    if (!jobId) return;
    let active = true; let reading = false; let finished = false; const runNumber = generation.current;
    let stream: EventSource | undefined; let reconnect: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (reading || !active || finished) return; reading = true;
      try {
        const current = (await listLocalOperations(taskId)).find(item => item.id === jobId);
        if (!active || generation.current !== runNumber || !current) return;
        setOperation(current);
        if (current.phase === "waitingForTeacher") {
          const result = await readLocalProposal(taskId, current);
          if (!active || generation.current !== runNumber) return;
          finished = true; stream?.close(); setBusy(false); locked.current = false;
          if (JSON.stringify(inlineScope(purpose, latest.current, target.current.id)) !== fingerprint.current) { setLate({ proposal: result, target: target.current }); setMessage("生成期间你修改了此栏目，已保留你的输入。可选择填入结果或继续编辑。"); }
          else await fillRef.current(result, target.current);
        } else if (["failed", "cancelled", "partial"].includes(current.status)) { finished = true; stream?.close(); setBusy(false); locked.current = false; setMessage(current.error?.message || "本次未完成，原内容已保留。可重新生成。"); }
      } catch (error) { if (active) { setMessage(error instanceof Error ? error.message : "读取建议失败，可重试。"); setBusy(false); locked.current = false; } }
      finally { reading = false; }
    };
    const connect = () => {
      if (!active || finished || !navigator.onLine) return;
      stream?.close(); stream = new EventSource(`/api/v1/tasks/${taskId}/events`);
      stream.onopen = () => { setConnected(true); void refresh(); };
      stream.onerror = () => { if (active) { setConnected(false); if (stream?.readyState === EventSource.CLOSED) reconnect = setTimeout(connect, 3000); } };
      for (const type of JobEventTypeSchema.options) stream.addEventListener(type, event => { try { JobEventSchema.parse(JSON.parse((event as MessageEvent).data)); void refresh(); } catch { setMessage("进度格式不一致，请保留草稿并重试。"); } });
    };
    const offline = () => { clearTimeout(reconnect); stream?.close(); setConnected(false); };
    const online = () => { clearTimeout(reconnect); connect(); void refresh(); };
    window.addEventListener("offline", offline); window.addEventListener("online", online); connect();
    // Recover a completion event that arrived while the status request was in flight.
    const fallback = setInterval(() => { if (navigator.onLine) void refresh(); }, 10000);
    void refresh();
    return () => { active = false; clearInterval(fallback); clearTimeout(reconnect); stream?.close(); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [jobId, taskId, purpose]);
  const generate = async (chosen: InlineTarget) => {
    if (!isLocalMode) {
      if (loading || !demoExample.current) return;
      if (document.querySelector(".rubric-title-input,.activity-title-input")) { setMessage("请先完成卡片编辑，再替换示例。"); return; }
      setHistory(items => [...items, { before: latest.current, target: chosen, previous: null }]);
      setDraft(mergeInlineDraft(purpose, latest.current, demoExample.current, chosen.id));
      setMessage(`已恢复${chosen.label}的预生成示例，可继续修改或撤销。`); return;
    }
    if (!isLocalMode || locked.current || loading) return;
    if (document.querySelector("[data-inline-editing=true]")) { setMessage("请先保存卡片内正在编辑的内容，再生成；不会覆盖未完成的修改。"); return; }
    locked.current = true; setBusy(true); setMessage(""); setLate(null); target.current = chosen; fingerprint.current = JSON.stringify(inlineScope(purpose, latest.current, chosen.id)); generation.current++;
    try { const created = await createLocalOperation(taskId, purpose, requestKey.current); requestKey.current = crypto.randomUUID(); setOperation(created); }
    catch (error) { setMessage(error instanceof Error ? error.message : "生成失败，原内容已保留。"); setBusy(false); locked.current = false; }
  };
  const cancel = async () => { if (!operation) return; generation.current++; try { await cancelLocalOperation(taskId, operation.id, `inline-cancel-${operation.id}`); setOperation(null); setLate(null); setMessage("已取消生成，栏目内容保留。"); } catch (error) { setMessage(error instanceof Error ? error.message : "取消未完成。"); } finally { setBusy(false); locked.current = false; } };
  const undo = () => { const last = history.at(-1); if (!last || busy) return; setDraft(current => restoreInlineDraft(purpose, current, last.before as T, last.target.id)); setHistory(items => items.slice(0, -1)); setProposal(last.previous); if (!last.previous) drafts.delete(memoryKey); setMessage(`已撤销${last.target.label}的生成，其他栏目修改保留。`); };
  const commit = async (confirmed: T, manualSave: () => Promise<unknown>) => {
    if (locked.current) throw new Error("请等待当前操作完成。");
    if (document.querySelector("[data-inline-editing=true]")) { setMessage("请先保存卡片内的修改，再确认本页。"); throw new Error("尚有卡片正在编辑。"); }
    locked.current = true; setBusy(true);
    try {
      if (proposal) {
        const base = await localTaskData(taskId);
        const content = reviewedInlineContent(purpose, confirmed, base, proposal.snapshot.proposal);
        const hash = JSON.stringify([proposal.revisionId, content]);
        if (confirmation.current?.fingerprint !== hash) confirmation.current = { fingerprint: hash, key: crypto.randomUUID() };
        await adoptLocalProposal(taskId, proposal, confirmation.current.key, content);
      } else await manualSave();
      drafts.delete(memoryKey); setProposal(null); setHistory([]); setLate(null); setOperation(null); setMessage("已确认并保存当前内容。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "确认失败，修改仍保留，请重试。"); throw error; }
    finally { locked.current = false; setBusy(false); }
  };
  return { busy, loading, execution, message, connected, pending: Boolean(proposal), lastTarget: history.at(-1)?.target, generate, undo, cancel, canCancel: Boolean(operation?.canCancel && busy), late, applyLate: () => { if (late) void fill(late.proposal, late.target).catch(error => setMessage(error.message)); }, commit };
}

export type InlineAiController = Omit<ReturnType<typeof useInlineAi>, "commit">;
export function InlineAiButton({ ai, target, label }: { ai: InlineAiController; target: string; label: string }) {
  if (!isLocalMode) return <span className="inline-ai-buttons"><button type="button" className="ui-button secondary inline-ai-generate" disabled={ai.loading} onClick={() => void ai.generate({id:target,label})}><span aria-hidden="true">✦</span>示例 · {label.replace(/^生成/, "恢复")}</button>{ai.lastTarget?.id === target ? <button type="button" className="ui-button quiet" onClick={ai.undo}>撤销本次替换</button> : null}</span>;
  return <span className="inline-ai-buttons"><button type="button" className="ui-button secondary inline-ai-generate" disabled={ai.busy || ai.loading || ai.execution === "disabled"} onClick={() => void ai.generate({ id: target, label })}><span aria-hidden="true">✦</span>{ai.execution === "real" ? "AI" : "模拟 AI"} · {label}</button>{ai.lastTarget?.id === target ? <button type="button" className="ui-button quiet" disabled={ai.busy} onClick={ai.undo}>撤销本次生成</button> : null}</span>;
}
export function InlineAiStatus({ ai }: { ai: InlineAiController }) {
  if (!isLocalMode) return <aside className="inline-ai-status" aria-label="演示说明"><p>预生成示例已展示，可直接修改和继续<span>静态演示 · 不调用 AI</span></p>{ai.message ? <p role="status">{ai.message}</p> : null}</aside>;
  return <aside className="inline-ai-status" data-connection={ai.connected ? "connected" : "reconnecting"} aria-label="栏目 AI 状态"><p>{ai.pending ? "待确认 · 已填入栏目，可直接编辑" : "按栏目生成，直接填入；确认后保存"}<span>{ai.execution === "real" ? "真实 AI" : ai.execution === "disabled" ? "AI 未启用" : "模拟体验 · 不调用真实 AI"}</span></p>{ai.busy ? <p role="status">正在处理{!ai.connected ? "，连接恢复后继续接收结果" : "，你可以继续查看内容"}…{ai.canCancel ? <button className="ui-button quiet" onClick={() => void ai.cancel()}>取消生成</button> : null}</p> : null}{ai.message ? <p role="status">{ai.message}</p> : null}{ai.late ? <button className="ui-button secondary" onClick={ai.applyLate}>填入生成结果，替换此栏目</button> : null}<details><summary>使用说明</summary><p>生成依据当前已保存的课程、问题和材料。课程事实、学情、原文与授权由教师提供。当前未确认的修改保留在本窗口；用本页底部按钮确认后，才写入备课。真实 AI 需单独确认外发范围与预算，并完成本地配置。</p></details></aside>;
}
