const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const { getTarget, getGlobalPath, getLocalPath, getAllTargets, getTargetNames } = require('./skill-targets');

const fsPromises = fs.promises;

/**
 * 获取包根目录
 */
function getPackageRoot() {
  return path.join(__dirname, '..');
}

/**
 * 获取 skills 目录
 */
function getSkillsDir() {
  return path.join(getPackageRoot(), 'skills');
}

/**
 * 检查路径是否存在
 */
async function pathExists(checkPath) {
  try {
    await fsPromises.access(checkPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出可用的 skills
 */
async function listAvailableSkills() {
  const skillsDir = getSkillsDir();
  if (!(await pathExists(skillsDir))) {
    return [];
  }
  
  try {
    const items = await fsPromises.readdir(skillsDir);
    const skills = [];
    
    for (const item of items) {
      const skillPath = path.join(skillsDir, item);
      const stat = await fsPromises.stat(skillPath);
      if (stat.isDirectory()) {
        skills.push(item);
      }
    }
    
    return skills;
  } catch {
    return [];
  }
}

/**
 * 获取 skill 目录
 */
async function getSkillDir(skillName) {
  const skillsDir = getSkillsDir();
  const skillPath = path.join(skillsDir, skillName);
  
  if (await pathExists(skillPath)) {
    return skillPath;
  }
  return null;
}

/**
 * 递归复制目录
 */
async function copyDir(src, dest) {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 删除目录
 */
async function removeDir(dirPath) {
  if (await pathExists(dirPath)) {
    await fsPromises.rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * 提示选择安装模式
 */
async function promptMode(action = 'install') {
  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
    message: `选择 ${action} 位置:`,
    choices: [
      { 
        name: `全局 (Global) - 所有项目可用`, 
        value: 'global' 
      },
      { 
        name: `本地 (Local) - 仅当前项目可用`, 
        value: 'local' 
      }
    ],
    default: 'global'
  }]);

  return mode;
}

/**
 * 安装 skill
 */
async function installSkill(skillName, options = {}) {
  try {
    // 检查 skill 是否存在
    const skillDir = await getSkillDir(skillName);
    if (!skillDir) {
      const availableSkills = await listAvailableSkills();
      console.log(`❌ Skill "${skillName}" 不存在`);
      console.log(`可用的 skills: ${availableSkills.join(', ') || '无'}`);
      return;
    }

    // 确定安装模式
    let mode = 'global';
    if (options.local) {
      mode = 'local';
    } else if (options.global) {
      mode = 'global';
    } else {
      mode = await promptMode('install');
    }

    // 确定目标
    const target = options.target || 'kimi';
    
    // 确定目标路径
    let targetPath;
    if (mode === 'local') {
      targetPath = getLocalPath(target);
    } else {
      targetPath = getGlobalPath(target);
    }

    if (!targetPath) {
      console.log('❌ 无法确定安装路径');
      return;
    }

    // 确保目标目录存在
    await fsPromises.mkdir(targetPath, { recursive: true });

    // 检查是否已存在
    const destPath = path.join(targetPath, skillName);
    const exists = await pathExists(destPath);

    if (exists) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `Skill "${skillName}" 已存在，是否覆盖?`,
        default: false
      }]);

      if (!overwrite) {
        console.log('⚠️ 已取消安装');
        return;
      }

      // 删除旧的
      await removeDir(destPath);
    }

    // 复制 skill 文件
    console.log(`📦 正在安装 ${skillName}...`);
    await copyDir(skillDir, destPath);

    // 验证安装
    if (await pathExists(destPath)) {
      const modeText = mode === 'global' ? '全局' : '本地';
      console.log(`✅ 成功 ${modeText} 安装 ${skillName}`);
      console.log(`   位置: ${destPath}`);
      console.log();
      console.log('提示:');
      console.log('  1. 重启你的 AI agent 以使用 skill');
      console.log(`  2. 在对话中询问关于 "${skillName}" 的内容`);
    } else {
      console.log('❌ 安装验证失败');
    }
  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

/**
 * 卸载 skill
 */
async function uninstallSkill(skillName, options = {}) {
  try {
    // 确定安装模式
    let mode = 'global';
    if (options.local) {
      mode = 'local';
    } else if (options.global) {
      mode = 'global';
    } else {
      mode = await promptMode('uninstall');
    }

    // 确定目标
    const target = options.target || 'kimi';
    
    // 确定目标路径
    let targetPath;
    if (mode === 'local') {
      targetPath = getLocalPath(target);
    } else {
      targetPath = getGlobalPath(target);
    }

    const skillPath = path.join(targetPath, skillName);

    // 检查是否存在
    if (!(await pathExists(skillPath))) {
      console.log(`⚠️ Skill "${skillName}" 不存在于 ${skillPath}`);
      return;
    }

    // 确认卸载
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `确认卸载 "${skillName}"?`,
      default: false
    }]);

    if (!confirm) {
      console.log('⚠️ 已取消卸载');
      return;
    }

    // 删除 skill
    console.log(`🗑️  正在卸载 ${skillName}...`);
    await removeDir(skillPath);

    console.log(`✅ 成功卸载 ${skillName}`);
  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

/**
 * 列出可用的 skills
 */
async function listSkills() {
  try {
    const skills = await listAvailableSkills();

    if (skills.length === 0) {
      console.log('⚠️ 没有可用的 skills');
      return;
    }

    console.log('📚 可用的 FastCar Skills:');
    console.log();
    
    for (const skill of skills) {
      const skillDir = await getSkillDir(skill);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      
      let description = '';
      if (await pathExists(skillMdPath)) {
        const content = await fsPromises.readFile(skillMdPath, 'utf-8');
        const match = content.match(/description:\s*(.+)/);
        if (match) {
          description = match[1].trim();
        }
      }

      console.log(`  • ${skill}`);
      if (description) {
        console.log(`    ${description}`);
      }
    }

    console.log();
    console.log('安装命令: fastcar-cli skill install <skill-name>');
  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

/**
 * 列出支持的目标 agents
 */
function listTargets() {
  const targets = getAllTargets();

  console.log('🤖 支持的 AI Agents:');
  console.log();

  for (const [key, config] of Object.entries(targets)) {
    const globalPath = getGlobalPath(key);
    const localPath = getLocalPath(key);

    console.log(`  • ${config.name} (${key})`);
    console.log(`    ${config.description}`);
    console.log(`    全局: ${globalPath}`);
    console.log(`    本地: ${localPath}`);
    console.log();
  }
}

/**
 * 初始化项目级配置
 */
async function initSkill(options = {}) {
  try {
    const target = options.target || 'kimi';
    const localPath = getLocalPath(target);

    console.log(`🔧 正在初始化 ${target} 配置...`);

    if (await pathExists(localPath)) {
      console.log(`⚠️ 目录已存在: ${localPath}`);
      return;
    }

    await fsPromises.mkdir(localPath, { recursive: true });
    
    console.log(`✅ 已创建 ${localPath}`);
    console.log();
    console.log('下一步:');
    console.log(`  fastcar-cli skill install <skill-name> --local`);
  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

module.exports = {
  installSkill,
  uninstallSkill,
  listSkills,
  listTargets,
  initSkill
};
