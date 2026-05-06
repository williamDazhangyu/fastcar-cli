const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");

const STATE_DIR = ".agent-state";
const STATE_FILE = "auto-iterate-coding.md";
const PROMPT_FILE = "auto-iterate-start-prompt.md";

function parseArgs(args = []) {
  const options = {
    from: null,
  };

  const fromIndex = args.findIndex((arg) => arg === "-f" || arg === "--from");
  if (fromIndex !== -1 && args[fromIndex + 1]) {
    options.from = args[fromIndex + 1];
  }

  return options;
}

function normalizeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatList(value, fallback = "未指定") {
  const lines = normalizeLines(value);
  if (lines.length === 0) {
    return fallback;
  }
  return lines.map((line) => `- ${line}`).join("\n");
}

function formatNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validatePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return true;
  }
  return "请输入大于 0 的整数";
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readChecklistFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const stat = await fs.promises.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`清单路径不是文件: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    content: await fs.promises.readFile(resolvedPath, "utf8"),
  };
}

function buildStateContent(answers) {
  const sourceChecklist = answers.sourceChecklist
    ? `\n## Source Checklist\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";

  return `# Auto Iterate Coding State
${sourceChecklist}

## Task
用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

兼容性约束：
${formatList(answers.compatibility)}

## Budgets
max_iterations：${answers.maxIterations}
autopilot_max_iterations：${answers.autopilotMaxIterations}
implementation_iterations_used：0
optimization_iterations_used：0
remaining_implementation_iterations：${answers.autopilotMaxIterations}
remaining_optimization_iterations：未开始

## Current State
当前阶段：启动前
任务规模：auto
Autopilot：true
完整任务清单：待从成功标准和原始清单提取
已完成任务：无
当前任务：先提取 Requirement Coverage Matrix
剩余任务：所有需求
整体完成状态：in_progress
最近修改：无
关键文件：未探索
最近验证命令：未运行
最近验证结果：未运行
首个关键失败信号：无
未验证项：全部成功标准尚未验证
需要用户决策：无

## Requirement Coverage Matrix
REQ-BOOTSTRAP：
原文摘要：启动后必须先从用户目标、成功标准和原始清单文档提取完整 Requirement Coverage Matrix
类型：验证
状态：pending
相关文件：.agent-state/auto-iterate-coding.md
验证证据：无
阻塞原因：无
下一步：读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现前更新本矩阵

## Definition of Done
${normalizeLines(answers.successCriteria)
  .map((line, index) => `成功标准 ${index + 1}：not_verified - ${line}`)
  .join("\n") || "成功标准 1：not_verified - 未指定"}
真实验证：未运行
沙箱验证：未运行
未验证项：全部成功标准尚未验证
Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending
剩余风险：尚未开始实现

## Decisions
已确认的架构决策：未确认，优先从现有代码和脚手架推断
已确认的产品行为：以本文件成功标准为准
已确认的接口兼容性：
${formatList(answers.compatibility)}
用户提供的限制：
${formatList(answers.constraints)}

## Hypotheses
已排除假设：无
当前主要假设：可以通过现有项目结构和验证命令完成垂直切片实现
下一步最小动作：读取项目结构、现有实现、测试脚本和验证命令

## Validation
已通过验证：无
失败验证：无
未运行验证及原因：尚未开始
沙箱验证：无
可运行的验证命令：
${formatList(answers.validationCommands)}

## Context Handoff Summary
目标：${answers.goal || "未指定"}
当前状态：启动前，等待 Agent 读取状态并开始探索
已完成：CLI 已生成初始状态和启动提示
当前失败：无
已验证命令：未运行
已排除假设：无
当前假设：可以先建立 feedback loop 再实现
下一步：先提取 Requirement Coverage Matrix，再读取当前代码和验证命令，制定垂直切片计划
禁止事项：不要伪造验证，不要泄露或写入密钥，不要破坏兼容性约束
剩余预算：实现迭代 ${answers.autopilotMaxIterations} / 普通预算 ${answers.maxIterations}

## Resume Prompt
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
`;
}

function buildPromptContent(answers) {
  const sourceChecklist = answers.sourceChecklist
    ? `\n原始清单文档：\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";

  return `# Auto Iterate Coding Start Prompt

将下面内容发给 Agent，用于启动本项目的 Autopilot 自动迭代开发。

\`\`\`text
请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。

上下文与状态管理：
请不要依赖历史对话作为唯一上下文。
如果存在 .agent-state/auto-iterate-coding.md，请先读取它作为任务恢复状态。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要更新 .agent-state/auto-iterate-coding.md。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。

需求覆盖要求：
如果需求来自长文档、PRD、issue 列表或多条清单，请先从原文提取 Requirement Coverage Matrix。
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。

AI 实现流程清单：
${sourceChecklist}

用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

需要保持兼容的接口、命令或行为：
${formatList(answers.compatibility)}

可运行的验证命令：
${formatList(answers.validationCommands)}

外部资源、密钥、数据库、网络或沙箱限制：
${formatList(answers.constraints)}

交付格式：
${answers.deliveryFormat}

迭代预算：
max_iterations = ${answers.maxIterations}
autopilot_max_iterations = ${answers.autopilotMaxIterations}

确认后请直接开始自动化开发。中间只汇报关键进展；除非遇到必须由我决策的问题，否则不要停下来问我。
\`\`\`
`;
}

