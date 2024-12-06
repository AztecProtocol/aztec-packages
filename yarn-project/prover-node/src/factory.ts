import { type Archiver, createArchiver } from '@aztec/archiver';
import { type ProverCoordination, type ProvingJobBroker } from '@aztec/circuit-types';
import { createEthereumChain } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { RollupAbi } from '@aztec/l1-artifacts';
import { createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { L1Publisher } from '@aztec/sequencer-client';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { join } from 'path';
import { createPublicClient, getAddress, getContract, http } from 'viem';

import { createBondManager } from './bond/factory.js';
import { type ProverNodeConfig, type QuoteProviderConfig } from './config.js';
import { ClaimsMonitor } from './monitors/claims-monitor.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { ProverCacheManager } from './prover-cache/cache_manager.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';
import { HttpQuoteProvider } from './quote-provider/http.js';
import { SimpleQuoteProvider } from './quote-provider/simple.js';
import { QuoteSigner } from './quote-signer.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  config: ProverNodeConfig & DataStoreConfig,
  deps: {
    telemetry?: TelemetryClient;
    log?: DebugLogger;
    aztecNodeTxProvider?: ProverCoordination;
    archiver?: Archiver;
    publisher?: L1Publisher;
    broker?: ProvingJobBroker;
  } = {},
) {
  const telemetry = deps.telemetry ?? new NoopTelemetryClient();
  const log = deps.log ?? createDebugLogger('aztec:prover');
  const archiver = deps.archiver ?? (await createArchiver(config, telemetry, { blockUntilSync: true }));
  log.verbose(`Created archiver and synced to block ${await archiver.getBlockNumber()}`);

  const worldStateConfig = { ...config, worldStateProvenBlocksOnly: false };
  const worldStateSynchronizer = await createWorldStateSynchronizer(worldStateConfig, archiver, telemetry);
  await worldStateSynchronizer.start();

  const broker = deps.broker ?? (await createAndStartProvingBroker(config, telemetry));
  const prover = await createProverClient(config, worldStateSynchronizer, broker, telemetry);

  // REFACTOR: Move publisher out of sequencer package and into an L1-related package
  const publisher = deps.publisher ?? new L1Publisher(config, telemetry);

  // If config.p2pEnabled is true, createProverCoordination will create a p2p client where quotes will be shared and tx's requested
  // If config.p2pEnabled is false, createProverCoordination request information from the AztecNode
  const proverCoordination = await createProverCoordination(config, {
    aztecNodeTxProvider: deps.aztecNodeTxProvider,
    worldStateSynchronizer,
    archiver,
    telemetry,
  });

  const quoteProvider = createQuoteProvider(config);
  const quoteSigner = createQuoteSigner(config);

  const proverNodeConfig: ProverNodeOptions = {
    maxPendingJobs: config.proverNodeMaxPendingJobs,
    pollingIntervalMs: config.proverNodePollingIntervalMs,
    maxParallelBlocksPerEpoch: config.proverNodeMaxParallelBlocksPerEpoch,
  };

  const claimsMonitor = new ClaimsMonitor(publisher, proverNodeConfig);
  const epochMonitor = new EpochMonitor(archiver, proverNodeConfig);

  const rollupContract = publisher.getRollupContract();
  const walletClient = publisher.getClient();
  const bondManager = await createBondManager(rollupContract, walletClient, config);

  const cacheDir = config.cacheDir ? join(config.cacheDir, `prover_${config.proverId}`) : undefined;
  const cacheManager = new ProverCacheManager(cacheDir);

  return new ProverNode(
    prover,
    publisher,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    proverCoordination,
    quoteProvider,
    quoteSigner,
    claimsMonitor,
    epochMonitor,
    bondManager,
    telemetry,
    cacheManager,
    proverNodeConfig,
  );
}

function createQuoteProvider(config: QuoteProviderConfig) {
  return config.quoteProviderUrl
    ? new HttpQuoteProvider(config.quoteProviderUrl)
    : new SimpleQuoteProvider(config.quoteProviderBasisPointFee, config.quoteProviderBondAmount);
}

function createQuoteSigner(config: ProverNodeConfig) {
  // REFACTOR: We need a package that just returns an instance of a rollup contract ready to use
  const { l1RpcUrl: rpcUrl, l1ChainId: chainId, l1Contracts } = config;
  const chain = createEthereumChain(rpcUrl, chainId);
  const client = createPublicClient({ chain: chain.chainInfo, transport: http(chain.rpcUrl) });
  const address = getAddress(l1Contracts.rollupAddress.toString());
  const rollupContract = getContract({ address, abi: RollupAbi, client });
  const privateKey = config.publisherPrivateKey;
  return QuoteSigner.new(Buffer32.fromString(privateKey), rollupContract);
}
