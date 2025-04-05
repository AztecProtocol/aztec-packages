import type { LogFn, Logger } from '@aztec/foundation/log';

import { preloadCrsDataForServerSideProving } from './util.js';

export async function preloadCrs(_options: any, userLog: LogFn, _debugLogger: Logger) {
  await preloadCrsDataForServerSideProving({ realProofs: true }, userLog);
}
