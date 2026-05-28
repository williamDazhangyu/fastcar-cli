import { DISPATCH_AGENT_CONFIGS } from "./dispatch";

export function buildAutoIterateHelp(): string {
  const supportedAgents = Object.keys(DISPATCH_AGENT_CONFIGS).join("|");
  return `Usage: fastcar-cli auto-iterate [options]

Modes:
  --strict | --quick | --diagnose | --verify | --plan-only | --optimize | --prototype

Session:
  --session <name>
  --list
  --switch <name>
  --resume <name>
  --validate-state [session|state.md|state.json]
  --strict-state
  --finalize [session]

Dispatch:
  --dispatch <session> --agent <${supportedAgents}> --task <text> --files <glob[,glob]> [--verify-command <cmd>] [--timeout <seconds>] [--dry-run]

Pipeline:
  --run --once [--json-progress]
  --autopilot
  --check
  --step-timeout <seconds>
  --inactivity-timeout <seconds>
  --validation-timeout <seconds>
  --progress-interval <seconds>
  --max-steps <n>
  --validate-cmd <cmd>
  --focus <type:id>
  --scope <glob[,glob]>
  --answer <id>
  --isolate
  --allow-modify
  --no-validate
  --no-run

Skill Capture:
  --capture-skills <session> [--yes]

Other:
  --goal <text>
  --from <file>
  --max-iterations <n>
  --autopilot-max-iterations <n>
  --yes
  --examples [keyword]
`;
}

export function showAutoIterateHelp(): void {
  console.log(buildAutoIterateHelp());
}
