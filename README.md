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

# 全局安装（默认）
fastcar-cli skill install fastcar-framework --global
fastcar-cli skill install fastcar-framework -g

# 本地安装（仅当前项目可用）
fastcar-cli skill install fastcar-framework --local
fastcar-cli skill install fastcar-framework -l

# 指定目标 agent
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

#### 卸载 skill

```bash
fastcar-cli skill uninstall fastcar-framework
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
