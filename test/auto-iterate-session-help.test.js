const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");
const {
  buildAutoIterateHelp,
  LEGACY_DISPATCH_AGENTS,
  showAutoIterateHelp,
} = require("../dist/auto-iterate/sessionHelp");
const { FLAG_REGISTRY } = require("../dist/pipeline/flags");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.log = original;
  }
}

test("buildAutoIterateHelp renders major command groups and flags", () => {
  const help = buildAutoIterateHelp();

  assert(help.startsWith("Usage: fastcar-cli auto-iterate [options]"));
  for (const section of ["Modes:", "Session:", "Legacy dispatch (deprecated):", "Legacy CLI pipeline (deprecated):", "Skill Capture:", "Other:"]) {
    assert(help.includes(section), `missing ${section}`);
  }
  for (const flag of [
    "Native sub-agent flow (default):",
    'Main Agent reads the auto-iterate skill/state, dispatches Agent(subagent_type="coder"),',
    "validates the result with deterministic Node runner facts, then merges state.",
    "CLI can optionally create a resumable session skeleton for this flow.",
    "Protocol-only LLM flow:",
    'fastcar-cli auto-iterate --quick --goal "<goal>" --session <session> --yes --no-run',
    "The current LLM follows auto-iterate techniques without dispatching native subagents.",
    "--strict",
    "--quick",
    "--diagnose|--debug",
    "--optimize|--optimise",
    "--prototype|--proto",
    "--validate-state [session|state.md|state.json]",
    "--strict-state|--strict-validate|--strict-validation",
    "--dispatch <session>",
    "--verify-command|--verify-cmd <cmd>",
    "--run --once [--json-progress] (legacy compatibility only)",
    "--inactivity-timeout <seconds>",
    "--validation-timeout <seconds>",
    "--scope <glob[,glob]>",
    "--validate-cmd <cmd>  legacy/deprecated pipeline 独立验证命令，可重复传入；不同于 dispatch 的 --verify-command/--verify-cmd",
    "--no-run  protocol-only LLM execution; do not dispatch native subagent or legacy Worker pipeline",
    "--capture-skills <session> [--yes]",
    "-f, --from <file>",
    "--max-iterations|--max <n>",
    "--autopilot-max-iterations|--autopilot-max <n>",
    "--yes|-y|--non-interactive  non-interactive session creation",
    "--examples [keyword]",
    "--query <keyword>",
  ]) {
    assert(help.includes(flag), `missing ${flag}`);
  }
});

test("buildAutoIterateHelp reflects supported dispatch agents", () => {
  const help = buildAutoIterateHelp();
  const supportedAgents = LEGACY_DISPATCH_AGENTS.join("|");

  assert(help.includes(`--agent <${supportedAgents}>`));
  assert(help.includes("codex|claude|gemini"));
  assert(help.includes("openhands|replit"));
});

test("buildAutoIterateHelp includes registry-backed flag help", () => {
  const help = buildAutoIterateHelp();
  for (const info of Object.values(FLAG_REGISTRY)) {
    if (info.help) {
      assert(help.includes(info.help), `missing registry help ${info.help}`);
    }
  }
});

test("showAutoIterateHelp prints the built help text", () => {
  const { lines } = captureConsole(() => showAutoIterateHelp());

  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0], buildAutoIterateHelp());
});

test("CLI --help uses the extracted help renderer", () => {
  const cliPath = path.join(__dirname, "..", "bin", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, "auto-iterate", "--help"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout.trimEnd(), buildAutoIterateHelp().trimEnd());
});

(async () => {
  let passed = 0;
  for (const item of cases) {
    try {
      await item.fn();
      passed += 1;
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  if (process.exitCode !== 1) {
    console.log(`\n${passed} test(s) passed.`);
  }
})();
