export interface NaturalLanguageExampleSection {
  title: string;
  keywords: string[];
  examples: string[];
  fewShots?: NaturalLanguageRouteFewShot[];
}

export interface NaturalLanguageRouteFewShot {
  user: string;
  route: string;
  notes: string[];
}

export const NATURAL_LANGUAGE_EXAMPLES: NaturalLanguageExampleSection[] = [
  {
    title: "快速启动开发任务",
    keywords: ["quick", "快速", "启动", "修复", "开发", "goal", "auto-iterate goal"],
    examples: [
      "帮我快速启动自动迭代，修复登录失败问题，session 叫 login-bugfix",
      "让 auto-iterate goal 处理：修复登录失败问题，session 叫 login-bugfix",
      "启动 auto-iterate goal：修复支付回调重复处理问题，session 叫 payment-callback-fix",
      "快速开始修复用户登录失败，最多跑 5 轮，session 叫 login-fix",
      "开一个自动迭代任务，实现用户登录功能，session 叫 user-login",
      "帮我自动推进这个问题：订单列表分页错误，最多迭代 8 次",
      "启动快速自动迭代，目标是修复支付回调重复处理问题",
    ],
    fewShots: [
      {
        user: "让 auto-iterate goal 处理：修复登录失败问题，session 叫 login-bugfix",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes',
        notes: [
          "auto-iterate goal 是父任务启动口语，映射为 --goal 参数，不等于 Codex /goal。",
          "默认走主 Agent + coder subagent，不启动旧 --check/--run Worker pipeline。",
          "用户给出 session 时必须显式使用该 session。",
        ],
      },
      {
        user: "帮我自动推进这个问题：订单列表分页错误，最多迭代 8 次",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --quick --goal "订单列表分页错误" --session quick-order-pagination --autopilot-max-iterations 8 --yes',
        notes: [
          "未给 session 时生成英文小写、数字和连字符组成的默认 session。",
          "最多迭代 N 次是上限预算，映射为 --autopilot-max-iterations N。",
        ],
      },
    ],
  },
  {
    title: "严格按文档完整实现",
    keywords: ["strict", "严格", "文档", "PRD", "完整实现", "docs"],
    examples: [
      "完整实现 docs/prd.md 里的所有需求，session 叫 prd-implement",
      "严格按照 docs/ai-checklist.md 实现，不要遗漏任何需求，最多跑 10 轮",
      "根据 docs/login.md 全部实现登录模块，session 叫 login-prd",
      "按这个 PRD 完整做完：docs/payment-prd.md",
      "把 docs/order.md 文档里的需求都做完，使用严格启动模式",
    ],
    fewShots: [
      {
        user: "完整实现 docs/prd.md 里的所有需求，session 叫 prd-implement",
        route: "主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --strict --from docs/prd.md --session prd-implement --yes",
        notes: [
          "文档路径明确时优先使用 --from，不要把路径拼进 --goal。",
          "默认自动模式由主 Agent 负责 RCM、状态合并、验证和交付门禁。",
          "完整实现、严格按文档、PRD 默认选择 strict。",
        ],
      },
    ],
  },
  {
    title: "Verify-only：只检查/验收，不修改代码",
    keywords: ["verify", "验收", "检查", "验证", "不修改", "PRD"],
    examples: [
      "帮我验收 docs/prd.md 是否都实现了，不要修改代码，session 叫 prd-check",
      "检查当前实现是否满足 docs/login.md，不能改代码",
      "验证这个 PRD 是否已经完成：docs/payment-prd.md",
      "只检查订单模块是否满足需求，不要修复，最多跑 3 轮",
      "帮我做一次 Verify-only，检查登录功能是否完整实现",
    ],
    fewShots: [
      {
        user: "帮我验收 docs/prd.md 是否都实现了，不要修改代码，session 叫 prd-check",
        route: "主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check --yes",
        notes: [
          "验收、检查完成度且禁止修改时选择 verify。",
          "verify 自动模式使用 --once，不追加 --autopilot。",
          "verify 复用已有实现做只读检查，不进入修复流程。",
        ],
      },
    ],
  },
  {
    title: "Diagnose：困难 bug / 性能回归",
    keywords: ["diagnose", "debug", "诊断", "调试", "复现", "性能回归", "bug"],
    examples: [
      "帮我诊断这个登录偶发失败问题，先建立复现闭环，session 叫 login-diagnose",
      "Diagnose 当前 npm test 失败，最多跑 8 轮，session 叫 test-diagnose",
      "调试订单导出性能回归，先建立 baseline 和可重复验证",
      "帮我 debug 支付回调重复处理问题，不要猜修复，先复现",
      "诊断这个 flaky e2e，尽量提高复现率并列出假设",
    ],
    fewShots: [
      {
        user: "帮我 debug 支付回调重复处理问题，不要猜修复，先复现",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --diagnose --goal "debug 支付回调重复处理问题，不要猜修复，先复现" --session diagnose-payment-callback --yes',
        notes: [
          "debug、诊断、复现、flaky、性能回归优先选择 diagnose。",
          "未给 session 时按模式和目标生成默认 session。",
        ],
      },
    ],
  },
  {
    title: "Plan-only：只规划，不写代码",
    keywords: ["plan", "规划", "计划", "不要写代码", "不修改"],
    examples: [
      "只帮我规划订单模块重构，不要写代码",
      "先规划实现用户权限系统，不要修改任何文件",
      "帮我制定支付模块改造计划，先不要实现",
      "Plan-only：分析如何实现消息通知功能",
      "只输出实现计划、风险和验证策略，不进入编码",
    ],
    fewShots: [
      {
        user: "只帮我规划订单模块重构，不要写代码，session 叫 order-plan",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --plan-only --goal "订单模块重构" --session order-plan --yes',
        notes: [
          "只规划、不要写代码选择 plan-only。",
          "plan-only 自动模式使用 --once，不追加 --autopilot。",
          "plan-only 不应进入实现或修复。",
        ],
      },
    ],
  },
  {
    title: "Prototype-only：一次性原型澄清",
    keywords: ["prototype", "proto", "原型", "试一下", "状态机", "UI 方案", "交互"],
    examples: [
      "先做一个逻辑原型验证订单状态机，不要直接实现生产代码",
      "Prototype：给设置页做 3 个 UI 方案，通过 variant 切换",
      "帮我做一次性原型，验证这个数据模型是否能表达退款流程",
      "先让我玩一下这个交互流程原型，结论确认后再实现",
      "做一个 UI 原型比较仪表盘的几种信息架构，不能影响生产构建",
    ],
    fewShots: [
      {
        user: "先做一个逻辑原型验证订单状态机，session 叫 order-prototype",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes',
        notes: [
          "原型、试方案、验证状态机或 UI 方案选择 prototype。",
          "prototype 用于澄清方案，不默认改生产路径。",
        ],
      },
    ],
  },
  {
    title: "Optimization-only：优化但保持行为不变",
    keywords: ["optimize", "优化", "完善", "补充", "整理", "重构", "性能", "可维护性", "可开工协议"],
    examples: [
      "优化登录模块代码结构，但不要改变外部行为",
      "优化订单查询性能，先建立 baseline，最多跑 5 轮",
      "提升支付模块可维护性，不要新增依赖",
      "帮我做一次 Optimization-only，目标是减少重复代码",
      "优化这个模块的类型定义和命名，保持 API 兼容",
      "自动迭代三十次，将 docs\\impl\\brand-kits.md 完善至可开工协议版本，session 叫 brand-kits-doc",
      "自动迭代五十次，补充 docs/impl/brand-kits.md，要求触发全局自动迭代",
    ],
    fewShots: [
      {
        user: "优化订单查询性能，保持 API 兼容，最多跑 5 轮，session 叫 order-query-optimize",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --optimize --goal "优化订单查询性能，保持 API 兼容" --session order-query-optimize --autopilot-max-iterations 5 --yes',
        notes: [
          "优化、性能、可维护性且要求保持行为不变时选择 optimize。",
          "兼容性约束必须保留在 goal 或后续 state 中。",
        ],
      },
      {
        user: "自动迭代三十次，将 docs\\impl\\brand-kits.md 完善至可开工协议版本，session 叫 brand-kits-doc",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --optimize --goal "将 docs/impl/brand-kits.md 完善至可开工协议版本" --scope docs/impl/brand-kits.md --session brand-kits-doc --autopilot-max-iterations 30 --yes',
        notes: [
          "完善/补充文档是优化目标，文档路径作为 --scope 限定修改范围，不当作 strict --from 的 PRD 来源。",
          "自动迭代 N 次且没有最少/至少修饰时，N 是 Autopilot 上限预算，映射为 --autopilot-max-iterations N。",
          "目标 Agent 必须使用主 Agent + coder subagent 原生工作流，不能启动旧 --run Worker pipeline。",
        ],
      },
    ],
  },
  {
    title: "一直修到通过 / Autopilot",
    keywords: ["autopilot", "一直", "通过", "测试", "全自动"],
    examples: [
      "一直修到测试通过，最多跑 10 轮，session 叫 fix-tests",
      "全自动修复当前构建错误，直到通过或触发停止条件",
      "帮我自动迭代修复 npm test 失败，最多迭代 8 次",
      "不要每轮问我，自动修到验证通过，session 叫 auto-fix",
      "进入 Autopilot，修复所有类型检查错误",
      "触发全局自动迭代，不要只在当前聊天里口头迭代",
    ],
    fewShots: [
      {
        user: "一直修到测试通过，最多跑 10 轮，session 叫 fix-tests",
        route: '主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --diagnose --goal "一直修到测试通过" --session fix-tests --autopilot-max-iterations 10 --yes',
        notes: [
          "一直修到通过表达有界 Autopilot 修复失败信号。",
          "旧 CLI 驱动路径已废弃；验证命令由主 Agent 自己运行并写入 validation.log。",
        ],
      },
    ],
  },
  {
    title: "Agent skill 发现、goal 与 worker dispatch",
    keywords: ["agent", "codex", "goal", "worker", "dispatch", "派发", "子 Agent", "全局自动迭代", "skill install"],
    examples: [
      "先确保目标 Agent 可读取 auto-iterate-coding：fastcar-cli skill install auto-iterate-coding --global --target <agent>",
      "如果当前 Agent skills 列表没有 auto-iterate-coding，就不会稳定触发全局自动迭代",
      "目标 Agent 名称以 fastcar-cli skill targets 输出为准，例如 codex、claude、kimi、cursor",
      "推荐：先在交互式 Codex 输入 /goal 设置整体目标；随后主 Agent 读取 skill/state 并直接派发 coder subagent，可选用 fastcar-cli auto-iterate --quick --goal \"同一目标摘要\" --session <session> --yes 生成 session 骨架",
      "说明：/goal 负责 Codex 会话级目标；auto-iterate state.json 负责 session、预算、RCM、验证证据和恢复状态",
      "说明：这里的 Codex goal 需要先判断语义；子任务默认按 Codex worker / dispatch 处理，不等于更新当前会话 Codex goal 模型",
      "让 Codex goal 处理 login-bugfix 的 REQ-001，只能改 src/auth.js 和 test/auth.test.js，验证命令 npm test，先 dry-run",
      "让 Codex goal 接手当前自动迭代任务的 REQ-002，文件白名单是 src/auto-iterate.js 和 test/auto-iterate-doc-reliability.test.js，先生成 worker prompt 不实际执行",
      "派发给 Codex worker：session 是 dispatch-codex，任务是补充 resume 降级测试，只允许改 test/auto-iterate-doc-reliability.test.js，跑 npm test",
      "在交互式 Codex 输入 /goal，把当前 Codex goal 设为：完整修复登录失败并通过 npm test",
      "确认 prompt 后，让本地 Codex 真实执行这个 worker",
      "先生成 Codex worker prompt，不启动外部 Agent，确认后再配置 AUTO_ITERATE_CODEX_CMD 执行",
    ],
    fewShots: [
      {
        user: "让 Codex goal 处理 login-bugfix 的 REQ-001，只能改 src/auth.js 和 test/auth.test.js，验证命令 npm test，先 dry-run",
        route: 'legacy/deprecated: fastcar-cli auto-iterate --dispatch login-bugfix --agent codex --task "处理 REQ-001" --files "src/auth.js,test/auth.test.js" --verify-command "npm test" --dry-run',
        notes: [
          "这里的 Codex goal 是旧 worker dispatch 口语，不是当前会话 /goal。",
          "dispatch 外部 Worker 路径已废弃；当前默认应由主 Agent 直接派发原生 coder subagent。",
        ],
      },
    ],
  },
  {
    title: "session 管理",
    keywords: ["session", "会话", "恢复", "切换", "列出", "list", "resume", "switch"],
    examples: [
      "列出所有自动迭代任务",
      "查看当前有哪些 auto-iterate session",
      "恢复登录修复任务",
      "恢复 session login-bugfix",
      "切换到 login-verify 这个 session",
      "继续上次的自动迭代任务",
    ],
    fewShots: [
      {
        user: "恢复登录修复任务",
        route: "fastcar-cli auto-iterate --list -> fastcar-cli auto-iterate --resume login-bugfix",
        notes: [
          "自然名称不等于 session id 时先 list 匹配。",
          "resume、list、switch 不追加 --yes。",
        ],
      },
    ],
  },
  {
    title: "Protocol-only / LLM-only",
    keywords: ["few-shot", "protocol-only", "协议", "手动模式", "fallback", "no-run", "不按固定流程"],
    examples: [
      "只遵从 auto-iterate 协议规范执行，不走固定 CLI 流水线",
      "按协议执行，但不要 spawn worker，session 叫 protocol-only-fix",
      "使用手动模式修复登录失败，不要 --run",
      "在当前对话里按自动迭代协议执行，别走 CLI 驱动",
      "我只想让 agent 遵从迭代协议规范执行，而不是按照固定执行流程走",
    ],
    fewShots: [
      {
        user: "按协议执行修复登录失败，但不要走固定 CLI 流水线，session 叫 protocol-only-fix",
        route: 'fastcar-cli auto-iterate --quick --goal "修复登录失败" --session protocol-only-fix --yes --no-run',
        notes: [
          "协议优先、手动模式、不走固定流程、不 spawn worker 都映射为 protocol-only 并追加 --no-run。",
          "当前 LLM 随后在当前会话里维护 state、RCM、DoD、验证和停止条件，不启动 subagent。",
        ],
      },
    ],
  },
  {
    title: "组合场景",
    keywords: ["组合", "预算", "最多", "依赖", "数据库"],
    examples: [
      "帮我快速启动自动迭代，目标是修复登录失败，最多跑 5 轮，session 叫 login-bugfix，不要新增依赖",
      "严格按照 docs/prd.md 完整实现，Autopilot 预算 10 轮，session 叫 prd-impl，不要连接生产数据库",
      "帮我验收 docs/login.md 是否都实现了，不要修改代码，最多跑 3 轮，session 叫 login-check",
      "只规划支付模块重构，不要写代码，session 叫 payment-plan，输出风险和验证策略",
      "优化订单查询性能，保持 API 兼容，最多跑 5 轮，session 叫 order-query-optimize",
    ],
    fewShots: [
      {
        user: "严格按照 docs/prd.md 完整实现，Autopilot 预算 10 轮，session 叫 prd-impl，不要连接生产数据库",
        route: "主 Agent 原生 subagent 工作流；可选先生成 session: fastcar-cli auto-iterate --strict --from docs/prd.md --session prd-impl --autopilot-max-iterations 10 --yes",
        notes: [
          "多个约束同时出现时先判定主模式，再追加预算、session 和资源限制。",
          "外部资源限制应进入后续 state 或启动提示，不要要求连接生产数据库。",
        ],
      },
    ],
  },
];

