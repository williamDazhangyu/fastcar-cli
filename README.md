# @fastcar/cli 脚手架工具

Fastcar 脚手架工具，用于快速初始化项目模板。

## 特性

- 🚀 通过 npm 包管理模板，动态获取最新版本
- 📦 支持多种项目模板（web、rpc、cos、micro、static）
- 🎯 交互式模板选择
- ⚡ 自动合并依赖和配置
- 🗜️ 项目打包（自动排除 devDependencies、日志文件）
- 🔄 数据库表逆向生成
- 🤖 AI Agent Skill 管理（支持 Kimi、Claude、Cursor）
- 🔁 自动迭代编码 skill：支持有边界的实现、验证、修复、优化和 session 恢复

## 安装

### 全局安装（推荐）

```bash
npm install -g @fastcar/cli
```

### 使用 npx（无需安装）

```bash
npx @fastcar/cli init
```

## 使用命令

### 查看版本

```bash
fastcar-cli -v
# 或
fastcar-cli --version
```

### 查看帮助

```bash
fastcar-cli --help
```

### 初始化项目

```bash
# 交互式选择模板
fastcar-cli init

# 直接指定模板
fastcar-cli init web
fastcar-cli init rpc
fastcar-cli init cos
fastcar-cli init micro
fastcar-cli init static
```

### 项目打包

将项目打包成 zip 文件，自动排除 `devDependencies`、`node_modules`、`dist`、`logs` 和 `*.log` 文件。

```bash
# 自动检测包管理器（根据 lock 文件）
fastcar-cli pack

# 指定包管理器
fastcar-cli pack npm
fastcar-cli pack yarn
fastcar-cli pack pnpm
```

打包后的文件位于 `dist/{name}-{version}.zip`，解压后目录名为当前项目文件夹名。

### 数据库逆向生成

根据数据库表结构生成 Model 和 Mapper 文件。

```bash
# 生成配置文件
fastcar-cli reverse:init

# 执行逆向生成
fastcar-cli reverse
```

配置文件 `reverse.config.json` 示例：

```json
{
  "tables": ["test"],
  "modelDir": "/path/to/models",
  "mapperDir": "/path/to/mappers",
  "dbConfig": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "test_db"
  },
  "style": {
    "tabWidth": 4,
    "printWidth": 200,
    "trailingComma": "es5",
    "useTabs": true,
    "parser": "typescript",
    "endOfLine": "crlf"
  },
  "ignoreCamelcase": false
}
```

### Skill 管理

将 FastCar skill 安装到支持的 AI Agent 中，让 AI 在对话时掌握 FastCar 框架知识。

#### 启动自动迭代开发

`auto-iterate` 会交互式询问 AI 实现流程清单和迭代预算，并在当前项目生成独立 session 状态文件和启动提示。

```bash
fastcar-cli auto-iterate
```

常用非交互模式：

```bash
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes
fastcar-cli auto-iterate --diagnose --goal "诊断登录偶发失败" --session login-diagnose --yes
fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check --yes
fastcar-cli auto-iterate --plan-only --goal "规划订单模块重构" --session order-plan --yes
fastcar-cli auto-iterate --optimize --goal "优化查询性能" --session query-optimize --yes
fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes
```

如果流程清单很长，也可以从本地文档导入：

```bash
fastcar-cli auto-iterate --from docs/ai-checklist.md
fastcar-cli auto-iterate -f docs/ai-checklist.md
```

生成后，把 `.agent-state/auto-iterate/<session>/start-prompt.md` 的内容发给 Agent，即可按 `auto-iterate-coding` skill 进入自动迭代流程。

#### auto-iterate-coding 使用技巧与文档引用

`auto-iterate-coding` 的完整协议以仓库内 `skills/auto-iterate-coding/` 为准，README 只保留发包用户最常用的入口说明。建议先阅读这些文档：

