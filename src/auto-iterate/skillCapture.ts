import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { getSessionPaths, slugifySessionName, toRelative, type SessionPaths } from "./sessionPaths";
import { readJsonFile, writeJsonFileAtomic } from "./stateIO";
import { resolveStateFileForValidation } from "./sessionStateValidation";
import { inferLanguageFromState, getLanguageText, languageCode } from "../pipeline/language";
import { validationHistoryEntries } from "../pipeline/validationCommands";

const SKILL_CAPTURE_MAX_TEXT_LENGTH = 220;
const SKILL_CAPTURE_SENSITIVE_PATTERNS = [
  {
    pattern: /\b(authorization)\s*[:=]\s*bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: "$1: Bearer [REDACTED]",
  },
  {
    pattern: /\b(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|connection[_-]?string|dsn|jwt)\s*[:=]\s*[^;\s,)\]}]+/gi,
    replacement: "$1=[REDACTED]",
  },
  {
    pattern: /([a-z][a-z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s/]+)@/gi,
    replacement: "$1[REDACTED]@",
  },
  {
    pattern: /\b[A-Za-z0-9_~+/=-]{32,}\b/g,
    replacement: "[REDACTED_TOKEN]",
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
];

type StateObject = Record<string, any>;

interface SkillCandidateDraft {
  name: string;
  title: string;
  description: string;
  scenarios: Set<string>;
  approaches: Set<string>;
  verifications: Set<string>;
  pitfalls: Set<string>;
  sourceRequirements: string[];
  sourceDecisions: string[];
}

export interface SkillCandidate {
  name: string;
  title: string;
  description: string;
  scenarios: string[];
  approaches: string[];
  verifications: string[];
  pitfalls: string[];
  sourceRequirements: string[];
  sourceDecisions: string[];
  session: string;
}

interface AddCandidateData {
  title?: string;
  description?: string;
  scenario?: unknown;
  approach?: unknown;
  verification?: unknown;
  pitfall?: unknown;
  sourceReq?: string;
  sourceDecision?: string;
}

export interface CaptureSkillsOptions {
  yes?: boolean;
}

function getIsoTimestamp(): string {
  return new Date().toISOString();
}

export function sanitizeSkillCaptureText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text = String(value)
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  for (const item of SKILL_CAPTURE_SENSITIVE_PATTERNS) {
    text = text.replace(item.pattern, item.replacement);
  }

  if (text.length > SKILL_CAPTURE_MAX_TEXT_LENGTH) {
    text = `${text.slice(0, SKILL_CAPTURE_MAX_TEXT_LENGTH - 3).trim()}...`;
  }

  return text;
}

