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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { StoredClaim } from './types.js';

export interface DeployState {
  /** alias → resolved address (informational). */
  addresses: Record<string, string>;
  /** deployer address → a bridge claim that's been funded on L1 but not yet consumed. */
  pendingClaims: Record<string, StoredClaim>;
}

function statePath(dir: string): string {
  return join(dir, 'state.json');
}

export function loadState(dir: string): DeployState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(dir), 'utf8')) as Partial<DeployState>;
    return { addresses: parsed.addresses ?? {}, pendingClaims: parsed.pendingClaims ?? {} };
  } catch {
    return { addresses: {}, pendingClaims: {} };
  }
}

export function saveState(dir: string, state: DeployState): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2));
}
