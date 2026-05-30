import fs from "fs";
import path from "path";
import process from "process";
import { createRequire } from "module";
import inquirer from "inquirer";
import yaml from "yaml";

const runtimeRequire = createRequire(__filename);

interface ReverseConfig {
  type?: "mysql" | "pgsql" | string;
  tables: string[];
  modelDir: string;
  mapperDir: string;
  dbConfig: Record<string, unknown>;
  style?: Record<string, unknown>;
  ignoreCamelcase?: boolean;
  [key: string]: unknown;
}

interface ExistingConfig {
  ext: "yml" | "json";
  configPath: string;
}

interface DbToolInfo {
  pkg: string;
  mainDep: string;
}

interface ReverseGenerateTool {
  ReverseGenerate?: {
    generator?: (config: ReverseConfig) => Promise<unknown> | unknown;
  };
}


// 默认配置文件模板
const defaultConfig = {
  type: "mysql",
  tables: ["test"],
  modelDir: "",
  mapperDir: "",
  dbConfig: {
    host: "localhost",
    port: 3306,
    user: "root",
    password: "password",
    database: "test_db",
  },
  style: {
    tabWidth: 4,
    printWidth: 200,
    trailingComma: "es5",
    useTabs: true,
    parser: "typescript",
    endOfLine: "crlf",
  },
  ignoreCamelcase: false,
};

// 支持的配置文件名
const CONFIG_FILES = {
  json: "reverse.config.json",
  yml: "reverse.config.yml",
};

// 查找已存在的配置文件
function findExistingConfig(cwd: string): ExistingConfig | null {
  for (const ext of ["yml", "json"] as const) {
    const configPath = path.join(cwd, CONFIG_FILES[ext]);
    if (fs.existsSync(configPath)) {
      return { ext, configPath };
    }
  }
  return null;
}

// 读取配置文件
function readConfig(configPath: string, ext: ExistingConfig["ext"]): ReverseConfig {
  const content = fs.readFileSync(configPath, "utf-8");
  if (ext === "yml") {
    return yaml.parse(content);
  }
  return JSON.parse(content);
}

// 写入配置文件
function writeConfig(configPath: string, ext: ExistingConfig["ext"], config: ReverseConfig): void {
  if (ext === "yml") {
    fs.writeFileSync(configPath, yaml.stringify(config));
  } else {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
}

// 生成默认配置文件
export async function initReverseConfig(): Promise<void> {
  const cwd = process.cwd();

  // 检查是否已存在任何格式的配置文件
  const existing = findExistingConfig(cwd);
  if (existing) {
    console.log(`⚠️  ${path.basename(existing.configPath)} 配置文件已存在`);
    console.log("   如需重新生成，请先删除现有文件");
    return;
  }

  // 交互式选择配置格式
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "format",
      message: "选择配置文件格式:",
      choices: [
        { name: "YAML (reverse.config.yml)", value: "yml" },
        { name: "JSON (reverse.config.json)", value: "json" },
      ],
      default: "yml",
    },
  ]);

  const ext: ExistingConfig["ext"] = answer.format === "json" ? "json" : "yml";
  const configPath = path.join(cwd, CONFIG_FILES[ext]);

  // 填充默认路径
  const config = {
    ...defaultConfig,
    modelDir: path.join(cwd, "src", "model").replace(/\\/g, "/"),
    mapperDir: path.join(cwd, "src", "mapper").replace(/\\/g, "/"),
  };

  try {
    writeConfig(configPath, ext, config);
    console.log(`✅ 已生成 ${CONFIG_FILES[ext]} 配置文件`);
    console.log("📁 文件路径:", configPath);
    console.log("\n💡 请根据需要修改以下配置:");
    console.log("   • type: 数据库类型 (mysql 或 pgsql)");
    console.log("   • tables: 要逆向生成的表名数组");
    console.log("   • modelDir: Model 文件输出目录");
    console.log("   • mapperDir: Mapper 文件输出目录");
    console.log("   • dbConfig: 数据库连接配置");
  } catch (error) {
    console.log("❌ 生成配置文件失败:", error instanceof Error ? error.message : String(error));
  }
}

