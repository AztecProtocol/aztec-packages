import type { Archiver } from '@aztec/archiver';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export async function uploadSnapshot(
  archiver: Archiver,
  worldState: WorldStateSynchronizer,
  config: Pick<DataStoreConfig, 'dataDirectory' | 'l1Contracts'>,
  log: Logger,
) {
  if (!('backupTo' in archiver)) {
    // Rule out remote archivers
    throw new Error('Archiver implementation does not support backups. Cannot generate snapshot.');
  }

  const backupDir = await mkdtemp(join(config.dataDirectory ?? tmpdir(), 'snapshot'));

  try {
    log.info(`Pausing archiver and world state sync to start snapshot upload`);
    await archiver.stop();
    await worldState.stopSync();

    log.info(`Creating backups of lmdb environments to ${backupDir}`);
    await Promise.all([
      archiver.backupTo(join(backupDir, 'archiver')),
      worldState.backupTo(join(backupDir, 'world-state')),
    ]);
  } finally {
    log.info(`Snapshot generated, resuming archiver and world state sync`);
    worldState.resumeSync();
    archiver.restart();
  }

  try {
    // Upload snapshot
  } finally {
    log.info(`Cleaning up backup dir`);
    await rm(backupDir, { recursive: true, maxRetries: 3 });
  }
}