- [skills/auto-iterate-coding/SKILL.md](./skills/auto-iterate-coding/SKILL.md)：主协议，定义触发词、模式选择、能力降级、状态维护、停止条件和最终交付规则。
- [skills/auto-iterate-coding/references/natural-language-routing.md](./skills/auto-iterate-coding/references/natural-language-routing.md)：自然语言到 `fastcar-cli auto-iterate ...` 的路由规则。
- [skills/auto-iterate-coding/references/state-schema.md](./skills/auto-iterate-coding/references/state-schema.md)：`.agent-state/auto-iterate/<session>/state.json` 的强约束字段、生成视图和一致性规则。
- [skills/auto-iterate-coding/examples/state-template.md](./skills/auto-iterate-coding/examples/state-template.md)：`state.md` 人类阅读视图的渲染模板。
- [skills/auto-iterate-coding/examples/end-to-end-scenarios.md](./skills/auto-iterate-coding/examples/end-to-end-scenarios.md)：端到端场景示例，展示启动、执行、验证和交付摘要。

核心技巧如下：

- 每个任务都显式指定 `--session <name>`，例如 `login-bugfix`、`prd-check`、`order-prototype`，避免多个任务覆盖同一份状态。
- 简短 bug 或小功能用 `--quick`；复杂 PRD 或长清单用 `--strict --from <file>`；只验收不用改代码时用 `--verify`；只规划用 `--plan-only`；先复现 bug 用 `--diagnose`；一次性验证想法用 `--prototype`；保持行为不变的质量提升用 `--optimize`。
- 自然语言路由时也要让 Agent 生成独立 session。例如“帮我快速启动自动迭代修复登录失败，session 叫 login-bugfix，最多跑 5 轮”应路由为 `fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes`。
- `max_iterations` 和 `autopilot_max_iterations` 是预算，不是必须跑满的轮数。验证已通过、风险高于收益、缺少外部资源或达到预算时，Agent 应停止并说明状态。
- 不要把静态阅读当作验证。Agent 必须优先运行真实命令，例如 `npm test`、`npm run build`、`npm run typecheck`；无法运行时要把相关需求标记为 `not_verified` 或 `blocked`。
- 长任务要持续维护 `.agent-state/auto-iterate/<session>/state.json`，并刷新生成视图 `.agent-state/auto-iterate/<session>/state.md`。恢复任务时先运行 `fastcar-cli auto-iterate --resume <session>`，该命令会执行 strict state 门禁；再把对应 `start-prompt.md` 发给 Agent。
- 最终交付不要只看“测试通过”。Agent 应同时输出 Requirement Coverage Matrix、Definition of Done、Watchdog 状态、验证证据、未验证项和剩余风险。

推荐工作流：

```bash
# 1. 安装 skill
fastcar-cli skill install auto-iterate-coding

# 2. 为当前任务生成独立 session
fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes

# 3. 把启动提示发给 Agent
# .agent-state/auto-iterate/login-bugfix/start-prompt.md

# 4. 中断后恢复
fastcar-cli auto-iterate --resume login-bugfix
```

#### 列出可用的 skills

```bash
fastcar-cli skill list
```

#### 列出支持的 AI Agents

```bash
fastcar-cli skill targets
```

#### 安装 skill

```bash
# 交互式选择安装位置（全局/本地）
fastcar-cli skill install fastcar-framework

# 全局安装（默认写入通用 agents 目录，Codex/Kimi 等可识别）
fastcar-cli skill install fastcar-framework --global
fastcar-cli skill install fastcar-framework -g

# 本地安装（仅当前项目可用）
fastcar-cli skill install fastcar-framework --local
fastcar-cli skill install fastcar-framework -l
# 若项目根目录不存在 AGENTS.md，会自动补到项目根目录

# 单独安装自动迭代编码 skill
fastcar-cli skill install auto-iterate-coding
fastcar-cli skill install auto-iterate-coding --global
fastcar-cli skill install auto-iterate-coding --local

# 安装全部 skills（会同时补充共享的 AGENTS.md）
fastcar-cli skill install all
fastcar-cli skill install --all -g

# 指定目标 agent
fastcar-cli skill install fastcar-framework --target agents
fastcar-cli skill install fastcar-framework --target codex
fastcar-cli skill install fastcar-framework --target kimi
fastcar-cli skill install fastcar-framework -t claude
```

