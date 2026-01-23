import type { Archiver } from '@aztec/archiver';
import type { Logger } from '@aztec/foundation/log';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { SnapshotDataUrls } from '@aztec/stdlib/snapshots';

import { existsSync } from 'fs';
import { join } from 'path/posix';

export async function createBackups(
  backupDir: string,
  archiver: Archiver,
  worldState: WorldStateSynchronizer,
  log: Logger,
) {
  try {
    log.info(`Pausing archiver and world state sync to start snapshot upload`);
    await archiver.stop();
    await worldState.stopSync();

    log.info(`Creating backups of lmdb environments to ${backupDir}`);
    const [archiverPath, worldStatePaths] = await Promise.all([
      archiver.backupTo(join(backupDir, 'archiver')),
      worldState.backupTo(join(backupDir, 'world-state')),
    ]);
    const paths: SnapshotDataUrls = { ...worldStatePaths, archiver: archiverPath };

    const missing = Object.entries(paths).filter(([_key, path]) => !path || !existsSync(path));
    if (missing.length > 0) {
      throw new Error(`Missing backup files: ${missing.map(([key, path]) => `${path} (${key})`).join(', ')}`);
    }

    log.info(`Data stores backed up to ${backupDir}`, { paths });
    return paths;
  } catch (err) {
    throw new Error(`Error creating backups for snapshot upload: ${err}`);
  } finally {
    log.info(`Resuming archiver and world state sync`);
    worldState.resumeSync();
    archiver.resume();
  }
}
