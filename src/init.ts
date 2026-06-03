import process from "process";
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import * as utils from "./utils";
import templates from "./templates.json";
import { getLocalPath, getTargetNames } from "./skill-targets";
import { asRecord } from "./valueUtils";
import { toCliError } from "./cliError";
import { downloadTemplate, type TemplateConfig } from "./templateDownloader";

interface OptionComponent {
  name: string;
  description: string;
  default: boolean;
  package: string;
}

interface PackageManagerConfig {
  name: string;
  installCmd: string;
  description: string;
}

interface InitOptions {
  yes: boolean;
  template: string | null;
  name: string | null;
  version: string | null;
  description: string | null;
  repositoryUrl: string | null;
  author: string | null;
  license: string | null;
  private: boolean | null;
  components: string[] | null;
  packageManager: string | null;
  withAgent: boolean;
  agentTarget: string;
  templateExplicit: boolean;
}

interface ParsedInitArgs {
  options: InitOptions;
  positional: string[];
}

interface QuestionInfo {
  name: string;
  version: string;
  description: string;
  repositoryUrl: string;
  author: string;
  license: string;
  private: boolean;
  components: string[];
}

interface PackageInfo {
  name?: string;
  version?: string;
  description?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  author?: string;
  license?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

type PromptQuestion = Record<string, unknown>;

const templateRegistry: Record<string, TemplateConfig> = templates;

function asPackageInfo(value: unknown): PackageInfo {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PackageInfo : {};
}

function readJsonObject(filePath: string): PackageInfo {
  return asPackageInfo(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

// 可选组件配置
const optionComponents: OptionComponent[] = [
  {
    name: "pgsql",
    description: "PostgreSQL - 关系型数据库",
    default: false,
    package: "@fastcar/pgsql",
  },
  {
    name: "mysql",
    description: "MySQL - 关系型数据库",
    default: false,
    package: "@fastcar/mysql",
  },
  {
    name: "redis",
    description: "Redis - 缓存数据库",
    default: false,
    package: "@fastcar/redis",
  },
  {
    name: "mongo",
    description: "MongoDB - 文档数据库",
    default: false,
    package: "@fastcar/mongo",
  },
];

const optionComponentNames = optionComponents.map((c) => c.name);

// 包管理器配置
const packageManagers: PackageManagerConfig[] = [
  {
    name: "pnpm",
    installCmd: "pnpm install",
    description: "pnpm - 快速、节省磁盘空间的包管理器",
  },
  {
    name: "yarn",
    installCmd: "yarn install",
    description: "yarn - 快速、可靠、安全的依赖管理",
  },
  {
    name: "npm",
    installCmd: "npm install",
    description: "npm - Node.js 默认包管理器",
  },
];

const packageManagerNames = packageManagers.map((pm) => pm.name);

function readOptionValue(args: string[], index: number): string | null {
  const arg = args[index];
  const equalIndex = arg.indexOf("=");

  if (equalIndex !== -1) {
    return arg.slice(equalIndex + 1);
  }

  const next = args[index + 1];
  if (next && !next.startsWith("-")) {
    return next;
  }

  return null;
}

function shouldSkipNext(args: string[], index: number): boolean {
  const arg = args[index];
  const next = args[index + 1];
  return arg.indexOf("=") === -1 && Boolean(next && !next.startsWith("-"));
}

function parseBoolean(value: unknown, defaultValue = true): boolean {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseComponents(value: unknown): string[] {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInitArgs(args: string[] = []): ParsedInitArgs {
  const options: InitOptions = {
    yes: false,
    template: null,
    name: null,
    version: null,
    description: null,
    repositoryUrl: null,
    author: null,
    license: null,
    private: null,
    components: null,
    packageManager: null,
    withAgent: false,
    agentTarget: "agents",
    templateExplicit: false,
  };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--yes" || arg === "-y" || arg === "--non-interactive") {
      options.yes = true;
      continue;
    }

    if (arg === "--with-agent" || arg === "--agent" || arg === "--init-agent") {
      options.withAgent = true;
      continue;
    }

    if (arg === "--no-agent") {
      options.withAgent = false;
      continue;
    }

    if (arg === "--template" || arg.startsWith("--template=")) {
      options.template = readOptionValue(args, index);
      options.templateExplicit = true;
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--name" || arg.startsWith("--name=")) {
      options.name = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--version" || arg.startsWith("--version=")) {
      options.version = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--description" || arg.startsWith("--description=")) {
      options.description = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--repository-url" || arg === "--repository" || arg.startsWith("--repository-url=") || arg.startsWith("--repository=")) {
      options.repositoryUrl = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--author" || arg.startsWith("--author=")) {
      options.author = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--license" || arg.startsWith("--license=")) {
      options.license = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--private" || arg.startsWith("--private=")) {
      options.private = parseBoolean(readOptionValue(args, index), true);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--public") {
      options.private = false;
      continue;
    }

    if (arg === "--components" || arg.startsWith("--components=")) {
      options.components = parseComponents(readOptionValue(args, index));
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--component" || arg.startsWith("--component=")) {
      options.components = [
        ...(options.components || []),
        ...parseComponents(readOptionValue(args, index)),
      ];
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--package-manager" || arg === "--pm" || arg.startsWith("--package-manager=") || arg.startsWith("--pm=")) {
      options.packageManager = readOptionValue(args, index);
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    if (arg === "--agent-target" || arg.startsWith("--agent-target=")) {
      options.agentTarget = readOptionValue(args, index) || "agents";
      options.withAgent = true;
      if (shouldSkipNext(args, index)) index += 1;
      continue;
    }

    positional.push(arg);
  }

  if (options.template && !options.templateExplicit && !getTemplateConfig(options.template)) {
    positional.unshift(options.template);
    options.template = null;
  }

  return {
    options,
    positional,
  };
}

function getPackageManager(name: string | null): PackageManagerConfig | null {
  return packageManagers.find((pm) => pm.name === name) || null;
}

function validateComponents(components: string[]): void {
  const invalidComponents = components.filter((name) => !optionComponentNames.includes(name));
  if (invalidComponents.length > 0) {
    throw new Error(
      `不支持的组件: ${invalidComponents.join(", ")}\n` +
        `可用组件: ${optionComponentNames.join(", ")}`,
    );
  }
}

function validateInitOptions(options: InitOptions): void {
  if (options.packageManager && !getPackageManager(options.packageManager)) {
    throw new Error(
      `不支持的包管理器: ${options.packageManager}\n` +
        `可用包管理器: ${packageManagerNames.join(", ")}`,
    );
  }

  if (options.components) {
    validateComponents(options.components);
  }

  if (options.agentTarget && !getTargetNames().includes(options.agentTarget)) {
    throw new Error(
      `不支持的 Agent target: ${options.agentTarget}\n` +
        `可用 target: ${getTargetNames().join(", ")}`,
    );
  }
}

function buildQuestionInfoFromOptions(
  defaultName: string,
  existingPackage: PackageInfo,
  options: InitOptions,
): QuestionInfo {
  return {
    name: options.name || existingPackage.name || defaultName,
    version: options.version || existingPackage.version || "1.0.0",
    description:
      options.description !== null && options.description !== undefined
        ? options.description
        : existingPackage.description || "",
    repositoryUrl:
      options.repositoryUrl !== null && options.repositoryUrl !== undefined
        ? options.repositoryUrl
        : existingPackage.repository && existingPackage.repository.url
          ? existingPackage.repository.url
          : "",
    author:
      options.author !== null && options.author !== undefined
        ? options.author
        : existingPackage.author || "",
    license: options.license || existingPackage.license || "MIT",
    private:
      options.private !== null && options.private !== undefined
        ? options.private
        : existingPackage.private !== undefined
          ? existingPackage.private
          : true,
    components: options.components || [],
  };
}

function getPackageInfoFromQuestionInfo(existingPackage: PackageInfo, questionInfo: QuestionInfo): PackageInfo {
  const packageInfo = {
    ...existingPackage,
    name: questionInfo.name,
    version: questionInfo.version,
    description: questionInfo.description,
    author: questionInfo.author,
    license: questionInfo.license,
    private: questionInfo.private,
  };

  if (questionInfo.repositoryUrl) {
    packageInfo.repository = {
      type: "git",
      url: questionInfo.repositoryUrl,
    };
  }

  return packageInfo;
}

function initLocalAgentConfig(projectDir: string, target: string): string {
  const localPath = getLocalPath(target, projectDir);
  if (!localPath) {
    throw new Error(`无法确定 ${target} 的项目级 Agent 配置目录`);
  }

  fs.mkdirSync(localPath, { recursive: true });

  const agentsSourcePath = path.join(__dirname, "..", "skills", "AGENTS.md");
  const agentsTargetPath = path.join(localPath, "AGENTS.md");
  if (fs.existsSync(agentsSourcePath) && !fs.existsSync(agentsTargetPath)) {
    fs.copyFileSync(agentsSourcePath, agentsTargetPath);
  }

  return localPath;
}

// 交互式选择包管理器
async function selectPackageManager(): Promise<PackageManagerConfig> {
  const choices = packageManagers.map((pm) => ({
    name: pm.description,
    value: pm.name,
  }));

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "packageManager",
      message: "选择包管理器安装依赖:",
      choices,
      default: "npm",
    },
  ]);

  return packageManagers.find((pm) => pm.name === answer.packageManager) || packageManagers[2];
}

// 获取所有可用的模板列表
function getTemplateList(): Array<{ name: string; value: string; package: string }> {
  return Object.values(templateRegistry).map((t) => ({
    name: `${t.name} - ${t.description}`,
    value: t.name,
    package: t.package,
  }));
}

// 根据模板名称获取模板配置
function getTemplateConfig(name: string | null): TemplateConfig | null {
  return name ? templateRegistry[name] || null : null;
}

// 交互式选择模板
async function selectTemplate(): Promise<string> {
  const templateList = getTemplateList();

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: "请选择项目模板:",
      choices: templateList,
    },
  ]);

  return typeof answer.template === "string" ? answer.template : "web";
}

