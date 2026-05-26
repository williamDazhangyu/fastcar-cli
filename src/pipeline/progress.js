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
  const summary = payload.summary || payload.reason || payload.status || "";
  process.stdout.write(`[auto-iterate] ${label}${summary ? `: ${summary}` : ""}\n`);
  return payload;
}

module.exports = {
  emitProgress,
};
