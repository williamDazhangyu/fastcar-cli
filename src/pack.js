const fs = require("fs");
const path = require("path");
const process = require("process");
const { execSync } = require("child_process");
const utils = require("./utils");

/**
 * 检测可用的包管理器
 * @returns {string} 包管理器名称 (npm/yarn/pnpm)
 */
function detectPackageManager() {
  // 检查是否有 lock 文件来确定使用的包管理器
  const cwd = process.cwd();
  
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  // 默认使用 npm
  return "npm";
}

/**
 * 获取包管理器的安装命令
 * @param {string} pm - 包管理器名称
 * @returns {string} 安装命令
 */
function getInstallCommand(pm) {
  switch (pm) {
    case "yarn":
      return "yarn install --production --frozen-lockfile";
    case "pnpm":
      return "pnpm install --prod";
    case "npm":
    default:
      return "npm install --production";
  }
}

/**
 * 检查包管理器是否已安装
 * @param {string} pm - 包管理器名称
 * @returns {boolean}
 */
function isPackageManagerInstalled(pm) {
  if (pm === "npm") return true; // npm 随 Node.js 一起安装
  
  try {
    execSync(`${pm} --version`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 打包项目，使用包管理器安装生产依赖
 * @param {string} projectPath - 项目路径，默认为当前目录
 * @param {string} outputPath - 输出路径，默认为项目目录下的 dist 文件夹
 * @param {string} packageManager - 指定包管理器 (npm/yarn/pnpm)，不传则自动检测
 */
async function packProject(projectPath, outputPath, packageManager) {
  const cwd = projectPath || process.cwd();

  // 检查项目目录
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log("❌ 未找到 package.json，请在项目根目录执行此命令");
    return;
  }

  // 读取 package.json
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    console.log("❌ 解析 package.json 失败:", error.message);
    return;
  }

  // 确定包管理器
  let pm = packageManager || detectPackageManager();
  
  // 检查指定的包管理器是否可用
  if (!isPackageManagerInstalled(pm)) {
    console.log(`⚠️  未找到 ${pm}，尝试使用 npm...`);
    pm = "npm";
  }

  console.log("📦 开始打包项目...");
  console.log(`   项目路径: ${cwd}`);
  console.log(`   包管理器: ${pm}`);
  
  const deps = Object.keys(packageJson.dependencies || {});
  console.log(`   生产依赖: ${deps.length} 个`);

  // 确定输出路径
  const projectName = packageJson.name || "project";
  const version = packageJson.version || "0.0.0";
  const folderName = path.basename(cwd);
  const defaultOutputDir = outputPath || path.join(cwd, "dist");
  const zipFileName = `${projectName}-${version}.zip`;
  const zipFilePath = path.join(defaultOutputDir, zipFileName);

  // 创建临时目录，使用项目文件夹名作为根目录名
  const tempDir = path.join(cwd, `.pack-temp-${Date.now()}`);
  const rootDir = path.join(tempDir, folderName);
  
  try {
    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(defaultOutputDir, { recursive: true });

    // 复制项目文件到临时目录（排除 node_modules）
    console.log("📋 正在复制项目文件...");
    await copyProjectFiles(cwd, rootDir);

    // 复制 lock 文件（如果存在）
    const lockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    for (const lockFile of lockFiles) {
      const lockPath = path.join(cwd, lockFile);
      if (fs.existsSync(lockPath)) {
        fs.copyFileSync(lockPath, path.join(rootDir, lockFile));
      }
    }

    // 执行安装生产依赖
    console.log(`🗜️  正在使用 ${pm} 安装生产依赖...`);
    const installCmd = getInstallCommand(pm);
    try {
      execSync(installCmd, { 
        cwd: rootDir, 
        stdio: "inherit" 
      });
    } catch (error) {
      console.log(`⚠️  ${pm} 安装失败，尝试使用 npm...`);
      execSync(getInstallCommand("npm"), { 
        cwd: rootDir, 
        stdio: "inherit" 
      });
    }

    // 打包
    console.log("📦 正在生成压缩包...");
    if (fs.existsSync(zipFilePath)) {
      fs.rmSync(zipFilePath);
    }
    await utils.zipFile(rootDir, zipFilePath);

    console.log("✅ 打包完成!");
    console.log(`   输出文件: ${zipFilePath}`);
    console.log(`   解压目录: ${folderName}/`);

    // 计算文件大小
    const stats = fs.statSync(zipFilePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   文件大小: ${sizeMB} MB`);
  } catch (error) {
    console.log("❌ 打包失败:", error.message);
  } finally {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      utils.delDirEctory(tempDir);
    }
  }
}

/**
 * 复制项目文件（排除 node_modules、dist、logs 和 .log 文件）
 */
async function copyProjectFiles(src, dest) {
  const items = fs.readdirSync(src);

  for (const item of items) {
    // 跳过隐藏文件、node_modules、dist、logs 目录
    if (item.startsWith(".") || item === "node_modules" || item === "dist" || item === "logs") {
      continue;
    }

    // 跳过 .log 文件
    if (item.endsWith(".log")) {
      continue;
    }

    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // 递归复制目录
      fs.mkdirSync(destPath, { recursive: true });
      await copyProjectFiles(srcPath, destPath);
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = {
  packProject,
  detectPackageManager,
};