export function isHighValueSkillCaptureText(value: unknown): boolean {
  const text = sanitizeSkillCaptureText(value);
  if (text.length < 8) {
    return false;
  }

  if (/^(无|none|null|unknown|pending|未指定|未运行|not_run|尚未开始)$/i.test(text)) {
    return false;
  }

  if (/^(测试通过|验证通过|passed|ok|success)$/i.test(text)) {
    return false;
  }

  if (/(一次性日志|完整日志|客户数据|用户数据|secret|password|token|api[_-]?key)/i.test(text) &&
      /\[REDACTED/.test(text) === false) {
    return false;
  }

  return true;
}

export function extractSkillCandidates(stateJson: StateObject): SkillCandidate[] {
  const language = inferLanguageFromState(stateJson);
  const isEnglish = languageCode(language) === "en";
  const requirements = Array.isArray(stateJson.requirements) ? stateJson.requirements : [];
  const decisions = stateJson.decisions || {};
  const deliveryEvidence = stateJson.deliveryEvidence || {};
  const validation = stateJson.validation || {};
  const implementationContract = stateJson.implementationContract || {};
  const session = stateJson.session || {};
  const candidateMap = new Map<string, SkillCandidateDraft>();

  function addCandidate(name: string, data: AddCandidateData): void {
    if (!candidateMap.has(name)) {
      candidateMap.set(name, {
        name,
        title: data.title || name,
        description: data.description || "",
        scenarios: new Set(),
        approaches: new Set(),
        verifications: new Set(),
        pitfalls: new Set(),
        sourceRequirements: [],
        sourceDecisions: [],
      });
    }

    const candidate = candidateMap.get(name);
    if (!candidate) {
      return;
    }
    const scenario = sanitizeSkillCaptureText(data.scenario);
    const approach = sanitizeSkillCaptureText(data.approach);
    const verification = sanitizeSkillCaptureText(data.verification);
    const pitfall = sanitizeSkillCaptureText(data.pitfall);
    if (isHighValueSkillCaptureText(scenario)) candidate.scenarios.add(scenario);
    if (isHighValueSkillCaptureText(approach)) candidate.approaches.add(approach);
    if (isHighValueSkillCaptureText(verification)) candidate.verifications.add(verification);
    if (isHighValueSkillCaptureText(pitfall)) candidate.pitfalls.add(pitfall);
    if (data.sourceReq) candidate.sourceRequirements.push(data.sourceReq);
    if (data.sourceDecision) candidate.sourceDecisions.push(data.sourceDecision);
  }

  const frameworkKeywords = [
    { pattern: /fastcar|@fastcar|Koa|Controller|Component|Service|Autowired|Application/i, skill: "fastcar-framework", title: isEnglish ? "FastCar Framework Practice Notes" : "FastCar Framework 实践经验" },
    { pattern: /数据库|database|mysql|postgresql|pgsql|MongoDB|Redis|ORM|mapper|entity|transaction|事务/i, skill: "fastcar-database", title: isEnglish ? "FastCar Database Practice Notes" : "FastCar 数据库实践经验" },
    { pattern: /RPC|rpc|微服务|microservice|gRPC|WebSocket|Socket\.IO|MQTT|protobuf/i, skill: "fastcar-rpc-microservices", title: isEnglish ? "FastCar RPC/Microservices Practice Notes" : "FastCar RPC/微服务实践经验" },
    { pattern: /serverless|Serverless|阿里云|腾讯云|AWS Lambda|FC|SCF|云函数/i, skill: "fastcar-serverless", title: isEnglish ? "FastCar Serverless Practice Notes" : "FastCar Serverless 实践经验" },
    { pattern: /缓存|cache|定时任务|cron|时间轮|time.wheel|workerpool|文件监听|COS|对象存储/i, skill: "fastcar-toolkit", title: isEnglish ? "FastCar Toolkit Practice Notes" : "FastCar 工具集实践经验" },
    { pattern: /队列|queue|pg.?boss|PgBoss|job|schedule|worker|dead.letter/i, skill: "fastcar-pgboss", title: isEnglish ? "FastCar PgBoss Queue Practice Notes" : "FastCar PgBoss 队列实践经验" },
    { pattern: /TypeScript|类型|type|interface|enum|泛型|generic|类型安全/i, skill: "typescript-coding-style", title: isEnglish ? "TypeScript Coding Practice Notes" : "TypeScript 编码实践经验" },
  ];

  const sessionSkillName = slugifySessionName(`captured-${session.session || "session"}`);
  const sessionSkillTitle = isEnglish
    ? `Session ${session.session || "unknown"} Skill Notes`
    : `Session ${session.session || "unknown"} 技能沉淀`;
  const sessionSkillDescription = isEnglish
    ? "General practice notes extracted from an auto-iterate session"
    : "从自动迭代 session 提取的通用实战经验";

  for (const req of requirements) {
    const summary = req.summary || "";
    const evidence = req.evidence || "";
    const combined = `${summary} ${evidence}`;
    const sanitizedEvidence = sanitizeSkillCaptureText(req.evidence || req.nextStep || "");

    for (const item of frameworkKeywords) {
      if (item.pattern.test(combined)) {
        addCandidate(item.skill, {
          title: item.title,
          description: isEnglish
            ? `Practice notes automatically extracted from session ${session.session || "unknown"}`
            : `从 session ${session.session || "unknown"} 自动提取的实战经验`,
          scenario: req.summary,
          approach: sanitizedEvidence,
          sourceReq: req.id || "",
        });
      }
    }

    if (req.status === "passed" && isHighValueSkillCaptureText(sanitizedEvidence)) {
      addCandidate(sessionSkillName, {
        title: sessionSkillTitle,
        description: sessionSkillDescription,
        scenario: req.summary,
        approach: sanitizedEvidence,
        verification: sanitizedEvidence,
        sourceReq: req.id || "",
      });
    }

    if (req.status === "blocked" && isHighValueSkillCaptureText(req.blockedReason)) {
      addCandidate(sessionSkillName, {
        title: sessionSkillTitle,
        pitfall: `${req.summary}: ${req.blockedReason}`,
        sourceReq: req.id || "",
      });
    }
  }

  const decisionFields = [
    "parallelWriteConfirmation",
    "coderFileOwnership",
    "fallbackStrategy",
    "architectureDecision",
    "compatibilityDecision",
    "resourceDecision",
    "scopeDecision",
  ];
  for (const field of decisionFields) {
    const sanitizedValue = sanitizeSkillCaptureText(decisions[field]);
    if (isHighValueSkillCaptureText(sanitizedValue)) {
      addCandidate(sessionSkillName, {
        title: sessionSkillTitle,
        approach: `${isEnglish ? "Decision" : "决策"} ${field}: ${sanitizedValue}`,
        sourceDecision: field,
      });
    }
  }

  const validationCommands = validationHistoryEntries(Array.isArray(validation.commands) ? validation.commands : []);
  for (const cmd of validationCommands) {
    const commandText = sanitizeSkillCaptureText(cmd.command);
    if (isHighValueSkillCaptureText(commandText)) {
      const resultText = cmd.result === "passed" ? "通过" :
        cmd.result === "failed" ? (isEnglish ? "failed" : "失败") : (isEnglish ? "not run" : "未运行");
      const summary = sanitizeSkillCaptureText(cmd.summary);
      addCandidate(sessionSkillName, {
        title: sessionSkillTitle,
        verification: `${commandText} - ${resultText}${isHighValueSkillCaptureText(summary) ? `: ${summary}` : ""}`,
      });
    }
  }

  const contractFields = ["goal", "scope", "nonGoals", "constraints", "architecture", "successCriteria"];
  for (const field of contractFields) {
    const sanitizedValue = sanitizeSkillCaptureText(implementationContract[field]);
    if (isHighValueSkillCaptureText(sanitizedValue)) {
      addCandidate(sessionSkillName, {
        title: sessionSkillTitle,
        approach: `${isEnglish ? "Contract" : "契约"} ${field}: ${sanitizedValue}`,
      });
    }
  }

  const changedFiles = Array.isArray(deliveryEvidence.changedFiles)
    ? deliveryEvidence.changedFiles
    : (Array.isArray(deliveryEvidence.changed_files) ? deliveryEvidence.changed_files : []);
  const fileExtensions = new Set<string>();
  for (const item of changedFiles) {
    const file = typeof item === "string" ? item : (item.path || item.file || "");
    const ext = path.extname(file).toLowerCase();
    if (ext) fileExtensions.add(ext);
  }
  if (fileExtensions.has(".ts") || fileExtensions.has(".tsx")) {
    addCandidate(sessionSkillName, {
      title: sessionSkillTitle,
      approach: isEnglish
        ? "TypeScript files changed; pay attention to type safety and import conventions"
        : "涉及 TypeScript 文件修改，注意类型安全和 import 规范",
    });
  }

  const result: SkillCandidate[] = [];
  for (const [, candidate] of candidateMap) {
    const scenarios = [...candidate.scenarios].filter(Boolean);
    const approaches = [...candidate.approaches].filter(Boolean);
    const verifications = [...candidate.verifications].filter(Boolean);
    const pitfalls = [...candidate.pitfalls].filter(Boolean);
    if (scenarios.length || approaches.length || verifications.length || pitfalls.length) {
      result.push({
        name: candidate.name,
        title: candidate.title,
        description: candidate.description,
        scenarios,
        approaches,
        verifications,
        pitfalls,
        sourceRequirements: [...new Set(candidate.sourceRequirements)].filter(Boolean),
        sourceDecisions: [...new Set(candidate.sourceDecisions)].filter(Boolean),
        session: session.session || "unknown",
      });
    }
  }

  return result;
}

export function buildSkillMarkdown(candidate: SkillCandidate, language: unknown): string {
  const text = getLanguageText(language);
  const lines = [
    "---",
    `name: ${candidate.name}`,
    `description: ${candidate.description || text.skillAutoDescription(candidate.session)}`,
    "---",
    "",
    `# ${candidate.title || candidate.name}`,
    "",
  ];

  const sections: [string, string[]][] = [
    [text.skillSections.scenarios, candidate.scenarios],
    [text.skillSections.approaches, candidate.approaches],
    [text.skillSections.verifications, candidate.verifications],
    [text.skillSections.pitfalls, candidate.pitfalls],
  ];
  for (const [title, values] of sections) {
    if (values && values.length > 0) {
      lines.push(`## ${title}`, "");
      for (const value of values) {
        lines.push(`- ${value}`);
      }
      lines.push("");
    }
  }

  if (candidate.sourceRequirements && candidate.sourceRequirements.length > 0) {
    lines.push(`## ${text.skillSections.source}`, "");
    lines.push(`- Session: ${candidate.session || "unknown"}`);
    lines.push(languageCode(language) === "en"
      ? `- Related requirements: ${candidate.sourceRequirements.join(", ")}`
      : `- 相关需求: ${candidate.sourceRequirements.join(", ")}`);
    if (candidate.sourceDecisions && candidate.sourceDecisions.length > 0) {
      lines.push(languageCode(language) === "en"
        ? `- Related decisions: ${candidate.sourceDecisions.join(", ")}`
        : `- 相关决策: ${candidate.sourceDecisions.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(text.generatedByCapture);
  lines.push(text.generatedAt(getIsoTimestamp()));
  lines.push(text.reviewSkill);
  lines.push("");
  return lines.join("\n");
}

export function buildSkillsIndexEntry(candidate: SkillCandidate): string {
  const escapeCell = (value: unknown) => sanitizeSkillCaptureText(value).replace(/\|/g, "\\|");
  return `| ${escapeCell(candidate.name)} | ${escapeCell(candidate.title || candidate.name)} | ${candidate.scenarios ? escapeCell(candidate.scenarios.slice(0, 3).join("；")) : ""} | ${escapeCell(candidate.session || "unknown")} |`;
}

export async function updateSkillsIndexFile(
  skillsDir: string,
  candidates: SkillCandidate[],
  language: unknown,
): Promise<{ content: string; changed: boolean }> {
  const text = getLanguageText(language);
  const indexPath = path.join(skillsDir, "index.md");
  let existingContent = "";
  try {
    existingContent = await fs.promises.readFile(indexPath, "utf8");
  } catch {
    // Create below.
  }

  const existingEntries = new Set<string>();
  const entryPattern = /^\|\s*([^|]+)\s*\|/gm;
  let match;
  while ((match = entryPattern.exec(existingContent)) !== null) {
    existingEntries.add(match[1].trim());
  }

  if (existingContent && existingContent.includes("| 技能名称 |")) {
    let changed = false;
    const lines = existingContent.split("\n");
    const newLines: string[] = [];
    let inTable = false;
    let tableEnded = false;
    for (const line of lines) {
      newLines.push(line);
      if (line.startsWith("| 技能名称 |") || line.startsWith("| Skill |")) {
        inTable = true;
        continue;
      }
      if (inTable && !tableEnded && (line.trim() === "" || !line.startsWith("|"))) {
        for (const candidate of candidates) {
          if (!existingEntries.has(candidate.name)) {
            newLines.splice(newLines.length - 1, 0, buildSkillsIndexEntry(candidate));
            changed = true;
          }
        }
        tableEnded = true;
      }
    }
    if (inTable && !tableEnded) {
      for (const candidate of candidates) {
        if (!existingEntries.has(candidate.name)) {
          newLines.push(buildSkillsIndexEntry(candidate));
          changed = true;
        }
      }
    }
    return { content: newLines.join("\n"), changed };
  }

  const now = getIsoTimestamp();
  let content = `${text.skillsIndexTitle}

${text.skillsIndexNotice(now)}

${text.capturedSkillsHeading}

${text.skillsIndexHeader}
|----------|------|-------------|-------------|
`;
  for (const candidate of candidates) {
    content += `${buildSkillsIndexEntry(candidate)}\n`;
  }
  content += `\n${text.skillsIndexUsage}\n`;
  return { content, changed: true };
}

export async function updateStateMarkdownSkillCapture(
  stateMdPath: string,
  skillCapture: StateObject,
): Promise<void> {
  let content;
  try {
    content = await fs.promises.readFile(stateMdPath, "utf8");
  } catch {
    return;
  }

  const capturedFilesText = (skillCapture.capturedFiles || []).length > 0
    ? skillCapture.capturedFiles.join(", ")
    : "无";
  const skippedReasonsText = (skillCapture.skippedReasons || []).length > 0
    ? skillCapture.skippedReasons.join("; ")
    : "无";
  const pendingText = (skillCapture.pendingCandidates || []).length > 0
    ? skillCapture.pendingCandidates.join(", ")
    : "无";
  const newSection = `status：${skillCapture.status || "pending"}
root：${skillCapture.root || ".agents/skills"}
index_file：${skillCapture.indexFile || ".agents/skills/index.md"}
captured_files：${capturedFilesText}
pending_candidates：${pendingText}
skipped_reasons：${skippedReasonsText}
selection_criteria：${skillCapture.selectionCriteria || "只沉淀可复用、可验证、跨任务有价值的技能点；不要记录密钥、客户数据、一次性日志或完整源码"}
last_run_summary：${skillCapture.lastRunSummary || ""}
执行时机：每次任务交付、提前停止或阶段性验收后，先提取高价值技能点，再更新 .agents/skills/index.md；没有高价值内容时写明 skipped_no_high_value 和原因`;
  const escapedHeading = "## Skill Capture / 技能沉淀".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escapedHeading}\\s*\\r?\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");
  if (pattern.test(content)) {
    await fs.promises.writeFile(stateMdPath, content.replace(pattern, `$1${newSection}\n\n`), "utf8");
  }
}

export async function writeCapturedSkills(
  sessionPaths: SessionPaths,
  candidates: SkillCandidate[],
  session: string,
  stateJson: StateObject,
  currentSkillCapture: StateObject,
): Promise<void> {
  const language = inferLanguageFromState(stateJson);
  const text = getLanguageText(language);
  const skillsDir = path.join(process.cwd(), ".agents", "skills");
  await fs.promises.mkdir(skillsDir, { recursive: true });

  const capturedFiles = [];
  for (const candidate of candidates) {
    const skillDir = path.join(skillsDir, candidate.name);
    await fs.promises.mkdir(skillDir, { recursive: true });
    const skillMdPath = path.join(skillDir, "SKILL.md");
    await fs.promises.writeFile(skillMdPath, buildSkillMarkdown(candidate, language), "utf8");
    capturedFiles.push(toRelative(skillMdPath));
    console.log(`📝 已写入: ${toRelative(skillMdPath)}`);
  }

  const { content: indexContent, changed } = await updateSkillsIndexFile(skillsDir, candidates, language);
  const indexPath = path.join(skillsDir, "index.md");
  await fs.promises.writeFile(indexPath, indexContent, "utf8");
  capturedFiles.push(toRelative(indexPath));
  console.log(changed
    ? `📋 已更新索引: ${toRelative(indexPath)}`
    : `📋 索引已存在对应入口: ${toRelative(indexPath)}`);

  const now = getIsoTimestamp();
  const updatedCapture = {
    ...currentSkillCapture,
    status: "captured",
    capturedFiles: [...new Set([...(currentSkillCapture.capturedFiles || []), ...capturedFiles])],
    pendingCandidates: [],
    lastRunSummary: text.capturedSummary(now, candidates.length, candidates.map((candidate) => candidate.name).join(", ")),
  };
  stateJson.skillCapture = updatedCapture;
  stateJson.updatedAt = now;
  await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateJson);
  await updateStateMarkdownSkillCapture(sessionPaths.sessionStatePath, updatedCapture);

  console.log("");
  console.log(`✅ 技能沉淀完成：${candidates.length} 个技能 → .agents/skills/`);
  console.log(`   Session: ${session}`);
  console.log(`   技能目录: ${toRelative(skillsDir)}`);
  console.log("   已更新 state.json 和 state.md 中的 skillCapture 状态。");
}

export async function captureSkills(
  sessionName: string,
  options: CaptureSkillsOptions = {},
): Promise<void> {
  const stateInfo = await resolveStateFileForValidation(sessionName);
  const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
  if (!session || session === "unknown") {
    console.log("❌ 无法确定 session，请传入 --capture-skills <session>");
    process.exitCode = 1;
    return;
  }

  const sessionPaths = getSessionPaths(session);
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath) as StateObject | null;
  if (!stateJson) {
    console.log(`❌ 缺少或无法解析 state.json: ${toRelative(sessionPaths.sessionStateJsonPath)}`);
    process.exitCode = 1;
    return;
  }

  const currentSkillCapture = stateJson.skillCapture || {};
  const language = inferLanguageFromState(stateJson);
  const text = getLanguageText(language);
  if (currentSkillCapture.status === "captured") {
    console.log(`⚠️  Session "${session}" 已执行过技能沉淀 (status=captured)。`);
    console.log(`   已捕获文件: ${(currentSkillCapture.capturedFiles || []).join(", ") || "无"}`);
    return;
  }

  console.log(`🔍 正在从 session "${session}" 提取技能候选...`);
  const candidates = extractSkillCandidates(stateJson);
  if (candidates.length === 0) {
    const now = getIsoTimestamp();
    const updatedCapture = {
      ...currentSkillCapture,
      status: "skipped_no_high_value",
      skippedReasons: [
        ...(currentSkillCapture.skippedReasons || []),
        text.noHighValueReason,
      ],
      lastRunSummary: text.noHighValueSummary(now),
    };
    stateJson.skillCapture = updatedCapture;
    stateJson.updatedAt = now;
    await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateJson);
    await updateStateMarkdownSkillCapture(sessionPaths.sessionStatePath, updatedCapture);
    console.log("✅ 已将 skillCapture.status 标记为 skipped_no_high_value。");
    return;
  }

  console.log(`\n发现 ${candidates.length} 个技能候选:\n`);
  candidates.forEach((candidate, index) => {
    console.log(`  [${index + 1}] ${candidate.name}`);
    console.log(`      标题: ${candidate.title}`);
    if (candidate.scenarios.length > 0) {
      console.log(`      触发场景: ${candidate.scenarios.slice(0, 3).join("；")}${candidate.scenarios.length > 3 ? "..." : ""}`);
    }
    if (candidate.approaches.length > 0) {
      console.log(`      可靠做法: ${candidate.approaches.length} 条`);
    }
    if (candidate.verifications.length > 0) {
      console.log(`      验证方式: ${candidate.verifications.length} 条`);
    }
    if (candidate.pitfalls.length > 0) {
      console.log(`      常见误区: ${candidate.pitfalls.length} 条`);
    }
    console.log("");
  });

  if (options.yes) {
    console.log("🤖 非交互模式：自动捕获全部候选。\n");
    await writeCapturedSkills(sessionPaths, candidates, session, stateJson, currentSkillCapture);
    return;
  }

  const { selected } = await inquirer.prompt<{ selected: number[] }>([{
    type: "checkbox",
    name: "selected",
    message: "选择要沉淀的技能 (空格选中，回车确认):",
    choices: [
      ...candidates.map((candidate, index) => ({
        name: `[${index + 1}] ${candidate.name} - ${candidate.title}`,
        value: index,
      })),
      { name: "跳过全部 (标记 skipped_no_high_value)", value: -1 },
    ],
  }]);

  if (selected.length === 0 || (selected.length === 1 && selected[0] === -1)) {
    const now = getIsoTimestamp();
    const updatedCapture = {
      ...currentSkillCapture,
      status: "skipped_no_high_value",
      skippedReasons: [
        ...(currentSkillCapture.skippedReasons || []),
        text.userSkippedSkillCapture,
      ],
      lastRunSummary: text.userSkippedSkillCaptureSummary(now),
    };
    stateJson.skillCapture = updatedCapture;
    stateJson.updatedAt = now;
    await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateJson);
    await updateStateMarkdownSkillCapture(sessionPaths.sessionStatePath, updatedCapture);
    console.log("✅ 已将 skillCapture.status 标记为 skipped_no_high_value。");
    return;
  }

  await writeCapturedSkills(
    sessionPaths,
    selected.filter((item: number) => item >= 0).map((item: number) => candidates[item]),
    session,
    stateJson,
    currentSkillCapture,
  );
}