// 询问项目信息
// skipNamePrompt: 如果为 true，跳过项目名称询问，直接使用 defaultName
const Questions = async (defaultName: string, skipNamePrompt = false): Promise<QuestionInfo> => {
  return new Promise((resolve) => {
    const prompts: PromptQuestion[] = [];

    // 只有在需要时才询问项目名称
    if (!skipNamePrompt) {
      prompts.push({
        type: "input",
        name: "name",
        default: defaultName,
        message: `项目名称 (${defaultName}):`,
      });
    }

    prompts.push(
      {
        type: "input",
        name: "version",
        default: "1.0.0",
        message: "版本 (1.0.0):",
      },
      {
        type: "input",
        name: "description",
        message: "项目描述:",
      },
      {
        type: "input",
        name: "repositoryUrl",
        message: "仓库地址:",
      },
      {
        type: "input",
        name: "author",
        message: "作者:",
      },
      {
        type: "input",
        name: "license",
        default: "MIT",
        message: "许可证 (MIT):",
      },
      {
        type: "confirm",
        name: "private",
        message: "私有项目:",
        default: true,
      },
      {
        type: "checkbox",
        name: "components",
        message: "选择需要的数据库组件 (空格选择/取消，回车确认):",
        choices: optionComponents.map((c) => ({
          name: c.description,
          value: c.name,
          checked: c.default,
        })),
      },
    );

    inquirer.prompt(prompts).then((answers) => {
      const typedAnswers = answers as Partial<QuestionInfo>;
      // 如果跳过了名称询问，手动设置 name 字段
      if (skipNamePrompt) {
        typedAnswers.name = defaultName;
      }
      resolve({
        name: typedAnswers.name || defaultName,
        version: typedAnswers.version || "1.0.0",
        description: typedAnswers.description || "",
        repositoryUrl: typedAnswers.repositoryUrl || "",
        author: typedAnswers.author || "",
        license: typedAnswers.license || "MIT",
        private: typedAnswers.private !== undefined ? typedAnswers.private : true,
        components: Array.isArray(typedAnswers.components) ? typedAnswers.components : [],
      });
    });
  });
};

