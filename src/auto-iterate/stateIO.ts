import crypto from "crypto";
import { promises as fsPromises } from "fs";

export interface JsonReadResult {
  data: unknown | null;
  error: unknown | null;
}

/**
 * Reads and parses JSON, returning null for missing files, invalid JSON, and
 * read errors. Existing callers use null as a legacy degrade signal.
 */
export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fsPromises.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Reads JSON while preserving the original error for diagnostics.
 */
export async function readJsonFileWithError(filePath: string): Promise<JsonReadResult> {
  try {
    return {
      data: JSON.parse(await fsPromises.readFile(filePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
}

/**
 * Writes JSON through a same-directory temporary file before renaming it into
 * place, so interrupted writes do not leave a partially-written state file.
 */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fsPromises.writeFile(
    tmpPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
  await fsPromises.rename(tmpPath, filePath);
}
