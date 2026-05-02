import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { collectCrateDirs, nargoGitDepPath } from './collect_crate_dirs.js';
import { run } from './spawn.js';

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

/**
 * Creates a local git repository with a Nargo.toml committed and tagged. Returns the repo path,
 * which can be used as a `file://` git URL in tests.
 */
async function makeGitRepo(dir: string, tag: string, pkgName: string): Promise<void> {
  await makePackage(dir, pkgName);
  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);
  await run('git', ['-C', dir, 'add', '.']);
  await run('git', ['-C', dir, 'commit', '-m', 'init', '--no-gpg-sign']);
  await run('git', ['-C', dir, 'tag', tag]);
}

describe('collectCrateDirs', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `collect-crate-dirs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdirp(tempDir);
    // Redirect $HOME so nargoGitDepPath writes into our temp tree instead of the real ~/.nargo
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── Path / workspace traversal ───────────────────────────────────────────

  it('returns only the start crate when there are no dependencies', async () => {
    const projectDir = join(tempDir, 'project');
    await makePackage(projectDir, 'project', 'contract');

    const result = await collectCrateDirs(projectDir);

    expect(result).toEqual([resolve(projectDir)]);
  });

  it('follows path-based dependencies', async () => {
    const projectDir = join(tempDir, 'project');
    const libDir = join(tempDir, 'lib');

    await makePackage(projectDir, 'project', 'contract', { lib: '{ path = "../lib" }' });
    await makePackage(libDir, 'lib');

    const result = await collectCrateDirs(projectDir);

    expect(result).toHaveLength(2);
    expect(result).toContain(resolve(projectDir));
    expect(result).toContain(resolve(libDir));
  });

  it('visits all members of a workspace root', async () => {
    const workspaceDir = join(tempDir, 'workspace');
    const crateA = join(workspaceDir, 'a');
    const crateB = join(workspaceDir, 'b');

    await mkdirp(workspaceDir);
    await writeFile(join(workspaceDir, 'Nargo.toml'), `[workspace]\nmembers = ["a", "b"]\n`);
    await makePackage(crateA, 'a', 'contract');
    await makePackage(crateB, 'b', 'lib');

    const result = await collectCrateDirs(workspaceDir);

    expect(result).toHaveLength(3);
    expect(result).toContain(resolve(workspaceDir));
    expect(result).toContain(resolve(crateA));
    expect(result).toContain(resolve(crateB));
  });

  it('visits a shared dependency only once', async () => {
    const projectDir = join(tempDir, 'project');
    const crateA = join(tempDir, 'a');
    const crateB = join(tempDir, 'b');
    const shared = join(tempDir, 'shared');

    await makePackage(projectDir, 'project', 'contract', { a: '{ path = "../a" }', b: '{ path = "../b" }' });
    await makePackage(crateA, 'a', 'lib', { shared: '{ path = "../shared" }' });
    await makePackage(crateB, 'b', 'lib', { shared: '{ path = "../shared" }' });
    await makePackage(shared, 'shared');

    const result = await collectCrateDirs(projectDir);

    expect(result).toHaveLength(4); // project, a, b, shared
    expect(result.filter(d => d === resolve(shared))).toHaveLength(1);
  });

  it('does not infinite-loop on circular path dependencies', async () => {
    const crateA = join(tempDir, 'a');
    const crateB = join(tempDir, 'b');

    await makePackage(crateA, 'a', 'lib', { b: '{ path = "../b" }' });
    await makePackage(crateB, 'b', 'lib', { a: '{ path = "../a" }' });

    const result = await collectCrateDirs(crateA);

    expect(result).toHaveLength(2);
    expect(result).toContain(resolve(crateA));
    expect(result).toContain(resolve(crateB));
  });

  it('throws when Nargo.toml is missing from the start directory', async () => {
    const projectDir = join(tempDir, 'project');
    await mkdirp(projectDir); // directory exists but no Nargo.toml

    await expect(collectCrateDirs(projectDir)).rejects.toThrow('Nargo.toml not found');
  });

  it('throws when a path dependency resolves to a file instead of a directory', async () => {
    const projectDir = join(tempDir, 'project');
    await writeFile(join(tempDir, 'not_a_dir'), 'I am a file');
    await makePackage(projectDir, 'project', 'contract', { bad: '{ path = "../not_a_dir" }' });

    await expect(collectCrateDirs(projectDir)).rejects.toThrow('not a directory');
  });

  // ── skipGitDeps ──────────────────────────────────────────────────────────

  it('ignores git-based dependencies when skipGitDeps is true', async () => {
    const projectDir = join(tempDir, 'project');
    await makePackage(projectDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-packages", tag = "v1.0" }',
    });

    // Should return only the project dir without attempting to resolve or clone the git dep
    const result = await collectCrateDirs(projectDir, { skipGitDeps: true });

    expect(result).toEqual([resolve(projectDir)]);
  });

  // ── Git deps — already cached ($HOME redirected, no real clone) ──────────

  it('includes a cached git dependency without cloning', async () => {
    const projectDir = join(tempDir, 'project');
    // Pre-create the nargo cache entry that nargoGitDepPath would compute — simulates nargo having
    // already fetched this dep (existsSync check passes so no clone is attempted).
    const cacheDir = nargoGitDepPath('https://github.com/AztecProtocol/aztec-packages', 'v1.0');
    await makePackage(projectDir, 'project', 'contract', {
      aztec: '{ git = "https://github.com/AztecProtocol/aztec-packages", tag = "v1.0" }',
    });
    await makePackage(cacheDir, 'aztec-packages');

    const result = await collectCrateDirs(projectDir);

    expect(result).toContain(resolve(cacheDir));
  });

  it('visits the subdirectory crate when the git dep has a directory field', async () => {
    // Models the real aztec-nr pattern:
    //   aztec = { git = "…/aztec-packages", tag = "v0.82.0", directory = "noir-projects/aztec-nr/aztec" }
    // nargo clones the whole repo to the cache root; only the subdir is the actual crate.
    const projectDir = join(tempDir, 'project');
    const cacheRoot = nargoGitDepPath('https://github.com/AztecProtocol/aztec-packages', 'v0.82.0');
    const crateDir = join(cacheRoot, 'noir-projects', 'aztec-nr', 'aztec');

    await makePackage(projectDir, 'project', 'contract', {
      aztec:
        '{ git = "https://github.com/AztecProtocol/aztec-packages", tag = "v0.82.0", directory = "noir-projects/aztec-nr/aztec" }',
    });
    // makePackage(crateDir) creates all parents including cacheRoot via mkdirp
    await makePackage(crateDir, 'aztec');

    const result = await collectCrateDirs(projectDir);

    expect(result).toContain(resolve(crateDir));
    // The cache root itself is never visited as a crate (only the subdir is)
    expect(result).not.toContain(resolve(cacheRoot));
  });

  it('follows path deps declared inside a cached git dependency', async () => {
    // This test scenario could occur as the git based dep could point to a path based dep in the repository that got
    // cloned.

    const projectDir = join(tempDir, 'project');
    const cacheDir = nargoGitDepPath('https://github.com/SomeOrg/some-repo', 'v2.0');
    const transitiveDep = join(cacheDir, 'lib');

    await makePackage(projectDir, 'project', 'contract', {
      some_dep: '{ git = "https://github.com/SomeOrg/some-repo", tag = "v2.0" }', // eslint-disable-line camelcase
    });
    // Cached dep itself has a path dependency
    await makePackage(cacheDir, 'some_dep', 'lib', { lib: '{ path = "lib" }' });
    await makePackage(transitiveDep, 'lib');

    const result = await collectCrateDirs(projectDir);

    expect(result).toContain(resolve(cacheDir));
    expect(result).toContain(resolve(transitiveDep));
  });

  // ── Git deps — fetch behavior (real local git repos) ───────────────────

  it('clones a git dependency when it is not in the cache', async () => {
    // Create a real local git repo tagged "v2.0" to serve as the remote.
    // This exercises the actual clone path without any network access.
    const repoDir = join(tempDir, 'upstream-repo');
    await makeGitRepo(repoDir, 'v2.0', 'my-dep');

    const projectDir = join(tempDir, 'project');
    await makePackage(projectDir, 'project', 'contract', {
      my_dep: `{ git = "file://${repoDir}", tag = "v2.0" }`, // eslint-disable-line camelcase
    });

    const expectedCachePath = nargoGitDepPath(`file://${repoDir}`, 'v2.0');

    const result = await collectCrateDirs(projectDir);

    expect(result).toContain(resolve(expectedCachePath));
  });

  it('throws a helpful error when the git clone fails', async () => {
    const projectDir = join(tempDir, 'project');
    await makePackage(projectDir, 'project', 'contract', {
      bad: '{ git = "file:///nonexistent/repo/that/does/not/exist", tag = "v1.0" }',
    });

    const err: Error = await collectCrateDirs(projectDir).catch(e => e);
    expect(err.message).toContain('Failed to fetch git dependency');
    expect(err.message).toContain('nargo check');
  });
});
