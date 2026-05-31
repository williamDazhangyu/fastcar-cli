import process from "process";
import fs from "fs";
import path from "path";
import * as utils from "./utils";
import { toCliError } from "./cliError";
import { npmCommand, runCommandOrThrow } from "./commandUtils";

export interface TemplateConfig {
  name: string;
  description: string;
  package: string;
  tags?: string[];
}

export async function downloadTemplate(packageName: string, targetDir: string): Promise<boolean> {
  console.log(`📦 正在下载模板 ${packageName}...`);
  console.log(`📂 目标目录: ${targetDir}`);

  const tempDir = path.join(process.cwd(), `.fastcar-temp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`📂 临时目录: ${tempDir}`);

  try {
    try {
      console.log(`⬇️  执行: npm pack ${packageName}...`);
      runCommandOrThrow(npmCommand, ["pack", packageName, "--pack-destination", tempDir], tempDir);
      console.log(`✅ npm pack 执行成功`);
    } catch (packError) {
      const typedPackError = toCliError(packError);
      const errorMsg = typedPackError.message || "";
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
            `📋 错误详情：${typedPackError.message}\n` +
            `💡 尝试重新执行命令，或手动检查 npm 是否正常工作`,
        );
      }
    }

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

    try {
      const extractDir = path.join(tempDir, "extracted");
      fs.mkdirSync(extractDir, { recursive: true });
      runCommandOrThrow("tar", ["-xzf", tarballPath, "-C", extractDir]);
    } catch (extractError) {
      const typedExtractError = toCliError(extractError);
      throw new Error(
        `解压模板包失败\n` +
          `📋 错误详情：${typedExtractError.message}\n` +
          `💡 解决方案：\n` +
          `  - 检查 tar 命令是否可用\n` +
          `  - 尝试手动解压：tar -xzf ${tarballPath}`,
      );
    }

    const packageDir = path.join(tempDir, "extracted", "package");
    console.log(`📂 检查 package 目录: ${packageDir}`);
    console.log(`📂 目录是否存在: ${fs.existsSync(packageDir)}`);

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

    const templateDir = path.join(packageDir, "template");
    console.log(`📂 检查 template 目录: ${templateDir}`);
    console.log(`📂 template 目录是否存在: ${fs.existsSync(templateDir)}`);

    const sourceDir = fs.existsSync(templateDir) ? templateDir : packageDir;
    console.log(`📂 源目录: ${sourceDir}`);
    console.log(`📂 目标目录: ${targetDir}`);

    console.log("📋 复制模板文件...");
    console.log(`   从: ${sourceDir}`);
    console.log(`   到: ${targetDir}`);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        `源目录不存在: ${sourceDir}\n` + `💡 可能原因：模板包结构不正确`,
      );
    }

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

    utils.delDirectory(tempDir);

    return true;
  } catch (error) {
    if (fs.existsSync(tempDir)) {
      utils.delDirectory(tempDir);
    }
    throw error;
  }
}
