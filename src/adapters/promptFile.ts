import fs from "fs";

type PromptFileReadError = Error & {
  code?: string;
  reason?: string;
  path?: string;
  cause?: unknown;
};

export function readPromptFile(promptPath: string): string {
  try {
    return fs.readFileSync(promptPath, "utf8");
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    const reason = cause.code === "ENOENT" ? "prompt_file_missing" : "prompt_file_unreadable";
    const wrapped = new Error(`${reason}: unable to read Worker prompt at ${promptPath}`) as PromptFileReadError;
    wrapped.code = cause.code || "PROMPT_FILE_READ_FAILED";
    wrapped.reason = reason;
    wrapped.path = promptPath;
    wrapped.cause = error;
    throw wrapped;
  }
}
