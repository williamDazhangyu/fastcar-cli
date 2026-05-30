import fs from "fs";
import path from "path";
import process from "process";
import { spawnSync } from "child_process";
import { delDirectory, zipFile } from "./utils";

interface PackageJsonLike {
  name?: string;
  version?: string;
  dependencies?: Record<string, unknown>;
}

type PackageManager = "npm" | "yarn" | "pnpm" | string;

const SUPPORTED_PACKAGE_MANAGERS = new Set(["npm", "yarn", "pnpm"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function detectPackageManager(): PackageManager {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

function normalizePackageManager(pm: PackageManager | null | undefined): "npm" | "yarn" | "pnpm" {
  const normalized = String(pm || "").trim();
  return SUPPORTED_PACKAGE_MANAGERS.has(normalized)
    ? normalized as "npm" | "yarn" | "pnpm"
    : "npm";
}

function getInstallArgs(pm: PackageManager): string[] {
  switch (pm) {
    case "yarn":
      return ["install", "--production", "--frozen-lockfile"];
    case "pnpm":
      return ["install", "--prod"];
    case "npm":
    default:
      return ["install", "--production"];
  }
}

function isPackageManagerInstalled(pm: PackageManager): boolean {
  if (pm === "npm") {
    return true;
  }

  try {
    const result = spawnSync(pm, ["--version"], { stdio: "pipe", shell: false, windowsHide: true });
    return result.status === 0;
  } catch {
    return false;
  }
}

export async function packProject(
  projectPath?: string | null,
  outputPath?: string | null,
  packageManager?: PackageManager | null,
): Promise<void> {
  const cwd = projectPath || process.cwd();

  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log("❌ 未找到 package.json，请在项目根目录执行此命令");
    return;
  }

  let packageJson: PackageJsonLike;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
  } catch (error) {
    console.log("❌ 解析 package.json 失败:", errorMessage(error));
    return;
  }

  let pm = normalizePackageManager(packageManager || detectPackageManager());
  if (!isPackageManagerInstalled(pm)) {
    console.log(`⚠️  未找到 ${pm}，尝试使用 npm...`);
    pm = "npm";
  }

  console.log("📦 开始打包项目...");
  console.log(`   项目路径: ${cwd}`);
  console.log(`   包管理器: ${pm}`);

  const deps = Object.keys(packageJson.dependencies || {});
  console.log(`   生产依赖: ${deps.length} 个`);

  const projectName = packageJson.name || "project";
  const version = packageJson.version || "0.0.0";
  const folderName = path.basename(cwd);
  const defaultOutputDir = outputPath || path.join(cwd, "dist");
  const tgzFileName = `${projectName}-${version}.tgz`;
  const tgzFilePath = path.join(defaultOutputDir, tgzFileName);

  const tempDir = path.join(cwd, `.pack-temp-${Date.now()}`);
  const rootDir = path.join(tempDir, folderName);

  try {
    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(defaultOutputDir, { recursive: true });

    console.log("📋 正在复制项目文件...");
    await copyProjectFiles(cwd, rootDir);

    const lockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    for (const lockFile of lockFiles) {
      const lockPath = path.join(cwd, lockFile);
      if (fs.existsSync(lockPath)) {
        fs.copyFileSync(lockPath, path.join(rootDir, lockFile));
      }
    }

    console.log(`🗜️  正在使用 ${pm} 安装生产依赖...`);
    const installArgs = getInstallArgs(pm);
    try {
      const installResult = spawnSync(pm, installArgs, {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      });
      if (installResult.status !== 0) {
        throw new Error(`${pm} install exited with ${installResult.status}`);
      }
    } catch {
      console.log(`⚠️  ${pm} 安装失败，尝试使用 npm...`);
      const fallbackResult = spawnSync("npm", getInstallArgs("npm"), {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      });
      if (fallbackResult.status !== 0) {
        throw new Error(`npm install exited with ${fallbackResult.status}`);
      }
    }

    console.log("📦 正在生成压缩包...");
    if (fs.existsSync(tgzFilePath)) {
      fs.rmSync(tgzFilePath);
    }
    await zipFile(rootDir, tgzFilePath);

    console.log("✅ 打包完成!");
    console.log(`   输出文件: ${tgzFilePath}`);
    console.log(`   解压目录: ${folderName}/`);

    const stats = fs.statSync(tgzFilePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   文件大小: ${sizeMB} MB`);
  } catch (error) {
    console.log("❌ 打包失败:", errorMessage(error));
  } finally {
    if (fs.existsSync(tempDir)) {
      delDirectory(tempDir);
    }
  }
}

async function copyProjectFiles(src: string, dest: string): Promise<void> {
  const items = fs.readdirSync(src);

  for (const item of items) {
    if (item.startsWith(".") || item === "node_modules" || item === "dist" || item === "logs") {
      continue;
    }

    if (item.endsWith(".log")) {
      continue;
    }

    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      await copyProjectFiles(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
