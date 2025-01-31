import { type Archiver, createArchiver } from '@aztec/archiver';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { type ProverCoordination, type ProvingJobBroker } from '@aztec/circuit-types';
import { EpochCache } from '@aztec/epoch-cache';
import { L1TxUtils, RollupContract, createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { RollupAbi } from '@aztec/l1-artifacts';
import { createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient, getAddress, getContract, http } from 'viem';

import { createBondManager } from './bond/factory.js';
import { type ProverNodeConfig, type QuoteProviderConfig } from './config.js';
import { ClaimsMonitor } from './monitors/claims-monitor.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';
import { HttpQuoteProvider } from './quote-provider/http.js';
import { SimpleQuoteProvider } from './quote-provider/simple.js';
import { QuoteSigner } from './quote-signer.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  config: ProverNodeConfig & DataStoreConfig,
  deps: {
    telemetry?: TelemetryClient;
    log?: Logger;
    aztecNodeTxProvider?: ProverCoordination;
    archiver?: Archiver;
    publisher?: ProverNodePublisher;
    blobSinkClient?: BlobSinkClientInterface;
    broker?: ProvingJobBroker;
    l1TxUtils?: L1TxUtils;
  } = {},
) {
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const blobSinkClient = deps.blobSinkClient ?? createBlobSinkClient(config);
  const log = deps.log ?? createLogger('prover-node');
  const archiver = deps.archiver ?? (await createArchiver(config, blobSinkClient, { blockUntilSync: true }, telemetry));
  log.verbose(`Created archiver and synced to block ${await archiver.getBlockNumber()}`);

  const worldStateConfig = { ...config, worldStateProvenBlocksOnly: false };
  const worldStateSynchronizer = await createWorldStateSynchronizer(worldStateConfig, archiver, telemetry);
  await worldStateSynchronizer.start();

  const broker = deps.broker ?? (await createAndStartProvingBroker(config, telemetry));
  const prover = await createProverClient(config, worldStateSynchronizer, broker, telemetry);

  const { l1RpcUrl: rpcUrl, l1ChainId: chainId, publisherPrivateKey } = config;
  const chain = createEthereumChain(rpcUrl, chainId);
  const { publicClient, walletClient } = createL1Clients(rpcUrl, publisherPrivateKey, chain.chainInfo);

  const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils ?? new L1TxUtils(publicClient, walletClient, log, config);
  const publisher = deps.publisher ?? new ProverNodePublisher(config, { telemetry, rollupContract, l1TxUtils });

  const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config);

  // If config.p2pEnabled is true, createProverCoordination will create a p2p client where quotes will be shared and tx's requested
  // If config.p2pEnabled is false, createProverCoordination request information from the AztecNode
  const proverCoordination = await createProverCoordination(config, {
    aztecNodeTxProvider: deps.aztecNodeTxProvider,
    worldStateSynchronizer,
    archiver,
    epochCache,
    telemetry,
  });

  const quoteProvider = createQuoteProvider(config);
  const quoteSigner = createQuoteSigner(config);

  const proverNodeConfig: ProverNodeOptions = {
    maxPendingJobs: config.proverNodeMaxPendingJobs,
    pollingIntervalMs: config.proverNodePollingIntervalMs,
    maxParallelBlocksPerEpoch: config.proverNodeMaxParallelBlocksPerEpoch,
    txGatheringMaxParallelRequests: config.txGatheringMaxParallelRequests,
    txGatheringIntervalMs: config.txGatheringIntervalMs,
    txGatheringTimeoutMs: config.txGatheringTimeoutMs,
  };

  const claimsMonitor = new ClaimsMonitor(publisher, proverNodeConfig, telemetry);
  const epochMonitor = new EpochMonitor(archiver, proverNodeConfig, telemetry);

  const escrowContractAddress = await rollupContract.getProofCommitmentEscrow();
  const bondManager = await createBondManager(EthAddress.fromString(escrowContractAddress), walletClient, config);

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
    proverNodeConfig,
    telemetry,
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
