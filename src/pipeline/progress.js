// @ts-check

/**
 * @param {unknown} ms
 * @returns {string}
 */
function formatMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) {
    return "0s";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${Math.round(value / 1000)}s`;
}

/**
 * @param {unknown} counts
 * @returns {string}
 */
function formatReqCounts(counts) {
  const entries = Object.entries(counts || {}).filter(([, value]) => value);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}:${value}`).join(",")
    : "none";
}

/**
 * @param {import("./types").ProgressPayload} payload
 * @returns {string}
 */
function formatHumanProgress(payload) {
  if (payload.event === "worker_started") {
    return `worker started iter=${payload.iter} focus=${payload.focus && payload.focus.type ? payload.focus.type : "unknown"} timeout=${formatMs(payload.timeout_ms)}`;
  }
  if (payload.event === "worker_output") {
    return `worker ${payload.stream} iter=${payload.iter} +${payload.bytes || 0}B elapsed=${formatMs(payload.elapsed_ms)}${payload.summary ? ` ${payload.summary}` : ""}`;
  }
  if (payload.event === "pipeline_progress") {
    return [
      `iter=${payload.iter}`,
      `stage=${payload.stage || "unknown"}`,
      `elapsed=${formatMs(payload.elapsed_ms)}`,
      `idle=${formatMs(payload.last_activity_ms)}`,
      `budget=${payload.budget_left === null || payload.budget_left === undefined ? "unknown" : payload.budget_left}`,
      `reqs=${formatReqCounts(payload.req_counts)}`,
      payload.last_output ? `last=${payload.last_output}` : "",
    ].filter(Boolean).join(" ");
  }
  if (payload.event === "agent_done") {
    return `iter=${payload.iter} exit=${payload.exit_code} duration=${formatMs(payload.duration_ms)} stdout=${payload.stdout_bytes || 0}B stderr=${payload.stderr_bytes || 0}B`;
  }
  if (payload.event === "validation_done") {
    return `iter=${payload.iter} status=${payload.status} exit=${payload.exit_code} duration=${formatMs(payload.duration_ms)} command=${payload.command || "none"}`;
  }
  if (payload.event === "state_merged") {
    return `iter=${payload.iter} budget=${payload.budget_left === null || payload.budget_left === undefined ? "unknown" : payload.budget_left} reqs=${formatReqCounts(payload.req_status)}`;
  }
  return payload.summary || payload.reason || payload.status || "";
}

/**
 * @param {import("./types").ProgressPayload} event
 * @param {import("./types").ProgressOptions} [options]
 * @returns {import("./types").EmittedProgressPayload}
 */
function emitProgress(event, options = {}) {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };

  if (options.jsonProgress) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return payload;
  }

  const label = payload.event || "progress";
  const summary = formatHumanProgress(payload);
  process.stdout.write(`[auto-iterate] ${label}${summary ? `: ${summary}` : ""}\n`);
  return payload;
}

module.exports = {
  emitProgress,
};
