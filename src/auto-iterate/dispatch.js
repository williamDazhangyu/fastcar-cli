// @ts-check

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  getSessionPaths,
  slugifySessionName,
  toRelative,
} = require("./sessionPaths");
const { readJsonFile, writeJsonFileAtomic } = require("./stateIO");
const { parseFileList } = require("./stateMarkdownParsers");
const { resolveStateFileForValidation } = require("./sessionStateValidation");
const { validationConfigCommands } = require("../pipeline/validationCommands");

const MAX_SUB_AGENT_HISTORY_ITEMS = 200;

const DISPATCH_AGENT_CONFIGS = {
  codex: {
    label: "Codex",
    env: "AUTO_ITERATE_CODEX_CMD",
    aliases: ["codex", "codex-cli"],
  },
  claude: {
    label: "Claude Code",
    env: "AUTO_ITERATE_CLAUDE_CMD",
    aliases: ["claude", "claude-code", "claude_code"],
  },
  gemini: {
    label: "Gemini CLI",
    env: "AUTO_ITERATE_GEMINI_CMD",
    aliases: ["gemini", "gemini-cli", "gemini_cli"],
  },
  kimi: {
    label: "Kimi Code",
    env: "AUTO_ITERATE_KIMI_CMD",
    aliases: ["kimi", "kimi-code", "kimi_code"],
  },
  cursor: {
    label: "Cursor",
    env: "AUTO_ITERATE_CURSOR_CMD",
    aliases: ["cursor", "cursor-agent", "cursor_agent"],
  },
  windsurf: {
    label: "Windsurf",
    env: "AUTO_ITERATE_WINDSURF_CMD",
    aliases: ["windsurf", "windsurf-cascade", "cascade"],
  },
  copilot: {
    label: "GitHub Copilot",
    env: "AUTO_ITERATE_COPILOT_CMD",
    aliases: ["copilot", "github-copilot", "github_copilot"],
  },
  jules: {
    label: "Google Jules",
    env: "AUTO_ITERATE_JULES_CMD",
    aliases: ["jules", "google-jules", "google_jules"],
  },
  devin: {
    label: "Devin",
    env: "AUTO_ITERATE_DEVIN_CMD",
    aliases: ["devin"],
  },
  openhands: {
    label: "OpenHands",
    env: "AUTO_ITERATE_OPENHANDS_CMD",
    aliases: ["openhands", "open-hands", "open_hands"],
  },
  replit: {
    label: "Replit Agent",
    env: "AUTO_ITERATE_REPLIT_CMD",
    aliases: ["replit", "replit-agent", "replit_agent"],
  },
};

