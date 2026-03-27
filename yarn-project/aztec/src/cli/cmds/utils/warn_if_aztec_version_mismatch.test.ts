import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { warnIfAztecVersionMismatch } from './warn_if_aztec_version_mismatch.js';

/** Create a directory (recursively). */
async function mkdirp(dir: string) {
  await mkdir(dir, { recursive: true });
}

/** Create a directory with a minimal `[package]` Nargo.toml inside it. */
async function makePackage(dir: string, name: string, type = 'lib', deps?: Record<string, string>): Promise<void> {
  await mkdirp(dir);
  let toml = `[package]\nname = "${name}"\ntype = "${type}"\n`;
  if (deps) {
    toml += `\n[dependencies]\n`;
    for (const [depName, depValue] of Object.entries(deps)) {
      toml += `${depName} = ${depValue}\n`;
    }
  }
  await writeFile(join(dir, 'Nargo.toml'), toml);
}

describe('warnIfAztecVersionMismatch', () => {
  let tempDir: string;
  let originalCwd: string;
  let logMessages: string[];
  const log = (msg: string) => {
    logMessages.push(msg);
  };

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = join(tmpdir(), `version-match-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdirp(tempDir);
    process.chdir(tempDir);
    logMessages = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('does not warn when the aztec dependency tag matches the CLI version', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "aztec" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages.filter(m => m.includes('WARNING'))).toHaveLength(0);
  });

  it('warns when the aztec dependency tag does not match the CLI version', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v0.99.0", directory = "aztec" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages).toHaveLength(1);
    expect(logMessages[0]).toContain('WARNING');
    expect(logMessages[0]).toContain('v0.99.0');
    expect(logMessages[0]).toContain('v1.0.0');
  });

  it('warns when the CLI version is not available', async () => {
    await makePackage(tempDir, 'project', 'contract');

    await warnIfAztecVersionMismatch(log, '');

    expect(logMessages).toHaveLength(1);
    expect(logMessages[0]).toContain('CLI version not found');
  });

  it('does not warn when the project has no aztec dependency', async () => {
    const libDir = join(tempDir, 'lib');
    await makePackage(tempDir, 'project', 'contract', {
      some_other_lib: '{ path = "lib" }', // eslint-disable-line camelcase
    });
    await makePackage(libDir, 'lib');

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages.filter(m => m.includes('WARNING'))).toHaveLength(0);
  });
});
