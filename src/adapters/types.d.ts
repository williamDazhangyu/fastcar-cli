declare module "cross-spawn" {
  import { SpawnOptions, SpawnSyncOptions, SpawnSyncReturns } from "node:child_process";

  function crossSpawn(command: string, args?: readonly string[], options?: SpawnOptions): import("node:child_process").ChildProcess;

  namespace crossSpawn {
    function sync(command: string, options?: SpawnSyncOptions): SpawnSyncReturns<string>;
    function sync(command: string, args?: readonly string[], options?: SpawnSyncOptions): SpawnSyncReturns<string>;
  }

  export = crossSpawn;
}

declare module "which" {
  namespace which {
    function sync(command: string): string;
  }

  export = which;
}

declare module "inquirer" {
  interface PromptQuestion {
    type: string;
    name: string;
    message: string;
    default?: unknown;
    validate?: (value: any) => true | string | Promise<true | string>;
    filter?: (value: any) => unknown;
    choices?: Array<{ name: string; value: unknown }>;
  }

  interface InquirerModule {
    prompt<T extends Record<string, unknown> = Record<string, unknown>>(
      questions: PromptQuestion[],
    ): Promise<T>;
  }

  const inquirer: InquirerModule;
  export = inquirer;
}
