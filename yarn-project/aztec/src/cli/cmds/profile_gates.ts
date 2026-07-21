import { findBbBinary } from '@aztec/bb.js';
import { asyncPool } from '@aztec/foundation/async-pool';
import type { LogFn } from '@aztec/foundation/log';

import { execFile as execFileCb } from 'child_process';
import { rm } from 'fs/promises';
import { promisify } from 'util';

import { type DiscoveredArtifact, MAX_CONCURRENT, discoverArtifacts } from './profile_utils.js';

const execFile = promisify(execFileCb);

interface GateCountResult {
  name: string;
  type: DiscoveredArtifact['type'];
  gateCount: number;
}

/** Parses circuit_size from bb gates JSON output: { "functions": [{ "circuit_size": N }] } */
function parseGateCount(stdout: string): number {
  const parsed = JSON.parse(stdout);
  const size = parsed?.functions?.[0]?.circuit_size;
  if (typeof size !== 'number') {
    throw new Error('Failed to parse circuit_size from bb gates output');
  }
  return size;
}

/** Runs bb gates on a single artifact file and returns the gate count. */
async function getGateCount(bb: string, artifactPath: string): Promise<number> {
  const { stdout } = await execFile(bb, ['gates', '--scheme', 'chonk', '-b', artifactPath]);
  return parseGateCount(stdout);
}

/** Profiles all compiled artifacts in a target directory and prints gate counts. */
export async function profileGates(targetDir: string, json: boolean, log: LogFn): Promise<void> {
  const bb = process.env.BB ?? findBbBinary() ?? 'bb';
  const { artifacts, tmpDir } = await discoverArtifacts(targetDir);

  if (artifacts.length === 0) {
    if (json) {
      log('[]');
    } else {
      log('No artifacts found in target directory.');
    }
    return;
  }

  try {
    const results: GateCountResult[] = await asyncPool(MAX_CONCURRENT, artifacts, async artifact => ({
      name: artifact.name,
      type: artifact.type,
      gateCount: await getGateCount(bb, artifact.filePath),
    }));
    results.sort((a, b) => a.name.localeCompare(b.name));

    if (results.length === 0) {
      if (json) {
        log('[]');
      } else {
        log('No constrained circuits found.');
      }
      return;
    }

    if (json) {
      const entries = results.map(r => ({ name: r.name, type: r.type, gates: r.gateCount }));
      log(JSON.stringify(entries, null, 2));
      return;
    }

    const maxNameLen = Math.max(...results.map(r => r.name.length));
    log('');
    log('Gate counts:');
    log('-'.repeat(maxNameLen + 16));
    for (const { name, gateCount } of results) {
      log(`${name.padEnd(maxNameLen)}  ${gateCount.toLocaleString().padStart(12)}`);
    }
    log('-'.repeat(maxNameLen + 16));
    log(`Total: ${results.length} circuit(s)`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
