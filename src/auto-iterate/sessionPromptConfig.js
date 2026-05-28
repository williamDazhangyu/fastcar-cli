// @ts-check
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptMode = promptMode;
exports.promptStrictConfig = promptStrictConfig;
exports.promptQuickConfig = promptQuickConfig;
exports.promptVerifyConfig = promptVerifyConfig;
exports.promptDiagnoseConfig = promptDiagnoseConfig;
exports.promptPlanConfig = promptPlanConfig;
exports.promptPrototypeConfig = promptPrototypeConfig;
exports.promptOptimizeConfig = promptOptimizeConfig;
exports.promptAutoIterateConfig = promptAutoIterateConfig;
exports.promptAutoIterateConfigFromFile = promptAutoIterateConfigFromFile;
const inquirer_1 = __importDefault(require("inquirer"));
const sessionPaths_1 = require("./sessionPaths");
const sessionConfig_1 = require("./sessionConfig");
async function promptMode(defaultMode = "strict") {
    const { mode } = await inquirer_1.default.prompt([
        {
            type: "list",
            name: "mode",
            message: "请选择 auto-iterate 启动模式:",
            choices: sessionConfig_1.MODE_CHOICES,
            default: defaultMode,
        },
    ]);
    return mode;
}
async function promptStrictConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("strict");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "用户目标:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入用户目标",
        },
        {
            type: "editor",
            name: "successCriteria",
            message: "成功标准（每行一条）:",
            validate: (value) => (0, sessionConfig_1.normalizeLines)(value).length > 0 || "请至少输入一条成功标准",
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
            default: sessionConfig_1.DEFAULT_CONSTRAINTS,
        },
        {
            type: "input",
            name: "deliveryFormat",
            message: "交付格式:",
            default: sessionConfig_1.DEFAULT_DELIVERY_FORMAT,
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({ ...answers, mode: "strict" });
}
async function promptQuickConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("quick");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "简短目标 / 需求描述:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入目标或需求描述",
        },
        {
            type: "confirm",
            name: "allowAgentInference",
            message: "是否允许 Agent 先从代码库推断成功标准、修改范围和验证命令?",
            default: true,
        },
        {
            type: "editor",
            name: "constraints",
            message: "外部资源、密钥、数据库、网络、新依赖或沙箱限制（每行一条，可留空）:",
            default: sessionConfig_1.DEFAULT_CONSTRAINTS,
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "quick",
        successCriteria: "由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）",
        nonGoals: "不做与本需求无关的重构、架构迁移或新依赖引入",
        allowedScope: "优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认",
        compatibility: "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认",
        validationCommands: "由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified",
        deliveryFormat: sessionConfig_1.DEFAULT_DELIVERY_FORMAT,
    });
}
async function promptVerifyConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("verify");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "要检查/验收的目标、PRD 或实现说明:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入要检查的目标或说明",
        },
        {
            type: "confirm",
            name: "allowModify",
            message: "是否允许 Agent 在发现问题后直接修复?（默认否，仅输出差距清单）",
            default: false,
        },
        {
            type: "input",
            name: "allowedScope",
            message: "验收范围 / 关注文件（可留空）:",
            default: "现有实现、测试、文档和与目标直接相关的文件",
        },
        {
            type: "editor",
            name: "validationCommands",
            message: "可运行的验证命令（每行一条；可留空让 Agent 自动识别）:",
            default: "由 Agent 自动识别；缺失时标记 not_verified",
        },
        {
            type: "editor",
            name: "constraints",
            message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
            default: sessionConfig_1.DEFAULT_CONSTRAINTS,
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "verify",
        allowAgentInference: true,
        successCriteria: "逐项验证目标或 PRD 是否已由现有实现满足，并给出证据",
        nonGoals: answers.allowModify
            ? "不做与验收目标无关的修改"
            : "不修改项目文件；不把差距修复伪装成验收结果",
        compatibility: "不得削弱现有测试、接口、配置、数据格式或兼容行为",
        deliveryFormat: "最终输出需求覆盖矩阵、完成定义、已运行验证、未验证项、差距清单、建议修复顺序、阻塞项和验收结论。",
    });
}
async function promptDiagnoseConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("diagnose");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "要诊断的 bug、失败信号或性能回归:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入要诊断的问题",
        },
        {
            type: "editor",
            name: "validationCommands",
            message: "已知复现命令 / 测试 / curl / trace / harness（每行一条；可留空让 Agent 建立）:",
            default: "由 Agent 先建立可信 feedback loop；没有复现信号时停止请求 artifact 或环境",
        },
        {
            type: "input",
            name: "allowedScope",
            message: "允许修改范围:",
            default: "与复现、回归测试、诊断 instrumentation 和最小修复直接相关的文件",
        },
        {
            type: "editor",
            name: "constraints",
            message: "外部资源、日志、trace、数据库、网络或沙箱限制（每行一条，可留空）:",
            default: sessionConfig_1.DEFAULT_CONSTRAINTS,
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "diagnose",
        allowAgentInference: true,
        successCriteria: "建立可信 feedback loop；复现用户描述的问题；定位可证伪根因；完成最小修复；重新运行原始复现循环和回归验证",
        nonGoals: "不在没有复现和验证信号时猜测修复；不保留临时 debug instrumentation；不做无关重构",
        compatibility: "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；需要改变行为时停止确认",
        deliveryFormat: "最终输出复现方式、排序假设、最终根因、关键修改、回归验证、原始 feedback loop 结果、临时产物清理状态、剩余风险和验收建议。",
    });
}
async function promptPlanConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("plan");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "要规划的目标或需求:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入要规划的目标",
        },
        {
            type: "input",
            name: "allowedScope",
            message: "规划范围（可留空）:",
            default: "只读探索项目，不修改项目文件",
        },
        {
            type: "input",
            name: "constraints",
            message: "限制、非目标或需要注意的兼容性约束（可留空；多条可用分号分隔）:",
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "plan",
        allowAgentInference: true,
        allowModify: false,
        successCriteria: "输出可执行计划、任务拆分、验证策略、风险和需要用户确认的问题",
        nonGoals: "不写代码，不修改项目文件，不执行破坏性操作",
        compatibility: answers.constraints,
        validationCommands: "只识别验证命令，不运行需要修改环境或外部资源的操作",
        deliveryFormat: "最终输出需求拆解、架构理解、关键文件、实施步骤、验证策略、风险、阻塞项和建议下一步。",
    });
}
async function promptPrototypeConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("prototype");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "原型要回答的问题:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入原型要回答的问题",
        },
        {
            type: "list",
            name: "prototypeKind",
            message: "原型类型:",
            choices: [
                { name: "逻辑原型：状态机 / 数据模型 / 业务流程", value: "logic" },
                { name: "UI 原型：页面 / 交互 / 信息架构方案", value: "ui" },
                { name: "由 Agent 根据代码上下文判断", value: "auto" },
            ],
            default: "auto",
        },
        {
            type: "input",
            name: "allowedScope",
            message: "允许创建原型的位置或范围:",
            default: "靠近被验证模块或页面的明确 prototype 文件 / 临时路由 / 轻量脚本",
        },
        {
            type: "editor",
            name: "constraints",
            message: "原型限制、数据限制或清理要求（每行一条，可留空）:",
            default: "默认不连接真实数据库或生产服务\n原型必须明确标记为一次性代码\n完成后删除、吸收或记录清理条件",
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "prototype",
        allowAgentInference: true,
        successCriteria: `创建 ${answers.prototypeKind} 原型；一个命令可运行；回答原型问题；记录结论、清理条件和是否需要吸收为生产实现`,
        nonGoals: "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象",
        compatibility: "不得影响生产构建、公开 API、真实数据写入和现有用户路径；UI variant switcher 不得暴露到生产路径",
        validationCommands: "一个原型运行命令；必要时补充构建或类型检查；正式实现验证需在吸收原型后另行运行",
        deliveryFormat: "最终输出原型问题、选择路径、运行命令、文件位置、观察结论、未确认项、清理/吸收计划和不能声称完成的生产需求。",
    });
}
async function promptOptimizeConfig(options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)("optimize");
    const answers = await inquirer_1.default.prompt([
        {
            type: "input",
            name: "goal",
            message: "要优化的目标、模块或问题:",
            default: options.goal,
            validate: (value) => Boolean(value && value.trim()) || "请输入优化目标",
        },
        {
            type: "input",
            name: "allowedScope",
            message: "允许优化范围:",
            default: "与优化目标直接相关的代码、测试、类型和文档",
        },
        {
            type: "editor",
            name: "validationCommands",
            message: "baseline / 回归验证命令（每行一条）:",
            default: "npm test\nnpm run build\nnpm run typecheck",
        },
        {
            type: "editor",
            name: "constraints",
            message: "优化限制、风险边界或非目标（每行一条，可留空）:",
            default: "不要改变外部可观察行为\n不要新增依赖，除非先说明原因并等待确认\n无法重新运行验证时停止优化",
        },
        {
            type: "input",
            name: "maxIterations",
            message: "max_iterations:",
            default: String(options.maxIterations || config.defaultMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
        },
        {
            type: "input",
            name: "autopilotMaxIterations",
            message: "autopilot_max_iterations:",
            default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
            validate: sessionConfig_1.validatePositiveInteger,
            filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
        },
    ]);
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode: "optimize",
        allowAgentInference: true,
        successCriteria: "建立 baseline；完成低风险优化；重新运行验证；证明质量提升且无行为回归",
        nonGoals: "不做无关重构，不追求抽象最优，不改变用户可观察行为",
        compatibility: "保持现有 API、命令、配置、数据格式和测试行为兼容",
        deliveryFormat: "最终输出 baseline、优化目标、优化前后对比、保留/放弃的优化、运行验证、剩余风险和回退建议。",
    });
}
async function promptAutoIterateConfig(mode, options = {}) {
    switch (mode) {
        case "quick":
            return promptQuickConfig(options);
        case "diagnose":
            return promptDiagnoseConfig(options);
        case "verify":
            return promptVerifyConfig(options);
        case "plan":
            return promptPlanConfig(options);
        case "optimize":
            return promptOptimizeConfig(options);
        case "prototype":
            return promptPrototypeConfig(options);
        case "strict":
        default:
            return promptStrictConfig(options);
    }
}
async function promptAutoIterateConfigFromFile(source, mode, options = {}) {
    const config = (0, sessionConfig_1.getModeConfig)(mode);
    const prompts = [
        {
            type: "input",
            name: "goal",
            message: mode === "verify" ? "验收目标摘要（原始文档会完整保留）:" : "用户目标摘要（用于状态索引，原始清单会完整保留）:",
            default: options.goal || "见原始清单文档",
        },
        {
            type: "editor",
            name: "successCriteria",
            message: "成功标准摘要（每行一条；可从清单中提炼，原始清单会完整保留）:",
            default: mode === "verify"
                ? "逐项验证原始清单文档是否已由现有实现满足"
                : "以原始清单文档为准",
        },
        {
            type: "input",
            name: "allowedScope",
            message: mode === "verify" ? "验收范围 / 关注文件:" : "允许修改范围:",
            default: mode === "verify"
                ? "现有实现、测试、文档和与原始清单直接相关的文件"
                : "以原始清单文档为准；未明确时仅修改与本次需求直接相关的代码、测试、类型和文档",
        },
        {
            type: "editor",
            name: "validationCommands",
            message: "可运行的验证命令（每行一条）:",
            default: mode === "verify"
                ? "由 Agent 自动识别；缺失时标记 not_verified"
                : "npm test\nnpm run build\nnpm run typecheck",
        },
        {
            type: "editor",
            name: "constraints",
            message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
            default: sessionConfig_1.DEFAULT_CONSTRAINTS,
        },
    ];
    if (mode === "verify") {
        prompts.splice(3, 0, {
            type: "confirm",
            name: "allowModify",
            message: "是否允许 Agent 在发现问题后直接修复?（默认否，仅输出差距清单）",
            default: false,
        });
    }
    if (mode === "prototype") {
        prompts.splice(3, 0, {
            type: "list",
            name: "prototypeKind",
            message: "原型类型:",
            choices: [
                { name: "逻辑原型：状态机 / 数据模型 / 业务流程", value: "logic" },
                { name: "UI 原型：页面 / 交互 / 信息架构方案", value: "ui" },
                { name: "由 Agent 根据原始文档和代码上下文判断", value: "auto" },
            ],
            default: "auto",
        });
    }
    prompts.push({
        type: "input",
        name: "deliveryFormat",
        message: "交付格式:",
        default: sessionConfig_1.DEFAULT_DELIVERY_FORMAT,
    }, {
        type: "input",
        name: "maxIterations",
        message: "max_iterations:",
        default: String(options.maxIterations || config.defaultMaxIterations),
        validate: sessionConfig_1.validatePositiveInteger,
        filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultMaxIterations),
    }, {
        type: "input",
        name: "autopilotMaxIterations",
        message: "autopilot_max_iterations:",
        default: String(options.autopilotMaxIterations || config.defaultAutopilotMaxIterations),
        validate: sessionConfig_1.validatePositiveInteger,
        filter: (value) => (0, sessionConfig_1.formatNumber)(value, config.defaultAutopilotMaxIterations),
    });
    const answers = await inquirer_1.default.prompt(prompts);
    const allowModify = mode === "verify" ? answers.allowModify : mode !== "plan";
    return (0, sessionConfig_1.withModeDefaults)({
        ...answers,
        mode,
        allowAgentInference: mode !== "strict",
        allowModify,
        nonGoals: mode === "verify"
            ? "不修改项目文件；不把差距修复伪装成验收结果"
            : mode === "plan"
                ? "不写代码，不修改项目文件，不执行破坏性操作"
                : mode === "prototype"
                    ? "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象"
                    : "以原始清单文档为准",
        compatibility: "以原始清单文档为准",
        sourceChecklist: source.content,
        sourceChecklistPath: (0, sessionPaths_1.toRelativeSourcePath)(source.path),
    });
}
