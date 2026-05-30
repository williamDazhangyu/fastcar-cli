const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fillTemplate, runTemplateAdapter } = require("../dist/src/adapters/template");
const { getAdapter } = require("../dist/src/adapters");
const { resolveCommand, runNativeCommand, runNativeCommandAsync } = require("../dist/src/adapters/commandResolver");
const { buildCodexWorkerPrompt, extractJsonObject, resolveWindowsNativeCodex } = require("../dist/src/adapters/codex");
const { resolveCursorCommand, runCursorAdapter } = require("../dist/src/adapters/cursor");
const { buildKimiPrompt } = require("../dist/src/adapters/kimi");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("TemplateAdapter 填充 prompt/result/session/iteration", () => {
  const command = fillTemplate("node worker.js {prompt} {result} {session} {iteration}", {
    prompt: "p.md",
    result: "r.json",
    session: "s",
    iteration: 3,
  });
  assert.strictEqual(command, "node worker.js p.md r.json s 3");
});

test("Codex 专用适配器在无 env 时使用 native command", () => {
  const adapter = getAdapter("codex", {});
  assert.strictEqual(adapter.id, "codex");
  assert.strictEqual(adapter.commandTemplate, undefined);
  assert.ok(adapter.run);
});

test("Codex adapter 生成受限 Worker prompt，避免触发 Router/skill 全量流程", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-codex-prompt-"));
  const promptPath = path.join(dir, "prompt.md");
  const resultPath = path.join(dir, "result.json");
  fs.writeFileSync(promptPath, [
    "Mode: quick",
    "Focus: extract_requirements:REQ-BOOTSTRAP",
    "Focus summary: extract requirements",
    "Result path: relative/result.json",
    "Hard rules:",
    "- Use the auto-iterate-coding skill",
  ].join("\n"), "utf8");
  const prompt = buildCodexWorkerPrompt({ promptPath, resultPath });
  assert.ok(prompt.includes("restricted single-step auto-iterate Worker"));
  assert.ok(prompt.includes("Do not read AGENTS.md"));
  assert.ok(prompt.includes("Do not run commands"));
  assert.ok(prompt.includes("relative/result.json"));
  assert.ok(prompt.includes('"status": "completed"'));
  assert.ok(!prompt.includes("Use the auto-iterate-coding skill"));
});

test("native prompt adapters 对缺失 prompt 文件返回结构化诊断", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-missing-prompt-"));
  const promptPath = path.join(dir, "missing-prompt.md");
  const resultPath = path.join(dir, "result.json");

  for (const build of [
    () => buildCodexWorkerPrompt({ promptPath, resultPath }),
    () => buildKimiPrompt({ promptPath, resultPath }),
    () => runCursorAdapter({ promptPath, cwd: dir, resultPath }),
  ]) {
    assert.throws(build, (error) => {
      assert.strictEqual(error.reason, "prompt_file_missing");
      assert.strictEqual(error.path, promptPath);
      assert.ok(String(error.message).includes("prompt_file_missing"));
      return true;
    });
  }
});

test("Codex adapter 可从最终消息中提取 JSON 兜底写 result", () => {
  const json = extractJsonObject([
    "worker result:",
    "```json",
    "{\"status\":\"completed\",\"summary\":\"ok\",\"files_changed\":[]}",
    "```",
  ].join("\n"));
  assert.strictEqual(json, "{\"status\":\"completed\",\"summary\":\"ok\",\"files_changed\":[]}");
});

test("Kimi 专用适配器在无 env 时使用 native command", () => {
  const adapter = getAdapter("kimi", {});
  assert.strictEqual(adapter.id, "kimi");
  assert.strictEqual(adapter.commandTemplate, undefined);
  assert.ok(adapter.run);
});

test("Kimi adapter 配置 UTF-8 Python 环境以避免 Windows GBK 输出失败", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "kimi.ts"), "utf8");
  assert.ok(source.includes("PYTHONIOENCODING"));
  assert.ok(source.includes("PYTHONUTF8"));
});

test("Kimi adapter 限制 headless 单轮步数并关闭 thinking 以便 Worker 写完即退", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "kimi.ts"), "utf8");
  assert.ok(source.includes("--no-thinking"));
  assert.ok(source.includes("--max-steps-per-turn"));
  assert.ok(source.includes("--max-ralph-iterations"));
  assert.ok(source.includes("--agent-file"));
});

test("Kimi 受限 Worker agent 禁用 subagent 和 shell 工具", () => {
  const agent = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "kimi-worker-agent.yaml"), "utf8");
  assert.ok(agent.includes("kimi_cli.tools.file:ReadFile"));
  assert.ok(agent.includes("kimi_cli.tools.file:WriteFile"));
  assert.ok(!agent.includes("kimi_cli.tools.agent:Agent"));
  assert.ok(!agent.includes("kimi_cli.tools.shell:Shell"));
});

