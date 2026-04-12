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
 * 执行单个 skill 安装
 * @param {boolean|null} overwrite - true/false 直接覆盖/跳过，null 则询问
 */
async function installSingleSkill(skillName, skillDir, targetPath, mode, overwrite = null) {
  // 检查是否已存在
  const destPath = path.join(targetPath, skillName);
  const exists = await pathExists(destPath);

  if (exists) {
    let shouldOverwrite = overwrite;
    if (shouldOverwrite === null) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `Skill "${skillName}" 已存在，是否覆盖?`,
        default: false
      }]);
      shouldOverwrite = answer.overwrite;
    }

    if (!shouldOverwrite) {
      console.log(`⚠️ 跳过 ${skillName}`);
      return false;
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
    return true;
  } else {
    console.log(`❌ ${skillName} 安装验证失败`);
    return false;
  }
}

/**
 * 安装 skill
 */
async function installSkill(skillName, options = {}) {
  try {
    // 处理安装全部
    const isAll = skillName === 'all' || options.all;
    if (isAll) {
      const availableSkills = await listAvailableSkills();
      if (availableSkills.length === 0) {
        console.log('⚠️ 没有可用的 skills');
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

      await fsPromises.mkdir(targetPath, { recursive: true });

      // 先确认覆盖策略
      const overwriteMap = new Map();
      const existingSkills = [];
      for (const name of availableSkills) {
        const destPath = path.join(targetPath, name);
        if (await pathExists(destPath)) {
          existingSkills.push(name);
        } else {
          overwriteMap.set(name, true);
        }
      }

      let globalOverwrite = null; // null = 逐个确认, true = 全部覆盖, false = 全部跳过
      if (existingSkills.length > 0) {
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: `检测到 ${existingSkills.length} 个 skill 已存在，覆盖策略:`,
          choices: [
            { name: '全部覆盖', value: 'all' },
            { name: '逐个确认', value: 'one-by-one' },
            { name: '全部跳过', value: 'skip' }
          ],
          default: 'one-by-one'
        }]);

        if (action === 'all') {
          globalOverwrite = true;
        } else if (action === 'skip') {
          globalOverwrite = false;
        }
      }

      for (const name of existingSkills) {
        if (globalOverwrite === true) {
          overwriteMap.set(name, true);
        } else if (globalOverwrite === false) {
          overwriteMap.set(name, false);
        } else {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Skill "${name}" 已存在，是否覆盖?`,
            default: false
          }]);
          overwriteMap.set(name, overwrite);
        }
      }

      // 过滤掉选择不覆盖的
      const skillsToInstall = availableSkills.filter(name => overwriteMap.get(name));

      // 按每批 3 个并行安装
      const BATCH_SIZE = 3;
      let successCount = 0;
      for (let i = 0; i < skillsToInstall.length; i += BATCH_SIZE) {
        const batch = skillsToInstall.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (name) => {
            const skillDir = await getSkillDir(name);
            if (!skillDir) return false;
            return installSingleSkill(name, skillDir, targetPath, mode, true);
          })
        );
        successCount += results.filter(Boolean).length;
      }

      const total = availableSkills.length;
      const skipped = total - skillsToInstall.length;
      console.log();
      console.log(`🎉 共安装 ${successCount}/${total} 个 skills${skipped > 0 ? `（跳过 ${skipped} 个）` : ''}`);
      console.log();
      console.log('⚠️  重要: 请重启你的 AI agent 以加载新安装的 skills！');
      return;
    }

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

    const ok = await installSingleSkill(skillName, skillDir, targetPath, mode);

    if (ok) {
      const destPath = path.join(targetPath, skillName);
      console.log(`   位置: ${destPath}`);
      console.log();
      console.log('⚠️  重要: 请重启你的 AI agent 以加载新安装的 skill！');
      console.log();
      console.log('重启后，你可以在对话中:');
      console.log(`  • 直接询问关于 "${skillName}" 的内容`);
      console.log(`  • 使用 /skill:${skillName} 强制加载该 skill`);
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
