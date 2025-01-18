import {
  type BlobSinkConfig,
  blobSinkConfigMappings,
  createBlobSinkServer,
  getBlobSinkConfigFromEnv,
} from '@aztec/blob-sink/server';
import { type LogFn } from '@aztec/foundation/log';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';

export async function startBlobSink(options: any, signalHandlers: (() => Promise<void>)[], userLog: LogFn) {
  if (options.prover || options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(
      `Starting a blob sink with --node, --sequencer, --pxe, --p2p-bootstrap, --prover or --txe is not supported.`,
    );
    process.exit(1);
  }

  const blobSinkConfig = {
    ...getBlobSinkConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<BlobSinkConfig>(options, blobSinkConfigMappings, 'blobSink'), // override with command line options
  };

  const telemetry = initTelemetryClient(getTelemetryClientConfig());

  const blobSink = await createBlobSinkServer(blobSinkConfig, telemetry);
  signalHandlers.push(blobSink.stop.bind(blobSink));

  await blobSink.start();
}
