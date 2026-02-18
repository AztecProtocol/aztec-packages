import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export function parseArgs(argv: string[]): {
  dryRun: boolean;
  positional: string[];
} {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => a !== "--dry-run");
  return { dryRun, positional };
}

export function configureGitIdentityInCI(): void {
  if (process.env.CI) {
    execSync('git config --global user.name "AztecBot"');
    execSync('git config --global user.email "tech@aztecprotocol.com"');
  }
}

export function writeGithubOutputs(outputs: Record<string, string>): void {
  if (process.env.GITHUB_OUTPUT) {
    const lines =
      Object.entries(outputs)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n";
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  }
}
