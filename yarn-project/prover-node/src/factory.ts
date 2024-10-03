import { type Archiver, createArchiver } from '@aztec/archiver';
import { type AztecNode } from '@aztec/circuit-types';
import { createEthereumChain } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { createProverClient } from '@aztec/prover-client';
import { L1Publisher } from '@aztec/sequencer-client';
import { createSimulationProvider } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient, getAddress, getContract, http } from 'viem';

import { type ProverNodeConfig, type QuoteProviderConfig } from './config.js';
import { ClaimsMonitor } from './monitors/claims-monitor.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNode } from './prover-node.js';
import { SimpleQuoteProvider } from './quote-provider/simple.js';
import { QuoteSigner } from './quote-signer.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  config: ProverNodeConfig,
  deps: {
    telemetry?: TelemetryClient;
    log?: DebugLogger;
    aztecNodeTxProvider?: AztecNode;
    archiver?: Archiver;
  } = {},
) {
  const telemetry = deps.telemetry ?? new NoopTelemetryClient();
  const log = deps.log ?? createDebugLogger('aztec:prover');
  const archiver = deps.archiver ?? (await createArchiver(config, telemetry, { blockUntilSync: true }));
  log.verbose(`Created archiver and synced to block ${await archiver.getBlockNumber()}`);

  const worldStateConfig = { ...config, worldStateProvenBlocksOnly: true };
  const worldStateSynchronizer = await createWorldStateSynchronizer(worldStateConfig, archiver, telemetry);
  await worldStateSynchronizer.start();

  const simulationProvider = await createSimulationProvider(config, log);

  const prover = await createProverClient(config, telemetry);

  // REFACTOR: Move publisher out of sequencer package and into an L1-related package
  const publisher = new L1Publisher(config, telemetry);

  const txProvider = deps.aztecNodeTxProvider ? deps.aztecNodeTxProvider : createProverCoordination(config);
  const quoteProvider = createQuoteProvider(config);
  const quoteSigner = createQuoteSigner(config);

  const proverNodeConfig = {
    maxPendingJobs: config.proverNodeMaxPendingJobs,
    pollingIntervalMs: config.proverNodePollingIntervalMs,
  };

  const claimsMonitor = new ClaimsMonitor(publisher, proverNodeConfig);
  const epochMonitor = new EpochMonitor(archiver, proverNodeConfig);

  return new ProverNode(
    prover!,
    publisher,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    txProvider,
    simulationProvider,
    quoteProvider,
    quoteSigner,
    claimsMonitor,
    epochMonitor,
    telemetry,
    proverNodeConfig,
  );
}

function createQuoteProvider(config: QuoteProviderConfig) {
  return new SimpleQuoteProvider(config.quoteProviderBasisPointFee, config.quoteProviderBondAmount);
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
