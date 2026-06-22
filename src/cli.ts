#!/usr/bin/env node

import init from "./init";
import setModules from "./setModules";
import { reverseGenerate, initReverseConfig } from "./reverse";
import { packProject } from "./pack";
import {
  installSkill,
  uninstallSkill,
  listSkills,
  listTargets,
  initSkill,
} from "./skill";
import { initAutoIterate } from "./auto-iterate";
import { updateCosTemplate } from "./update";
import fs from "fs";
import path from "path";
import templates from "./templates.json";

interface SkillCommandOptions {
  global: boolean;
  local: boolean;
  all: boolean;
  target: string | null;
}

function showHelp(): void {
  console.log(`
Usage: fastcar-cli [command] [options]

Commands:
  init [template] [name]   初始化项目
                           template: 模板名称 (${Object.keys(templates).join(", ")})
                           name: 项目名称（可选，默认使用当前目录名）
                           --yes, -y 非交互初始化，适合 Agent 调用
                           --package-manager npm|yarn|pnpm 指定包管理器
                           --components pgsql,mysql,redis,mongo 指定可选组件
                           --with-agent 初始化项目级 Agent 配置目录
                           --agent-target agents|codex|kimi|claude|cursor

  clean node_modules       删除冗余的 node_modules 目录
  compress node_modules    压缩 node_modules 目录
  reverse                  数据库表逆向生成
  reverse:init             生成 reverse.config.yml/json 配置文件
  pack [pm]                打包项目（排除 devDependencies）
                           pm: 包管理器 (npm/yarn/pnpm)，可选，默认自动检测

  update:cos               更新 @fastcar/template-cos 的 target 文件夹
  auto-iterate             交互式生成 auto-iterate-coding 启动文件
                           当前默认架构: 主 Agent 直接派发 coder subagent；CLI 生成/维护 session
                           内置 Watchdog 状态模板守卫；不启动独立后台进程
                           --mode strict|quick|diagnose|verify|plan|optimize|prototype
                           --strict / --quick / --diagnose / --verify / --plan-only / --optimize / --prototype
                           --goal <text> 快速传入简短目标
                           --session <name> 指定 session，避免覆盖历史任务；自然语言路由必须显式传入
                           --max-iterations <n> 普通迭代预算
                           --autopilot-max-iterations <n> Autopilot 迭代预算
                           --list / --switch <name> / --resume <name>
                           --validate-state [session] 校验 session 状态
                           --finalize [session] 汇总并交付已验证 session
                           --capture-skills <session> 提取可复用 skill
                           --yes, -y 非交互生成，适合手动/fallback
                           --examples [关键词] 输出可复制的自然语言触发示例
                           -f, --from    从本地清单文档导入长需求

  skill install <name>     安装 FastCar skill 到本地 AI Agent
                           使用 all 或 --all 安装全部 skills
                           -g, --global   安装到全局（默认）
                           -l, --local    安装到项目级
                           -t, --target   目标 agent (agents/codex/kimi/claude/cursor)
  skill uninstall <name>   卸载 FastCar skill
                           使用 all 或 --all 卸载全部 skills
  skill list               列出可用的 skills
  skill targets            列出支持的 AI Agents
  skill init               初始化项目级 agent 配置

Options:
  -v, --version           显示版本号
  -h, --help              显示帮助信息

Examples:
  $ fastcar-cli init                  # 交互式选择模板
  $ fastcar-cli init web              # 使用 web 模板
  $ fastcar-cli init rpc              # 使用 rpc 模板
  $ fastcar-cli init micro            # 使用 microservices 模板
  $ fastcar-cli init cos              # 使用 cos 模板
  $ fastcar-cli init static           # 使用 static 模板
  $ fastcar-cli init my-project       # 创建 my-project 目录
  $ fastcar-cli init web my-project   # 使用 web 模板创建 my-project
  $ fastcar-cli init web my-project --yes --package-manager npm --with-agent # Agent 非交互创建项目
  $ fastcar-cli clean node_modules
  $ fastcar-cli reverse        # 数据库表逆向生成
  $ fastcar-cli reverse:init   # 生成默认配置文件（默认 YAML 格式）
  $ fastcar-cli pack           # 打包项目（自动检测包管理器）
  $ fastcar-cli pack yarn      # 使用 yarn 安装依赖
  $ fastcar-cli pack pnpm      # 使用 pnpm 安装依赖

  $ fastcar-cli update:cos     # 更新 cos 模板的 target 文件夹
  $ fastcar-cli auto-iterate   # 交互式生成自动迭代开发状态和启动提示
  $ fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes # 默认 native-subagent session（非交互）
  $ fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes --no-run # protocol-only / LLM-only session
  $ fastcar-cli auto-iterate --diagnose --goal "诊断登录偶发失败" --session login-diagnose --yes # 诊断 session
  $ fastcar-cli auto-iterate --verify --from docs/prd.md --session login-verify --yes # Verify-only 验收 session
  $ fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes # 原型澄清 session
  $ fastcar-cli auto-iterate --list # 列出 auto-iterate sessions
  $ fastcar-cli auto-iterate --examples # 输出自然语言触发示例
  $ fastcar-cli auto-iterate --examples 验收 # 按关键词检索触发示例
  $ fastcar-cli auto-iterate --switch login-verify # 切换当前 session
  $ fastcar-cli auto-iterate --resume login-bugfix # 恢复指定 session
  $ fastcar-cli auto-iterate --validate-state login-bugfix # 只读校验 session 基线和 sub-agent 协议一致性
  $ fastcar-cli auto-iterate --finalize login-bugfix # 汇总并交付已验证 session
  $ fastcar-cli auto-iterate --plan-only --goal "设计支付模块" --session payment-plan --yes # Plan-only 规划 session
  $ fastcar-cli auto-iterate --strict --from docs/ai-checklist.md --session checklist-impl --yes # 从本地清单文档生成 session

  $ fastcar-cli skill install fastcar-framework       # 交互式安装
  $ fastcar-cli skill install fastcar-framework -g    # 全局安装
  $ fastcar-cli skill install fastcar-framework -l    # 本地安装
  $ fastcar-cli skill install fastcar-framework -t agents # 安装到通用 agents 目录
  $ fastcar-cli skill install fastcar-framework -t kimi   # 安装到 Kimi 专用目录
  $ fastcar-cli skill install auto-iterate-coding     # 安装自动迭代编码 skill
  $ fastcar-cli skill install auto-iterate-coding -g  # 全局安装自动迭代编码 skill
  $ fastcar-cli skill install auto-iterate-coding -l  # 本地安装自动迭代编码 skill
  $ fastcar-cli skill install all                     # 安装全部 skills
  $ fastcar-cli skill install --all -g                # 全局安装全部 skills
  $ fastcar-cli skill uninstall fastcar-framework     # 卸载单个 skill
  $ fastcar-cli skill uninstall all                   # 卸载全部 skills
  $ fastcar-cli skill list                            # 列出可用 skills
  $ fastcar-cli skill targets                         # 列出支持的 agents

Reverse 命令参数说明:
  通过配置文件传入参数，在项目根目录创建 reverse.config.yml 或 reverse.config.json：

  {
    "tables": ["test"],               // 要逆向生成的表名数组（必填）
    "modelDir": "/path/to/models",    // Model 文件输出目录绝对路径（必填）
    "mapperDir": "/path/to/mappers",  // Mapper 文件输出目录绝对路径（必填）
    "dbConfig": {                     // MySQL 数据库配置（必填）
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "password": "password",
      "database": "test_db"
    },
    "style": {                        // Prettier 格式化配置（可选）
      "tabWidth": 4,
      "printWidth": 200,
      "trailingComma": "es5",
      "useTabs": true,
      "parser": "typescript",
      "endOfLine": "crlf"
    },
    "ignoreCamelcase": false          // 是否忽略驼峰命名转换（可选，默认 false）
  }

  也可以使用 reverse:init 命令生成默认配置文件:
  $ fastcar-cli reverse:init
`);
}

