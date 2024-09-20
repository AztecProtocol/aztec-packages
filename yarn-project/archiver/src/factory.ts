import { createDebugLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/utils';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { Archiver } from './archiver/archiver.js';
import { type ArchiverConfig } from './archiver/config.js';
import { KVArchiverDataStore } from './archiver/index.js';
import { createArchiverClient } from './rpc/archiver_client.js';

export async function createArchiver(
  config: ArchiverConfig,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
) {
  if (!config.archiverUrl) {
    const store = await createStore('archiver', config, createDebugLogger('aztec:archiver:lmdb'));
    const archiverStore = new KVArchiverDataStore(store, config.maxLogs);
    return Archiver.createAndSync(config, archiverStore, telemetry, opts.blockUntilSync);
  } else {
    return createArchiverClient(config.archiverUrl);
  }
}
