#!/usr/bin/env node

const init = require("../src/init");
const setModules = require("../src/setModules");
const { reverseGenerate, initReverseConfig } = require("../src/reverse");
const { packProject } = require("../src/pack");
const {
  installSkill,
  uninstallSkill,
  listSkills,
  listTargets,
  initSkill,
} = require("../src/skill");
const packageINFO = require("../package.json");
const templates = require("../src/templates.json");

function showHelp() {
  console.log(`
Usage: fastcar-cli [command] [options]

Commands:
  init [template] [name]   初始化项目
                           template: 模板名称 (${Object.keys(templates).join(", ")})
                           name: 项目名称（可选，默认使用当前目录名）

  clean node_modules       删除冗余的 node_modules 目录
  compress node_modules    压缩 node_modules 目录
  reverse                  数据库表逆向生成
  reverse:init             生成 reverse.config.yml/json 配置文件
  pack [pm]                打包项目（排除 devDependencies）
                           pm: 包管理器 (npm/yarn/pnpm)，可选，默认自动检测

  skill install <name>     安装 FastCar skill 到本地 AI Agent
                           -g, --global   安装到全局（默认）
                           -l, --local    安装到项目级
                           -t, --target   目标 agent (kimi/claude/cursor)
  skill uninstall <name>   卸载 FastCar skill
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
  $ fastcar-cli clean node_modules
  $ fastcar-cli reverse        # 数据库表逆向生成
  $ fastcar-cli reverse:init   # 生成默认配置文件（默认 YAML 格式）
  $ fastcar-cli pack           # 打包项目（自动检测包管理器）
  $ fastcar-cli pack yarn      # 使用 yarn 安装依赖
  $ fastcar-cli pack pnpm      # 使用 pnpm 安装依赖

  $ fastcar-cli skill install fastcar-framework       # 交互式安装
  $ fastcar-cli skill install fastcar-framework -g    # 全局安装
  $ fastcar-cli skill install fastcar-framework -l    # 本地安装
  $ fastcar-cli skill install fastcar-framework -t kimi # 安装到 Kimi
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

function showVersion() {
  console.log(`fastcar-cli version ${packageINFO.version}`);
}

async function run(argv) {
  // 命令入口
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
      const pm = body[0]; // 可选的包管理器参数
      packProject(null, null, pm);
      break;
    }
    case "skill": {
      const subCmd = body[0];
      const args = body.slice(1);

      // 解析参数
      const options = {
        global: args.includes("-g") || args.includes("--global"),
        local: args.includes("-l") || args.includes("--local"),
        target: null,
      };

      // 解析 --target 或 -t
      const targetIdx = args.findIndex((a) => a === "-t" || a === "--target");
      if (targetIdx !== -1 && args[targetIdx + 1]) {
        options.target = args[targetIdx + 1];
      }

      // 移除参数，保留 skill name
      const skillName = args.find((a) => !a.startsWith("-"));

      switch (subCmd) {
        case "install": {
          if (!skillName) {
            console.log("❌ 请指定 skill 名称");
            console.log(
              "用法: fastcar-cli skill install <skill-name> [options]",
            );
            return;
          }
          installSkill(skillName, options);
          break;
        }
        case "uninstall": {
          if (!skillName) {
            console.log("❌ 请指定 skill 名称");
            console.log(
              "用法: fastcar-cli skill uninstall <skill-name> [options]",
            );
            return;
          }
          uninstallSkill(skillName, options);
          break;
        }
        case "list": {
          listSkills();
          break;
        }
        case "targets": {
          listTargets();
          break;
        }
        case "init": {
          initSkill(options);
          break;
        }
        default: {
          console.log("❌ 未知的 skill 命令");
          console.log("可用的子命令: install, uninstall, list, targets, init");
        }
      }
      break;
    }
    default: {
      console.log(`❌ 未知命令: ${head}\n`);
      showHelp();
    }
  }
}

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
