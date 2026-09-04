import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inspectArtifacts } from './check_artifacts.js';

describe('check artifacts', () => {
  it('finds incompatible verification keys and reports their source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aztec-check-artifacts-'));
    const nested = join(directory, 'nested');
    await mkdir(nested);
    await writeArtifact(join(directory, 'pool.json'), 'pool', [
      ['deposit', 32],
      ['withdraw', 16],
    ]);
    await writeArtifact(join(nested, 'treasury.json'), 'treasury', [['deposit', 16]]);

    const result = await inspectArtifacts([directory], 32);

    expect(result.records).toHaveLength(3);
    expect(result.incompatible).toEqual([
      expect.objectContaining({ contractName: 'treasury', functionName: 'deposit', size: 16 }),
      expect.objectContaining({ contractName: 'pool', functionName: 'withdraw', size: 16 }),
    ]);
    expect([...result.sizes.keys()]).toEqual([16, 32]);
  });

  it('detects mixed sizes without guessing which group is stale', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aztec-check-artifacts-'));
    await writeArtifact(join(directory, 'contract.json'), 'contract', [
      ['current', 32],
      ['unknown', 16],
    ]);

    const result = await inspectArtifacts([directory]);

    expect(result.expectedSize).toBeUndefined();
    expect(result.incompatible).toEqual([]);
    expect([...result.sizes.entries()].map(([size, records]) => [size, records.length])).toEqual([
      [32, 1],
      [16, 1],
    ]);
  });
});

async function writeArtifact(path: string, name: string, functions: [string, number][]) {
  await writeFile(
    path,
    JSON.stringify({
      name,
      functions: functions.map(([functionName, size]) => ({
        name: functionName,
        custom_attributes: ['private'],
        verification_key: Buffer.alloc(size).toString('base64'),
      })),
    }),
  );
}
