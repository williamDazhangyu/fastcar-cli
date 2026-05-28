// @ts-check

const path = require("path");

/**
 * @param {string} stateJsonPath
 * @param {number} iteration
 * @returns {import("./types").IterationPaths}
 */
function buildIterationPaths(stateJsonPath, iteration) {
  const iterationDir = path.join(
    path.dirname(stateJsonPath),
    "iterations",
    String(iteration),
  );
  return {
    iterationDir,
    promptPath: path.join(iterationDir, "prompt.md"),
    resultPath: path.join(iterationDir, "result.json"),
    workerLogPath: path.join(iterationDir, "worker.log"),
    validationLogPath: path.join(iterationDir, "validation.log"),
  };
}

module.exports = {
  buildIterationPaths,
};
