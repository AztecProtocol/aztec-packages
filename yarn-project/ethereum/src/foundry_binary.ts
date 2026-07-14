import { spawnSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate a Foundry binary (`anvil`, `forge`, ...) without relying on the caller's PATH. Order:
 *   1. `$<NAME>_BIN` (e.g. `$ANVIL_BIN`, `$FORGE_BIN`) — explicit override, e.g. for CI with a pinned
 *      version. Throws if set but not pointing at an executable, instead of silently falling back.
 *   2. `~/.aztec/current/internal-bin/<name>` — where aztec-up installs it.
 *   3. `~/.aztec/current/bin/aztec-<name>` — the publicly-exposed symlink.
 *   4. `~/.foundry/bin/<name>` — standalone foundryup install.
 *   5. `command -v <name>` — anything else on PATH.
 *
 * Throws with a directive message if none work.
 */
export function resolveFoundryBinary(name: string): string {
  const envVar = `${name.toUpperCase()}_BIN`;
  const envBin = process.env[envVar];
  if (envBin) {
    if (!isExecutable(envBin)) {
      throw new Error(`$${envVar} is set to ${envBin}, which does not exist or is not executable.`);
    }
    return envBin;
  }

  const candidates = [
    join(homedir(), '.aztec', 'current', 'internal-bin', name),
    join(homedir(), '.aztec', 'current', 'bin', `aztec-${name}`),
    join(homedir(), '.foundry', 'bin', name),
  ];
  for (const path of candidates) {
    if (isExecutable(path)) {
      return path;
    }
  }

  const which = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  throw new Error(
    `${name} binary not found. Tried $${envVar}, ~/.aztec/current/internal-bin/${name}, ` +
      `~/.aztec/current/bin/aztec-${name}, ~/.foundry/bin/${name}, and $PATH. ` +
      `Install via \`aztec-up\` or set ${envVar} to a working binary.`,
  );
}
