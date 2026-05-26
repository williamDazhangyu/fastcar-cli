const fs = require("fs");
const path = require("path");

const resultPath = process.argv[2];
if (!resultPath) {
  console.error("missing result path");
  process.exit(1);
}

if (process.env.PIPELINE_WORKER_EXIT_CODE) {
  console.error("fixture worker forced failure");
  process.exit(Number(process.env.PIPELINE_WORKER_EXIT_CODE));
}

if (process.env.PIPELINE_WORKER_SLEEP_MS) {
  const deadline = Date.now() + Number(process.env.PIPELINE_WORKER_SLEEP_MS);
  while (Date.now() < deadline) {
    // Busy wait keeps the fixture dependency-free and lets spawn timeout kill it.
  }
}

function readPromptFocus() {
  const promptPath = process.argv[3] || process.env.PIPELINE_WORKER_PROMPT_PATH || process.env.AUTO_ITERATE_PROMPT_PATH;
  if (!promptPath || !fs.existsSync(promptPath)) {
    return { raw: null, type: null, reqId: null };
  }
  const prompt = fs.readFileSync(promptPath, "utf8");
  const match = prompt.match(/^Focus:\s*(.+)$/m);
  const raw = match ? match[1].trim() : null;
  const [type, ...rest] = String(raw || "").split(":");
  return { raw, type: type || null, reqId: rest.join(":") || null };
}

const changedFile = Object.prototype.hasOwnProperty.call(process.env, "PIPELINE_WORKER_CHANGED_FILE")
  ? process.env.PIPELINE_WORKER_CHANGED_FILE
  : "README.md";
if (process.env.PIPELINE_WORKER_SET_FILE && changedFile) {
  fs.mkdirSync(path.dirname(path.resolve(changedFile)), { recursive: true });
  fs.writeFileSync(changedFile, process.env.PIPELINE_WORKER_SET_FILE, "utf8");
} else if (process.env.PIPELINE_WORKER_WRITE_FILE && changedFile) {
  fs.mkdirSync(path.dirname(path.resolve(changedFile)), { recursive: true });
  fs.appendFileSync(changedFile, process.env.PIPELINE_WORKER_WRITE_FILE, "utf8");
}

const result = {
  status: process.env.PIPELINE_WORKER_STATUS || "completed",
  summary: "fixture worker completed one focus",
  files_changed: changedFile ? [changedFile] : [],
  requirements: [
    {
      id: "REQ-BOOTSTRAP",
      summary: "fixture requirement extracted",
      type: "验证",
      status: process.env.PIPELINE_WORKER_REQ_STATUS || "implemented",
      relatedFiles: ["README.md"],
      evidence: "fixture worker wrote result.json",
      blockedReason: "无",
      nextStep: "继续下一轮",
    },
  ],
  state_patch: {
    currentState: {
      currentTask: "fixture worker task",
    },
  },
  trace: {
    rationaleSummary: "公开推理摘要：fixture 根据本轮 focus 生成最小可验证输出，未记录私有思考链。",
    decisions: [
      { topic: "fixture output", reason: "保持测试可重复", impact: "只影响测试夹具" },
    ],
    evidence: [
      { source: "fixture worker", detail: "写入 result.json" },
    ],
  },
  documentation: {
    apiChanges: ["fixture 未新增真实 API"],
    architectureNotes: ["CLI 负责合并状态，Worker 只提交建议"],
    implementationNotes: ["fixture 生成 trace 和 documentation 字段用于端到端验证"],
    changelogEntries: ["新增自动迭代可追溯摘要与交付文档生成验证"],
  },
  risks: "fixture only",
  blocked_reason: "",
};

if (process.env.PIPELINE_WORKER_MODE_AWARE === "1") {
  const focus = readPromptFocus();
  result.summary = `fixture worker completed ${focus.raw || "unknown"} focus`;
  result.files_changed = [];
  result.requirements = [];
  result.state_patch = {
    currentState: {
      currentTask: `fixture ${focus.raw || "unknown"}`,
    },
  };
  if (focus.type === "reproduce") {
    result.state_patch.hypotheses = [
      { id: "H1", summary: "fixture hypothesis", priority: 1, status: "pending" },
    ];
  }
  if (focus.type === "fix_bug") {
    result.requirements = [
      {
        id: focus.reqId || "REQ-BOOTSTRAP",
        summary: "fixture bug fixed",
        type: "验证",
        status: "passed",
        relatedFiles: ["README.md"],
        evidence: "fixture fix completed and CLI validation passed",
        blockedReason: "无",
        nextStep: "回归检查",
      },
    ];
  }
  if (focus.type === "establish_baseline") {
    result.state_patch.optimizationMetrics = [
      { name: "duration", value: 100, unit: "ms", direction: "lower_is_better", source: "fixture" },
    ];
  }
  if (focus.type === "optimize") {
    result.state_patch.optimizationMetrics = [
      { name: "duration", value: 80, unit: "ms", direction: "lower_is_better", source: "fixture" },
    ];
  }
  if (focus.type === "verify_optimization") {
    result.state_patch.optimizationMetrics = [
      { name: "duration", value: 80, unit: "ms", direction: "lower_is_better", source: "fixture" },
    ];
  }
}

if (process.env.PIPELINE_WORKER_STATE_PATCH) {
  result.state_patch = JSON.parse(process.env.PIPELINE_WORKER_STATE_PATCH);
}

if (result.status === "need_decision") {
  result.decision_request = {
    question: "选择 fixture 方案？",
    options: [
      { id: "A", label: "方案 A" },
      { id: "B", label: "方案 B" },
    ],
    recommended: "A",
  };
}

if (process.env.PIPELINE_WORKER_INVALID_RESULT === "1") {
  fs.writeFileSync(resultPath, "{ invalid json", "utf8");
} else if (process.env.PIPELINE_WORKER_SKIP_RESULT !== "1") {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
