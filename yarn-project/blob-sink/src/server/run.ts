// Run a standalone blob sink server
import { createLogger } from '@aztec/foundation/log';

import { getBlobSinkConfigFromEnv } from './config.js';
import { createBlobSinkServer } from './factory.js';

const logger = createLogger('aztec:blob-sink');

async function main() {
  const config = getBlobSinkConfigFromEnv();

  const blobSinkServer = await createBlobSinkServer(config);

  await blobSinkServer.start();

  const stop = async () => {
    logger.debug('Stopping Blob Sink...');
    await blobSinkServer.stop();
    logger.info('Node stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

void main();