#### 可用的 FastCar Skills

| Skill 名称 | 适用场景 | 安装命令 |
|-----------|---------|---------|
| fastcar-framework | IoC 核心、Koa Web、项目模板、基础配置 | `fastcar-cli skill install fastcar-framework` |
| fastcar-database | MySQL/PGSQL/MongoDB/Redis ORM、逆向生成 | `fastcar-cli skill install fastcar-database` |
| fastcar-rpc-microservices | RPC 通信、微服务架构、Socket/gRPC | `fastcar-cli skill install fastcar-rpc-microservices` |
| fastcar-serverless | 阿里云 FC / 腾讯云 SCF / AWS Lambda | `fastcar-cli skill install fastcar-serverless` |
| fastcar-toolkit | 缓存、定时任务、时间轮、工作线程池、COS SDK | `fastcar-cli skill install fastcar-toolkit` |
| auto-iterate-coding | 自动迭代式 AI 编程、多轮实现-验证-修复-优化 | `fastcar-cli skill install auto-iterate-coding` |

#### 卸载 skill

```bash
fastcar-cli skill uninstall fastcar-framework

# 卸载全部 skills（保留共享的 AGENTS.md）
fastcar-cli skill uninstall all
fastcar-cli skill uninstall --all -l
```

#### 初始化项目级 agent 配置

```bash
fastcar-cli skill init
```

### 其他命令

```bash
# 清除多余依赖库
fastcar-cli clean node_modules

# 压缩依赖库
fastcar-cli compress node_modules
```

## 快速开始

### 创建 Web 项目示例

```bash
# 创建项目目录
mkdir my-project
cd my-project

# 初始化项目（交互式选择模板）
fastcar-cli init

# 或者直接指定 web 模板
fastcar-cli init web

# 安装依赖
npm install

# 启动项目
npm run dev
```

### 打包项目示例

```bash
# 进入项目目录
cd my-project

# 打包项目（自动检测包管理器）
fastcar-cli pack

# 使用 yarn 打包
fastcar-cli pack yarn

# 输出: dist/my-project-1.0.0.zip
```

## 可用模板

| 模板名称 | 包名 | 说明 |
|---------|------|------|
| web | @fastcar/template-web | Web 应用模板 |
| rpc | @fastcar/template-rpc | RPC 服务模板 |
| cos | @fastcar/template-cos | COS 存储模板 |
| micro | @fastcar/template-microservices | 微服务模板 |
| static | @fastcar/template-static | 静态资源模板 |

## 自定义模板

### 创建模板包

1. 初始化 npm 项目

```bash
mkdir template-mytemplate
cd template-mytemplate
npm init
```

2. 创建 `template/` 目录并放入项目文件

3. 发布到 npm

```bash
npm publish --access public
```

详细说明请参考 [template-example/README.md](./template-example/README.md)

### 注册模板

在 `src/templates.json` 中添加模板配置：

```json
{
  "mytemplate": {
    "name": "mytemplate",
    "description": "我的自定义模板",
    "package": "@fastcar/template-mytemplate",
    "tags": ["custom"]
  }
}
```

## 模板包规范

模板包必须遵循以下结构：

```
template-xxx/
├── package.json          # 模板包的 package.json
├── README.md            # 模板说明文档
└── template/            # 模板文件目录（必需）
    ├── package.json     # 项目模板中的 package.json
    └── ...              # 其他项目文件
```

## 许可证

MIT
