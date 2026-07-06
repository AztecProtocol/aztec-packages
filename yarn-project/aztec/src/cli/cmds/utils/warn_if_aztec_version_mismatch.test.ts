import { DEV_VERSION } from '@aztec/foundation/version';

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

  it('warns when a non-aztec aztec-nr dependency tag does not match the CLI version', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      // eslint-disable-next-line camelcase
      uint_note: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v0.99.0", directory = "uint-note" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages).toHaveLength(1);
    expect(logMessages[0]).toContain('WARNING');
    expect(logMessages[0]).toContain('uint_note');
    expect(logMessages[0]).toContain('v0.99.0');
    expect(logMessages[0]).toContain('v1.0.0');
  });

  it('warns about a sibling aztec-nr dependency even when the aztec dependency matches', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "aztec" }',
      // eslint-disable-next-line camelcase
      uint_note: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v0.99.0", directory = "uint-note" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages).toHaveLength(1);
    expect(logMessages[0]).toContain('WARNING');
    expect(logMessages[0]).toContain('uint_note');
    expect(logMessages[0]).not.toMatch(/—\s*aztec\s*\(/);
  });

  it('does not warn when multiple aztec-nr dependencies all match the CLI version', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "aztec" }',
      // eslint-disable-next-line camelcase
      uint_note: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "uint-note" }',
      // eslint-disable-next-line camelcase
      compressed_string:
        '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "compressed-string" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages.filter(m => m.includes('WARNING'))).toHaveLength(0);
  });

  it('does not warn for unrelated third-party git dependencies', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.0.0", directory = "aztec" }',
      // eslint-disable-next-line camelcase
      noir_string_search: '{ git = "https://github.com/noir-lang/noir_string_search", tag = "v0.1.0" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages.filter(m => m.includes('WARNING'))).toHaveLength(0);
  });

  it('normalizes trailing slashes and .git suffixes in the aztec-nr git URL', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr.git", tag = "v1.0.0", directory = "aztec" }',
      // eslint-disable-next-line camelcase
      uint_note: '{ git = "https://github.com/AztecProtocol/aztec-nr/", tag = "v1.0.0", directory = "uint-note" }',
    });

    await warnIfAztecVersionMismatch(log, '1.0.0');

    expect(logMessages.filter(m => m.includes('WARNING'))).toHaveLength(0);
  });

  it('skips the check when running from a monorepo checkout', async () => {
    await makePackage(tempDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-nr", tag = "v1.2.3", directory = "aztec" }',
    });

    await warnIfAztecVersionMismatch(log, DEV_VERSION);

    expect(logMessages).toHaveLength(0);
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