function showVersion(): void {
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  const packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
  console.log(`fastcar-cli version ${packageInfo.version || "unknown"}`);
}

export async function run(argv: string[]): Promise<void> {
  if (!argv || argv.length === 0) {
    showHelp();
    return;
  }

  const head = argv[0];
  const body = argv.slice(1);

  switch (head) {
    case "-v":
    case "--version": {
      showVersion();
      break;
    }
    case "-h":
    case "--help": {
      showHelp();
      break;
    }
    case "init": {
      await init(body);
      break;
    }
    case "clean":
    case "compress": {
      if (!body[0]) {
        body[0] = "node_modules";
      }

      if (body[0] === "node_modules") {
        setModules(body[0], head === "compress");
      } else {
        console.log("❌ 缺少文件路径");
      }
      break;
    }
    case "reverse": {
      await reverseGenerate(body);
      break;
    }
    case "reverse:init": {
      await initReverseConfig();
      break;
    }
    case "pack": {
      const pm = body[0];
      packProject(undefined, undefined, pm);
      break;
    }
    case "update:cos": {
      await updateCosTemplate(body);
      break;
    }
    case "auto-iterate": {
      await initAutoIterate(body);
      break;
    }
    case "skill": {
      await runSkillCommand(body);
      break;
    }
    default: {
      console.log(`❌ 未知命令: ${head}\n`);
      showHelp();
    }
  }
}

async function runSkillCommand(body: string[]): Promise<void> {
  const subCmd = body[0];
  const args = body.slice(1);
  const options: SkillCommandOptions = {
    global: args.includes("-g") || args.includes("--global"),
    local: args.includes("-l") || args.includes("--local"),
    all: args.includes("--all"),
    target: null,
  };
  const targetIdx = args.findIndex((arg) => arg === "-t" || arg === "--target");
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    options.target = args[targetIdx + 1];
  }
  const skillName = args.find((arg) => !arg.startsWith("-"));

  switch (subCmd) {
    case "install": {
      if (!skillName && !options.all) {
        console.log("❌ 请指定 skill 名称，或使用 all/--all 安装全部");
        console.log("用法: fastcar-cli skill install <skill-name> [options]");
        return;
      }
      await installSkill(skillName || "all", options);
      break;
    }
    case "uninstall": {
      if (!skillName && !options.all) {
        console.log("❌ 请指定 skill 名称，或使用 all/--all 卸载全部");
        console.log("用法: fastcar-cli skill uninstall <skill-name> [options]");
        return;
      }
      await uninstallSkill(skillName || "all", options);
      break;
    }
    case "list": {
      await listSkills();
      break;
    }
    case "targets": {
      listTargets();
      break;
    }
    case "init": {
      await initSkill(options);
      break;
    }
    default: {
      console.log("❌ 未知的 skill 命令");
      console.log("可用的子命令: install, uninstall, list, targets, init");
    }
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
