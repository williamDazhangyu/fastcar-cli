import { toRelativeSourcePath } from "./sessionPaths";
import { isImplementationMode } from "./modeRules";
import { inferLanguageFromAnswers } from "../pipeline/language";

export interface ModeConfig {
  label: string;
  description: string;
  autopilot: boolean;
  currentPhase: string;
  currentTask: string;
  nextAction: string;
  defaultMaxIterations: number;
  defaultAutopilotMaxIterations: number;
}

export interface ModeChoice {
  name: string;
  value: string;
}

type StateObject = Record<string, any>;

export const MODE_CONFIGS: Record<string, ModeConfig> = {
  strict: {
    label: "严格启动",
    description: "适合复杂任务、生产代码、大范围修改。",
    autopilot: true,
    currentPhase: "strict_start",
    currentTask: "先提取 Requirement Coverage Matrix",
    nextAction: "先提取 Requirement Coverage Matrix，再读取当前代码和验证命令，制定垂直切片计划",
    defaultMaxIterations: 100,
    defaultAutopilotMaxIterations: 20,
  },
  quick: {
    label: "快速启动",
    description: "适合小中型任务，Agent 先从代码库推断流程清单。",
    autopilot: true,
    currentPhase: "quick_start",
    currentTask: "先探索代码库并生成推断版 AI 实现流程清单",
    nextAction: "先探索项目结构、脚本和相关代码，生成推断版成功标准、修改范围、验证命令和 Requirement Coverage Matrix",
    defaultMaxIterations: 100,
    defaultAutopilotMaxIterations: 10,
  },
  diagnose: {
    label: "Diagnose",
    description: "适合困难 bug、性能回归和持续失败信号，先建立反馈闭环再修复。",
    autopilot: true,
    currentPhase: "diagnose_start",
    currentTask: "建立能复现目标问题的 feedback loop",
    nextAction: "先复现并对齐用户描述的问题，建立快速确定的 pass/fail 信号，再列出可证伪假设并逐一验证",
    defaultMaxIterations: 80,
    defaultAutopilotMaxIterations: 12,
  },
  verify: {
    label: "Verify-only",
    description: "只检查/验收现有实现，不主动修改。",
    autopilot: false,
    currentPhase: "verify_only_start",
    currentTask: "提取 Requirement Coverage Matrix 并验证现有实现",
    nextAction: "只读探索代码、测试和文档；运行可用验证命令；除非用户明确允许修复，否则不修改文件",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 10,
  },
  plan: {
    label: "Plan-only",
    description: "只规划，不写代码。",
    autopilot: false,
    currentPhase: "plan_only_start",
    currentTask: "探索现状并输出实施计划，不修改项目代码",
    nextAction: "只读探索代码、文档和脚本，输出需求拆解、架构理解、任务清单、验证策略和风险",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 10,
  },
  optimize: {
    label: "Optimization-only",
    description: "只做有边界优化，先建立 baseline，验证后保留。",
    autopilot: false,
    currentPhase: "optimization_only_start",
    currentTask: "建立 baseline 并选择一个低风险优化方向",
    nextAction: "先运行或识别 baseline 验证，再做最小优化；只有验证通过且质量明确提升时才保留",
    defaultMaxIterations: 50,
    defaultAutopilotMaxIterations: 10,
  },
  prototype: {
    label: "Prototype-only",
    description: "正式实现前做一次性原型，澄清状态模型、数据模型、交互逻辑或 UI 方向。",
    autopilot: false,
    currentPhase: "prototype_clarification_start",
    currentTask: "明确原型要回答的问题并选择逻辑原型或 UI 原型",
    nextAction: "先确认原型问题、路径和清理条件，再创建一个明确标记、一个命令可运行、默认不持久化的一次性原型",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 8,
  },
};

