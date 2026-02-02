import type { Logger } from '@aztec/foundation/log';

import { execSync, spawn } from 'child_process';
import path from 'path';

/**
 * @param scriptPath - The path to the script, relative to the project root
 * @param args - The arguments to pass to the script
 * @param logger - The logger to use
 * @returns The exit code of the script
 */
function runScript(scriptPath: string, args: string[], logger: Logger, env?: Record<string, string>) {
  const childProcess = spawn(scriptPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  });
  return new Promise<number>((resolve, reject) => {
    childProcess.on('close', (code: number | null) => resolve(code ?? 0));
    childProcess.on('error', reject);
    childProcess.stdout?.on('data', (data: Buffer) => {
      logger.info(data.toString());
    });
    childProcess.stderr?.on('data', (data: Buffer) => {
      logger.error(data.toString());
    });
  });
}

/**
 * Returns the absolute path to the git repository root
 */
export function getGitProjectRoot(): string {
  try {
    const rootDir = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return rootDir;
  } catch (error) {
    throw new Error(`Failed to determine git project root: ${error}`);
  }
}

export function getAztecBin() {
  return path.join(getGitProjectRoot(), 'yarn-project/aztec/dest/bin/index.js');
}

/**
 * Runs the Aztec binary
 * @param args - The arguments to pass to the Aztec binary
 * @param logger - The logger to use
 * @param env - Optional environment variables to set for the process
 * @returns The exit code of the Aztec binary
 */
export function runAztecBin(args: string[], logger: Logger, env?: Record<string, string>) {
  return runScript('node', [getAztecBin(), ...args], logger, env);
}

export function runProjectScript(script: string, args: string[], logger: Logger, env?: Record<string, string>) {
  const scriptPath = script.startsWith('/') ? script : path.join(getGitProjectRoot(), script);
  return runScript(scriptPath, args, logger, env);
}
