import {
  type BlobSinkConfig,
  blobSinkConfigMappings,
  createBlobSinkServer,
  getBlobSinkConfigFromEnv,
} from '@aztec/blob-sink/server';
import type { LogFn } from '@aztec/foundation/log';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { getL1Config } from '../get_l1_config.js';
import { extractRelevantOptions } from '../util.js';

export async function startBlobSink(options: any, signalHandlers: (() => Promise<void>)[], userLog: LogFn) {
  if (options.prover || options.node || options.sequencer || options.pxe || options.p2pBootstrap || options.txe) {
    userLog(
      `Starting a blob sink with --node, --sequencer, --pxe, --p2p-bootstrap, --prover or --txe is not supported.`,
    );
    process.exit(1);
  }

  let blobSinkConfig: BlobSinkConfig = {
    ...getBlobSinkConfigFromEnv(), // get default config from env
    ...extractRelevantOptions<BlobSinkConfig>(options, blobSinkConfigMappings, 'blobSink'), // override with command line options
  };

  if (!blobSinkConfig.l1Contracts?.registryAddress || blobSinkConfig.l1Contracts.registryAddress.isZero()) {
    throw new Error('REGISTRY_CONTRACT_ADDRESS not set');
  }

  if (!blobSinkConfig.l1RpcUrls || blobSinkConfig.l1RpcUrls.length === 0) {
    throw new Error('ETHEREUM_HOSTS not set');
  }

  if (typeof blobSinkConfig.l1ChainId !== 'number') {
    throw new Error('L1_CHAIN_ID');
  }

  const telemetry = initTelemetryClient(getTelemetryClientConfig());

  const { config: chainConfig, addresses } = await getL1Config(
    blobSinkConfig.l1Contracts.registryAddress,
    blobSinkConfig.l1RpcUrls,
    blobSinkConfig.l1ChainId,
    blobSinkConfig.rollupVersion,
  );

  blobSinkConfig = {
    ...blobSinkConfig,
    l1Contracts: addresses,
    ...chainConfig,
  };

  const blobSink = await createBlobSinkServer(blobSinkConfig, telemetry);
  signalHandlers.push(blobSink.stop.bind(blobSink));

  await blobSink.start();
}