export const MODE_CHOICES: ModeChoice[] = [
  {
    name: "严格启动：复杂任务、生产代码、大范围修改",
    value: "strict",
  },
  {
    name: "快速启动：小中型任务，Agent 先推断流程清单",
    value: "quick",
  },
  {
    name: "Diagnose：困难 bug / 性能回归，先建立反馈闭环",
    value: "diagnose",
  },
  {
    name: "Verify-only：只检查/验收，不主动修改",
    value: "verify",
  },
  {
    name: "Plan-only：只规划，不写代码",
    value: "plan",
  },
  {
    name: "Optimization-only：只做有边界优化",
    value: "optimize",
  },
  {
    name: "Prototype-only：一次性原型澄清设计，不按生产实现交付",
    value: "prototype",
  },
];

export const DEFAULT_CONSTRAINTS =
  "不要连接生产数据库\n不要写入密钥、token、密码或连接串\n不要新增依赖，除非先说明原因并等待确认";

export const DEFAULT_DELIVERY_FORMAT =
  "最终输出实现总结、关键修改、完整任务清单完成状态、需求覆盖矩阵（Requirement Coverage Matrix）、完成定义（Definition of Done）、Watchdog 状态、交付可验证性、验证证据、未验证项、剩余需求、风险、技能沉淀状态、验收建议，以及本 session state 的最终状态摘要。";

export function getModeConfig(mode: string | null | undefined): ModeConfig {
  return MODE_CONFIGS[String(mode || "")] || MODE_CONFIGS.strict;
}

export function normalizeLines(value: unknown): string[] {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatList(value: unknown, fallback = "未指定"): string {
  const lines = normalizeLines(value);
  if (lines.length === 0) {
    return fallback;
  }
  return lines.map((line) => `- ${line}`).join("\n");
}

export function formatNumber(value: unknown, fallback: number | null): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function validatePositiveInteger(value: unknown): true | string {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return true;
  }
  return "请输入大于 0 的整数";
}

export function buildModeInstructions(answers: StateObject): string {
  switch (answers.mode) {
    case "quick":
      return `快速启动模式：
- Agent 先探索代码库并生成“推断版 AI 实现流程清单”。
- 只有以下情况才停止询问用户：成功标准会影响产品行为、修改范围可能跨模块、验证命令缺失且无法推断、需要数据库/密钥/外部服务/新依赖、可能破坏兼容性。
- 在实现前把推断出的成功标准、修改范围、验证命令和 Requirement Coverage Matrix 写入状态。`;
    case "diagnose":
      return `Diagnose 模式：
- 先建立能复现目标问题的 feedback loop；没有可信 pass/fail 信号时停止并请求 artifact 或环境。
- 确认复现的是用户描述的问题，而不是附近的其他失败。
- 连续失败或修改无改善时，列出 3-5 个排序假设；每个假设必须可证伪，每轮只验证一个主要假设。
- 使用唯一前缀标记临时 debug instrumentation，交付前必须清理。
- 修复后重新运行原始复现循环和回归验证。`;
    case "verify":
      return `Verify-only 模式：
- 只检查、评估和验收现有实现，不进入修改循环。
- 除非用户明确允许修复，否则不要修改项目文件。
- 流程：提取 Requirement Coverage Matrix → 阅读代码和测试 → 运行可用验证命令 → 标记 passed / implemented / not_verified / blocked → 输出差距清单和建议修复顺序。`;
    case "plan":
      return `Plan-only 模式：
- 只规划，不写代码，不修改项目文件。
- 输出需求拆解、架构理解、任务清单、验证策略、风险、建议的垂直切片顺序。
- 如果需要实现，先等待用户确认后再进入实现模式。`;
    case "optimize":
      return `Optimization-only 模式：
- 先建立 baseline：当前验证结果、关键 diff、复杂度和已知风险。
- 每轮只选择一个优化方向，做最小修改并重新验证。
- 只有质量明确提升且风险可接受时才保留；无法验证或收益低于风险时停止。`;
    case "prototype":
      return `Prototype-only 模式：
- 先明确原型要回答的一个问题，并选择逻辑原型或 UI 原型。
- 原型必须明确标记为一次性代码，一个命令可运行，默认不连接真实数据库或生产服务。
- 逻辑原型应把可吸收的核心逻辑放在纯 module / reducer / state machine 背后；TUI 外壳是一次性的。
- UI 原型应生成结构差异明显的方案，优先挂在现有页面，通过 variant 切换；生产构建不能暴露切换器。
- 原型结论未被用户确认、吸收并完成生产验证前，不得声称需求完成。`;
    case "strict":
    default:
      return `严格启动模式：
- 按用户提供的完整流程清单执行。
- 先提取 Requirement Coverage Matrix，再探索现有实现、制定垂直切片计划、实现、验证、修复和优化。
- 所有关键 REQ passed 后，必须进入 validation_hardening 交付前验证加固：至少 2 轮，覆盖 boundary / negative / regression；发现问题就新增或重开 REQ，无法验证则标记 blocked / not_available。
- 不要把单个阶段、子任务或最小纵切通过误判为整体完成。`;
  }
}

