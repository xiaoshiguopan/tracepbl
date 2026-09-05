import assert from "node:assert/strict";
const origin = process.env.TRACEPBL_BROWSER_ORIGIN ?? "http://127.0.0.1:38173";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use loopback only");
const runtime = await fetch(`${origin}/api/v1/runtime`);
assert.equal((await runtime.json()).ai.execution, "fake");
const cookie = runtime.headers.get("set-cookie").split(";", 1)[0];
async function request(path, method, body, version, key = crypto.randomUUID()) {
  return fetch(`${origin}/api/v1${path}`, { method, headers: { Cookie: cookie, Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "Idempotency-Key": key, ...(version === undefined ? {} : { "If-Match": `"task-lv-${version}"` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const created = await request("/tasks", "POST", { title: "合成删除保护运行验证" });
assert.equal(created.status, 201);
const task = await created.json();
const key = crypto.randomUUID();
const removed = await request(`/tasks/${task.id}`, "DELETE", { impactConfirmed: true }, task.lockVersion, key);
assert.equal(removed.status, 202);
const deletion = await removed.json();
const replay = await request(`/tasks/${task.id}`, "DELETE", { impactConfirmed: true }, task.lockVersion, key);
assert.equal(replay.status, 202); assert.deepEqual(await replay.json(), deletion);
assert.equal((await request(`/tasks/${task.id}`, "GET")).status, 404);
const restored = await request(`/tasks/${task.id}/restorations`, "POST", {}, deletion.lockVersion);
assert.equal(restored.status, 200);
const visible = await request(`/tasks/${task.id}`, "GET");
assert.equal(visible.status, 200); assert.equal(visible.headers.get("cache-control"), "no-store");
console.log(JSON.stringify({ status: "passed", deleteWithExternalJournal: true, sameKeyReplay: true, hiddenAfterDelete: true, undoVisible: true, privateCache: "no-store" }));
