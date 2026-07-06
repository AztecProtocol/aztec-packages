import type { LogFn } from '@aztec/foundation/log';
import { DEV_VERSION, getPackageVersion } from '@aztec/foundation/version';

import TOML from '@iarna/toml';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { collectCrateDirs } from './collect_crate_dirs.js';

/** Returns true if the given git URL points to the AztecProtocol/aztec-nr repository. */
function isAztecNrGitUrl(gitUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(gitUrl);
  } catch {
    return false;
  }
  if (url.hostname !== 'github.com') {
    return false;
  }
  const repoPath = url.pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
  return repoPath === 'AztecProtocol/aztec-nr';
}

/** Warns if any aztec-nr git dependency in a crate's Nargo.toml has a tag that doesn't match the CLI version. */
export async function warnIfAztecVersionMismatch(log: LogFn, cliVersion?: string): Promise<void> {
  const version = cliVersion ?? getPackageVersion();
  if (version === DEV_VERSION) {
    return;
  }

  const expectedTag = `v${version}`;
  const mismatches: { file: string; depName: string; tag: string }[] = [];

  const crateDirs = await collectCrateDirs('.', { skipGitDeps: true });

  for (const dir of crateDirs) {
    const tomlPath = join(dir, 'Nargo.toml');
    let content: string;
    try {
      content = await readFile(tomlPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = TOML.parse(content) as Record<string, any>;
    const deps = (parsed.dependencies as Record<string, any>) ?? {};

    for (const [depName, dep] of Object.entries(deps)) {
      // Skip non-object deps (e.g. malformed entries) and anything that isn't a tagged git dep.
      if (!dep || typeof dep !== 'object' || typeof dep.git !== 'string' || typeof dep.tag !== 'string') {
        continue;
      }
      // Only flag deps that are sourced from the aztec-nr repo.
      if (!isAztecNrGitUrl(dep.git)) {
        continue;
      }
      if (dep.tag !== expectedTag) {
        mismatches.push({ file: tomlPath, depName, tag: dep.tag });
      }
    }
  }

  if (mismatches.length > 0) {
    const details = mismatches.map(m => `  ${m.file} — ${m.depName} (${m.tag})`).join('\n');
    log(
      `WARNING: Aztec dependency version mismatch detected.\n` +
        `The following aztec-nr dependencies do not match the CLI version (${expectedTag}):\n` +
        `${details}\n\n` +
        `See https://docs.aztec.network/errors/9 for how to update your dependencies.`,
    );
  }
}
