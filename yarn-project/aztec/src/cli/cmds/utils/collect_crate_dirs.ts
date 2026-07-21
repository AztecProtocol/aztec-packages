import TOML from '@iarna/toml';
import { existsSync } from 'fs';
import { mkdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

import { run } from './spawn.js';

/**
 * Recursively collects crate directories starting from startCrateDir by following dependencies declared in Nargo.toml
 * files.
 *
 * When `skipGitDeps` is false (default), git-based deps are followed and fetched into the nargo cache
 * (`$HOME/nargo/<domain>/<repo-path>/<tag>`) if not already present.
 *
 * When `skipGitDeps` is true, git-based deps are ignored entirely.
 */
export async function collectCrateDirs(startCrateDir: string, opts?: { skipGitDeps?: boolean }): Promise<string[]> {
  const { skipGitDeps = false } = opts ?? {};
  const visited = new Set<string>();

  async function visit(crateDir: string): Promise<void> {
    const absDir = resolve(crateDir);
    if (visited.has(absDir)) {
      return;
    }
    visited.add(absDir);

    const tomlPath = join(absDir, 'Nargo.toml');
    const content = await readFile(tomlPath, 'utf-8').catch(() => {
      throw new Error(`Incorrectly defined dependency. Nargo.toml not found in ${absDir}`);
    });

    const parsed = TOML.parse(content) as Record<string, any>;
    const members = (parsed.workspace as Record<string, any>)?.members as string[] | undefined;

    // A Nargo.toml is either a workspace root (has workspace.members) or a single crate (has dependencies).
    if (Array.isArray(members)) {
      // The crate is a workspace root and has members defined so we visit the members
      for (const member of members) {
        await visit(resolve(absDir, member));
      }
    } else {
      // Single crate — follow its deps
      const deps = (parsed.dependencies as Record<string, any>) ?? {};
      for (const dep of Object.values(deps)) {
        if (!dep || typeof dep !== 'object') {
          continue;
        }
        if (typeof dep.path === 'string') {
          // Dependency contains "path" hence it's a local dependency. We just check it's a real directory and then we
          // recursively search through it
          const depPath = resolve(absDir, dep.path);
          const s = await stat(depPath);
          if (!s.isDirectory()) {
            throw new Error(
              `Dependency path "${dep.path}" in ${tomlPath} resolves to ${depPath} which is not a directory`,
            );
          }
          await visit(depPath);
        } else if (!skipGitDeps && typeof dep.git === 'string' && typeof dep.tag === 'string') {
          // Dependency contains "git" hence it's a git dependency. We ensure it has been fetched and fetch it if
          // it's not the case and then we recursively search through it.
          await fetchAndVisit(dep.git, dep.tag, dep.directory);
        }
      }
    }
  }

  async function fetchAndVisit(gitUrl: string, tag: string, directory?: string): Promise<void> {
    // `directory` is set when the dep lives in a subdirectory of a repository, e.g.:
    //   aztec = { git = "https://github.com/AztecProtocol/aztec-packages", tag = "v0.82.0",
    //             directory = "noir-projects/aztec-nr/aztec" }
    // In that case nargo clones the whole repo and the crate root is <cachePath>/<directory>.
    const cachePath = nargoGitDepPath(gitUrl, tag);
    const crateDir = directory ? join(cachePath, directory) : cachePath;
    await ensureGitDepCached(gitUrl, tag, cachePath);
    await visit(crateDir);
  }

  await visit(startCrateDir);
  return [...visited];
}

/**
 * Computes the local nargo cache path for a git dependency, mirroring nargo's own `git_dep_location` function.
 * Path format: `$HOME/nargo/<domain>/<repo-path>/<tag>`
 * e.g. `~/nargo/github.com/AztecProtocol/aztec-packages/v0.82.0`
 *
 * Source: noir/noir-repo/tooling/nargo_toml/src/git.rs
 */
export function nargoGitDepPath(gitUrl: string, tag: string): string {
  const url = new URL(gitUrl);
  const domain = url.hostname;
  const repoPath = url.pathname.replace(/^\//, '');
  return join(process.env.HOME ?? homedir(), 'nargo', domain, repoPath, tag);
}

/**
 * Ensures a git dep is present in the nargo cache, cloning it if it isn't. Mirrors nargo's `clone_git_repo`.
 * If cloning fails (e.g. no network), throws with a message suggesting `nargo check` to prime the cache.
 *
 * Source: noir/noir-repo/tooling/nargo_toml/src/git.rs
 */
async function ensureGitDepCached(gitUrl: string, tag: string, cachePath: string): Promise<void> {
  if (existsSync(cachePath)) {
    return;
  }
  await mkdir(dirname(cachePath), { recursive: true });
  try {
    await run('git', ['-c', 'advice.detachedHead=false', 'clone', '--depth', '1', '--branch', tag, gitUrl, cachePath]);
  } catch (err: any) {
    throw new Error(
      `Failed to fetch git dependency ${gitUrl}@${tag}: ${err?.message ?? err}.\n` +
        `Try running \`nargo check\` first to prime the dependency cache.`,
    );
  }
}
