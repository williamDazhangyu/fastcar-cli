const path = require('path');
const os = require('os');

/**
 * 目标 AI Agent 配置
 */
const TARGETS = {
  kimi: {
    name: 'Kimi Code CLI',
    description: 'Kimi Code extension for VS Code',
    globalPaths: {
      win32: path.join(os.homedir(), '.kimi/skills'),
      darwin: path.join(os.homedir(), '.kimi/skills'),
      linux: path.join(os.homedir(), '.kimi/skills')
    },
    localPath: '.agents/skills'
  },
  claude: {
    name: 'Claude Code',
    description: 'Claude Code CLI',
    globalPaths: {
      win32: path.join(os.homedir(), '.claude/skills'),
      darwin: path.join(os.homedir(), '.claude/skills'),
      linux: path.join(os.homedir(), '.config/claude/skills')
    },
    localPath: '.claude/skills'
  },
  cursor: {
    name: 'Cursor',
    description: 'Cursor IDE',
    globalPaths: {
      win32: path.join(os.homedir(), '.cursor/skills'),
      darwin: path.join(os.homedir(), '.cursor/skills'),
      linux: path.join(os.homedir(), '.config/cursor/skills')
    },
    localPath: '.cursor/skills'
  }
};

function getTarget(target) {
  return TARGETS[target] || null;
}

function getGlobalPath(target) {
  const config = getTarget(target);
  if (!config) return null;
  
  const platform = process.platform;
  return config.globalPaths[platform] || config.globalPaths.linux;
}

function getLocalPath(target, cwd = process.cwd()) {
  const config = getTarget(target);
  if (!config || !config.localPath) return null;
  
  return path.join(cwd, config.localPath);
}

function getAllTargets() {
  return TARGETS;
}

function getTargetNames() {
  return Object.keys(TARGETS);
}

module.exports = {
  TARGETS,
  getTarget,
  getGlobalPath,
  getLocalPath,
  getAllTargets,
  getTargetNames
};
