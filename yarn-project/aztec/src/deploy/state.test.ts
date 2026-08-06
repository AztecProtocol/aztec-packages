import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type DeployState, loadState, saveState } from './state.js';

describe('deploy state persistence', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-state-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty state when no file exists', () => {
    expect(loadState(dir)).toEqual({ addresses: {}, pendingClaims: {} });
    expect(loadState(join(dir, 'missing-subdir'))).toEqual({ addresses: {}, pendingClaims: {} });
  });

  it('round-trips state and leaves no temp files behind', () => {
    const state: DeployState = {
      addresses: { token: '0x1234' },
      pendingClaims: { '0xabc': { claimAmount: '1000', claimSecret: '0x2', messageLeafIndex: '3' } },
    };
    saveState(dir, state);
    expect(loadState(dir)).toEqual(state);
    expect(readdirSync(dir)).toEqual(['state.json']);
  });

  it('throws loudly on a corrupt state file instead of silently discarding pending claims', () => {
    writeFileSync(join(dir, 'state.json'), '{ not json');
    expect(() => loadState(dir)).toThrow(/deploy state/i);
  });

  it('throws loudly on a state file with the wrong shape', () => {
    // A pending claim whose fields are not strings would otherwise blow up later inside BigInt().
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ pendingClaims: { '0xabc': { claimAmount: 5 } } }));
    expect(() => loadState(dir)).toThrow(/deploy state/i);
  });
});