export function withModeDefaults(answers: StateObject): StateObject {
  const mode = answers.mode || "strict";
  const config = getModeConfig(mode);
  const language = answers.language && answers.language.code
    ? answers.language
    : inferLanguageFromAnswers(answers);
  const maxIterations = formatNumber(
    answers.maxIterations,
    config.defaultMaxIterations,
  );
  const autopilotMaxIterations = formatNumber(
    answers.autopilotMaxIterations,
    config.defaultAutopilotMaxIterations,
  );

  return {
    ...answers,
    language,
    mode,
    modeLabel: config.label,
    modeDescription: config.description,
    autopilot: config.autopilot,
    currentPhase: answers.currentPhase || config.currentPhase,
    currentTask: answers.currentTask || config.currentTask,
    nextAction: answers.nextAction || config.nextAction,
    allowAgentInference: Boolean(answers.allowAgentInference),
    allowModify: answers.allowModify !== false,
    maxIterations,
    autopilotMaxIterations,
    deliveryFormat: answers.deliveryFormat || DEFAULT_DELIVERY_FORMAT,
    modeInstructions: buildModeInstructions({ ...answers, mode }),
  };
}

export function buildNonInteractiveConfig(
  mode: string,
  options: StateObject = {},
  source: { content: string; path: string } | null = null,
): StateObject {
  const config = getModeConfig(mode);
  const goal = options.goal || (source ? "见原始清单文档" : "未指定目标");
  const maxIterations = options.maxIterations || config.defaultMaxIterations;
  const autopilotMaxIterations =
    options.autopilotMaxIterations || config.defaultAutopilotMaxIterations;
  const sourceDefaults = source
    ? {
        sourceChecklist: source.content,
        sourceChecklistPath: toRelativeSourcePath(source.path),
      }
    : {};

  const base = {
    mode,
    goal,
    maxIterations,
    autopilotMaxIterations,
    constraints: DEFAULT_CONSTRAINTS,
    deliveryFormat: DEFAULT_DELIVERY_FORMAT,
    allowAgentInference: mode !== "strict",
    ...sourceDefaults,
  };

  switch (mode) {
    case "quick":
      return withModeDefaults({
        ...base,
        successCriteria:
          "由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）",
        nonGoals: "不做与本需求无关的重构、架构迁移或新依赖引入",
        allowedScope:
          "优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认",
        compatibility:
          "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认",
        validationCommands:
          "由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified",
      });
    case "diagnose":
      return withModeDefaults({
        ...base,
        successCriteria:
          "建立可信 feedback loop；复现用户描述的问题；定位可证伪根因；完成最小修复；重新运行原始复现循环和回归验证",
        nonGoals:
          "不在没有复现和验证信号时猜测修复；不保留临时 debug instrumentation；不做无关重构",
        allowedScope:
          "与目标失败信号、复现 harness、回归测试和最小修复直接相关的文件",
        compatibility:
          "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；需要改变行为时停止确认",
        validationCommands:
          "由 Agent 先建立最小复现命令、测试、curl、fixture、trace replay 或 harness；缺失时停止请求 artifact",
        deliveryFormat:
          "最终输出复现方式、排序假设、最终根因、关键修改、回归验证、原始 feedback loop 结果、临时产物清理状态、剩余风险和验收建议。",
      });
    case "verify":
      return withModeDefaults({
        ...base,
        allowModify: false,
        successCriteria: source
          ? "逐项验证原始清单文档是否已由现有实现满足"
          : "逐项验证目标或 PRD 是否已由现有实现满足，并给出证据",
        nonGoals: "不修改项目文件；不把差距修复伪装成验收结果",
        allowedScope: "现有实现、测试、文档和与目标直接相关的文件",
        compatibility: "不得削弱现有测试、接口、配置、数据格式或兼容行为",
        validationCommands: "由 Agent 自动识别；缺失时标记 not_verified",
        deliveryFormat:
          "最终输出需求覆盖矩阵、完成定义、已运行验证、未验证项、差距清单、建议修复顺序、阻塞项和验收结论。",
      });
    case "plan":
      return withModeDefaults({
        ...base,
        allowModify: false,
        successCriteria:
          "输出可执行计划、任务拆分、验证策略、风险和需要用户确认的问题",
        nonGoals: "不写代码，不修改项目文件，不执行破坏性操作",
        allowedScope: "只读探索项目，不修改项目文件",
        compatibility: "保持现有架构、接口、命令和数据格式兼容",
        validationCommands: "只识别验证命令，不运行需要修改环境或外部资源的操作",
        deliveryFormat:
          "最终输出需求拆解、架构理解、关键文件、实施步骤、验证策略、风险、阻塞项和建议下一步。",
      });
    case "optimize":
      return withModeDefaults({
        ...base,
        successCriteria:
          "建立 baseline；完成低风险优化；重新运行验证；证明质量提升且无行为回归",
        nonGoals: "不做无关重构，不追求抽象最优，不改变用户可观察行为",
        allowedScope: "与优化目标直接相关的代码、测试、类型和文档",
        compatibility: "保持现有 API、命令、配置、数据格式和测试行为兼容",
        validationCommands: "npm test\nnpm run build\nnpm run typecheck",
        constraints:
          "不要改变外部可观察行为\n不要新增依赖，除非先说明原因并等待确认\n无法重新运行验证时停止优化",
        deliveryFormat:
          "最终输出 baseline、优化目标、优化前后对比、保留/放弃的优化、运行验证、剩余风险和回退建议。",
      });
    case "prototype":
      return withModeDefaults({
        ...base,
        allowModify: true,
        successCriteria:
          "明确原型要回答的问题；创建一次性逻辑原型或 UI 原型；一个命令可运行；记录结论、清理条件和是否需要吸收为生产实现",
        nonGoals:
          "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象",
        allowedScope:
          "明确标记的 prototype 文件、临时路由、轻量脚本、必要的运行命令和原型旁说明",
        compatibility:
          "不得影响生产构建、公开 API、真实数据写入和现有用户路径；UI variant switcher 不得暴露到生产路径",
        validationCommands:
          "一个原型运行命令；必要时补充构建或类型检查；正式实现验证需在吸收原型后另行运行",
        deliveryFormat:
          "最终输出原型问题、选择路径、运行命令、文件位置、观察结论、未确认项、清理/吸收计划和不能声称完成的生产需求。",
      });
    case "strict":
    default:
      return withModeDefaults({
        ...base,
        successCriteria: source ? "以原始清单文档为准" : "由用户目标推断并在实现前确认",
        nonGoals: source ? "以原始清单文档为准" : "未指定",
        allowedScope: source
          ? "以原始清单文档为准；未明确时仅修改与本次需求直接相关的代码、测试、类型和文档"
          : "与本次需求直接相关的代码、测试、类型和文档",
        compatibility: source ? "以原始清单文档为准" : "保持现有公开接口、命令和行为兼容",
        validationCommands: "npm test\nnpm run build\nnpm run typecheck",
      });
  }
}

export function getStyleConsolidationDefaultStatus(mode: string): string {
  return isImplementationMode(mode) ? "pending" : "not_applicable";
}
