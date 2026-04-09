const process = require("process");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const compressing = require("compressing");
const utils = require("./utils");
const templates = require("./templates.json");

/**
 * 从 npm 下载模板包并仅同步 template/target 文件夹
 * @param {string} packageName - 模板包名（如 @fastcar/template-cos）
 * @param {string} targetDir - 目标目录（当前项目目录）
 */
async function updateTemplateTarget(packageName, targetDir) {
  console.log(`📦 正在更新模板 ${packageName}...`);
  console.log(`📂 目标目录: ${targetDir}`);

  // 使用 npm pack 下载包
  const tempDir = path.join(process.cwd(), `.fastcar-update-temp-${Date.now()}`);
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

      await compressing.tgz.uncompress(tarballPath, extractDir);
    } catch (extractError) {
      throw new Error(
        `解压模板包失败\n` +
          `📋 错误详情：${extractError.message}\n` +
          `💡 解决方案：\n` +
          `  - 检查 compressing 库是否正常工作\n` +
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

    // 检查 template/target 目录
    const templateTargetDir = path.join(packageDir, "template", "target");
    console.log(`📂 检查 template/target 目录: ${templateTargetDir}`);
    console.log(`📂 template/target 目录是否存在: ${fs.existsSync(templateTargetDir)}`);

    if (!fs.existsSync(templateTargetDir)) {
      throw new Error(
        `模板包中不存在 template/target 目录\n` +
          `💡 可能的原因：该模板不支持 target 同步更新\n` +
          `💡 解决方案：联系模板维护者确认包结构`,
      );
    }

    // 检查源目录是否有内容
    const sourceFiles = fs.readdirSync(templateTargetDir);
    console.log(`📄 源目录文件数: ${sourceFiles.length}`);
    if (sourceFiles.length === 0) {
      throw new Error(
        `template/target 目录为空\n` +
          `💡 可能原因：模板包没有正确打包`,
      );
    }

    // 目标 target 目录
    const destTargetDir = path.join(targetDir, "target");
    console.log(`📂 目标 target 目录: ${destTargetDir}`);

    // 如果目标 target 目录已存在，先备份
    if (fs.existsSync(destTargetDir)) {
      const backupDir = path.join(targetDir, `target-backup-${Date.now()}`);
      console.log(`📦 备份现有 target 目录到: ${backupDir}`);
      utils.copyDirectory(destTargetDir, backupDir);
      
      // 删除旧的 target 目录
      console.log(`🗑️  删除旧的 target 目录...`);
      utils.delDirEctory(destTargetDir);
    }

    // 复制 template/target 到目标 target 目录
    console.log("📋 复制 template/target 文件...");
    console.log(`   从: ${templateTargetDir}`);
    console.log(`   到: ${destTargetDir}`);

    const copyResult = utils.copyDirectory(templateTargetDir, destTargetDir);
    if (copyResult === false) {
      throw new Error(
        `复制 target 文件失败\n` +
          `💡 可能原因：\n` +
          `  1. 源目录不存在或为空\n` +
          `  2. 目标目录没有写入权限\n` +
          `  3. 磁盘空间不足`,
      );
    }

    // 检查目标目录内容
    if (fs.existsSync(destTargetDir)) {
      const targetFiles = fs.readdirSync(destTargetDir);
      console.log(`📄 目标目录内容: ${targetFiles.join(", ") || "(空)"}`);

      if (targetFiles.length === 0) {
        throw new Error(
          `目标目录为空，复制可能失败\n` + `💡 请检查模板包内容是否正确`,
        );
      }
    } else {
      throw new Error(
        `目标目录创建失败: ${destTargetDir}\n` + `💡 请检查是否有写入权限`,
      );
    }

    console.log(`✅ 模板 ${packageName} 的 target 目录更新完成`);

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

/**
 * 更新 @fastcar/template-cos 模块的 target 文件夹
 * @param {string[]} args - 命令行参数
 */
async function updateCosTemplate(args = []) {
  try {
    const currDir = process.cwd();
    const templateName = "cos";
    const templateConfig = templates[templateName];

    if (!templateConfig) {
      console.error("\n" + "=".repeat(50));
      console.error("❌ 模板配置不存在");
      console.error("=".repeat(50));
      console.error(`\n📋 模板名称：${templateName}`);
      console.error("\n💡 可用的模板列表：");
      Object.keys(templates).forEach((key) => {
        console.error(`  • ${key} - ${templates[key].description}`);
      });
      console.error("=".repeat(50) + "\n");
      process.exit(1);
    }

    console.log(
      `\n🚀 更新模板: ${templateConfig.name} - ${templateConfig.description}\n`,
    );

    // 检查当前目录是否有 package.json（确认是项目目录）
    const packageJsonPath = path.join(currDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      console.warn("⚠️  当前目录没有 package.json，请确认已在项目根目录执行此命令");
      const inquirer = require("inquirer");
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "continue",
          message: "是否继续更新?",
          default: false,
        },
      ]);
      if (!answer.continue) {
        console.log("❌ 已取消更新");
        return;
      }
    }

    // 执行更新
    await updateTemplateTarget(templateConfig.package, currDir);

    console.log("\n✨ target 目录更新完成！");
    console.log(`📁 项目路径: ${currDir}`);
    console.log(`📦 使用模板: ${templateConfig.package}`);
    console.log();
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ 更新失败");
    console.error("=".repeat(50));

    if (error.message) {
      console.error("\n📋 错误信息：");
      console.error(error.message);
    }

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
    console.error(
      "  4. 访问 https://github.com/williamDazhangyu/fastcar-cli/issues 提交问题",
    );
    console.error("-".repeat(50) + "\n");

    process.exit(1);
  }
}

module.exports = {
  updateCosTemplate,
  updateTemplateTarget,
};
