import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";

// The sentinel is synthetic. Never probe existing secrets, logs, or user output.
const sentinel = resolve("apps/web/.tracepbl/stage12-synthetic-probe.txt");
mkdirSync(dirname(sentinel), { recursive: true });
writeFileSync(sentinel, "stage12 synthetic file boundary probe", { flag: "wx" });
try {
  for (const path of ["/.tracepbl/stage12-synthetic-probe.txt", `/@fs/${sentinel.replaceAll("\\", "/")}`]) {
    const response = await fetch(`http://127.0.0.1:35173${path}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 200) assert.equal(await response.text(), "stage12 synthetic file boundary probe", "Distinguish actual file exposure from SPA fallback");
    assert.equal(response.status, 403, `Private local file must be denied: ${path}`);
  }
  console.log("Synthetic private-file probes: 2 denied; no existing secrets read.");
} finally { unlinkSync(sentinel); }
