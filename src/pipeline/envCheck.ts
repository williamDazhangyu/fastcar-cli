import which from "which";

import type {
  EnvCheckEvent,
  WorkerCandidate,
} from "./types";

export const WORKER_CANDIDATES: WorkerCandidate[] = [
  { id: "kimi", command: "kimi", env: "AUTO_ITERATE_KIMI_CMD", priority: 10 },
  { id: "codex", command: "codex", env: "AUTO_ITERATE_CODEX_CMD", priority: 9 },
  { id: "claude", command: "claude", env: "AUTO_ITERATE_CLAUDE_CMD", priority: 8 },
  { id: "gemini", command: "gemini", env: "AUTO_ITERATE_GEMINI_CMD", priority: 7 },
  {
    id: "cursor",
    command: "cursor",
    commandCandidates: ["cursor", "agent", "cursor-agent"],
    env: "AUTO_ITERATE_CURSOR_CMD",
    priority: 6,
  },
];

function commandExists(command: string): boolean {
  try {
    which.sync(command);
    return true;
  } catch {
    return false;
  }
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvCheckEvent {
  const workers = WORKER_CANDIDATES.map((candidate) => {
    const fromEnv = Boolean(env[candidate.env]);
    const commandCandidates = candidate.commandCandidates || [candidate.command];
    const foundCommand = commandCandidates.find((command) => commandExists(command));
    const onPath = Boolean(foundCommand);
    const available = fromEnv || onPath;
    const source: "env" | "path" | "missing" = fromEnv ? "env" : onPath ? "path" : "missing";
    return {
      id: candidate.id,
      command: foundCommand || candidate.command,
      env: candidate.env,
      available,
      source,
      reason: available ? null : "not_found",
      priority: candidate.priority,
    };
  });
  const workersAvailable = workers
    .filter((item) => item.available)
    .sort((a, b) => b.priority - a.priority);
  const workersUnavailable = workers
    .filter((item) => !item.available)
    .map(({ priority, ...item }) => item);

  return {
    event: "env_check",
    cwd: process.cwd(),
    usable: workersAvailable.length > 0,
    workers_available: workersAvailable.map(({ priority, reason, ...item }) => item),
    workers_unavailable: workersUnavailable,
    recommended: workersAvailable[0] ? workersAvailable[0].id : null,
    issues: workersAvailable.length > 0 ? [] : ["no_worker_cli_found"],
  };
}
