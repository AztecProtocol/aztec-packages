import TOML from '@iarna/toml';
import { readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Returns true if recompilation is needed: either no artifacts exist in target/ or any .nr or Nargo.toml source file
 * (including path-based dependencies) is newer than the oldest artifact. We compare against the oldest artifact so
 * that a source change between the oldest and newest compilation (e.g. in a multi-contract workspace) still triggers
 * a recompile.
 *
 * Note: The above implies that if there is a random json file in the target dir we would be always recompiling.
 */
export async function needsRecompile(): Promise<boolean> {
  const oldestArtifactMs = await getOldestArtifactModificationTime('target');
  if (oldestArtifactMs === undefined) {
    return true;
  }

  const crateDirs = await collectCrateDirs('.');
  return hasNewerSourceFile(crateDirs, oldestArtifactMs);
}

/**
 * Returns the last modification time (timestamp in ms) of the oldest .json artifact in targetDir, or undefined if
 * none exist.
 */
async function getOldestArtifactModificationTime(targetDir: string): Promise<number | undefined> {
  let entries: string[];
  try {
    entries = (await readdir(targetDir)).filter(f => f.endsWith('.json'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }

  if (entries.length === 0) {
    return undefined;
  }

  let oldest = Infinity;
  for (const entry of entries) {
    const s = await stat(join(targetDir, entry));
    if (s.mtimeMs < oldest) {
      oldest = s.mtimeMs;
    }
  }
  return oldest;
}

/**
 * Recursively collects crate directories starting from startCrateDir by following path-based dependencies declared in
 * Nargo.toml files. Git-based deps are ignored (they only change when Nargo.toml itself is modified since the deps are
 * tagged).
 */
async function collectCrateDirs(startCrateDir: string): Promise<string[]> {
  // We have a set of visited dirs we check against when entering a new dir because we could stumble upon a directory
  // multiple times in case multiple deps shared a dep (e.g. dep A and dep B both sharing dep C).
  const visited = new Set<string>();

  async function visit(crateDir: string): Promise<void> {
    const absDir = resolve(crateDir);
    if (visited.has(absDir)) {
      return;
    }
    visited.add(absDir);

    // Every dep is its own crate and every crate needs to have Nargo.toml defined in the root so we try to load it and
    // error out if it's not the case.
    const tomlPath = join(absDir, 'Nargo.toml');
    const content = await readFile(tomlPath, 'utf-8').catch(() => {
      throw new Error(`Incorrectly defined dependency. Nargo.toml not found in ${absDir}`);
    });

    const parsed = TOML.parse(content) as Record<string, any>;

    const members = (parsed.workspace as Record<string, any>)?.members as string[] | undefined;

    if (Array.isArray(members)) {
      // The crate is a workspace root and has members defined so we visit the members
      for (const member of members) {
        const memberPath = resolve(absDir, member);
        await visit(memberPath);
      }
    } else {
      // The crate is not a workspace root so we check for dependencies
      const deps = (parsed.dependencies as Record<string, any>) ?? {};
      for (const dep of Object.values(deps)) {
        if (dep && typeof dep === 'object' && typeof dep.path === 'string') {
          const depPath = resolve(absDir, dep.path);
          const s = await stat(depPath);
          if (!s.isDirectory()) {
            throw new Error(
              `Dependency path "${dep.path}" in ${tomlPath} resolves to ${depPath} which is not a directory`,
            );
          }
          await visit(depPath);
        }
      }
    }
  }

  await visit(startCrateDir);
  return [...visited];
}

/**
 * Walks crate dirs looking for .nr and Nargo.toml files newer than thresholdMs. Short-circuits on the first match.
 */
async function hasNewerSourceFile(crateDirs: string[], thresholdMs: number): Promise<boolean> {
  // Returns true if it find a new file than thresholdMs, false otherwise
  async function walkForNewer(dir: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    // We iterate over the entries in the dir
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // If the entry is a dir and it's not called `target` we recursively enter it
        if (entry.name === 'target') {
          continue;
        }
        if (await walkForNewer(fullPath)) {
          return true;
        }
      } else if (entry.name === 'Nargo.toml' || entry.name.endsWith('.nr')) {
        // The entry is a Nargo.toml file or *.nr file so we check the timestamp
        const s = await stat(fullPath);
        if (s.mtimeMs > thresholdMs) {
          return true;
        }
      }
    }
    return false;
  }

  // We search through the crate dirs
  for (const dir of crateDirs) {
    if (await walkForNewer(dir)) {
      return true;
    }
  }
  return false;
}