test("Kimi adapter 生成短 prompt，避免读取仓库触发完整 Router 协议", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-kimi-prompt-"));
  const promptPath = path.join(dir, "prompt.md");
  const resultPath = path.join(dir, "result.json");
  fs.writeFileSync(promptPath, [
    "Mode: quick",
    "Focus: extract_requirements:REQ-BOOTSTRAP",
    "Focus summary: extract requirements",
    "Result path: relative/result.json",
  ].join("\n"), "utf8");
  const prompt = buildKimiPrompt({ promptPath, resultPath });
  assert.ok(prompt.includes(resultPath));
  assert.ok(prompt.includes("Do not inspect the repository"));
  assert.ok(prompt.includes('"status": "completed"'));
  assert.ok(prompt.includes('"id": "REQ-BOOTSTRAP"'));
  assert.ok(!prompt.includes("Write JSON to the result path with this schema"));
});

test("Claude/Gemini/Cursor 专用适配器在无 env 时使用 native command", () => {
  ["claude", "gemini", "cursor"].forEach((name) => {
    const adapter = getAdapter(name, {});
    assert.strictEqual(adapter.id, name);
    assert.strictEqual(adapter.commandTemplate, undefined);
    assert.ok(adapter.run);
  });
});

test("Cursor adapter 支持官方 Cursor Agent 的 agent/cursor-agent 二进制", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "cursor.ts"), "utf8");
  assert.ok(source.includes('"agent"'));
  assert.ok(source.includes('"cursor-agent"'));
  assert.ok(source.includes("--print"));
  assert.ok(source.includes("--trust"));
  assert.strictEqual(typeof resolveCursorCommand().command, "string");
});

test("env command template 优先于专用适配器", () => {
  const adapter = getAdapter("codex", {
    AUTO_ITERATE_CODEX_CMD: `node ${path.join("worker.js")} {result}`,
  });
  assert.strictEqual(adapter.commandTemplate, "node worker.js {result}");
});

test("commandResolver 使用 which 解析 PATH/PATHEXT 可执行文件", () => {
  const resolved = resolveCommand("node");
  assert.strictEqual(typeof resolved, "string");
  assert.ok(resolved.length > 0);
  assert.notStrictEqual(resolved, "node");
});

test("commandResolver 通过 cross-spawn 运行 Windows 带空格路径的 cmd shim", () => {
  if (process.platform !== "win32") {
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar shim "));
  const shim = path.join(dir, "worker shim.cmd");
  fs.writeFileSync(shim, "@echo off\r\necho shim:%1:%2\r\n", "utf8");
  const result = runNativeCommand(shim, ["alpha", "beta gamma"], {
    cwd: dir,
    timeoutMs: 10000,
  });
  assert.strictEqual(result.status, 0, result.stderr || result.error);
  assert.ok(result.stdout.includes("shim:"));
  assert.ok(result.stdout.includes("alpha"));
  assert.ok(result.stdout.includes("beta gamma"));
});

test("commandResolver 对所有 spawn 路径启用 windowsHide", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "commandResolver.ts"), "utf8");
  const matches = source.match(/windowsHide:\s*true/g) || [];
  assert.ok(matches.length >= 3);
});

test("Codex adapter 在 Windows 可解析 native exe 或安全降级", () => {
  const resolved = resolveWindowsNativeCodex();
  if (process.platform !== "win32") {
    assert.strictEqual(resolved, null);
    return;
  }
  if (resolved !== null) {
    assert.ok(resolved.endsWith("codex.exe"));
    assert.ok(fs.existsSync(resolved));
  }
});

test("native Worker adapters 避免 detached console 并透传输出进度回调", () => {
  const files = ["codex.ts", "kimi.ts", "claude.ts", "gemini.ts", "cursor.ts"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", file), "utf8");
    assert.ok(!source.includes("detached: true"), `${file} must not detach worker process`);
    assert.ok(source.includes("buildRunOptions(options"), `${file} must use shared run option forwarding`);
  }
});

test("native Worker adapters 统一透传 timeout policy 选项", () => {
  const helper = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "runOptions.ts"), "utf8");
  for (const expected of [
    "timeoutMs",
    "inactivityTimeoutMs",
    "warnBeforeMs",
    "graceKillMs",
    "timeoutWarningPath",
    "onOutput",
  ]) {
    assert.ok(helper.includes(`${expected}: options.${expected}`), `runOptions must forward ${expected}`);
  }

  const files = ["template.ts", "codex.ts", "kimi.ts", "claude.ts", "gemini.ts", "cursor.ts"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", file), "utf8");
    assert.ok(source.includes("./runOptions"), `${file} must import shared run options`);
    assert.ok(source.includes("buildRunOptions(options"), `${file} must forward timeout policy through helper`);
  }
});

test("runNativeCommandAsync 超时后返回 timedOut", async () => {
  const result = await runNativeCommandAsync(process.execPath, [
    "-e",
    "setTimeout(()=>{}, 5000)",
  ], {
    cwd: process.cwd(),
    detached: true,
    killOnTimeout: false,
    timeoutMs: 300,
  });
  assert.strictEqual(result.status, 1);
  assert.strictEqual(result.timedOut, true);
});

