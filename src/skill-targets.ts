import path from "path";
import os from "os";

export interface SkillTargetConfig {
  name: string;
  description: string;
  globalPaths: Partial<Record<NodeJS.Platform, string>> & { linux: string };
  localPath: string;
}

export const TARGETS = {
  agents: {
    name: "Generic Agent Skills",
    description: "Shared skills directory recognized by Codex and other OpenAI-compatible agents",
    globalPaths: {
      win32: path.join(os.homedir(), ".agents/skills"),
      darwin: path.join(os.homedir(), ".agents/skills"),
      linux: path.join(os.homedir(), ".agents/skills"),
    },
    localPath: ".agents/skills",
  },
  codex: {
    name: "Codex",
    description: "OpenAI Codex agent skills using the shared agents directory",
    globalPaths: {
      win32: path.join(os.homedir(), ".agents/skills"),
      darwin: path.join(os.homedir(), ".agents/skills"),
      linux: path.join(os.homedir(), ".agents/skills"),
    },
    localPath: ".agents/skills",
  },
  kimi: {
    name: "Kimi Code CLI",
    description: "Kimi Code extension for VS Code",
    globalPaths: {
      win32: path.join(os.homedir(), ".kimi/skills"),
      darwin: path.join(os.homedir(), ".kimi/skills"),
      linux: path.join(os.homedir(), ".kimi/skills"),
    },
    localPath: ".agents/skills",
  },
  claude: {
    name: "Claude Code",
    description: "Claude Code CLI",
    globalPaths: {
      win32: path.join(os.homedir(), ".claude/skills"),
      darwin: path.join(os.homedir(), ".claude/skills"),
      linux: path.join(os.homedir(), ".config/claude/skills"),
    },
    localPath: ".claude/skills",
  },
  cursor: {
    name: "Cursor",
    description: "Cursor IDE",
    globalPaths: {
      win32: path.join(os.homedir(), ".cursor/skills"),
      darwin: path.join(os.homedir(), ".cursor/skills"),
      linux: path.join(os.homedir(), ".config/cursor/skills"),
    },
    localPath: ".cursor/skills",
  },
} satisfies Record<string, SkillTargetConfig>;

export type SkillTargetName = keyof typeof TARGETS;

export function getTarget(target: string): SkillTargetConfig | null {
  return TARGETS[target as SkillTargetName] || null;
}

export function getGlobalPath(target: string): string | null {
  const config = getTarget(target);
  if (!config) {
    return null;
  }

  const platform = process.platform;
  return config.globalPaths[platform] || config.globalPaths.linux;
}

export function getLocalPath(target: string, cwd = process.cwd()): string | null {
  const config = getTarget(target);
  if (!config || !config.localPath) {
    return null;
  }

  return path.join(cwd, config.localPath);
}

export function getAllTargets(): Record<string, SkillTargetConfig> {
  return TARGETS;
}

export function getTargetNames(): string[] {
  return Object.keys(TARGETS);
}
