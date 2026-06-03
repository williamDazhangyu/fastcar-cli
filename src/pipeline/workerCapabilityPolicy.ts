import {
  languageCode,
} from "./language";
import type {
  BuildIterationPromptContext,
  LanguageCode,
  LanguageInfo,
  PipelineFocus,
} from "./types";

type WorkerPolicyLanguage = LanguageInfo | LanguageCode | string | undefined;

export interface WorkerCapabilityPolicyContext {
  mode?: string;
  focus?: PipelineFocus;
  resultPath?: string;
  sourceChecklist?: unknown;
  writeScope?: unknown;
  scope?: unknown;
  allowModify?: boolean;
  language?: WorkerPolicyLanguage;
}

export interface WorkerCapabilityPolicy {
  sourceFiles: string[];
  sourceContent: string;
  read: {
    allowed: string[];
    forbidden: string[];
  };
  write: {
    allowed: string[];
    forbidden: string[];
  };
  execute: {
    allowed: string[];
    forbidden: string[];
  };
  decision: {
    allowed: string[];
    forbidden: string[];
  };
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeList(value: unknown): string[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map(String);
}

function extractSourceChecklist(value: unknown): { path: string; content: string } {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as { path?: unknown; content?: unknown }
    : null;
  return {
    path: nonEmptyString(source ? source.path : ""),
    content: nonEmptyString(source ? source.content : ""),
  };
}

function isReadOnlyMode(ctx: WorkerCapabilityPolicyContext): boolean {
  return ctx.mode === "plan" || (ctx.mode === "verify" && !ctx.allowModify);
}

export function resolveWorkerSourceFiles(ctx: WorkerCapabilityPolicyContext): string[] {
  const source = extractSourceChecklist(ctx.sourceChecklist);
  if (source.path) {
    return [source.path];
  }
  return normalizeList(ctx.writeScope || ctx.scope);
}

export function getWorkerSourceContent(ctx: WorkerCapabilityPolicyContext): string {
  return extractSourceChecklist(ctx.sourceChecklist).content;
}

export function buildWorkerCapabilityPolicy(ctx: WorkerCapabilityPolicyContext): WorkerCapabilityPolicy {
  const lang = languageCode(ctx.language);
  const sourceFiles = resolveWorkerSourceFiles(ctx);
  const sourceContent = getWorkerSourceContent(ctx);
  const resultPath = nonEmptyString(ctx.resultPath) || "result.json";
  const readAllowed = lang === "en"
    ? [
        "the current Worker task contract/prompt",
        ...sourceFiles.map((item) => `explicit Source input: ${item}`),
        "project files directly required by the current focus",
        "files inside Allowed file scope when needed for the current focus",
      ]
    : [
        "当前 Worker task contract / prompt",
        ...sourceFiles.map((item) => `显式 Source input：${item}`),
        "当前 focus 直接需要的项目文件",
        "当前 focus 需要时可读取 Allowed file scope 内文件",
      ];
  const writeAllowed = isReadOnlyMode(ctx)
    ? [lang === "en" ? `only the exact result JSON file: ${resultPath}` : `只能写精确的 result JSON 文件：${resultPath}`]
    : [
        lang === "en" ? `the exact result JSON file: ${resultPath}` : `精确的 result JSON 文件：${resultPath}`,
        lang === "en"
          ? "project files required by the current focus and allowed by mode/scope/write guard"
          : "当前 focus 需要且被 mode/scope/write guard 允许的项目文件",
      ];
  return {
    sourceFiles,
    sourceContent,
    read: {
      allowed: readAllowed,
      forbidden: lang === "en"
        ? [
            "AGENTS.md, skills, or platform instruction files",
            ".agent-state files other than the current Worker prompt/contract and exact result path",
            "unrelated repository areas not needed for this focus",
          ]
        : [
            "AGENTS.md、skills 或平台指令文件",
            "除当前 Worker prompt/contract 和精确 result path 以外的 .agent-state 文件",
            "本轮 focus 不需要的无关仓库区域",
          ],
    },
    write: {
      allowed: writeAllowed,
      forbidden: lang === "en"
        ? [
            "state.json, state.md, auto-iterate-current.json, start-prompt.md, or any other session authority file",
            "AGENTS.md, skills, or platform instruction files",
            "out-of-scope project files; CLI write guard will audit actual git diff",
            "source inputs unless they are also inside the allowed write scope and the focus requires editing them",
          ]
        : [
            "state.json、state.md、auto-iterate-current.json、start-prompt.md 或其它 session 权威文件",
            "AGENTS.md、skills 或平台指令文件",
            "scope 外项目文件；CLI write guard 会审计真实 git diff",
            "Source inputs 本身；除非它也在允许写范围内且本轮 focus 明确需要编辑它",
          ],
    },
    execute: {
      allowed: lang === "en"
        ? ["no commands by default; the CLI runs validation and authoritative checks"]
        : ["默认不运行命令；CLI 负责验证和权威检查"],
      forbidden: lang === "en"
        ? [
            "validation, build, test, install, migration, network, or destructive commands unless a future explicit policy enables them",
          ]
        : [
            "验证、构建、测试、安装、迁移、网络或破坏性命令；除非未来显式 policy 开启",
          ],
    },
    decision: {
      allowed: lang === "en"
        ? [
            "write requirements, allowed state_patch fields, trace, documentation, risks, and decision_request",
            "mark requirement status no stronger than implemented unless CLI validation later confirms passed",
          ]
        : [
            "写入 requirements、允许的 state_patch 字段、trace、documentation、risks 和 decision_request",
            "需求状态最高只能推进到 implemented；passed 由后续 CLI validation 确认",
          ],
      forbidden: lang === "en"
        ? [
            "decrement budgets, merge state, choose the next focus, finalize delivery, or decide whole-task completion",
            "claim real validation that the Worker did not run",
          ]
        : [
            "递减预算、合并 state、选择下一轮 focus、最终交付或决定整体完成",
            "声称 Worker 未实际运行过的真实验证",
          ],
    },
  };
}

export function buildSourceInputsSection(ctx: BuildIterationPromptContext): string[] {
  const lang = languageCode(ctx.language);
  const policy = buildWorkerCapabilityPolicy(ctx);
  const lines = lang === "en"
    ? [
        "Source inputs:",
        ...policy.sourceFiles.map((item) => `- Explicit source/target file: ${item}`),
      ]
    : [
        "Source inputs:",
        ...policy.sourceFiles.map((item) => `- 显式来源/目标文件：${item}`),
      ];
  if (policy.sourceContent) {
    lines.push(
      lang === "en" ? "Original checklist document:" : "原始清单文档：",
      "```markdown",
      policy.sourceContent,
      "```",
    );
  } else if (policy.sourceFiles.length > 0) {
    lines.push(lang === "en"
      ? "If the focus is extract_requirements, read the explicit source/target file above before writing result.json."
      : "如果本轮 focus 是 extract_requirements，写 result.json 前必须先读取上面的显式来源/目标文件。");
  }
  return lines;
}

function formatPolicyGroup(title: string, items: string[]): string[] {
  return [
    `${title}:`,
    ...items.map((item) => `- ${item}`),
  ];
}

export function buildWorkerCapabilitySection(ctx: WorkerCapabilityPolicyContext): string[] {
  const lang = languageCode(ctx.language);
  const policy = buildWorkerCapabilityPolicy(ctx);
  if (lang === "en") {
    return [
      "Worker capability boundary:",
      ...formatPolicyGroup("Read allowed", policy.read.allowed),
      ...formatPolicyGroup("Read forbidden", policy.read.forbidden),
      ...formatPolicyGroup("Write allowed", policy.write.allowed),
      ...formatPolicyGroup("Write forbidden", policy.write.forbidden),
      ...formatPolicyGroup("Execute allowed", policy.execute.allowed),
      ...formatPolicyGroup("Execute forbidden", policy.execute.forbidden),
      ...formatPolicyGroup("Decision allowed", policy.decision.allowed),
      ...formatPolicyGroup("Decision forbidden", policy.decision.forbidden),
    ];
  }
  return [
    "Worker capability boundary:",
    ...formatPolicyGroup("允许读取", policy.read.allowed),
    ...formatPolicyGroup("禁止读取", policy.read.forbidden),
    ...formatPolicyGroup("允许写入", policy.write.allowed),
    ...formatPolicyGroup("禁止写入", policy.write.forbidden),
    ...formatPolicyGroup("允许执行", policy.execute.allowed),
    ...formatPolicyGroup("禁止执行", policy.execute.forbidden),
    ...formatPolicyGroup("允许决策", policy.decision.allowed),
    ...formatPolicyGroup("禁止决策", policy.decision.forbidden),
  ];
}

export function sanitizeWorkerTaskContract(prompt: string): string {
  return String(prompt || "")
    .split(/\r?\n/)
    .filter((line) => !/auto-iterate-coding skill|Use the auto-iterate-coding skill/i.test(line))
    .join("\n");
}

export function buildRestrictedWorkerAdapterPrompt(input: {
  workerPrompt: string;
  resultPath: string;
  adapterLabel?: string;
}): string {
  const workerPrompt = sanitizeWorkerTaskContract(input.workerPrompt);
  const resultPath = input.resultPath || "result.json";
  const adapterLabel = input.adapterLabel || "Agent";
  return [
    `You are a restricted single-step auto-iterate Worker running under ${adapterLabel}, not the Router.`,
    "Follow the Worker task contract below exactly, including Source inputs, capability boundary, and focus-specific rules.",
    "You may read project files allowed by the Worker capability boundary; do not read forbidden instruction/state files.",
    "Do not start or continue the auto-iterate Router protocol.",
    "Do not run commands or validation; CLI validation remains authoritative.",
    "Write exactly one JSON file to the result path, then stop immediately.",
    "VIOLATION: Writing any file other than the result path or policy-allowed project files will cause the pipeline to fail.",
    "NEVER write to state.json, state.md, .agent-state/auto-iterate-current.json, or start-prompt.md.",
    `Result path: ${resultPath}`,
    "After writing result.json: STOP. Do not inspect the result. Do not write anything else.",
    "",
    "Worker task contract:",
    "```text",
    workerPrompt,
    "```",
  ].join("\n");
}
