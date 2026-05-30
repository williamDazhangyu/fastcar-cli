const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "cli.js");
const workerPath = path.join(repoRoot, "scripts", "auto-iterate-openai-worker.js");

function makeProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-iterate-provider-proxy-"));
  fs.writeFileSync(path.join(projectDir, "README.md"), "# provider proxy smoke\n", "utf8");
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

function startMockProvider() {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(body),
      });
      const result = {
        status: "completed",
        summary: "provider proxy worker completed one focus",
        focus: null,
        files_changed: [],
        requirements: [
          {
            id: "REQ-BOOTSTRAP",
            summary: "provider proxy smoke requirement",
            type: "验证",
            status: "implemented",
            relatedFiles: ["README.md"],
            evidence: "mock provider returned valid result.json",
            blockedReason: "无",
            nextStep: "继续下一轮",
          },
        ],
        state_patch: {
          currentState: {
            currentTask: "provider proxy smoke",
          },
        },
        risks: "mock provider only",
        blocked_reason: "",
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(result),
            },
          },
        ],
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        requests,
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
      });
    });
  });
}

async function main() {
  const provider = await startMockProvider();
  try {
    const matrix = [
      { agent: "claude", env: "AUTO_ITERATE_CLAUDE_CMD", session: "provider-proxy-claude" },
      { agent: "gemini", env: "AUTO_ITERATE_GEMINI_CMD", session: "provider-proxy-gemini" },
      { agent: "cursor", env: "AUTO_ITERATE_CURSOR_CMD", session: "provider-proxy-cursor" },
    ];
    for (const item of matrix) {
      const projectDir = makeProject();
      const result = await spawnCli([
        "--run",
        "--once",
        "--quick",
        "--agent",
        item.agent,
        "--goal",
        `${item.agent} provider proxy smoke`,
        "--session",
        item.session,
        "--json-progress",
        "--validate-cmd",
        `"${process.execPath}" -e "process.exit(0)"`,
      ], {
        cwd: projectDir,
        env: {
          ...process.env,
          [item.env]: `"${process.execPath}" "${workerPath}" --prompt "{prompt}" --result "{result}"`,
          OPENAI_API_KEY: "test-key",
          OPENAI_BASE_URL: provider.baseUrl,
          OPENAI_MODEL: "mock-model",
        },
      });
      assert.strictEqual(result.status, 0, `agent=${item.agent}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      const events = ndjson(result.stdout);
      assert.ok(events.some((event) => event.event === "session_started" && event.agent === item.agent));
      assert.ok(events.some((event) => event.event === "agent_done" && event.exit_code === 0));
      assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));
      assert.ok(events.some((event) => event.event === "state_merged"));
      assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "once_completed"));
    }
    assert.strictEqual(provider.requests.length, 3);
    assert.ok(provider.requests.every((request) => request.url === "/v1/chat/completions"));
    assert.ok(provider.requests.every((request) => request.authorization === "Bearer test-key"));
    assert.ok(provider.requests.every((request) => request.body.model === "mock-model"));
    console.log("✓ provider-proxy smoke covers claude/gemini/cursor env-template HTTP worker");
  } finally {
    await new Promise((resolve) => provider.server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
