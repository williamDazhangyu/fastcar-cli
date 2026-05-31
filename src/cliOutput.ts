export function writeLine(message = ""): void {
  console.log(message);
}

export function setExitCode(code: number): void {
  process.exitCode = code;
}

export function getExitCode(): string | number | null | undefined {
  return process.exitCode;
}
