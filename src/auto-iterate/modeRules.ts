export const IMPLEMENTATION_MODES = Object.freeze(["strict", "quick", "diagnose", "prototype"]);

/**
 * Auto-iterate modes that create implementation work must pass style consolidation
 * before delivery; verify/plan/optimize have different delivery semantics.
 */
export function isImplementationMode(mode: unknown): boolean {
  return IMPLEMENTATION_MODES.includes(String(mode));
}
