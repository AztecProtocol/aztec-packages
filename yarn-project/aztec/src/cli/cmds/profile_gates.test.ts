import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(PACKAGE_ROOT, 'dest/bin/index.js');
const WORKSPACE = join(PACKAGE_ROOT, 'test/mixed-workspace');
const TARGET = join(WORKSPACE, 'target');

describe('aztec profile gates', () => {
  let gatesOutput: string;

  beforeAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
    runCompile();
    gatesOutput = runProfile('gates');
  }, 300_000);

  afterAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
  });

  it('prints gate counts for both contract functions', () => {
    expect(gatesOutput).toContain('simple_contract-SimpleContract::private_function');
    expect(gatesOutput).toContain('simple_contract-SimpleContract::another_private_function');
  });

  it('prints gate counts for both plain circuits', () => {
    expect(gatesOutput).toContain('simple_circuit');
    expect(gatesOutput).toContain('simple_circuit_2');
  });

  it('gate counts are positive integers', () => {
    const counts = [...gatesOutput.matchAll(/(\d[\d,]*)\s*$/gm)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
    expect(counts.length).toBeGreaterThanOrEqual(4);
    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
    }
  });
});

function runCompile() {
  try {
    execFileSync('node', [CLI, 'compile'], { cwd: WORKSPACE, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`compile failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

function runProfile(subcommand: string) {
  try {
    return execFileSync('node', [CLI, 'profile', subcommand, TARGET], { encoding: 'utf-8', stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`profile ${subcommand} failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}
