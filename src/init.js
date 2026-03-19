const process = require("process");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const inquirer = require("inquirer");
const utils = require("./utils");
const templates = require("./templates.json");

// 可选组件配置
const optionComponents = [
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
const packageManagers = [
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

// 交互式选择包管理器
async function selectPackageManager() {
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

  return packageManagers.find((pm) => pm.name === answer.packageManager);
}

// 获取所有可用的模板列表
function getTemplateList() {
  return Object.values(templates).map((t) => ({
    name: `${t.name} - ${t.description}`,
    value: t.name,
    package: t.package,
  }));
}

// 根据模板名称获取模板配置
function getTemplateConfig(name) {
  return templates[name] || null;
}

// 交互式选择模板
async function selectTemplate() {
  const templateList = getTemplateList();

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: "请选择项目模板:",
      choices: templateList,
    },
  ]);

  return answer.template;
}

// 从 npm 下载模板包
async function downloadTemplate(packageName, targetDir) {
  console.log(`📦 正在下载模板 ${packageName}...`);
  console.log(`📂 目标目录: ${targetDir}`);

  // 使用 npm pack 下载包
  const tempDir = path.join(process.cwd(), `.fastcar-temp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`📂 临时目录: ${tempDir}`);

  try {
    // 下载 tarball
    try {
      console.log(`⬇️  执行: npm pack ${packageName}...`);
      execSync(`npm pack ${packageName} --pack-destination "${tempDir}"`, {
        stdio: "pipe",
        cwd: tempDir,
      });
      console.log(`✅ npm pack 执行成功`);
    } catch (packError) {
      // 分析 npm pack 错误
      const errorMsg = packError.message || "";
      if (errorMsg.includes("E404") || errorMsg.includes("not found")) {
        throw new Error(
          `模板包 "${packageName}" 不存在\n` +
            `💡 可能的原因：\n` +
            `  1. 包名拼写错误\n` +
            `  2. 该模板尚未发布到 npm\n` +
            `  3. 你没有该私有包的访问权限\n` +
            `💡 解决方案：\n` +
            `  - 检查模板名称是否正确\n` +
            `  - 访问 https://www.npmjs.com/package/${packageName} 确认包是否存在`,
        );
      } else if (
        errorMsg.includes("network") ||
        errorMsg.includes("ECONNREFUSED")
      ) {
        throw new Error(
          `网络连接失败，无法下载模板包 "${packageName}"\n` +
            `💡 可能的原因：\n` +
            `  1. 网络连接问题\n` +
            `  2. npm registry 无法访问\n` +
            `  3. 代理设置问题\n` +
            `💡 解决方案：\n` +
            `  - 检查网络连接\n` +
            `  - 尝试切换 npm 镜像源：npm config set registry https://registry.npmmirror.com\n` +
            `  - 检查代理设置：npm config get proxy`,
        );
      } else {
        throw new Error(
          `下载模板包 "${packageName}" 失败\n` +
            `📋 错误详情：${packError.message}\n` +
            `💡 尝试重新执行命令，或手动检查 npm 是否正常工作`,
        );
      }
    }

    // 找到下载的 tarball 文件
    console.log(`📂 读取临时目录内容...`);
    const files = fs.readdirSync(tempDir);
    console.log(`📄 找到文件: ${files.join(", ")}`);

    const tarball = files.find((f) => f.endsWith(".tgz"));
    console.log(`📦 tarball 文件: ${tarball}`);

    if (!tarball) {
      throw new Error(
        `无法找到下载的模板包文件\n` +
          `💡 可能的原因：npm pack 命令执行异常\n` +
          `💡 解决方案：\n` +
          `  - 检查 npm 版本：npm --version\n` +
          `  - 尝试手动下载：npm pack ${packageName}`,
      );
    }

    const tarballPath = path.join(tempDir, tarball);

    // 解压 tarball
    try {
      const extractDir = path.join(tempDir, "extracted");
      fs.mkdirSync(extractDir, { recursive: true });

      if (process.platform === "win32") {
        execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, {
          stdio: "pipe",
        });
      } else {
        execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, {
          stdio: "pipe",
        });
      }
    } catch (extractError) {
      throw new Error(
        `解压模板包失败\n` +
          `📋 错误详情：${extractError.message}\n` +
          `💡 解决方案：\n` +
          `  - 检查 tar 命令是否可用\n` +
          `  - 尝试手动解压：tar -xzf ${tarballPath}`,
      );
    }

    // npm pack 解压后会得到 package 目录
    const packageDir = path.join(tempDir, "extracted", "package");
    console.log(`📂 检查 package 目录: ${packageDir}`);
    console.log(`📂 目录是否存在: ${fs.existsSync(packageDir)}`);

    // 列出 extracted 目录内容以便调试
    const extractDir = path.join(tempDir, "extracted");
    if (fs.existsSync(extractDir)) {
      const extractedFiles = fs.readdirSync(extractDir);
      console.log(`📄 extracted 目录内容: ${extractedFiles.join(", ")}`);
    }

    if (!fs.existsSync(packageDir)) {
      throw new Error(
        `模板包结构不正确，缺少 package 目录\n` +
          `💡 可能的原因：模板包打包格式不正确\n` +
          `💡 解决方案：联系模板维护者检查包结构`,
      );
    }

    // 检查模板包结构，优先使用 template 目录，否则使用整个包
    const templateDir = path.join(packageDir, "template");
    console.log(`📂 检查 template 目录: ${templateDir}`);
    console.log(`📂 template 目录是否存在: ${fs.existsSync(templateDir)}`);

    const sourceDir = fs.existsSync(templateDir) ? templateDir : packageDir;
    console.log(`📂 源目录: ${sourceDir}`);
    console.log(`📂 目标目录: ${targetDir}`);

    // 复制模板文件到目标目录
    console.log("📋 复制模板文件...");
    console.log(`   从: ${sourceDir}`);
    console.log(`   到: ${targetDir}`);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        `源目录不存在: ${sourceDir}\n` + `💡 可能原因：模板包结构不正确`,
      );
    }

    // 检查源目录是否有内容
    const sourceFiles = fs.readdirSync(sourceDir);
    console.log(`📄 源目录文件数: ${sourceFiles.length}`);
    if (sourceFiles.length === 0) {
      throw new Error(
        `源目录为空: ${sourceDir}\n` + `💡 可能原因：模板包没有正确打包`,
      );
    }

    const copyResult = utils.copyDirectory(sourceDir, targetDir);
    if (copyResult === false) {
      throw new Error(
        `复制模板文件失败\n` +
          `💡 可能原因：\n` +
          `  1. 源目录不存在或为空\n` +
          `  2. 目标目录没有写入权限\n` +
          `  3. 磁盘空间不足`,
      );
    }

    // 检查目标目录内容
    if (fs.existsSync(targetDir)) {
      const targetFiles = fs.readdirSync(targetDir);
      console.log(`📄 目标目录内容: ${targetFiles.join(", ")}`);

      if (targetFiles.length === 0) {
        throw new Error(
          `目标目录为空，复制可能失败\n` + `💡 请检查模板包内容是否正确`,
        );
      }
    } else {
      throw new Error(
        `目标目录创建失败: ${targetDir}\n` + `💡 请检查是否有写入权限`,
      );
    }

    console.log(`✅ 模板 ${packageName} 下载完成`);

    // 清理临时目录
    utils.delDirEctory(tempDir);

    return true;
  } catch (error) {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      utils.delDirEctory(tempDir);
    }
    throw error;
  }
}

