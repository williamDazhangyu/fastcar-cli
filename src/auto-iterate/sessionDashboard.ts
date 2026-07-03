import { promises as fsPromises } from "fs";
import path from "path";
import { getSessionPaths } from "./sessionPaths";
import { readJsonFile } from "./stateIO";
import { resolveStateFileForValidation } from "./sessionStateValidation";
import { inferLanguageFromState, languageCode, localizedStatusLabel } from "../pipeline/language";

type StateObject = Record<string, any>;

interface DashboardText {
  htmlLang: string;
  title: string;
  iterations: string;
  requirementsPassed: string;
  remainingBudget: string;
  totalDuration: string;
  progress: string;
  roundUnit: string;
  status: string;
  iterationHistory: string;
  noIterations: string;
  rcmTitle: string;
  noRequirements: string;
  watchdog: string;
  noProgress: string;
  deliveryVerifiability: string;
  requiredAction: string;
  plan: string;
  changedFiles: string;
  validation: string;
  impacts: string;
  risks: string;
  none: string;
  dashDefaultSummary: (index: number) => string;
  started: string;
  autoRefresh: string;
  generated: (dashboardPath: string) => string;
  openHint: string;
  missingSession: string;
  missingState: string;
  expectedPath: (stateJsonPath: string) => string;
}

function dashboardText(language: unknown): DashboardText {
  if (languageCode(language) === "en") {
    return {
      htmlLang: "en",
      title: "auto-iterate",
      iterations: "Iterations",
      requirementsPassed: "Requirements passed",
      remainingBudget: "Remaining budget",
      totalDuration: "Total duration",
      progress: "Progress",
      roundUnit: "rounds",
      status: "Status",
      iterationHistory: "Iteration History",
      noIterations: "No iteration records yet",
      rcmTitle: "Requirement Coverage Matrix (RCM)",
      noRequirements: "No requirement records yet",
      watchdog: "Watchdog",
      noProgress: "No-progress rounds",
      deliveryVerifiability: "Delivery verifiability",
      requiredAction: "Required action",
      plan: "Plan",
      changedFiles: "Changes",
      validation: "Validation",
      impacts: "Impact",
      risks: "Risks",
      none: "none",
      dashDefaultSummary: (index) => `Iteration ${index + 1}`,
      started: "Started",
      autoRefresh: "Auto refresh every 2s",
      generated: (dashboardPath) => `📊 Dashboard generated: ${dashboardPath}`,
      openHint: "   Open this file in a browser to view live progress.",
      missingSession: "❌ Unable to resolve session. Pass --dashboard <session>.",
      missingState: "❌ Unable to read state.json. Create the session first.",
      expectedPath: (stateJsonPath) => `   Expected path: ${stateJsonPath}`,
    };
  }

  return {
    htmlLang: "zh-CN",
    title: "auto-iterate",
    iterations: "迭代轮次",
    requirementsPassed: "需求通过",
    remainingBudget: "剩余预算",
    totalDuration: "总耗时",
    progress: "进度",
    roundUnit: "轮",
    status: "状态",
    iterationHistory: "迭代历史",
    noIterations: "暂无迭代记录",
    rcmTitle: "需求覆盖矩阵 (RCM)",
    noRequirements: "暂无需求记录",
    watchdog: "Watchdog",
    noProgress: "无进展轮次",
    deliveryVerifiability: "交付可验证性",
    requiredAction: "需要动作",
    plan: "方案",
    changedFiles: "修改",
    validation: "验证",
    impacts: "影响",
    risks: "风险",
    none: "无",
    dashDefaultSummary: (index) => `第 ${index + 1} 轮`,
    started: "开始",
    autoRefresh: "每 2s 自动刷新",
    generated: (dashboardPath) => `📊 已生成仪表盘: ${dashboardPath}`,
    openHint: "   在浏览器中打开此文件即可查看实时进度。",
    missingSession: "❌ 无法确定 session，请传入 --dashboard <session>",
    missingState: "❌ 无法读取 state.json，请先创建 session。",
    expectedPath: (stateJsonPath) => `   期望路径: ${stateJsonPath}`,
  };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusIcon(status: string): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "implemented":
      return "⏳";
    case "blocked":
      return "🚫";
    case "not_verified":
      return "⚠️";
    case "pending":
      return "⬜";
    default:
      return "❓";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "implemented":
      return "running";
    case "blocked":
      return "blocked";
    default:
      return "pending";
  }
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function numberField(record: StateObject, primary: string, fallback: string, defaultValue: number): number {
  const value = record[primary] ?? record[fallback];
  return Number.isFinite(Number(value)) ? Number(value) : defaultValue;
}

