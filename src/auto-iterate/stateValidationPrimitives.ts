export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue extends Record<string, unknown> {
  severity: ValidationSeverity;
  message: string;
}

export type FieldValidator = (
  issues: ValidationIssue[],
  value: unknown,
  label: string,
) => boolean;

export function normalizeRelativePathForCompare(filePath: string | null | undefined): string {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function addIssue(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  message: string,
): void {
  issues.push({ severity, message });
}

export function addError(issues: ValidationIssue[], message: string): void {
  addIssue(issues, "error", message);
}

export function addWarning(issues: ValidationIssue[], message: string): void {
  addIssue(issues, "warning", message);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requirePlainObject(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    addError(issues, `${label} 必须是对象`);
    return false;
  }
  return true;
}

export function requireArray(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): value is unknown[] {
  if (!Array.isArray(value)) {
    addError(issues, `${label} 必须是数组`);
    return false;
  }
  return true;
}

export function requireNonEmptyString(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): value is string {
  if (typeof value !== "string" || !value) {
    addError(issues, `${label} 必须是非空字符串`);
    return false;
  }
  return true;
}

export function requireBoolean(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): value is boolean {
  if (typeof value !== "boolean") {
    addError(issues, `${label} 必须是 boolean`);
    return false;
  }
  return true;
}

export function requireNonNegativeInteger(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    addError(issues, `${label} 必须是非负整数`);
    return false;
  }
  return true;
}

export function requireEnumValue(
  issues: ValidationIssue[],
  value: unknown,
  allowedValues: readonly unknown[],
  label: string,
): boolean {
  if (!allowedValues.includes(value)) {
    addError(issues, `${label}=${value || "missing"} 不是合法值`);
    return false;
  }
  return true;
}

export function requireNullableNonEmptyString(
  issues: ValidationIssue[],
  value: unknown,
  label: string,
): boolean {
  if (value === null) {
    return true;
  }
  return requireNonEmptyString(issues, value, label);
}

export function requireFields(
  issues: ValidationIssue[],
  source: Record<string, unknown> | null | undefined,
  fieldNames: string[],
  labelPrefix: string,
  validator: FieldValidator,
): void {
  fieldNames.forEach((fieldName) => {
    validator(issues, source ? source[fieldName] : undefined, `${labelPrefix}.${fieldName}`);
  });
}

export function requireNonNegativeIntegerFields(
  issues: ValidationIssue[],
  source: Record<string, unknown> | null | undefined,
  fieldNames: string[],
  labelPrefix: string,
): void {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonNegativeInteger);
}

export function requireBooleanFields(
  issues: ValidationIssue[],
  source: Record<string, unknown> | null | undefined,
  fieldNames: string[],
  labelPrefix: string,
): void {
  requireFields(issues, source, fieldNames, labelPrefix, requireBoolean);
}

export function requireNonEmptyStringFields(
  issues: ValidationIssue[],
  source: Record<string, unknown> | null | undefined,
  fieldNames: string[],
  labelPrefix: string,
): void {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonEmptyString);
}

export function requireNullableNonEmptyStringFields(
  issues: ValidationIssue[],
  source: Record<string, unknown> | null | undefined,
  fieldNames: string[],
  labelPrefix: string,
): void {
  requireFields(issues, source, fieldNames, labelPrefix, requireNullableNonEmptyString);
}

function addPathMismatchError(
  issues: ValidationIssue[],
  label: string,
  actualPath: string | null | undefined,
  expectedPath: string,
): void {
  addError(issues, `${label}=${actualPath || "missing"}，未指向 ${expectedPath}`);
}

export function requireNormalizedPath(
  issues: ValidationIssue[],
  actualPath: string | null | undefined,
  expectedPath: string,
  label: string,
): boolean {
  if (normalizeRelativePathForCompare(actualPath) !== expectedPath) {
    addPathMismatchError(issues, label, actualPath, expectedPath);
    return false;
  }
  return true;
}