// 询问项目信息
// skipNamePrompt: 如果为 true，跳过项目名称询问，直接使用 defaultName
const Questions = async (defaultName, skipNamePrompt = false) => {
  return new Promise((resolve) => {
    const prompts = [];

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
      // 如果跳过了名称询问，手动设置 name 字段
      if (skipNamePrompt) {
        answers.name = defaultName;
      }
      resolve(answers);
    });
  });
};

async function init(args = []) {
  try {
    let currDir = process.cwd();
    let type = null;
    let projectName = null;

    // 解析参数：支持以下几种格式
    // 1. init                    -> 交互式选择模板，询问项目名，创建文件夹
    // 2. init my-project         -> 交互式选择模板，使用 my-project 作为项目名，创建文件夹
    // 3. init web                -> 使用 web 模板，询问项目名，创建文件夹
    // 4. init web my-project     -> 使用 web 模板，使用 my-project 作为项目名，创建文件夹

    // hasProjectName 用于判断是否指定了项目名，决定是否询问项目名称
    let hasProjectName = false;

    if (args.length === 0) {
      // 情况1：没有任何参数
      type = null;
      projectName = null;
      hasProjectName = false;
    } else if (args.length === 1) {
      // 可能是情况2或情况3
      if (getTemplateConfig(args[0])) {
        // 情况3：args[0] 是模板名，未指定项目名，需要询问
        type = args[0];
        projectName = null;
        hasProjectName = false;
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
        console.log(`⚠️  未找到模板: ${type}，请从以下列表中选择:`);
      }
      type = await selectTemplate();
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
    let defaultName;
    if (projectName) {
      defaultName = projectName;
    } else {
      let disList = currDir.split(path.sep);
      defaultName = disList[disList.length - 1];
    }

    // 判定是否有 package.json 文件
    let realPackagePath = path.join(currDir, "package.json");
    let packageInfo = {};
    let questionInfo = {};
    let componentList = [];

    // 判断是否跳过项目名称询问
    // 只有在命令行指定了项目名参数时，才跳过询问
    const skipNamePrompt = hasProjectName;

    if (skipNamePrompt) {
      console.log(`📦 项目名称: ${defaultName}\n`);
    }

    // 无论是否有 package.json，都询问项目信息和组件选择
    // （如果有 package.json，则以它为基础进行修改）
    if (fs.existsSync(realPackagePath)) {
      const existingPackage = require(realPackagePath);
      questionInfo = await Questions(
        existingPackage.name || defaultName,
        skipNamePrompt,
      );

      // 保留原有的依赖，只更新其他字段
      packageInfo = {
        ...existingPackage,
        name: questionInfo.name,
        version: questionInfo.version,
        description: questionInfo.description,
        author: questionInfo.author,
        license: questionInfo.license,
        private: questionInfo.private,
      };
    } else {
      questionInfo = await Questions(defaultName, skipNamePrompt);
      packageInfo = {
        name: questionInfo.name,
        version: questionInfo.version,
        description: questionInfo.description,
        author: questionInfo.author,
        license: questionInfo.license,
        private: questionInfo.private,
      };

      if (!!questionInfo.repositoryUrl) {
        let repType = questionInfo.repositoryUrl.split(".");
        Reflect.set(packageInfo, {
          repository: {
            type: repType,
            url: questionInfo.repositoryUrl,
          },
        });
      }
    }

    // 获取最终的项目名（可能是用户输入的，也可能是命令行指定的）
    const finalProjectName = packageInfo.name;

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
      if (!packageInfo[key]) {
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
      let templatePackage = require(templatePackagePath);

      // 替换本地包名
      if (templatePackage.scripts) {
        templatePackage.scripts = JSON.stringify(
          templatePackage.scripts,
        ).replace(/\$npm_package_name/g, packageInfo.name);
        templatePackage.scripts = JSON.parse(templatePackage.scripts);
      }

      if (templatePackage.dependencies) {
        if (!packageInfo.dependencies) {
          packageInfo.dependencies = {};
        }

        let tmpDep = {};
        componentList.forEach((item) => {
          if (!packageInfo.dependencies[item]) {
            Reflect.set(tmpDep, item, `latest`);
          }
        });

        packageInfo.dependencies = Object.assign(
          packageInfo.dependencies,
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

    // 更改配置的文件名
    const pm2RunPath = path.join(currDir, "ecosystem.config.yml");

    if (fs.existsSync(pm2RunPath)) {
      const pm2Config = utils.readYaml(pm2RunPath);
      pm2Config.apps.name = packageInfo.name;
      utils.writeYaml(pm2RunPath, pm2Config);
    }

    // 选择包管理器
    const packageManager = await selectPackageManager();

    // 获取项目文件夹名（用于显示 cd 命令）
    const projectFolderName = path.basename(currDir);

    console.log("\n✨ 项目初始化完成！");
    console.log(`📁 项目路径: ${currDir}`);
    console.log(`📦 使用模板: ${templateConfig.package}`);
    console.log(`📦 包管理器: ${packageManager.name}`);
    console.log(`\n👉 请执行以下命令启动项目：`);
    console.log(`   cd ${projectFolderName} && ${packageManager.installCmd}`);
    console.log();
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ 项目初始化失败");
    console.error("=".repeat(50));

    if (error.message) {
      console.error("\n📋 错误信息：");
      console.error(error.message);
    }

    // 如果是系统错误，显示更多技术细节
    if (error.stderr) {
      console.error("\n📋 详细日志：");
      console.error(error.stderr.toString());
    }

    if (error.code) {
      console.error(`\n📋 错误代码：${error.code}`);
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

module.exports = init;
