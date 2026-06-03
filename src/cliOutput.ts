export function writeLine(message = ""): void {
  console.log(message);
}

export type CliColor =
  | "cyan"
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "magenta"
  | "gray"
  | "bold";

export interface VisualFormatOptions {
  color?: boolean;
}

const ANSI_CODES: Record<CliColor, string> = {
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  gray: "\u001b[90m",
  bold: "\u001b[1m",
};

const ANSI_RESET = "\u001b[0m";

export function shouldUseColor(options: VisualFormatOptions = {}): boolean {
  if (typeof options.color === "boolean") {
    return options.color;
  }
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

export function colorize(
  message: string,
  color: CliColor,
  options: VisualFormatOptions = {},
): string {
  if (!shouldUseColor(options)) {
    return message;
  }
  return `${ANSI_CODES[color]}${message}${ANSI_RESET}`;
}

export function visualLine(
  icon: string,
  label: string,
  value: string,
  color: CliColor,
  options: VisualFormatOptions = {},
): string {
  return colorize(`${icon} ${label}: ${value}`, color, options);
}

export function setExitCode(code: number): void {
  process.exitCode = code;
}

export function getExitCode(): string | number | null | undefined {
  return process.exitCode;
}
