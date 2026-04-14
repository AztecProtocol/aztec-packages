import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(PACKAGE_ROOT, 'dest/bin/index.js');
const WORKSPACE = join(PACKAGE_ROOT, 'test/mixed-workspace');
const TARGET = join(WORKSPACE, 'target');
const CONTRACT_ARTIFACT = join(TARGET, 'simple_contract-SimpleContract.json');

describe('aztec profile flamegraph', () => {
  const svgPath = join(TARGET, 'simple_contract-SimpleContract-private_function-flamegraph.svg');

  beforeAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
    runCompile();
    runFlamegraph(CONTRACT_ARTIFACT, 'private_function');
  }, 300_000);

  afterAll(() => {
    rmSync(TARGET, { recursive: true, force: true });
  });

  it('generates a valid flamegraph SVG', () => {
    expect(existsSync(svgPath)).toBe(true);
    const content = readFileSync(svgPath, 'utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('</svg>');
  });
});

function runCompile() {
  try {
    execFileSync('node', [CLI, 'compile'], { cwd: WORKSPACE, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`compile failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

function runFlamegraph(artifactPath: string, functionName: string) {
  try {
    execFileSync('node', [CLI, 'profile', 'flamegraph', artifactPath, functionName], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (e: any) {
    throw new Error(`profile flamegraph failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}
