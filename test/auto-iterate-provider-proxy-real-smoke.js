const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "cli.js");
const workerPath = path.join(repoRoot, "scripts", "auto-iterate-openai-worker.js");

function requiredEnvMissing() {
  return ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"].filter((name) => !process.env[name]);
}

function selectedAgents() {
  const raw = process.env.AUTO_ITERATE_PROVIDER_PROXY_AGENTS || "claude,gemini,cursor";
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function makeProject(agent) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), `auto-iterate-provider-proxy-real-${agent}-`));
  fs.writeFileSync(path.join(projectDir, "README.md"), `# ${agent} provider proxy real smoke\n`, "utf8");
  spawnSync("git", ["init"], { cwd: projectDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: projectDir, encoding: "utf8" });
  spawnSync("git", ["add", "README.md"], { cwd: projectDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: projectDir, encoding: "utf8" });
  return projectDir;
}

function ndjson(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function spawnCli(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, "auto-iterate", ...args], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (status, signal) => {
      resolve({
        status: status === null ? 1 : status,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

function templateEnvName(agent) {
  if (agent === "claude") return "AUTO_ITERATE_CLAUDE_CMD";
  if (agent === "gemini") return "AUTO_ITERATE_GEMINI_CMD";
  if (agent === "cursor") return "AUTO_ITERATE_CURSOR_CMD";
  throw new Error(`Unsupported provider-proxy agent: ${agent}`);
}

async function main() {
  const missing = requiredEnvMissing();
  if (missing.length > 0) {
    console.log(`- provider-proxy real smoke skipped: missing ${missing.join(", ")}`);
    return;
  }
  const agents = selectedAgents();
  assert.ok(agents.length > 0, "AUTO_ITERATE_PROVIDER_PROXY_AGENTS did not select any agent");
  for (const agent of agents) {
    const projectDir = makeProject(agent);
    const envName = templateEnvName(agent);
    const result = await spawnCli([
      "--run",
      "--once",
      "--quick",
      "--agent",
      agent,
      "--goal",
      `${agent} provider-proxy real smoke: complete one auto-iterate worker result without editing files`,
      "--session",
      `provider-proxy-real-${agent}`,
      "--json-progress",
      "--validate-cmd",
      `"${process.execPath}" -e "process.exit(0)"`,
    ], {
      cwd: projectDir,
      env: {
        ...process.env,
        [envName]: `"${process.execPath}" "${workerPath}" --prompt "{prompt}" --result "{result}"`,
      },
    });
    assert.strictEqual(result.status, 0, `agent=${agent}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const events = ndjson(result.stdout);
    assert.ok(events.some((event) => event.event === "session_started" && event.agent === agent), agent);
    assert.ok(events.some((event) => event.event === "agent_done" && event.exit_code === 0), agent);
    assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"), agent);
    assert.ok(events.some((event) => event.event === "state_merged"), agent);
    assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "once_completed"), agent);
  }
  console.log(`✓ provider-proxy real smoke passed for ${agents.join(", ")}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
