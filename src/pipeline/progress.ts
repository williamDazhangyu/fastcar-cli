import type {
  EmittedProgressPayload,
  ProgressOptions,
  ProgressPayload,
} from "./types";
import { colorize, type CliColor } from "../cliOutput";

interface HumanProgressView {
  icon: string;
  label: string;
  color: CliColor;
  summary: string;
}

function formatMs(ms: unknown): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) {
    return "0s";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${Math.round(value / 1000)}s`;
}

function formatReqCounts(counts: unknown): string {
  const entries = Object.entries(counts || {}).filter(([, value]) => value);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}:${value}`).join(",")
    : "none";
}

function progressView(
  icon: string,
  label: string,
  color: CliColor,
  summary: string,
): HumanProgressView {
  return {
    icon,
    label,
    color,
    summary,
  };
}

function formatHumanProgress(payload: ProgressPayload): HumanProgressView | null {
  if (payload.event === "worker_started") {
    return progressView("🚀", "开始", "cyan", `第 ${payload.iter || "?"} 轮；focus=${payload.focus && payload.focus.type ? payload.focus.type : "unknown"}`);
  }
  if (payload.event === "worker_output") {
    return null;
  }
  if (payload.event === "pipeline_progress") {
    return progressView("📊", "进度", "blue", [
      `第 ${payload.iter || "?"} 轮进行中`,
      `阶段=${payload.stage || "unknown"}`,
      `剩余预算=${payload.budget_left === null || payload.budget_left === undefined ? "unknown" : payload.budget_left}`,
      `需求=${formatReqCounts(payload.req_counts)}`,
    ].filter(Boolean).join(" "));
  }
  if (payload.event === "agent_done") {
    return progressView("🧩", "执行", "magenta", `第 ${payload.iter || "?"} 轮编码完成；exit=${payload.exit_code}; duration=${formatMs(payload.duration_ms)}`);
  }
  if (payload.event === "validation_done") {
    const status = String(payload.status || "unknown");
    const color = status === "passed" ? "green" : status === "failed" ? "red" : "yellow";
    return progressView(status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️", "验证", color, `第 ${payload.iter || "?"} 轮=${status}；command=${payload.command || "none"}`);
  }
  if (payload.event === "state_merged") {
    return progressView("💾", "结果", "green", `第 ${payload.iter || "?"} 轮状态已合并；剩余预算=${payload.budget_left === null || payload.budget_left === undefined ? "unknown" : payload.budget_left}；需求=${formatReqCounts(payload.req_status)}`);
  }
  if (payload.event === "error") {
    return progressView("❌", "错误", "red", String(payload.summary || payload.reason || payload.status || ""));
  }
  if (payload.event === "warning") {
    return progressView("⚠️", "提醒", "yellow", String(payload.summary || payload.reason || payload.status || ""));
  }
  return progressView("ℹ️", "信息", "gray", String(payload.summary || payload.reason || payload.status || ""));
}

export function emitProgress(
  event: ProgressPayload,
  options: ProgressOptions = {},
): EmittedProgressPayload {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };

  if (options.jsonProgress) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return payload;
  }

  const view = formatHumanProgress(payload);
  if (view === null) {
    return payload;
  }
  const line = `${view.icon} ${view.label}${view.summary ? `: ${view.summary}` : ""}`;
  process.stdout.write(`${colorize(line, view.color)}\n`);
  return payload;
}