async function promptAutoIterateConfig() {
  return inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "用户目标:",
      validate: (value) => Boolean(value && value.trim()) || "请输入用户目标",
    },
    {
      type: "editor",
      name: "successCriteria",
      message: "成功标准（每行一条）:",
      validate: (value) =>
        normalizeLines(value).length > 0 || "请至少输入一条成功标准",
    },
    {
      type: "editor",
      name: "nonGoals",
      message: "非目标（每行一条，可留空）:",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许修改范围:",
      default: "与本次需求直接相关的代码、测试、类型和文档",
    },
    {
      type: "editor",
      name: "compatibility",
      message: "需要保持兼容的接口、命令或行为（每行一条，可留空）:",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "可运行的验证命令（每行一条）:",
      default: "npm test\nnpm run build\nnpm run typecheck",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
      default:
        "不要连接生产数据库\n不要写入密钥、token、密码或连接串\n不要新增依赖，除非先说明原因并等待确认",
    },
    {
      type: "input",
      name: "deliveryFormat",
      message: "交付格式:",
      default:
        "最终输出实现总结、关键修改、Requirement Coverage Matrix、Definition of Done、验证证据、未验证项、剩余需求、风险、验收建议，以及 .agent-state/auto-iterate-coding.md 的最终状态摘要。",
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: "100",
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, 100),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: "20",
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, 20),
    },
  ]);
}

async function promptAutoIterateConfigFromFile(source) {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "用户目标摘要（用于状态索引，原始清单会完整保留）:",
      default: "见原始清单文档",
    },
    {
      type: "editor",
      name: "successCriteria",
      message: "成功标准摘要（每行一条；可从清单中提炼，原始清单会完整保留）:",
      default: "以原始清单文档为准",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许修改范围:",
      default: "以原始清单文档为准；未明确时仅修改与本次需求直接相关的代码、测试、类型和文档",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "可运行的验证命令（每行一条）:",
      default: "npm test\nnpm run build\nnpm run typecheck",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
      default:
        "不要连接生产数据库\n不要写入密钥、token、密码或连接串\n不要新增依赖，除非先说明原因并等待确认",
    },
    {
      type: "input",
      name: "deliveryFormat",
      message: "交付格式:",
      default:
        "最终输出实现总结、关键修改、Requirement Coverage Matrix、Definition of Done、验证证据、未验证项、剩余需求、风险、验收建议，以及 .agent-state/auto-iterate-coding.md 的最终状态摘要。",
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: "100",
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, 100),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: "20",
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, 20),
    },
  ]);

  return {
    ...answers,
    nonGoals: "以原始清单文档为准",
    compatibility: "以原始清单文档为准",
    sourceChecklist: source.content,
    sourceChecklistPath: path.relative(process.cwd(), source.path),
  };
}

async function initAutoIterate(args = []) {
  const options = parseArgs(args);
  console.log("🚀 初始化 auto-iterate-coding Autopilot 启动文件");
  console.log("请按提示填写 AI 实现流程清单。多行内容会打开默认编辑器。");
  console.log("也可以使用: fastcar-cli auto-iterate --from <清单文档路径>\n");

  const answers = options.from
    ? await promptAutoIterateConfigFromFile(await readChecklistFile(options.from))
    : await promptAutoIterateConfig();
  const stateDir = path.join(process.cwd(), STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);
  const promptPath = path.join(stateDir, PROMPT_FILE);

  const existingFiles = [];
  if (await pathExists(statePath)) {
    existingFiles.push(statePath);
  }
  if (await pathExists(promptPath)) {
    existingFiles.push(promptPath);
  }

  if (existingFiles.length > 0) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "检测到已存在的 auto-iterate 文件，是否覆盖?",
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log("已取消生成，未修改现有文件。");
      return;
    }
  }

  await fs.promises.mkdir(stateDir, { recursive: true });
  await fs.promises.writeFile(statePath, buildStateContent(answers), "utf8");
  await fs.promises.writeFile(promptPath, buildPromptContent(answers), "utf8");

  console.log("\n✅ 已生成 auto-iterate-coding 启动文件:");
  console.log(`   状态文件: ${path.relative(process.cwd(), statePath)}`);
  console.log(`   启动提示: ${path.relative(process.cwd(), promptPath)}`);
  console.log("\n下一步:");
  console.log(`   1. 确认已安装 skill: fastcar-cli skill install auto-iterate-coding`);
  console.log(`   2. 将 ${path.relative(process.cwd(), promptPath)} 的内容发给 Agent`);
  console.log("   3. Agent 会读取状态文件并开始自动化开发");
}

module.exports = {
  initAutoIterate,
};
