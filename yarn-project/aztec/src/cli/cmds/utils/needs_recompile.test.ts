import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { needsRecompile } from './needs_recompile.js';

/** Create a file (if needed) and set its timestamp to the given value (seconds since epoch). */
async function touch(filePath: string, timeSec: number) {
  // we apply the 'a' flag to mimic the behavior of touch command that does not change contents of a file if it already
  // exist
  await writeFile(filePath, '', { flag: 'a' });
  await utimes(filePath, timeSec, timeSec);
}

/** Create a directory (recursively). */
async function mkdirp(dir: string) {
  await mkdir(dir, { recursive: true });
}

describe('needsRecompile', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    // Create a unique temp directory and chdir into it so needsRecompile()
    // resolves its relative paths ('target', '.') against our test fixtures.
    tempDir = join(tmpdir(), `needs-recompile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdirp(tempDir);
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns true when target directory does not exist', async () => {
    // No target/ at all — always needs recompile.
    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    expect(await needsRecompile()).toBe(true);
  });

  it('returns true when target directory is empty (no .json artifacts)', async () => {
    await mkdirp('target');
    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    expect(await needsRecompile()).toBe(true);
  });

  it('returns true when target has only non-json files', async () => {
    await mkdirp('target');
    await touch(join('target', 'something.txt'), 1000);
    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    expect(await needsRecompile()).toBe(true);
  });

  it('returns false when artifacts are newer than all sources', async () => {
    // Source files at t=1000, artifact at t=2000.
    await mkdirp('src');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    expect(await needsRecompile()).toBe(false);
  });

  it('returns true when a .nr source file is newer than the newest artifact', async () => {
    await mkdirp('src');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('target', 'artifact.json'), 2000);
    await touch(join('src', 'main.nr'), 3000);

    expect(await needsRecompile()).toBe(true);
  });

  it('returns true when Nargo.toml is newer than the newest artifact', async () => {
    await mkdirp('src');
    await mkdirp('target');

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 3000, 3000);

    expect(await needsRecompile()).toBe(true);
  });

  it('follows path-based dependencies and detects newer sources in them', async () => {
    // Main project depends on a local library via path.
    const libDir = join(tempDir, 'lib', 'my_dep');
    await mkdirp(join(libDir, 'src'));
    await mkdirp('src');
    await mkdirp('target');

    // Main project Nargo.toml with a path dependency.
    const mainToml = `[package]
name = "test"
type = "contract"

[dependencies]
my_dep = { path = "lib/my_dep" }
`;
    await writeFile('Nargo.toml', mainToml);
    await utimes('Nargo.toml', 1000, 1000);

    // Dependency Nargo.toml
    await writeFile(join(libDir, 'Nargo.toml'), '[package]\nname = "my_dep"\ntype = "lib"\n');
    await utimes(join(libDir, 'Nargo.toml'), 1000, 1000);

    // Source files — all old.
    await touch(join('src', 'main.nr'), 1000);
    await touch(join(libDir, 'src', 'lib.nr'), 1000);

    // Artifact is newer than all sources.
    await touch(join('target', 'artifact.json'), 2000);

    expect(await needsRecompile()).toBe(false);

    // Now update a source file in the dependency.
    await utimes(join(libDir, 'src', 'lib.nr'), 3000, 3000);

    expect(await needsRecompile()).toBe(true);
  });

  it('ignores git-based dependencies (no path field)', async () => {
    await mkdirp('src');
    await mkdirp('target');

    // Nargo.toml with a git dependency only.
    const toml = `[package]
name = "test"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/example/repo", tag = "v1.0" }
`;
    await writeFile('Nargo.toml', toml);
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    // Should return false and not error out because of invalid links — git deps are not searched through since they
    // are fixed to a tag in Nargo.toml (and if Nargo.toml got modified we would detect it).
    expect(await needsRecompile()).toBe(false);
  });

  it('skips target/ directories when scanning for source files', async () => {
    await mkdirp('src');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    // Place a newer .nr file inside a nested target/ directory.
    // This should be ignored.
    await mkdirp(join('src', 'target'));
    await touch(join('src', 'target', 'cached.nr'), 5000);

    expect(await needsRecompile()).toBe(false);
  });

  it('compares against the oldest artifact when multiple exist', async () => {
    await mkdirp('src');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 2500);
    // Two artifacts: one old, one very new.
    await touch(join('target', 'old_artifact.json'), 2000);
    await touch(join('target', 'new_artifact.json'), 3000);

    // Source (2500) is newer than the oldest artifact (2000), so recompile.
    expect(await needsRecompile()).toBe(true);
  });

  it('returns false when all sources are older than the oldest artifact', async () => {
    await mkdirp('src');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'old_artifact.json'), 2000);
    await touch(join('target', 'new_artifact.json'), 3000);

    // Source (1000) < oldest artifact (2000), no recompile.
    expect(await needsRecompile()).toBe(false);
  });

  it('handles deeply nested .nr source files', async () => {
    await mkdirp('src/nested/deep');
    await mkdirp('target');

    await writeFile('Nargo.toml', '[package]\nname = "test"\ntype = "contract"\n');
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'nested', 'deep', 'module.nr'), 3000);
    await touch(join('target', 'artifact.json'), 2000);

    expect(await needsRecompile()).toBe(true);
  });

  it('throws when a path dependency resolves to a file instead of a directory', async () => {
    await mkdirp('src');
    await mkdirp('target');

    // Create a file where the dependency path points.
    await writeFile('not_a_dir', 'I am a file');

    const mainToml = `[package]
name = "test"
type = "contract"

[dependencies]
bad_dep = { path = "not_a_dir" }
`;
    await writeFile('Nargo.toml', mainToml);
    await utimes('Nargo.toml', 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    await expect(needsRecompile()).rejects.toThrow('which is not a directory');
  });

  it('traverses workspace members and their path dependencies', async () => {
    // Workspace root with two members: a contract and a test lib.
    // The test lib has a path dependency to an external lib outside the workspace.
    const contractDir = join(tempDir, 'test_contract');
    const testDir = join(tempDir, 'test_test');
    const externalLib = join(tempDir, 'external_lib');

    await mkdirp(join(contractDir, 'src'));
    await mkdirp(join(testDir, 'src'));
    await mkdirp(join(externalLib, 'src'));
    await mkdirp('target');

    // Workspace root Nargo.toml
    const workspaceToml = `[workspace]
members = ["test_contract", "test_test"]
`;
    await writeFile('Nargo.toml', workspaceToml);
    await utimes('Nargo.toml', 1000, 1000);

    // Contract member Nargo.toml
    await writeFile(join(contractDir, 'Nargo.toml'), '[package]\nname = "test_contract"\ntype = "contract"\n');
    await utimes(join(contractDir, 'Nargo.toml'), 1000, 1000);

    // Test member Nargo.toml with a path dependency to external_lib and a git dep (ignored)
    const testToml = `[package]
name = "test_test"
type = "lib"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "v5.0.0" }
ext = { path = "../external_lib" }
test_contract = { path = "../test_contract" }
`;
    await writeFile(join(testDir, 'Nargo.toml'), testToml);
    await utimes(join(testDir, 'Nargo.toml'), 1000, 1000);

    // External lib Nargo.toml
    await writeFile(join(externalLib, 'Nargo.toml'), '[package]\nname = "external_lib"\ntype = "lib"\n');
    await utimes(join(externalLib, 'Nargo.toml'), 1000, 1000);

    // All source files are old
    await touch(join(contractDir, 'src', 'main.nr'), 1000);
    await touch(join(testDir, 'src', 'test.nr'), 1000);
    await touch(join(externalLib, 'src', 'lib.nr'), 1000);

    // Artifact is newer than all sources
    await touch(join('target', 'artifact.json'), 2000);

    expect(await needsRecompile()).toBe(false);

    // Now update a source file in the external lib (reachable via workspace member's path dep)
    await utimes(join(externalLib, 'src', 'lib.nr'), 3000, 3000);

    expect(await needsRecompile()).toBe(true);
  });

  it('does not follow circular path dependencies', async () => {
    // Two projects that depend on each other via path.
    const libDir = join(tempDir, 'lib');
    await mkdirp(join(libDir, 'src'));
    await mkdirp('src');
    await mkdirp('target');

    const mainToml = `[package]
name = "main"
type = "contract"

[dependencies]
lib = { path = "lib" }
`;
    await writeFile('Nargo.toml', mainToml);
    await utimes('Nargo.toml', 1000, 1000);

    // lib depends back on the main project.
    const libToml = `[package]
name = "lib"
type = "lib"

[dependencies]
main = { path = ".." }
`;
    await writeFile(join(libDir, 'Nargo.toml'), libToml);
    await utimes(join(libDir, 'Nargo.toml'), 1000, 1000);

    await touch(join('src', 'main.nr'), 1000);
    await touch(join(libDir, 'src', 'lib.nr'), 1000);
    await touch(join('target', 'artifact.json'), 2000);

    // Should not infinite-loop; should return false since all sources are old.
    expect(await needsRecompile()).toBe(false);
  });
});
