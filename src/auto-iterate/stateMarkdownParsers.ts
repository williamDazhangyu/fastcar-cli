export interface ParsedSubAgentItem {
  raw: string;
  [field: string]: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSection(content: string, heading: string): string {
  const escapedHeading = escapeRegExp(heading);
  const pattern = new RegExp(
    `^${escapedHeading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = content.match(pattern);
  return match && match[1] ? match[1].trimEnd() : "";
}

export function extractFirstSection(content: string, headings: string[]): string {
  for (const heading of headings) {
    const section = extractSection(content, heading);
    if (section) {
      return section;
    }
  }
  return "";
}

export function parseScalar(
  section: string,
  fieldName: string,
  fallback = "",
): string {
  const escapedField = escapeRegExp(fieldName);
  const pattern = new RegExp(`^\\s*${escapedField}：([^\\r\\n]*)`, "m");
  const match = section.match(pattern);
  return match && match[1] ? match[1].trim() : fallback;
}

export function parseSubAgentList(
  section: string,
  fieldName: string,
): ParsedSubAgentItem[] {
  const escapedField = escapeRegExp(fieldName);
  const pattern = new RegExp(
    `^${escapedField}：\\s*\\r?\\n([\\s\\S]*?)(?=^${escapedField}_item_template：|^[^\\s].*：|^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = section.match(pattern);
  if (!match || !match[1]) {
    const inlineValue = parseScalar(section, fieldName, "");
    return inlineValue && !inlineValue.startsWith("无")
      ? [{ raw: inlineValue }]
      : [];
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
      const item: ParsedSubAgentItem = { raw: entry };
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

export function splitAssignedFiles(value: unknown): string[] {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !["无", "未分配", "not_run", "N/A"].includes(item));
}

export function stateHeadingExists(content: string, heading: string): boolean {
  const baseHeading = heading.split(" / ")[0];
  const escapedHeading = escapeRegExp(baseHeading);
  const pattern = new RegExp(`^${escapedHeading}(?:\\s*/.*)?\\s*$`, "m");
  return pattern.test(content);
}

export function parseStateNumber(
  section: string,
  fieldName: string,
  fallback = 0,
): number {
  const value = parseScalar(section, fieldName, "");
  const match = String(value).match(/-?\d+/);
  if (!match) {
    return fallback;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseStateBoolean(
  section: string,
  fieldName: string,
  fallback = false,
): boolean {
  const value = parseScalar(section, fieldName, String(fallback));
  if (String(value).trim().startsWith("true")) {
    return true;
  }
  if (String(value).trim().startsWith("false")) {
    return false;
  }
  return fallback;
}

export function parseStateList(section: string, fieldName: string): string[] {
  const value = parseScalar(section, fieldName, "");
  return String(value)
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseFileList(value: unknown): string[] {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
