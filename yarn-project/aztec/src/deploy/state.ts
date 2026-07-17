/**
 * Resume state for {@link runDeployment}, persisted to `<stateDir>/state.json`.
 *
 * On-chain inventory makes contract deploys and actions idempotent on their own, but a
 * bridge claim lives off-chain between "bridged on L1" and "claimed on L2". We persist
 * pending claims here so a run that dies in that window resumes the claim instead of
 * bridging again. Resolved addresses are stored too, as a human-readable record.
 *
 * The state file is keyed only by `stateDir`; point separate targets (local vs. a remote
 * network) at separate `stateDir`s to keep their state apart.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const deployStateSchema = z.object({
  addresses: z.record(z.string(), z.string()).default({}),
  pendingClaims: z
    .record(z.string(), z.object({ claimAmount: z.string(), claimSecret: z.string(), messageLeafIndex: z.string() }))
    .default({}),
});

export interface DeployState {
  /** alias → resolved address (informational). */
  addresses: Record<string, string>;
  /** deployer address → a bridge claim that's been funded on L1 but not yet consumed. */
  pendingClaims: Record<string, { claimAmount: string; claimSecret: string; messageLeafIndex: string }>;
}

function statePath(dir: string): string {
  return join(dir, 'state.json');
}

/**
 * Loads the persisted state, or an empty one when no file exists yet. A file that exists but can't
 * be read or doesn't match the schema throws instead of being treated as empty: silently starting
 * fresh would discard `pendingClaims`, and a lost claim secret strands the bridged funds forever.
 */
export function loadState(dir: string): DeployState {
  let raw: string;
  try {
    raw = readFileSync(statePath(dir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { addresses: {}, pendingClaims: {} };
    }
    throw new Error(`Failed to read deploy state at ${statePath(dir)}.`, { cause: error });
  }
  try {
    return deployStateSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `Corrupt deploy state at ${statePath(dir)}. Fix or remove it manually — removing abandons any pending ` +
        `bridge claims recorded in it (their funds become unclaimable).`,
      { cause: error },
    );
  }
}

/** Persists atomically (write + rename), so a crash mid-write can't truncate the previous state. */
export function saveState(dir: string, state: DeployState): void {
  mkdirSync(dir, { recursive: true });
  const path = statePath(dir);
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${path}.tmp`, path);
}
