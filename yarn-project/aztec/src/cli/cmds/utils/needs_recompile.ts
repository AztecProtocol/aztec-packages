import TOML from '@iarna/toml';
import { readFile, readdir, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';

/** Returns the mtime (in ms) of the oldest .json artifact in targetDir, or undefined if none exist. */
async function getOldestArtifactMtimeMs(targetDir: string): Promise<number | undefined> {
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

/** Recursively finds all Nargo.toml files under dir, skipping target/ directories. */
async function findNargoTomls(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'target') {
          continue;
        }
        await walk(join(d, entry.name));
      } else if (entry.name === 'Nargo.toml') {
        results.push(join(d, entry.name));
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Recursively collects source directories starting from startDir by following path-based dependencies declared in
 * Nargo.toml files. Git-based deps are ignored (they only change when Nargo.toml itself is modified since the deps are
 * tagged).
 */
async function collectSourceDirs(startDir: string): Promise<string[]> {
  // We have a set of visited dirs we check against when entering a new dir because we could stumble upon a directory
  // multiple times in case multiple deps shared a dep (e.g. dep A and dep B both sharing dep C).
  const visited = new Set<string>();
  const result: string[] = [];

  async function visit(dir: string): Promise<void> {
    const absDir = resolve(dir);
    if (visited.has(absDir)) {
      // We already visited this dir so we stop searching in this recursion.
      return;
    }
    visited.add(absDir);
    result.push(absDir);

    const tomlPaths = await findNargoTomls(absDir);

    for (const tomlPath of tomlPaths) {
      let content: string;
      try {
        content = await readFile(tomlPath, 'utf-8');
      } catch {
        continue;
      }

      let parsed: Record<string, any>;
      try {
        parsed = TOML.parse(content) as Record<string, any>;
      } catch {
        continue;
      }

      const deps = (parsed.dependencies as Record<string, any>) ?? {};
      for (const dep of Object.values(deps)) {
        if (dep && typeof dep === 'object' && typeof dep.path === 'string') {
          const depPath = resolve(dirname(tomlPath), dep.path);
          try {
            const s = await stat(depPath);
            if (s.isDirectory()) {
              await visit(depPath);
            }
          } catch {
            // Dependency directory doesn't exist; skip.
          }
        }
      }
    }
  }

  await visit(startDir);
  return result;
}

/**
 * Walks sourceDirs looking for .nr and Nargo.toml files newer than thresholdMs. Short-circuits on the first match.
 */
async function hasNewerSourceFile(sourceDirs: string[], thresholdMs: number): Promise<boolean> {
  async function walkForNewer(dir: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'target') {
          continue;
        }
        if (await walkForNewer(fullPath)) {
          return true;
        }
      } else if (entry.name === 'Nargo.toml' || entry.name.endsWith('.nr')) {
        const s = await stat(fullPath);
        if (s.mtimeMs > thresholdMs) {
          return true;
        }
      }
    }
    return false;
  }

  for (const dir of sourceDirs) {
    if (await walkForNewer(dir)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if recompilation is needed: either no artifacts exist in target/ or any .nr or Nargo.toml source file
 * (including path-based dependencies) is newer than the oldest artifact. We compare against the oldest artifact so
 * that a source change between the oldest and newest compilation (e.g. in a multi-contract workspace) still triggers
 * a recompile.
 *
 * Note: The above implies that if there is a random json file in the target dir we would be always recompiling.
 */
export async function needsRecompile(): Promise<boolean> {
  const oldestArtifactMs = await getOldestArtifactMtimeMs('target');
  if (oldestArtifactMs === undefined) {
    return true;
  }

  const sourceDirs = await collectSourceDirs('.');
  return hasNewerSourceFile(sourceDirs, oldestArtifactMs);
}
