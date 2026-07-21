import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(PACKAGE_ROOT, 'dest/bin/index.js');
const WORKSPACE = join(PACKAGE_ROOT, 'test/mixed-workspace');
const TARGET = join(WORKSPACE, 'target');
const CODEGEN_OUT = join(WORKSPACE, 'codegen-output');

// Compiles a mixed workspace containing both a contract and a plain circuit,
// then runs codegen. Validates that:
// - Contract artifacts have a functions array and are transpiled
// - Program (circuit) artifacts do not have functions and are not transpiled
// - Codegen produces TypeScript only for contracts, not circuits
describe('aztec compile integration', () => {
  beforeAll(() => {
    cleanupArtifacts();
    runCompile();
    runCodegen();
  }, 120_000);

  afterAll(() => {
    cleanupArtifacts();
  });

  it('contract artifact has functions array', () => {
    const artifact = JSON.parse(readFileSync(join(TARGET, 'simple_contract-SimpleContract.json'), 'utf-8'));
    expect(Array.isArray(artifact.functions)).toBe(true);
    expect(artifact.functions.length).toBeGreaterThan(0);
  });

  it('program artifact does not have functions', () => {
    const artifact = JSON.parse(readFileSync(join(TARGET, 'simple_circuit.json'), 'utf-8'));
    expect(artifact.functions).toBeUndefined();
  });

  it('contract artifact was transpiled', () => {
    const artifact = JSON.parse(readFileSync(join(TARGET, 'simple_contract-SimpleContract.json'), 'utf-8'));
    expect(artifact.transpiled).toBe(true);
  });

  it('program artifact was not transpiled', () => {
    const artifact = JSON.parse(readFileSync(join(TARGET, 'simple_circuit.json'), 'utf-8'));
    expect(artifact.transpiled).toBeFalsy();
  });

  it('codegen produced TypeScript for contract', () => {
    expect(existsSync(join(CODEGEN_OUT, 'SimpleContract.ts'))).toBe(true);
  });

  it('codegen did not produce TypeScript for circuit', () => {
    expect(existsSync(join(CODEGEN_OUT, 'SimpleCircuit.ts'))).toBe(false);
  });
});

function cleanupArtifacts() {
  rmSync(TARGET, { recursive: true, force: true });
  rmSync(CODEGEN_OUT, { recursive: true, force: true });
  rmSync(join(WORKSPACE, 'codegenCache.json'), { force: true });
}

function runCompile() {
  try {
    execFileSync('node', [CLI, 'compile'], { cwd: WORKSPACE, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`compile failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

function runNargoCompile() {
  const nargo = process.env.NARGO ?? 'nargo';
  try {
    execFileSync(nargo, ['compile'], { cwd: WORKSPACE, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`nargo compile failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

function runCodegen() {
  try {
    execFileSync('node', [CLI, 'codegen', 'target', '-o', 'codegen-output', '-f'], {
      cwd: WORKSPACE,
      stdio: 'pipe',
    });
  } catch (e: any) {
    throw new Error(`codegen failed:\n${e.stderr?.toString() ?? e.message}`);
  }
}

// Regression test for https://github.com/AztecProtocol/aztec-packages/issues/24075: a bare `nargo compile` leaves
// untranspiled artifacts in target/. `aztec compile` must still postprocess them (transpile + generate VKs).
describe('aztec compile postprocesses pre-existing untranspiled artifacts', () => {
  const CONTRACT_ARTIFACT = join(TARGET, 'simple_contract-SimpleContract.json');

  beforeAll(() => {
    cleanupArtifacts();
    runNargoCompile();
  }, 120_000);

  afterAll(() => {
    cleanupArtifacts();
  });

  it('transpiles artifacts left untranspiled by a bare nargo compile', () => {
    const beforeAztecCompile = JSON.parse(readFileSync(CONTRACT_ARTIFACT, 'utf-8'));
    expect(beforeAztecCompile.transpiled).toBeFalsy();

    runCompile();
    const afterAztecCompile = JSON.parse(readFileSync(CONTRACT_ARTIFACT, 'utf-8'));
    expect(afterAztecCompile.transpiled).toBe(true);
  }, 120_000);
});

// Validates that aztec compile warns when contract crates contain tests. We want tests to be in a separate `lib` crate.
describe('aztec compile warns about tests in contract crates', () => {
  const CONTRACT_WITH_TESTS_WORKSPACE = join(PACKAGE_ROOT, 'test/contract-with-tests');
  const CONTRACT_WITH_TESTS_TARGET = join(CONTRACT_WITH_TESTS_WORKSPACE, 'target');

  afterAll(() => {
    rmSync(CONTRACT_WITH_TESTS_TARGET, { recursive: true, force: true });
  });

  it('warns when a contract crate contains tests', () => {
    const result = execFileSync('node', [CLI, 'compile'], {
      cwd: CONTRACT_WITH_TESTS_WORKSPACE,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    expect(result).toMatch(/Found tests in contract crate/);
  }, 120_000);
});
