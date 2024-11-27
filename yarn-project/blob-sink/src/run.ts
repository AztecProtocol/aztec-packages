// Run a standalone blob sink server

import { createDebugLogger } from "@aztec/foundation/log";
import { BlobSinkServer } from "./server.js";
import { getBlobSinkConfigFromEnv } from "./config.js";


const logger = createDebugLogger('aztec:blob-sink');

async function main() {

  const config = getBlobSinkConfigFromEnv();
  const blobSinkServer = new BlobSinkServer(config);

  await blobSinkServer.start();

  const stop = async () => {
    logger.debug('Stopping bootstrap node...');
    await blobSinkServer.stop();
    logger.info('Node stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main();