test("runNativeCommandAsync 写入 timeout warning 并支持关闭 wall-clock timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-timeout-warning-"));
  const warningPath = path.join(dir, "timeout-warning.json");
  const events = [];
  const timedOut = await runNativeCommandAsync(process.execPath, [
    "-e",
    "setTimeout(()=>{}, 5000)",
  ], {
    cwd: dir,
    timeoutMs: 250,
    warnBeforeMs: 200,
    graceKillMs: 10,
    timeoutWarningPath: warningPath,
    onOutput(event) {
      events.push(event);
    },
  });
  assert.strictEqual(timedOut.status, 1);
  assert.strictEqual(timedOut.timedOut, true);
  assert.ok(fs.existsSync(warningPath));
  assert.ok(events.some((event) => event.event === "worker_timeout_warning"));

  const disabled = await runNativeCommandAsync(process.execPath, [
    "-e",
    "setTimeout(()=>process.exit(0), 100)",
  ], {
    cwd: dir,
    timeoutMs: 0,
  });
  assert.strictEqual(disabled.status, 0, disabled.stderr || disabled.error);
  assert.strictEqual(disabled.timedOut, false);

  const explicitDisabled = await runNativeCommandAsync(process.execPath, [
    "-e",
    "setTimeout(()=>process.exit(0), 100)",
  ], {
    cwd: dir,
    timeout: 10,
    timeoutMs: 0,
  });
  assert.strictEqual(explicitDisabled.status, 0, explicitDisabled.stderr || explicitDisabled.error);
  assert.strictEqual(explicitDisabled.timedOut, false);
});

test("runNativeCommandAsync 同时触发 wall 与 inactivity timeout 时只终止一次", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-timeout-once-"));
  const warningPath = path.join(dir, "timeout-warning.json");
  const result = await runNativeCommandAsync(process.execPath, [
    "-e",
    "setTimeout(()=>{}, 5000)",
  ], {
    cwd: dir,
    timeoutMs: 180,
    inactivityTimeoutMs: 180,
    warnBeforeMs: 0,
    graceKillMs: 120,
    timeoutWarningPath: warningPath,
  });
  assert.strictEqual(result.status, 1);
  assert.strictEqual(result.timedOut, true);
  const warning = JSON.parse(fs.readFileSync(warningPath, "utf8"));
  assert.strictEqual(warning.event, "timeout_kill");
  assert.match(warning.reason, /timed out/);
});

test("runNativeCommandAsync 在 result 已就绪后不会被超时竞态误杀", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-result-ready-"));
  const promptPath = path.join(dir, "prompt.md");
  const resultPath = path.join(dir, "result.json");
  const ready = await runNativeCommandAsync(process.execPath, [
    "-e",
    `const fs=require("fs");const path=${JSON.stringify(resultPath)};setTimeout(()=>fs.writeFileSync(path, JSON.stringify({status:"completed",summary:"ok",files_changed:[],requirements:[]}), "utf8"), 50);setTimeout(()=>{}, 5000);`,
  ], {
    cwd: dir,
    timeoutMs: 400,
    inactivityTimeoutMs: 400,
    warnBeforeMs: 0,
    graceKillMs: 10,
    resultPath,
    stopWhenResultValid(candidatePath) {
      return Boolean(candidatePath && fs.existsSync(candidatePath));
    },
  });
  assert.strictEqual(ready.status, 0, ready.stderr || ready.error);
  assert.strictEqual(ready.timedOut, false);
});

test("Worker 集成矩阵：TemplateAdapter 覆盖命令成功、非零退出和超时", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-template-"));
  const ok = runTemplateAdapter({
    commandTemplate: `"${process.execPath}" -e "console.log('ok')" {result}`,
    cwd: dir,
    resultPath: "result.json",
    promptPath: "prompt.md",
    session: "s",
    iteration: 1,
    timeoutMs: 10000,
  });
  assert.strictEqual(ok.status, 0, ok.stderr || ok.error);
  assert.ok(ok.stdout.includes("ok"));

  const failed = runTemplateAdapter({
    commandTemplate: `"${process.execPath}" -e "process.exit(7)"`,
    cwd: dir,
    resultPath: "result.json",
    promptPath: "prompt.md",
    session: "s",
    iteration: 1,
    timeoutMs: 10000,
  });
  assert.strictEqual(failed.status, 7);

  const timedOut = runTemplateAdapter({
    commandTemplate: `"${process.execPath}" -e "setTimeout(()=>{}, 5000)"`,
    cwd: dir,
    resultPath: "result.json",
    promptPath: "prompt.md",
    session: "s",
    iteration: 1,
    timeoutMs: 300,
  });
  assert.strictEqual(timedOut.timedOut, true);
});

async function main() {
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`✗ ${item.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${tests.length} test(s) passed.`);
}

main();