export function getNaturalLanguageExampleSections(query?: unknown): NaturalLanguageExampleSection[] {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return NATURAL_LANGUAGE_EXAMPLES;
  }

  return NATURAL_LANGUAGE_EXAMPLES.filter((section) => {
    const haystack = [
      section.title,
      ...section.keywords,
      ...section.examples,
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function renderNaturalLanguageExamples(query?: unknown): string {
  const sections = getNaturalLanguageExampleSections(query);
  if (sections.length === 0) {
    return [
      `未找到匹配的自然语言场景: ${query}`,
      "可尝试关键词：快速、文档、验收、诊断、原型、规划、优化、测试、Codex、worker、dispatch、session、预算",
      "",
    ].join("\n");
  }

  const lines = [
    "# auto-iterate 自然语言触发示例",
    "",
    "把下面任意一句发给 Agent，Agent 应默认走主 Agent + coder subagent 原生工作流；CLI 只用于 session 管理、校验、finalize，或用 --yes 生成 native-subagent session 骨架。用户明确 protocol-only / 手动模式 / 不启动 subagent 时才追加 --no-run。",
    "",
    "Few-shot 样本中的 Route 是路由目标形态；旧 --check/--run Worker pipeline 已废弃，不得作为默认启动路径。",
    "",
    "自然语言路由必须每次生成独立 session：用户已指定时使用该 session；用户未指定时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session，并在命令中显式追加 --session <name>。",
    "",
  ];
  for (const section of sections) {
    lines.push(`## ${section.title}`, "");
    lines.push(...section.examples);
    if (section.fewShots && section.fewShots.length > 0) {
      lines.push("", "Few-shot 路由样本：", "");
      for (const shot of section.fewShots) {
        lines.push(`User: ${shot.user}`);
        lines.push(`Route: ${shot.route}`);
        lines.push(`Notes: ${shot.notes.join("；")}`);
        lines.push("");
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function showNaturalLanguageExamples(query?: unknown): void {
  console.log(renderNaturalLanguageExamples(query));
}