function renderIterationRow(iter: StateObject, index: number, text: DashboardText): string {
  const status = iter.status || "implemented";
  const summary = escapeHtml(iter.summary || iter.rationaleSummary || text.dashDefaultSummary(index));
  const files = (iter.files || iter.filesChanged || iter.files_changed || []).map((f: string) => escapeHtml(f)).join(", ");
  const rationale = escapeHtml(iter.rationaleSummary || iter.summary || "");
  const validationResult = iter.validationResult || iter.result || "";
  const duration = formatDuration(iter.durationMs || iter.duration_ms || 0);
  const rawRisks = iter.risks || [];
  const risks = (Array.isArray(rawRisks) ? rawRisks.map((r: string) => escapeHtml(r)).join("; ") : escapeHtml(String(rawRisks))) || text.none;
  const rawImpacts = iter.impacts || iter.knownLimitations || [];
  const impacts = (Array.isArray(rawImpacts) ? rawImpacts.map((i: string) => escapeHtml(i)).join("; ") : escapeHtml(String(rawImpacts))) || text.none;

  return `
    <div class="iteration ${statusClass(status)}" onclick="this.classList.toggle('expanded')">
      <div class="iter-summary">
        <span class="iter-num">#${index + 1}</span>
        <span class="iter-icon">${statusIcon(status)}</span>
        <span class="iter-title">${summary}</span>
        <span class="iter-duration">${duration}</span>
      </div>
      <div class="iter-detail">
        <div class="iter-field"><strong>${text.plan}：</strong>${rationale}</div>
        <div class="iter-field"><strong>${text.changedFiles}：</strong>${files || "—"}</div>
        <div class="iter-field"><strong>${text.validation}：</strong>${escapeHtml(String(validationResult))}</div>
        <div class="iter-field"><strong>${text.impacts}：</strong>${impacts}</div>
        <div class="iter-field"><strong>${text.risks}：</strong>${risks}</div>
      </div>
    </div>`;
}

function renderRcmRow(req: StateObject): string {
  const status = req.status || "pending";
  const evidence = req.evidence || "";
  return `
    <div class="rcm-row ${statusClass(status)}">
      <span class="rcm-icon">${statusIcon(status)}</span>
      <span class="rcm-id">${escapeHtml(req.id || "")}</span>
      <span class="rcm-summary">${escapeHtml(req.summary || "")}</span>
      ${evidence ? `<span class="rcm-evidence">(${escapeHtml(String(evidence))})</span>` : ""}
    </div>`;
}

