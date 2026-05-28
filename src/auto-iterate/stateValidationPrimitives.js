// @ts-check

/**
 * @typedef {"error" | "warning"} ValidationSeverity
 * @typedef {{ severity: ValidationSeverity, message: string }} ValidationIssue
 * @typedef {(issues: ValidationIssue[], value: unknown, label: string) => boolean} FieldValidator
 */

/**
 * @param {string | null | undefined} filePath
 * @returns {string}
 */
function normalizeRelativePathForCompare(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * @param {ValidationIssue[]} issues
 * @param {ValidationSeverity} severity
 * @param {string} message
 * @returns {void}
 */
function addIssue(issues, severity, message) {
  issues.push({ severity, message });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} message
 * @returns {void}
 */
function addError(issues, message) {
  addIssue(issues, "error", message);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} message
 * @returns {void}
 */
function addWarning(issues, message) {
  addIssue(issues, "warning", message);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {value is Record<string, unknown>}
 */
function requirePlainObject(issues, value, label) {
  if (!isPlainObject(value)) {
    addError(issues, `${label} 必须是对象`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {value is unknown[]}
 */
function requireArray(issues, value, label) {
  if (!Array.isArray(value)) {
    addError(issues, `${label} 必须是数组`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {value is string}
 */
function requireNonEmptyString(issues, value, label) {
  if (typeof value !== "string" || !value) {
    addError(issues, `${label} 必须是非空字符串`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {value is boolean}
 */
function requireBoolean(issues, value, label) {
  if (typeof value !== "boolean") {
    addError(issues, `${label} 必须是 boolean`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {value is number}
 */
function requireNonNegativeInteger(issues, value, label) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    addError(issues, `${label} 必须是非负整数`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {readonly unknown[]} allowedValues
 * @param {string} label
 * @returns {boolean}
 */
function requireEnumValue(issues, value, allowedValues, label) {
  if (!allowedValues.includes(value)) {
    addError(issues, `${label}=${value || "missing"} 不是合法值`);
    return false;
  }
  return true;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} value
 * @param {string} label
 * @returns {boolean}
 */
function requireNullableNonEmptyString(issues, value, label) {
  if (value === null) {
    return true;
  }
  return requireNonEmptyString(issues, value, label);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string[]} fieldNames
 * @param {string} labelPrefix
 * @param {FieldValidator} validator
 * @returns {void}
 */
function requireFields(issues, source, fieldNames, labelPrefix, validator) {
  fieldNames.forEach((fieldName) => {
    validator(issues, source ? source[fieldName] : undefined, `${labelPrefix}.${fieldName}`);
  });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string[]} fieldNames
 * @param {string} labelPrefix
 * @returns {void}
 */
function requireNonNegativeIntegerFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonNegativeInteger);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string[]} fieldNames
 * @param {string} labelPrefix
 * @returns {void}
 */
function requireBooleanFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireBoolean);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string[]} fieldNames
 * @param {string} labelPrefix
 * @returns {void}
 */
function requireNonEmptyStringFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonEmptyString);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string[]} fieldNames
 * @param {string} labelPrefix
 * @returns {void}
 */
function requireNullableNonEmptyStringFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireNullableNonEmptyString);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string} label
 * @param {string | null | undefined} actualPath
 * @param {string} expectedPath
 * @returns {void}
 */
function addPathMismatchError(issues, label, actualPath, expectedPath) {
  addError(issues, `${label}=${actualPath || "missing"}，未指向 ${expectedPath}`);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {string | null | undefined} actualPath
 * @param {string} expectedPath
 * @param {string} label
 * @returns {boolean}
 */
function requireNormalizedPath(issues, actualPath, expectedPath, label) {
  if (normalizeRelativePathForCompare(actualPath) !== expectedPath) {
    addPathMismatchError(issues, label, actualPath, expectedPath);
    return false;
  }
  return true;
}

module.exports = {
  addError,
  addIssue,
  addWarning,
  isPlainObject,
  normalizeRelativePathForCompare,
  requireArray,
  requireBoolean,
  requireBooleanFields,
  requireEnumValue,
  requireFields,
  requireNonEmptyString,
  requireNonEmptyStringFields,
  requireNonNegativeInteger,
  requireNonNegativeIntegerFields,
  requireNormalizedPath,
  requireNullableNonEmptyString,
  requireNullableNonEmptyStringFields,
  requirePlainObject,
};
