import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(PACKAGE_ROOT, 'dest/bin/index.js');
const WORKSPACE = join(PACKAGE_ROOT, 'test/mixed-workspace');
const TARGET = join(WORKSPACE, 'target');

describe('aztec profile gates', () => {
  let gatesOutput: string;
  let gatesJsonOutput: string;
  let emptyDir: string;

  beforeAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
    runCompile();
    gatesOutput = runProfile('gates');
    gatesJsonOutput = runProfile('gates', '--json');
    emptyDir = mkdtempSync(join(tmpdir(), 'aztec-profile-gates-empty-'));
  }, 300_000);

  afterAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
    rmSync(emptyDir, { recursive: true, force: true });
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

  it('emits a JSON array with name/type/gates entries with --json', () => {
    const parsed = JSON.parse(gatesJsonOutput);
    expect(Array.isArray(parsed)).toBe(true);

    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'simple_circuit', type: 'program' }),
        expect.objectContaining({ name: 'simple_circuit_2', type: 'program' }),
        expect.objectContaining({
          name: 'simple_contract-SimpleContract::private_function',
          type: 'contract-function',
        }),
        expect.objectContaining({
          name: 'simple_contract-SimpleContract::another_private_function',
          type: 'contract-function',
        }),
      ]),
    );

    for (const entry of parsed) {
      expect(typeof entry.gates).toBe('number');
      expect(entry.gates).toBeGreaterThan(0);
      expect(['program', 'contract-function']).toContain(entry.type);
    }
  });

  it('emits an empty JSON array when the target directory has no artifacts', () => {
    const output = runProfileWithTarget('gates', emptyDir, '--json');
    expect(JSON.parse(output)).toEqual([]);
  });
});

function runCompile() {
  try {
    execFileSync('node', [CLI, 'compile'], { cwd: WORKSPACE, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`compile failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

function runProfile(subcommand: string, ...extraArgs: string[]) {
  return runProfileWithTarget(subcommand, TARGET, ...extraArgs);
}

function runProfileWithTarget(subcommand: string, target: string, ...extraArgs: string[]) {
  try {
    return execFileSync('node', [CLI, 'profile', subcommand, target, ...extraArgs], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (e: any) {
    throw new Error(`profile ${subcommand} failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}
