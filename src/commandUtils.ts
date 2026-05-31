import { spawnSync } from "child_process";
import process from "process";

export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function runCommandOrThrow(command: string, args: string[], cwd?: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}
