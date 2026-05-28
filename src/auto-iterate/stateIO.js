// @ts-check

const crypto = require("crypto");
const fs = require("fs");

/**
 * @typedef {Object} JsonReadResult
 * @property {unknown | null} data
 * @property {unknown | null} error
 */

/**
 * Reads and parses JSON, returning null for missing files, invalid JSON, and
 * read errors. Existing callers use null as a legacy degrade signal.
 * @param {string} filePath
 * @returns {Promise<unknown | null>}
 */
async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Reads JSON while preserving the original error for diagnostics.
 * @param {string} filePath
 * @returns {Promise<JsonReadResult>}
 */
async function readJsonFileWithError(filePath) {
  try {
    return {
      data: JSON.parse(await fs.promises.readFile(filePath, "utf8")),
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
 * @param {string} filePath
 * @param {unknown} data
 * @returns {Promise<void>}
 */
async function writeJsonFileAtomic(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.promises.writeFile(
    tmpPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
  await fs.promises.rename(tmpPath, filePath);
}

module.exports = {
  readJsonFile,
  readJsonFileWithError,
  writeJsonFileAtomic,
};