export default async function init(args: string[] = []): Promise<void> {
  try {
    const parsedArgs = parseInitArgs(args);
    const initOptions = parsedArgs.options;
    args = parsedArgs.positional;
    validateInitOptions(initOptions);

    let currDir = process.cwd();
    let type = initOptions.template || null;
    let projectName = initOptions.name || null;

    // 解析参数：支持以下几种格式
    // 1. init                    -> 交互式选择模板，询问项目名，创建文件夹
    // 2. init my-project         -> 交互式选择模板，使用 my-project 作为项目名，创建文件夹
    // 3. init web                -> 使用 web 模板，询问项目名，创建文件夹
    // 4. init web my-project     -> 使用 web 模板，使用 my-project 作为项目名，创建文件夹

    // hasProjectName 用于判断是否指定了项目名，决定是否询问项目名称
    let hasProjectName = false;

    if (initOptions.template) {
      if (args[0]) {
        projectName = args[0];
        hasProjectName = true;
      } else {
        hasProjectName = Boolean(initOptions.name);
      }
    } else if (args.length === 0) {
      // 情况1：没有任何参数
      type = null;
      projectName = initOptions.name || null;
      hasProjectName = Boolean(initOptions.name);
    } else if (args.length === 1) {
      // 可能是情况2或情况3
      if (getTemplateConfig(args[0])) {
        // 情况3：args[0] 是模板名，未指定项目名，需要询问
        type = args[0];
        projectName = initOptions.name || null;
        hasProjectName = Boolean(initOptions.name);
      } else {
        // 情况2：args[0] 是项目名（不是模板名）
        type = null;
        projectName = args[0];
        hasProjectName = true;
      }
    } else {
      // 情况4：args[0] 是模板名，args[1] 是项目名
      type = args[0];
      projectName = args[1];
      hasProjectName = true;
    }

    // 如果没有指定模板类型，或者指定的模板不存在，则交互式选择
    if (!type || !getTemplateConfig(type)) {
      if (type && !getTemplateConfig(type)) {
        if (initOptions.yes) {
          throw new Error(
            `未找到模板: ${type}\n` +
              `可用模板: ${Object.keys(templateRegistry).join(", ")}`,
          );
        }
        console.log(`⚠️  未找到模板: ${type}，请从以下列表中选择:`);
      }
      type = initOptions.yes ? "web" : await selectTemplate();
    }

    const templateConfig = getTemplateConfig(type);
    if (!templateConfig) {
      console.error("\n" + "=".repeat(50));
      console.error("❌ 模板不存在");
      console.error("=".repeat(50));
      console.error(`\n📋 你输入的模板：${type}`);
      console.error("\n📋 可用的模板列表：");

      const availableTemplates = getTemplateList();
      availableTemplates.forEach((t) => {
        console.error(`  • ${t.name}`);
      });

      console.error("\n💡 使用示例：");
      console.error(`  fastcar-cli init web`);
      console.error(`  fastcar-cli init rpc`);
      console.error(`  fastcar-cli init my-project`);
      console.error(`  fastcar-cli init web my-project`);
      console.error("\n💡 或者直接执行快速交互式选择：");
      console.error(`  fastcar-cli init`);
      console.error("=".repeat(50) + "\n");
      return;
    }

    console.log(
      `\n🚀 使用模板: ${templateConfig.name} - ${templateConfig.description}\n`,
    );

    // 获取默认项目名（用于询问时的默认值）
    let defaultName: string;
    if (projectName) {
      defaultName = projectName;
    } else {
      const disList = currDir.split(path.sep);
      defaultName = disList[disList.length - 1];
    }

    // 判定是否有 package.json 文件
    let realPackagePath = path.join(currDir, "package.json");
    let packageInfo: PackageInfo = {};
    let questionInfo: QuestionInfo;
    const componentList: string[] = [];

    // 判断是否跳过项目名称询问
    // 只有在命令行指定了项目名参数时，才跳过询问
    const skipNamePrompt = hasProjectName;

    if (skipNamePrompt) {
      console.log(`📦 项目名称: ${defaultName}\n`);
    }

    // 无论是否有 package.json，都询问项目信息和组件选择
    // （如果有 package.json，则以它为基础进行修改）
    if (fs.existsSync(realPackagePath)) {
      const existingPackage = readJsonObject(realPackagePath);
      questionInfo = initOptions.yes
        ? buildQuestionInfoFromOptions(defaultName, existingPackage, initOptions)
        : await Questions(existingPackage.name || defaultName, skipNamePrompt);

      // 保留原有的依赖，只更新其他字段
      packageInfo = getPackageInfoFromQuestionInfo(existingPackage, questionInfo);
    } else {
      questionInfo = initOptions.yes
        ? buildQuestionInfoFromOptions(defaultName, {}, initOptions)
        : await Questions(defaultName, skipNamePrompt);
      packageInfo = getPackageInfoFromQuestionInfo({}, questionInfo);
    }

    // 获取最终的项目名（可能是用户输入的，也可能是命令行指定的）
    const finalProjectName = packageInfo.name || defaultName;

    // 处理项目目录：只有当项目名与当前目录名不同时，才创建新目录
    // 这样如果用户在当前目录初始化，不会报错
    const currentDirName = currDir.split(path.sep).pop();

    if (finalProjectName !== currentDirName) {
      // 需要创建项目目录
      const projectDir = path.join(currDir, finalProjectName);

      if (fs.existsSync(projectDir)) {
        console.error("\n" + "=".repeat(50));
        console.error("❌ 目录已存在");
        console.error("=".repeat(50));
        console.error(`\n📋 目录路径：${projectDir}`);
        console.error("\n💡 解决方案：");
        console.error(`  1. 更换项目名`);
        console.error(`  2. 删除已存在的目录：rm -rf ${finalProjectName}`);
        console.error(
          `  3. 进入目录初始化：cd ${finalProjectName} && fastcar-cli init ${type}`,
        );
        console.error("=".repeat(50) + "\n");
        return;
      }

      fs.mkdirSync(projectDir, { recursive: true });
      currDir = projectDir;
      realPackagePath = path.join(currDir, "package.json");
      console.log(`📁 创建项目目录: ${finalProjectName}\n`);
    }

    Object.keys(packageInfo).forEach((key) => {
      if (packageInfo[key] === undefined || packageInfo[key] === null || packageInfo[key] === "") {
        Reflect.deleteProperty(packageInfo, key);
      }
    });

    // 处理组件选择结果 (checkbox 返回的是数组)
    if (questionInfo.components && Array.isArray(questionInfo.components)) {
      questionInfo.components.forEach((key) => {
        if (optionComponentNames.includes(key)) {
          componentList.push(`@fastcar/${key}`);
          if (key === "mysql") {
            componentList.push(`@fastcar/${key}-tool`);
          }
        }
      });
    } else {
      console.log("⚠️  没有选择任何组件");
    }

    // 从 npm 下载模板
    await downloadTemplate(templateConfig.package, currDir);

    // 检查模板是否正确复制
    console.log(`\n📂 检查项目目录: ${currDir}`);
    if (!fs.existsSync(currDir)) {
      throw new Error(`项目目录不存在: ${currDir}`);
    }

    const projectFiles = fs.readdirSync(currDir);
    console.log(`📄 项目文件: ${projectFiles.join(", ") || "(空)"}`);

    if (projectFiles.length === 0) {
      throw new Error(`项目目录为空，模板复制失败`);
    }

    // 合并 package.json 文件
    let templatePackagePath = path.join(currDir, "package.json");
    console.log(`📂 检查模板 package.json: ${templatePackagePath}`);

    if (fs.existsSync(templatePackagePath)) {
      console.log(`✅ 找到模板 package.json`);
      const templatePackage = readJsonObject(templatePackagePath);

      // 替换本地包名
      if (templatePackage.scripts) {
        const scriptsText = JSON.stringify(
          templatePackage.scripts,
        ).replace(/\$npm_package_name/g, packageInfo.name || finalProjectName);
        templatePackage.scripts = asRecord(JSON.parse(scriptsText)) as Record<string, string>;
      }

      if (templatePackage.dependencies) {
        const packageDependencies = packageInfo.dependencies || {};

        const tmpDep: Record<string, string> = {};
        componentList.forEach((item) => {
          if (!packageDependencies[item]) {
            Reflect.set(tmpDep, item, `latest`);
          }
        });

        packageInfo.dependencies = Object.assign(
          packageDependencies,
          tmpDep,
          templatePackage.dependencies,
        );
      }

      if (!packageInfo.scripts) {
        packageInfo.scripts = {};
      }

      // 覆盖其脚本
      if (templatePackage.scripts) {
        Object.assign(packageInfo.scripts, templatePackage.scripts);
      }

      if (templatePackage.devDependencies) {
        if (!packageInfo.devDependencies) {
          packageInfo.devDependencies = {};
        }

        Object.assign(
          packageInfo.devDependencies,
          templatePackage.devDependencies,
        );
      }
    } else {
      console.log(`⚠️  模板中没有 package.json，将使用默认配置`);
    }

    console.log("📝 写入 package.json...");
    fs.writeFileSync(realPackagePath, JSON.stringify(packageInfo, null, "\t"));

    // 复制 AGENTS.md 到项目根目录（如果模板没有自带）
    const agentsSourcePath = path.join(__dirname, "..", "skills", "AGENTS.md");
    const agentsTargetPath = path.join(currDir, "AGENTS.md");
    if (fs.existsSync(agentsSourcePath) && !fs.existsSync(agentsTargetPath)) {
      console.log("📝 复制 AGENTS.md 到项目根目录...");
      fs.copyFileSync(agentsSourcePath, agentsTargetPath);
    }

    // 更改配置的文件名
    const pm2RunPath = path.join(currDir, "ecosystem.config.yml");

    if (fs.existsSync(pm2RunPath)) {
      const pm2Config = asRecord(utils.readYaml(pm2RunPath));
      const appsConfig = asRecord(pm2Config.apps);
      appsConfig.name = packageInfo.name;
      pm2Config.apps = appsConfig;
      utils.writeYaml(pm2RunPath, pm2Config);
    }

    let agentConfigPath = null;
    if (initOptions.withAgent) {
      agentConfigPath = initLocalAgentConfig(currDir, initOptions.agentTarget);
      console.log(`🤖 已初始化项目级 Agent 配置: ${agentConfigPath}`);
    }

    // 选择包管理器
    const packageManager = initOptions.yes
      ? getPackageManager(initOptions.packageManager || "npm")
      : initOptions.packageManager
        ? getPackageManager(initOptions.packageManager)
        : await selectPackageManager();
    if (!packageManager) {
      throw new Error(`无法确定包管理器: ${initOptions.packageManager || "npm"}`);
    }

    // 获取项目文件夹名（用于显示 cd 命令）
    const projectFolderName = path.basename(currDir);

    console.log("\n✨ 项目初始化完成！");
    console.log(`📁 项目路径: ${currDir}`);
    console.log(`📦 使用模板: ${templateConfig.package}`);
    console.log(`📦 包管理器: ${packageManager.name}`);
    if (agentConfigPath) {
      console.log(`🤖 Agent 配置: ${agentConfigPath}`);
    }
    console.log(`\n👉 请执行以下命令启动项目：`);
    console.log(`   cd ${projectFolderName} && ${packageManager.installCmd}`);
    console.log();
  } catch (error) {
    const typedError = toCliError(error);
    console.error("\n" + "=".repeat(50));
    console.error("❌ 项目初始化失败");
    console.error("=".repeat(50));

    if (typedError.message) {
      console.error("\n📋 错误信息：");
      console.error(typedError.message);
    }

    // 如果是系统错误，显示更多技术细节
    if (typedError.stderr) {
      console.error("\n📋 详细日志：");
      console.error(typedError.stderr.toString());
    }

    if (typedError.code) {
      console.error(`\n📋 错误代码：${typedError.code}`);
    }

    console.error("\n" + "-".repeat(50));
    console.error("💡 如果问题持续存在，请尝试以下操作：");
    console.error("  1. 检查网络连接是否正常");
    console.error(
      "  2. 更新 fastcar-cli 到最新版本：npm install -g @fastcar/cli",
    );
    console.error("  3. 清除 npm 缓存：npm cache clean --force");
    console.error("  4. 使用 --verbose 参数查看详细日志（如果支持）");
    console.error(
      "  5. 访问 https://github.com/williamDazhangyu/fastcar-cli/issues 提交问题",
    );
    console.error("-".repeat(50) + "\n");

    process.exit(1);
  }
}