// 数据库表逆向生成
export async function reverseGenerate(args: string[] = []) {
  const cwd = process.cwd();

  // 检查是否在项目目录下（通过检查 package.json）
  const packagePath = path.join(cwd, "package.json");
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!fs.existsSync(packagePath)) {
    console.log("❌ 请在项目根目录下执行此命令");
    return;
  }

  // 读取配置文件
  const existing = findExistingConfig(cwd);
  if (!existing) {
    console.log("❌ 未找到 reverse.config.yml 或 reverse.config.json 配置文件");
    console.log("   请在项目根目录创建该文件，格式如下：");
    console.log(`
YAML 格式 (reverse.config.yml):
  type: mysql
  tables: [test]
  modelDir: ${cwd.replace(/\\/g, "/")}/src/models
  mapperDir: ${cwd.replace(/\\/g, "/")}/src/mappers
  dbConfig:
    host: localhost
    port: 3306
    user: root
    password: password
    database: test_db
  style:
    tabWidth: 4
    printWidth: 200
    trailingComma: es5
    useTabs: true
    parser: typescript
    endOfLine: crlf
  ignoreCamelcase: false

JSON 格式 (reverse.config.json):
{
  "type": "mysql",
  "tables": ["test"],
  "modelDir": "${cwd.replace(/\\/g, "/")}/src/models",
  "mapperDir": "${cwd.replace(/\\/g, "/")}/src/mappers",
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
    `);
    return;
  }

  let config: ReverseConfig;
  try {
    config = readConfig(existing.configPath, existing.ext);
  } catch (error) {
    console.log(`❌ 配置文件 ${path.basename(existing.configPath)} 解析失败:`, error instanceof Error ? error.message : String(error));
    return;
  }

  // 校验必填参数
  const requiredFields = ["tables", "modelDir", "mapperDir", "dbConfig"];
  const missingFields = requiredFields.filter((field) => !config[field]);
  if (missingFields.length > 0) {
    console.log("❌ 配置文件缺少必填字段:", missingFields.join(", "));
    return;
  }

  // 数据库类型与对应工具包映射
  const DB_TOOLS: Record<string, DbToolInfo> = {
    mysql: {
      pkg: "@fastcar/mysql-tool",
      mainDep: "@fastcar/mysql",
    },
    pgsql: {
      pkg: "@fastcar/pgsql",
      mainDep: "@fastcar/core",
    },
  };

  const dbType = config.type || "mysql";
  const dbToolInfo = DB_TOOLS[dbType];
  if (!dbToolInfo) {
    console.log(
      `❌ 不支持的数据库类型: ${dbType}，目前支持: ${Object.keys(DB_TOOLS).join(", ")}`,
    );
    return;
  }

  // 加载数据库逆向生成工具包
  function requireDBTool(nodeModulesPath: string, pkgName: string, mainDepName: string): ReverseGenerateTool | null {
    let tool: ReverseGenerateTool;

    try {
      // 先尝试从项目本地加载
      tool = runtimeRequire(path.join(nodeModulesPath, pkgName)) as ReverseGenerateTool;
    } catch (e) {
      const error = e as NodeJS.ErrnoException & { requireStack?: string[] };
      // 检查错误类型：是包本身缺失，还是其依赖缺失
      if (error.code === "MODULE_NOT_FOUND") {
        // 如果错误消息中包含包名，说明是包本身未安装
        if (error.message.includes(pkgName)) {
          console.log(`❌ 未找到 ${pkgName} 包，请先安装:`);
          return null;
        }
        // 如果 Require stack 中有该包路径，说明是主要依赖缺失
        if (
          mainDepName &&
          error.requireStack &&
          error.requireStack.some((s) => s.includes(pkgName))
        ) {
          console.log(`❌ 缺少依赖包 ${mainDepName}，请先安装:`);
          return null;
        }
      }

      try {
        // 如果本地没有，尝试全局加载
        tool = runtimeRequire(pkgName) as ReverseGenerateTool;
      } catch (e2) {
        const fallbackError = e2 as NodeJS.ErrnoException;
        if (fallbackError.code === "MODULE_NOT_FOUND") {
          // 同样区分是包本身缺失还是依赖缺失
          if (fallbackError.message.includes(pkgName)) {
            console.log(`❌ 未找到 ${pkgName} 包，请先安装:`);
            console.log(`   npm install ${pkgName}`);
            console.log(`   或: yarn add ${pkgName}`);
            return null;
          }
          if (mainDepName && fallbackError.message.includes(mainDepName)) {
            console.log(`❌ 缺少依赖包 ${mainDepName}，请先安装:`);
            console.log(`   npm install ${mainDepName}`);
            console.log(`   或: yarn add ${mainDepName}`);
            return null;
          }
          const match = fallbackError.message.match(/Cannot find module '([^']+)'/);
          const missingDep = match ? match[1] : "相关依赖";
          console.log(`❌ 缺少依赖包 ${missingDep}，请先安装:`);
          console.log(`   npm install ${missingDep}`);
          console.log(`   或: yarn add ${missingDep}`);
          return null;
        }

        console.log(`❌ 加载 ${pkgName} 失败:`, fallbackError.message);
        return null;
      }
    }

    return tool;
  }

  const dbTool = requireDBTool(
    nodeModulesPath,
    dbToolInfo.pkg,
    dbToolInfo.mainDep,
  );
  if (!dbTool) {
    return;
  }

  // 检查 ReverseGenerate.generator 方法是否存在
  if (
    !dbTool.ReverseGenerate ||
    typeof dbTool.ReverseGenerate.generator !== "function"
  ) {
    console.log(
      `❌ ${dbToolInfo.pkg} 包中未找到 ReverseGenerate.generator 方法`,
    );
    return;
  }

  try {
    console.log("🔄 开始执行数据库表逆向生成...");
    console.log("📋 目标表:", config.tables.join(", "));
    console.log("📁 Model 输出目录:", config.modelDir);
    console.log("📁 Mapper 输出目录:", config.mapperDir);
    await dbTool.ReverseGenerate.generator(config);
    console.log("✅ 逆向生成完成");
  } catch (error) {
    // 检查是否是依赖缺失
    const reverseError = error as NodeJS.ErrnoException;
    if (reverseError.code === "MODULE_NOT_FOUND") {
      const match = reverseError.message.match(/Cannot find module '([^']+)'/);
      const missingDep = match ? match[1] : "相关依赖";
      console.log(`❌ 缺少依赖包 ${missingDep}，请先安装:`);
      return;
    }
    console.log("❌ 逆向生成失败:", reverseError.message);
    process.exit(1);
  }
}
