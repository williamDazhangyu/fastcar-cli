// @ts-check

const IMPLEMENTATION_MODES = Object.freeze(["strict", "quick", "diagnose", "prototype"]);

/**
 * Auto-iterate modes that create implementation work must pass style consolidation
 * before delivery; verify/plan/optimize have different delivery semantics.
 *
 * @param {unknown} mode
 * @returns {boolean}
 */
function isImplementationMode(mode) {
  return IMPLEMENTATION_MODES.includes(String(mode));
}

module.exports = {
  IMPLEMENTATION_MODES,
  isImplementationMode,
};