const DISPATCH_AGENT_ALIAS_MAP = Object.entries(DISPATCH_AGENT_CONFIGS).reduce(
  (aliases, [key, config]) => {
    for (const alias of config.aliases) {
      aliases[alias] = key;
    }
    return aliases;
  },
  {},
);

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getIsoTimestamp() {
  return new Date().toISOString();
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeDispatchAgent(value) {
  const normalized = String(value || "codex").trim().toLowerCase();
  return DISPATCH_AGENT_ALIAS_MAP[normalized] || null;
}

/**
 * @param {string | null | undefined} agent
 * @param {string | null | undefined} session
 * @returns {string}
 */
function makeAgentId(agent, session) {
  const stamp = getIsoTimestamp()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  return slugifySessionName(`${agent || "agent"}-${session || "session"}-${stamp}`);
}

/**
 * @param {Record<string, any> | null | undefined} stateJson
 * @param {string | null | undefined} fallback
 * @returns {string}
 */
function selectVerifyCommand(stateJson, fallback) {
  if (fallback) {
    return fallback;
  }
  const commands = stateJson && stateJson.validation && Array.isArray(stateJson.validation.commands)
    ? stateJson.validation.commands
    : [];
  return validationConfigCommands(commands)[0] || "未指定";
}

/**
 * @param {import("./sessionPaths").SessionPaths} sessionPaths
 * @returns {string}
 */
function getDispatchDir(sessionPaths) {
  return path.join(sessionPaths.sessionDir, "dispatch");
}

/**
 * @param {import("./sessionPaths").SessionPaths} sessionPaths
 * @param {string} agentId
 * @returns {string}
 */
function getDispatchWorktreeDir(sessionPaths, agentId) {
  return path.join(sessionPaths.sessionDir, "worktrees", agentId);
}

function runGit(args, options = {}) {
  const cwd = String(options.cwd || process.cwd());
  const safeDirectory = path.resolve(cwd).replace(/\\/g, "/");
  return spawnSync("git", ["-c", `safe.directory=${safeDirectory}`, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

/**
 * @param {import("./sessionPaths").SessionPaths} sessionPaths
 * @param {string} agentId
 * @returns {Promise<string>}
 */
async function createDispatchWorktree(sessionPaths, agentId) {
  const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (repoCheck.status !== 0 || String(repoCheck.stdout).trim() !== "true") {
    throw new Error("当前目录不是 git worktree，不能执行隔离 worker；请使用 --dry-run 或在 git 仓库中运行");
  }

  const worktreeDir = getDispatchWorktreeDir(sessionPaths, agentId);
  await fs.promises.mkdir(path.dirname(worktreeDir), { recursive: true });
  if (await pathExists(worktreeDir)) {
    throw new Error(`dispatch worktree 已存在: ${toRelative(worktreeDir)}`);
  }

  const addResult = runGit(["worktree", "add", "--detach", worktreeDir, "HEAD"]);
  if (addResult.status !== 0) {
    throw new Error(`创建 git worktree 失败: ${addResult.stderr || addResult.stdout}`);
  }
  return worktreeDir;
}

function buildWorkerPrompt(options) {
  const files = options.files.join(", ");
  return `# auto-iterate worker task

你的角色：父 Agent 委派的 coder 子任务执行者，非独立 session。

Session：${options.session}
父协议：auto-iterate-coding
Agent：${options.agent}
任务：${options.task}
允许修改文件：${files}
验证命令：${options.verifyCommand}
超时：${options.timeoutSeconds} 秒

必须遵守：
- 只完成本子任务，不判断整体项目是否完成。
- 只能修改“允许修改文件”中的文件；不确定时先停止并在 blocked_reason 中说明。
- 禁止读取或写入 .agent-state/ 下任何文件，包括 state.json、state.md、start-prompt.md、auto-iterate-current.json。
- 不得写入密钥、token、密码或连接串。
- 不得执行破坏性 git 命令。
- 不得新增依赖，除非任务明确要求且父 Agent 已允许。
- 修改后运行验证命令；无法运行时说明原因，不得伪造验证。

请严格按以下 Sub-Agent Result Schema 输出：

agent_id：${options.agentId}
type：coder
status：completed / failed / blocked
files_changed：
validation：
risks：
blocked_reason：
handoff：
`;
}

function formatActiveSubAgentsBlock(agents) {
  if (!agents || agents.length === 0) {
    return "无";
  }

  return [
    "",
    ...agents.flatMap((agent) => [
      `  - id：${agent.id}`,
      `    type：${agent.type}`,
      `    task：${agent.task}`,
      `    files_assigned：${agent.filesAssigned.join(",")}`,
      `    status：${agent.status}`,
      `    failure_reason：${agent.failureReason}`,
      `    started_at：${agent.startedAt || "未开始"}`,
      `    completed_at：${agent.completedAt || "未开始"}`,
      `    result_summary：${agent.resultSummary}`,
      `    merge_status：${agent.mergeStatus}`,
    ]),
  ].join("\n");
}

/**
 * @param {unknown} history
 * @returns {Record<string, any>[]}
 */
function normalizeSubAgentHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item && typeof item === "object")
    .slice(-MAX_SUB_AGENT_HISTORY_ITEMS);
}

function formatSubAgentHistoryBlock(history) {
  const items = normalizeSubAgentHistory(history);
  if (items.length === 0) {
    return "无";
  }
  return [
    "",
    ...items.flatMap((agent, index) => [
      `  - round：${agent.round || agent.lastDispatchRound || index + 1}`,
      `    agent_id：${agent.agentId || agent.agent_id || agent.id || "unknown"}`,
      `    type：${agent.type || "unknown"}`,
      `    task_summary：${agent.taskSummary || agent.task_summary || agent.task || ""}`,
      `    merge_result：${agent.mergeResult || agent.merge_result || agent.mergeStatus || "pending"}`,
      `    files_changed：${agent.filesChanged || agent.files_changed || (Array.isArray(agent.filesAssigned) ? agent.filesAssigned.join(",") : "")}`,
      `    validation_result：${agent.validationResult || agent.validation_result || agent.status || "unknown"}`,
      `    failure_reason：${agent.failureReason || agent.failure_reason || "无"}`,
    ]),
  ].join("\n");
}

function getExistingSubAgentDispatch(stateJson) {
  return stateJson && stateJson.subAgentDispatch && typeof stateJson.subAgentDispatch === "object"
    ? stateJson.subAgentDispatch
    : {};
}

function buildDispatchCounters(existingDispatch, activeIncrement = 1) {
  return {
    dispatchedCount: ((existingDispatch && existingDispatch.dispatchedCount) || 0) + activeIncrement,
    completedCount: (existingDispatch && existingDispatch.completedCount) || 0,
    failedCount: (existingDispatch && existingDispatch.failedCount) || 0,
    lastDispatchRound: ((existingDispatch && existingDispatch.lastDispatchRound) || 0) + activeIncrement,
  };
}

function replaceSection(content, heading, nextHeadingPattern, replacementBody) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNextHeading = nextHeadingPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(${escapedHeading}\\s*\\r?\\n)([\\s\\S]*?)(?=^${escapedNextHeading}\\s*\\r?$)`,
    "m",
  );
  if (!pattern.test(content)) {
    return content;
  }
  return content.replace(pattern, `$1${replacementBody.trimEnd()}\n\n`);
}

function updateStateMarkdownForDispatch(content, dispatch) {
  const dispatchBody = `enabled：true
current_phase：${dispatch.phase}
active_sub_agents：${dispatch.activeBlock}
active_sub_agents_item_template：
  - id：<agent_id>
    type：explore / coder / background
    task：
    files_assigned：
    status：planned / running / completed / failed / blocked
    failure_reason：
    started_at：
    completed_at：
    result_summary：
    merge_status：pending / merged / skipped
sub_agent_history：${dispatch.historyBlock}
sub_agent_history_item_template：
  - round：1
    agent_id：<agent_id>
    type：explore / coder / background
    task_summary：
    merge_result：success / partial / skipped
    files_changed：
    validation_result：
    failure_reason：
dispatched_count：${dispatch.dispatchedCount}
completed_count：${dispatch.completedCount}
failed_count：${dispatch.failedCount}
last_dispatch_round：${dispatch.lastDispatchRound}
last_merge_result：${dispatch.lastMergeResult}
max_sub_agent_rounds：3
sub_agent_timeout_seconds：${dispatch.timeoutSeconds}
max_failed_sub_agents：2
token_budget_hint：未设置
concurrency_limit：3`;

  return replaceSection(
    content,
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "## Budgets / 预算",
    dispatchBody,
  );
}

function updateDecisionsMarkdownForDispatch(content, dispatch) {
  return content
    .replace(
      /parallel_write_allowed：.*$/m,
      `parallel_write_allowed：true`,
    )
    .replace(
      /parallel_write_confirmation：.*$/m,
      `parallel_write_confirmation：isolation worktree dispatch by parent Agent`,
    )
    .replace(
      /coder_file_ownership：.*$/m,
      `coder_file_ownership：${dispatch.activeSubAgents[0].id}=${dispatch.activeSubAgents[0].filesAssigned.join(",")}`,
    )
    .replace(
      /fallback_strategy：.*$/m,
      "fallback_strategy：worktree 不可用、worker 失败或 Quality Gate 不通过时转父 Agent 串行执行",
    );
}

function updateStateJsonForDispatch(stateJson, dispatch) {
  const now = getIsoTimestamp();
  const next = {
    ...stateJson,
    updatedAt: now,
    subAgentDispatch: {
      enabled: true,
      currentPhase: dispatch.phase,
      activeSubAgents: dispatch.activeSubAgents,
      subAgentHistory: dispatch.subAgentHistory,
      dispatchedCount: dispatch.dispatchedCount,
      completedCount: dispatch.completedCount,
      failedCount: dispatch.failedCount,
      lastDispatchRound: dispatch.lastDispatchRound,
      lastMergeResult: dispatch.lastMergeResult,
      maxSubAgentRounds: 3,
      subAgentTimeoutSeconds: dispatch.timeoutSeconds,
      maxFailedSubAgents: 2,
      concurrencyLimit: 3,
    },
  };

  next.currentState = {
    ...(next.currentState || {}),
    currentPhase: "dispatch_ready",
    currentTask: `委派 ${dispatch.agent} worker 执行: ${dispatch.task}`,
    nextAction: dispatch.dryRun
      ? "检查生成的 worker prompt；确认后可去掉 --dry-run 执行外部 Agent"
      : "等待 worker 完成并执行 Quality Gate",
    overallStatus: "in_progress",
  };

  next.watchdog = {
    ...(next.watchdog || {}),
    enabled: true,
    stateDrift: "none",
    triggered: false,
    requiredAction: "continue",
  };

  next.decisions = {
    ...(next.decisions || {}),
    parallelWriteAllowed: true,
    parallelWriteConfirmation: "isolation worktree dispatch by parent Agent",
    coderFileOwnership: `${dispatch.activeSubAgents[0].id}=${dispatch.activeSubAgents[0].filesAssigned.join(",")}`,
    fallbackStrategy: "worktree 不可用、worker 失败或 Quality Gate 不通过时转父 Agent 串行执行",
  };

  return next;
}

function hasUnmergedActiveSubAgents(stateJson) {
  const active = stateJson &&
    stateJson.subAgentDispatch &&
    Array.isArray(stateJson.subAgentDispatch.activeSubAgents)
    ? stateJson.subAgentDispatch.activeSubAgents
    : [];
  return active.some((agent) => agent && agent.mergeStatus !== "merged" && agent.mergeStatus !== "skipped");
}

async function initDispatch(options) {
  const target = options.dispatchSession || "__current__";
  const requestedAgent = String(options.agent || "codex").trim();
  const agent = normalizeDispatchAgent(requestedAgent);
  if (!agent) {
    console.log(`❌ 暂不支持 agent: ${requestedAgent}`);
    console.log(`   支持的 agent: ${Object.keys(DISPATCH_AGENT_CONFIGS).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const agentConfig = DISPATCH_AGENT_CONFIGS[agent];
  const commandTemplate = process.env[agentConfig.env];

  const stateInfo = await resolveStateFileForValidation(target);
  const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
  if (!session || session === "unknown") {
    console.log("❌ 无法确定 dispatch session，请传入 --dispatch <session>");
    process.exitCode = 1;
    return;
  }

  const sessionPaths = getSessionPaths(session);
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath);
  if (!stateJson) {
    console.log(`❌ 缺少或无法解析 state.json: ${toRelative(sessionPaths.sessionStateJsonPath)}`);
    process.exitCode = 1;
    return;
  }
  if (hasUnmergedActiveSubAgents(stateJson)) {
    console.log("❌ 当前 session 存在未合并的 active_sub_agents，不能开始新的 dispatch。");
    console.log("   请先由父 Agent 执行 Quality Gate，将结果 merged/skipped 后移入 sub_agent_history，或进入 reconcile。");
    process.exitCode = 1;
    return;
  }

  const files = parseFileList(options.files);
  if (files.length === 0) {
    console.log("❌ dispatch 需要显式 --files <glob[,glob]> 白名单");
    process.exitCode = 1;
    return;
  }

  const task = options.task || "未指定子任务";
  const agentId = makeAgentId(agent, session);
  const verifyCommand = selectVerifyCommand(stateJson, options.verifyCommand);
  const timeoutSeconds = options.timeoutSeconds || 300;
  const dispatchDir = getDispatchDir(sessionPaths);
  await fs.promises.mkdir(dispatchDir, { recursive: true });
  const promptPath = path.join(dispatchDir, `${agentId}.prompt.md`);
  const resultPath = path.join(dispatchDir, `${agentId}.result.md`);
  if (!options.dryRun && !commandTemplate) {
    console.log(`❌ 未设置 ${agentConfig.env}，无法启动 ${agentConfig.label} worker。`);
    console.log(`   可先手动执行 ${agentConfig.label}，并把结果写入: ${toRelative(resultPath)}`);
    process.exitCode = 1;
    return;
  }

  let worktreeDir = null;
  if (!options.dryRun) {
    try {
      worktreeDir = await createDispatchWorktree(sessionPaths, agentId);
    } catch (error) {
      console.log(`❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
  }
  const workerPrompt = buildWorkerPrompt({
    agent,
    agentId,
    session,
    task,
    files,
    verifyCommand,
    timeoutSeconds,
  });
  await fs.promises.writeFile(promptPath, workerPrompt, "utf8");

  const startedAt = options.dryRun ? null : getIsoTimestamp();
  const activeAgent = {
    id: agentId,
    type: "coder",
    task,
    filesAssigned: files,
    status: options.dryRun ? "planned" : "running",
    failureReason: "无",
    startedAt,
    completedAt: null,
    resultSummary: `prompt=${toRelative(promptPath)}${worktreeDir ? `; worktree=${toRelative(worktreeDir)}` : ""}`,
    mergeStatus: "pending",
    promptFile: toRelative(promptPath),
    resultFile: toRelative(resultPath),
    worktreeDir: worktreeDir ? toRelative(worktreeDir) : null,
  };
  const existingDispatch = getExistingSubAgentDispatch(stateJson);
  const existingHistory = normalizeSubAgentHistory(existingDispatch.subAgentHistory);
  const counters = buildDispatchCounters(existingDispatch, 1);
  const stateMarkdown = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
  const dispatchState = {
    agent,
    task,
    phase: "implement",
    activeBlock: formatActiveSubAgentsBlock([activeAgent]),
    historyBlock: formatSubAgentHistoryBlock(existingHistory),
    activeSubAgents: [activeAgent],
    subAgentHistory: existingHistory,
    dispatchedCount: counters.dispatchedCount,
    completedCount: counters.completedCount,
    failedCount: counters.failedCount,
    lastDispatchRound: counters.lastDispatchRound,
    lastMergeResult: "pending",
    timeoutSeconds,
    dryRun: options.dryRun,
  };

  await writeJsonFileAtomic(
    sessionPaths.sessionStateJsonPath,
    updateStateJsonForDispatch(stateJson, dispatchState),
  );
  await fs.promises.writeFile(
    sessionPaths.sessionStatePath,
    updateDecisionsMarkdownForDispatch(
      updateStateMarkdownForDispatch(stateMarkdown, dispatchState),
      dispatchState,
    ),
    "utf8",
  );

  console.log(`✅ 已准备 ${agentConfig.label} worker dispatch`);
  console.log(`Session: ${session}`);
  console.log(`Agent: ${agent} / ${agentConfig.label}`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Prompt: ${toRelative(promptPath)}`);
  console.log(`Result: ${toRelative(resultPath)}`);
  if (worktreeDir) {
    console.log(`Worktree: ${toRelative(worktreeDir)}`);
  }

  if (options.dryRun) {
    console.log(`Dry run: 未启动外部 ${agentConfig.label}。`);
    console.log(`下一步: 检查 prompt 后，去掉 --dry-run 并配置 ${agentConfig.env} 执行。`);
    return;
  }

  const command = commandTemplate
    .replace(/\{prompt\}/g, promptPath)
    .replace(/\{result\}/g, resultPath)
    .replace(/\{session\}/g, session)
    .replace(/\{agentId\}/g, agentId);
  const result = spawnSync(command, [], {
    cwd: worktreeDir || undefined,
    encoding: "utf8",
    shell: true,
    timeout: timeoutSeconds * 1000,
  });
  let existingAgentResult = "";
  if (await pathExists(resultPath)) {
    existingAgentResult = await fs.promises.readFile(resultPath, "utf8");
  }
  await fs.promises.writeFile(
    resultPath,
    [
      existingAgentResult ? "agent_result：" : "",
      existingAgentResult || "",
      existingAgentResult ? "command_audit：" : "",
      `command：${command}`,
      `exit_code：${result.status}`,
      `signal：${result.signal || "none"}`,
      `error：${result.error ? result.error.message : "none"}`,
      "stdout：",
      result.stdout || "",
      "stderr：",
      result.stderr || "",
    ].join("\n"),
    "utf8",
  );
  const commandFailed = result.status !== 0;
  const finishedStatus = commandFailed ? "failed" : "completed";
  const finishedAgent = {
    ...activeAgent,
    status: finishedStatus,
    failureReason: finishedStatus === "failed"
      ? `exit_code=${result.status || "error"}${result.error ? `; error=${result.error.message}` : ""}`
      : "无",
    completedAt: getIsoTimestamp(),
    resultSummary: `${activeAgent.resultSummary}; result=${toRelative(resultPath)}; exit_code=${result.status}; error=${result.error ? result.error.message : "none"}`,
  };
  const finishedDispatchState = {
    ...dispatchState,
    activeBlock: formatActiveSubAgentsBlock([finishedAgent]),
    activeSubAgents: [finishedAgent],
    completedCount: dispatchState.completedCount + (finishedStatus === "completed" ? 1 : 0),
    failedCount: dispatchState.failedCount + (finishedStatus === "failed" ? 1 : 0),
  };
  const afterRunStateJson = await readJsonFile(sessionPaths.sessionStateJsonPath);
  const afterRunStateMarkdown = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
  await writeJsonFileAtomic(
    sessionPaths.sessionStateJsonPath,
    updateStateJsonForDispatch(afterRunStateJson || stateJson, finishedDispatchState),
  );
  await fs.promises.writeFile(
    sessionPaths.sessionStatePath,
    updateDecisionsMarkdownForDispatch(
      updateStateMarkdownForDispatch(afterRunStateMarkdown, finishedDispatchState),
      finishedDispatchState,
    ),
    "utf8",
  );
  console.log(`${agentConfig.label} exit code: ${result.status}`);
  console.log(`Result: ${toRelative(resultPath)}`);
  if (commandFailed) {
    process.exitCode = result.status || 1;
  }
}

module.exports = {
  DISPATCH_AGENT_CONFIGS,
  buildDispatchCounters,
  buildWorkerPrompt,
  createDispatchWorktree,
  formatActiveSubAgentsBlock,
  formatSubAgentHistoryBlock,
  getDispatchDir,
  getDispatchWorktreeDir,
  hasUnmergedActiveSubAgents,
  initDispatch,
  makeAgentId,
  normalizeDispatchAgent,
  normalizeSubAgentHistory,
  selectVerifyCommand,
  updateDecisionsMarkdownForDispatch,
  updateStateJsonForDispatch,
  updateStateMarkdownForDispatch,
};
