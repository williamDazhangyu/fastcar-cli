export type CliError = NodeJS.ErrnoException & {
  stderr?: Buffer | string;
};

export function toCliError(error: unknown): CliError {
  return error instanceof Error ? error as CliError : new Error(String(error)) as CliError;
}
