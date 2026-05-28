// @ts-check

/**
 * CommonJS runtime mirror for stateMarkdownParsers.ts.
 * Keep this file behavior-identical while the CLI still runs directly from src/*.js.
 */

/**
 * @typedef {{ raw: string, [field: string]: string }} ParsedSubAgentItem
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} content
 * @param {string} heading
 * @returns {string}
 */
function extractSection(content, heading) {
  const escapedHeading = escapeRegExp(heading);
  const pattern = new RegExp(
    `^${escapedHeading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = content.match(pattern);
  return match && match[1] ? match[1].trimEnd() : "";
}

/**
 * @param {string} content
 * @param {string[]} headings
 * @returns {string}
 */
function extractFirstSection(content, headings) {
  for (const heading of headings) {
    const section = extractSection(content, heading);
    if (section) {
      return section;
    }
  }
  return "";
}

/**
 * @param {string} section
 * @param {string} fieldName
 * @param {string} [fallback]
 * @returns {string}
 */
function parseScalar(section, fieldName, fallback = "") {
  const escapedField = escapeRegExp(fieldName);
  const pattern = new RegExp(`^\\s*${escapedField}：([^\\r\\n]*)`, "m");
  const match = section.match(pattern);
  return match && match[1] ? match[1].trim() : fallback;
}

/**
 * @param {string} section
 * @param {string} fieldName
 * @returns {ParsedSubAgentItem[]}
 */
function parseSubAgentList(section, fieldName) {
  const escapedField = escapeRegExp(fieldName);
  const pattern = new RegExp(
    `^${escapedField}：\\s*\\r?\\n([\\s\\S]*?)(?=^${escapedField}_item_template：|^[^\\s].*：|^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = section.match(pattern);
  if (!match || !match[1]) {
    const inlineValue = parseScalar(section, fieldName, "");
    return inlineValue && !inlineValue.startsWith("无") ? [{ raw: inlineValue }] : [];
  }

  const block = match[1];
  if (!block.trim() || block.trim().startsWith("无")) {
    return [];
  }

  return block
    .split(/\r?\n(?=\s*-\s+)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      /** @type {ParsedSubAgentItem} */
      const item = { raw: entry };
      for (const line of entry.split(/\r?\n/)) {
        const normalized = line.replace(/^\s*-\s*/, "").trim();
        const fieldMatch = normalized.match(/^([^：]+)：(.*)$/);
        if (fieldMatch) {
          item[fieldMatch[1].trim()] = fieldMatch[2].trim();
        }
      }
      return item;
    });
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function splitAssignedFiles(value) {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !["无", "未分配", "not_run", "N/A"].includes(item));
}

/**
 * @param {string} content
 * @param {string} heading
 * @returns {boolean}
 */
function stateHeadingExists(content, heading) {
  const baseHeading = heading.split(" / ")[0];
  const escapedHeading = escapeRegExp(baseHeading);
  const pattern = new RegExp(`^${escapedHeading}(?:\\s*/.*)?\\s*$`, "m");
  return pattern.test(content);
}

/**
 * @param {string} section
 * @param {string} fieldName
 * @param {number} [fallback]
 * @returns {number}
 */
function parseStateNumber(section, fieldName, fallback = 0) {
  const value = parseScalar(section, fieldName, "");
  const match = String(value).match(/-?\d+/);
  if (!match) {
    return fallback;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {string} section
 * @param {string} fieldName
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
function parseStateBoolean(section, fieldName, fallback = false) {
  const value = parseScalar(section, fieldName, String(fallback));
  if (String(value).trim().startsWith("true")) {
    return true;
  }
  if (String(value).trim().startsWith("false")) {
    return false;
  }
  return fallback;
}

/**
 * @param {string} section
 * @param {string} fieldName
 * @returns {string[]}
 */
function parseStateList(section, fieldName) {
  const value = parseScalar(section, fieldName, "");
  return String(value)
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function parseFileList(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  extractSection,
  extractFirstSection,
  parseScalar,
  parseSubAgentList,
  splitAssignedFiles,
  stateHeadingExists,
  parseStateNumber,
  parseStateBoolean,
  parseStateList,
  parseFileList,
};