export function buildDashboardHtml(state: StateObject): string {
  const language = inferLanguageFromState(state);
  const text = dashboardText(language);
  const task = state.task || {};
  const session = state.session || {};
  const mode = state.mode || {};
  const budgets = state.budgets || {};
  const watchdog = state.watchdog || {};
  const requirements = state.requirements || [];
  const traceability = state.traceability || {};
  const iterations = traceability.iterations || [];
  const validation = state.validation || {};
  const currentState = state.currentState || {};

  const totalIterations = budgets.maxIterations || budgets.autopilotMaxIterations || 0;
  const used = budgets.implementationIterationsUsed || 0;
  const remaining = budgets.remainingImplementationIterations ?? (totalIterations - used);
  const progressPct = totalIterations > 0 ? Math.min(100, Math.round((used / totalIterations) * 100)) : 0;

  const passedReqs = requirements.filter((r: StateObject) => r.status === "passed").length;
  const totalReqs = requirements.length || 0;

  const sessionName = escapeHtml(session.session || session.name || "unknown");
  const modeName = escapeHtml(mode.mode || mode.name || "unknown");
  const goal = escapeHtml(task.goal || "");
  const overallStatus = localizedStatusLabel(currentState.overallStatus || "in_progress", language);
  const deliveryVerifiability = watchdog.deliveryVerifiability || "unknown";
  const watchdogTriggered = watchdog.triggered ? "TRIGGERED" : "clear";
  const noProgressCount = numberField(watchdog, "noProgressStreak", "no_progress_count", 0);
  const maxNoProgress = numberField(watchdog, "maxNoProgressIterations", "max_no_progress_iterations", 3);

  const startTime = state.createdAt || state.startedAt || "";
  const validationEntries = validation.entries || [];
  const totalDurationMs = validationEntries.reduce(
    (sum: number, e: StateObject) => sum + (e.durationMs || e.duration_ms || 0),
    0,
  );

  return `<!DOCTYPE html>
<html lang="${text.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>auto-iterate: ${sessionName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; line-height: 1.5; }
  .container { max-width: 900px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; color: #58a6ff; }
  .header .badge { font-size: 12px; padding: 2px 8px; border-radius: 12px; background: #21262d; border: 1px solid #30363d; }
  .header .badge.autopilot { background: #1f3a5f; border-color: #58a6ff; color: #58a6ff; }
  .goal { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 14px; color: #8b949e; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .progress-bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #238636, #3fb950); border-radius: 4px; transition: width 0.5s ease; }
  .progress-text { font-size: 12px; color: #8b949e; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .stat { text-align: center; }
  .stat .value { font-size: 24px; font-weight: 600; }
  .stat .value.green { color: #3fb950; }
  .stat .value.yellow { color: #d29922; }
  .stat .value.red { color: #f85149; }
  .stat .label { font-size: 11px; color: #8b949e; margin-top: 4px; }
  .iteration { border: 1px solid #30363d; border-radius: 6px; margin-bottom: 8px; overflow: hidden; cursor: pointer; }
  .iteration.passed { border-left: 3px solid #3fb950; }
  .iteration.failed { border-left: 3px solid #f85149; }
  .iteration.running { border-left: 3px solid #d29922; }
  .iteration.blocked { border-left: 3px solid #f85149; }
  .iter-summary { display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 13px; }
  .iter-num { color: #8b949e; font-weight: 600; min-width: 28px; }
  .iter-title { flex: 1; }
  .iter-duration { color: #8b949e; font-size: 12px; }
  .iter-detail { display: none; padding: 0 12px 12px 48px; font-size: 12px; color: #8b949e; }
  .iteration.expanded .iter-detail { display: block; }
  .iter-field { margin-bottom: 4px; }
  .iter-field strong { color: #c9d1d9; }
  .rcm-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #21262d; }
  .rcm-row:last-child { border-bottom: none; }
  .rcm-row.passed { color: #3fb950; }
  .rcm-row.blocked { color: #f85149; }
  .rcm-row.pending { color: #8b949e; }
  .rcm-id { color: #58a6ff; font-family: monospace; min-width: 60px; }
  .rcm-evidence { color: #8b949e; font-size: 11px; }
  .watchdog-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
  .watchdog-row .label { color: #8b949e; }
  .watchdog-row .value.green { color: #3fb950; }
  .watchdog-row .value.red { color: #f85149; }
  .watchdog-row .value.yellow { color: #d29922; }
  .footer { text-align: center; font-size: 11px; color: #484f58; margin-top: 24px; }
  .footer .refresh { color: #58a6ff; }
  .empty { text-align: center; color: #484f58; padding: 24px; font-size: 13px; }
  @media (max-width: 600px) { body { padding: 12px; } .stats { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🚗 auto-iterate</h1>
    <span class="badge">${modeName}</span>
    ${mode.autopilot ? '<span class="badge autopilot">Autopilot</span>' : ""}
    <span style="flex:1"></span>
    <span style="font-size:12px;color:#484f58" id="lastUpdate"></span>
  </div>
  <div class="goal">${goal}</div>

  <div class="stats">
    <div class="stat">
      <div class="value green">${used}</div>
      <div class="label">${text.iterations}</div>
    </div>
    <div class="stat">
      <div class="value green">${passedReqs}/${totalReqs}</div>
      <div class="label">${text.requirementsPassed}</div>
    </div>
    <div class="stat">
      <div class="value ${remaining <= 0 ? "red" : "yellow"}">${remaining}</div>
      <div class="label">${text.remainingBudget}</div>
    </div>
    <div class="stat">
      <div class="value">${formatDuration(totalDurationMs)}</div>
      <div class="label">${text.totalDuration}</div>
    </div>
  </div>

  <div class="card">
    <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
    <div class="progress-text">${text.progress} ${progressPct}%（${used}/${totalIterations} ${text.roundUnit}） | ${text.status}: ${overallStatus}</div>
  </div>

  <div class="card">
    <h2>📋 ${text.iterationHistory}</h2>
    ${iterations.length === 0
      ? `<div class="empty">${text.noIterations}</div>`
      : iterations.map((iter: StateObject, i: number) => renderIterationRow(iter, i, text)).join("")}
  </div>

  <div class="card">
    <h2>📊 ${text.rcmTitle}</h2>
    ${requirements.length === 0
      ? `<div class="empty">${text.noRequirements}</div>`
      : requirements.map((req: StateObject) => renderRcmRow(req)).join("")}
  </div>

  <div class="card">
    <h2>🛡️ ${text.watchdog}</h2>
    <div class="watchdog-row"><span class="label">${text.status}</span><span class="value ${watchdogTriggered === "clear" ? "green" : "red"}">${watchdogTriggered}</span></div>
    <div class="watchdog-row"><span class="label">${text.noProgress}</span><span class="value ${noProgressCount >= maxNoProgress ? "red" : "yellow"}">${noProgressCount} / ${maxNoProgress}</span></div>
    <div class="watchdog-row"><span class="label">${text.deliveryVerifiability}</span><span class="value ${deliveryVerifiability === "verifiable" ? "green" : "yellow"}">${deliveryVerifiability}</span></div>
    ${watchdog.requiredAction && watchdog.requiredAction !== "none"
      ? `<div class="watchdog-row"><span class="label">${text.requiredAction}</span><span class="value red">${escapeHtml(watchdog.requiredAction)}</span></div>`
      : ""}
  </div>

  <div class="footer">
    ${startTime ? `${text.started}: ${escapeHtml(String(startTime))} | ` : ""}session: ${sessionName} |
    <span class="refresh">${text.autoRefresh}</span>
  </div>
</div>
<script>
  const stateUrl = "state.json";
  let lastModified = null;
  async function refresh() {
    try {
      const resp = await fetch(stateUrl, { cache: "no-store" });
      if (!resp.ok) return;
      const text = await resp.text();
      if (text === lastModified) return;
      lastModified = text;
      location.reload();
    } catch (e) {
      // state.json not ready yet, retry next cycle
    }
    document.getElementById("lastUpdate").textContent = new Date().toLocaleTimeString();
  }
  setInterval(refresh, 2000);
  document.getElementById("lastUpdate").textContent = new Date().toLocaleTimeString();
</script>
</body>
</html>`;
}

export async function generateDashboard(sessionName: string): Promise<void> {
  const previousExitCode = process.exitCode;
  process.exitCode = 0;

  let stateInfo: StateObject;
  try {
    stateInfo = await resolveStateFileForValidation(sessionName);
  } catch (rawError) {
    const error = rawError as Error;
    console.log(`❌ ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
  if (!session || session === "unknown") {
    console.log(dashboardText("zh").missingSession);
    process.exitCode = 1;
    return;
  }

  const sessionPaths = getSessionPaths(session);
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath) as StateObject | null;
  if (!stateJson) {
    console.log(dashboardText("zh").missingState);
    console.log(dashboardText("zh").expectedPath(sessionPaths.sessionStateJsonPath));
    process.exitCode = 1;
    return;
  }

  const html = buildDashboardHtml(stateJson);
  const text = dashboardText(inferLanguageFromState(stateJson));
  const dashboardPath = path.join(sessionPaths.sessionDir, "dashboard.html");
  await fsPromises.writeFile(dashboardPath, html, "utf8");

  process.exitCode = previousExitCode || 0;
  console.log(text.generated(dashboardPath));
  console.log(text.openHint);
}
