const path = require("path");
const fs = require("fs");
const process = require("process");

// 默认配置文件模板
const defaultConfig = {
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

// 生成默认配置文件
function initReverseConfig() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, "reverse.config.json");

  // 检查是否已存在
  if (fs.existsSync(configPath)) {
    console.log("⚠️  reverse.config.json 配置文件已存在");
    console.log("   如需重新生成，请先删除现有文件");
    return;
  }

  // 填充默认路径
  const config = {
    ...defaultConfig,
    modelDir: path.join(cwd, "src", "model").replace(/\\/g, "/"),
    mapperDir: path.join(cwd, "src", "mapper").replace(/\\/g, "/"),
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ 已生成 reverse.config.json 配置文件");
    console.log("📁 文件路径:", configPath);
    console.log("\n💡 请根据需要修改以下配置:");
    console.log("   • tables: 要逆向生成的表名数组");
    console.log("   • modelDir: Model 文件输出目录");
    console.log("   • mapperDir: Mapper 文件输出目录");
    console.log("   • dbConfig: 数据库连接配置");
  } catch (error) {
    console.log("❌ 生成配置文件失败:", error.message);
  }
}

// 数据库表逆向生成
async function reverseGenerate(args = []) {
  const cwd = process.cwd();

  // 检查是否在项目目录下（通过检查 package.json）
  const packagePath = path.join(cwd, "package.json");
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!fs.existsSync(packagePath)) {
    console.log("❌ 请在项目根目录下执行此命令");
    return;
  }

  // 读取配置文件
  const configPath = path.join(cwd, "reverse.config.json");
  if (!fs.existsSync(configPath)) {
    console.log("❌ 未找到 reverse.config.json 配置文件");
    console.log("   请在项目根目录创建该文件，格式如下：");
    console.log(`
{
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

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (error) {
    console.log("❌ 配置文件解析失败:", error.message);
    return;
  }

  // 校验必填参数
  const requiredFields = ["tables", "modelDir", "mapperDir", "dbConfig"];
  const missingFields = requiredFields.filter((field) => !config[field]);
  if (missingFields.length > 0) {
    console.log("❌ 配置文件缺少必填字段:", missingFields.join(", "));
    return;
  }

  // 尝试加载 @fastcar/mysql-tool 包
  let mysqlTool;
  try {
    // 先尝试从项目本地加载
    mysqlTool = require(path.join(nodeModulesPath, "@fastcar/mysql-tool"));
  } catch (e) {
    // 检查错误类型：是 @fastcar/mysql-tool 本身缺失，还是其依赖 @fastcar/mysql 缺失
    if (e.code === "MODULE_NOT_FOUND") {
      // 如果错误消息中包含 @fastcar/mysql-tool，说明是包本身未安装
      if (e.message.includes("@fastcar/mysql-tool")) {
        console.log("❌ 未找到 @fastcar/mysql-tool 包，请先安装:");
        return;
      }
      // 如果 Require stack 中有 mysql-tool，说明是 @fastcar/mysql 依赖缺失
      if (
        e.requireStack &&
        e.requireStack.some((s) => s.includes("@fastcar/mysql-tool"))
      ) {
        console.log("❌ 缺少依赖包 @fastcar/mysql，请先安装:");
        return;
      }
    }

    try {
      // 如果本地没有，尝试全局加载
      mysqlTool = require("@fastcar/mysql-tool");
    } catch (e2) {
      if (e2.code === "MODULE_NOT_FOUND") {
        // 同样区分是包本身缺失还是依赖缺失
        if (e2.message.includes("@fastcar/mysql-tool")) {
          console.log("❌ 未找到 @fastcar/mysql-tool 包，请先安装:");
          console.log("   npm install @fastcar/mysql-tool");
          console.log("   或: yarn add @fastcar/mysql-tool");
          return;
        }
        if (e2.message.includes("@fastcar/mysql")) {
          console.log("❌ 缺少依赖包 @fastcar/mysql，请先安装:");
          console.log("   npm install @fastcar/mysql");
          console.log("   或: yarn add @fastcar/mysql");
          return;
        }
      }

      console.log("❌ 加载 @fastcar/mysql-tool 失败:", e2.message);
      return;
    }
  }

  // 检查 ReverseGenerate.generator 方法是否存在
  if (
    !mysqlTool.ReverseGenerate ||
    typeof mysqlTool.ReverseGenerate.generator !== "function"
  ) {
    console.log(
      "❌ @fastcar/mysql-tool 包中未找到 ReverseGenerate.generator 方法",
    );
    return;
  }

  try {
    console.log("🔄 开始执行数据库表逆向生成...");
    console.log("📋 目标表:", config.tables.join(", "));
    console.log("📁 Model 输出目录:", config.modelDir);
    console.log("📁 Mapper 输出目录:", config.mapperDir);
    await mysqlTool.ReverseGenerate.generator(config);
    console.log("✅ 逆向生成完成");
  } catch (error) {
    // 检查是否是 @fastcar/mysql 依赖缺失
    if (
      error.code === "MODULE_NOT_FOUND" &&
      error.message.includes("@fastcar/mysql")
    ) {
      console.log("❌ 缺少依赖包 @fastcar/mysql，请先安装:");
      return;
    }
    console.log("❌ 逆向生成失败:", error.message);
    process.exit(1);
  }
}

module.exports = {
  reverseGenerate,
  initReverseConfig,
};
