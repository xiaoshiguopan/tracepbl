import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const rows = Object.entries(lock.packages).filter(([path, item]) => path.includes("node_modules/") && !item.link);
const lines = ["# 阶段 12 锁文件依赖与许可清单", "", "生成来源：当前 package-lock.json；不代表法律意见或对所有许可证正文的审阅。未联网查询供应商。", "", "| 安装路径 | 版本 | 范围 | SPDX/声明 | 完整性哈希 |", "|---|---|---|---|---|"];
for (const [path, item] of rows) lines.push(`| ${path} | ${item.version} | ${item.dev ? "开发" : "运行/可选"} | ${String(item.license ?? "未声明，待核对").replaceAll("|", "\\|")} | ${item.integrity ? "有" : "缺失，待核对"} |`);
if (!process.argv.includes("--scan-only")) writeFileSync("docs/07-quality-security/DEPENDENCY-LICENSES.md", lines.join("\n") + "\n");

// High-confidence patterns only. Print paths/rules, never matching secret text.
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bAKIA[A-Z0-9]{16}\b/, /\bsk-[A-Za-z0-9]{32,}\b/];
const findings = [];
for (const commit of git("rev-list", "--all").trim().split("\n")) {
  const scan = spawnSync("git", ["grep", "-I", "-l", "-E", "BEGIN .*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9]{32,}", commit], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (scan.status !== 0 && scan.status !== 1) throw new Error(`History scan failed for ${commit}`);
  const output = scan.stdout;
  for (const name of output.trim().split("\n").filter(Boolean)) findings.push({ location: name, rule: "history-high-confidence" });
}
const scanPaths = new Set([...git("ls-files", "-z").split("\0"), ...git("ls-files", "--others", "--exclude-standard", "-z", "--", "apps", "packages", "database", "tests", "scripts", "docs", ".github").split("\0")].filter(Boolean));
for (const path of scanPaths) {
  const content = readFileSync(path); if (content.includes(0)) continue;
  patterns.forEach((rule, index) => { if (rule.test(content.toString("utf8"))) findings.push({ location: path, rule: index }); });
}
process.stdout.write(JSON.stringify({ dependencies: rows.length, missingLicenses: rows.filter(([, item]) => !item.license).map(([path]) => path), missingIntegrity: rows.filter(([, item]) => !item.integrity).map(([path]) => path), secretPatternFindings: findings }, null, 2) + "\n");
process.exitCode = findings.length ? 1 : 0;
