import { type Archiver, createArchiver } from '@aztec/archiver';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { BBCircuitVerifier } from '@aztec/bb-prover/verifier';
import { type AztecNode } from '@aztec/circuit-types';
import { createEthereumChain } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { type P2PClient, createP2PClient } from '@aztec/p2p';
import { createProverClient } from '@aztec/prover-client';
import { L1Publisher } from '@aztec/sequencer-client';
import { createSimulationProvider } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient, getAddress, getContract, http } from 'viem';

import { createBondManager } from './bond/factory.js';
import { type ProverNodeConfig, type QuoteProviderConfig } from './config.js';
import { ClaimsMonitor } from './monitors/claims-monitor.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNode } from './prover-node.js';
import { HttpQuoteProvider } from './quote-provider/http.js';
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

  // WORKTODO: if prover node p2p is configured, then we can createProverCoordination via p2p in the createProverCoordination function
  // WORKTODO: it is not clear how the proof verifier will go in here - but it is required to validate the p2p requests.
  // WORKTODO: describe how this is set up - and create tests
  let p2pClient: P2PClient | undefined = undefined;
  if (config.p2pEnabled) {
    log.info('Using prover coordination via p2p');

    const proofVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
    p2pClient = await createP2PClient(config, archiver, proofVerifier, worldStateSynchronizer, telemetry);
    await p2pClient.start();

    log.info('Started p2p client');
  }

  const txProvider = deps.aztecNodeTxProvider ? deps.aztecNodeTxProvider : createProverCoordination(config, p2pClient);
  const quoteProvider = createQuoteProvider(config);
  const quoteSigner = createQuoteSigner(config);

  const proverNodeConfig = {
    maxPendingJobs: config.proverNodeMaxPendingJobs,
    pollingIntervalMs: config.proverNodePollingIntervalMs,
  };

  const claimsMonitor = new ClaimsMonitor(publisher, proverNodeConfig);
  const epochMonitor = new EpochMonitor(archiver, proverNodeConfig);

  const rollupContract = publisher.getRollupContract();
  const walletClient = publisher.getClient();
  const bondManager = await createBondManager(rollupContract, walletClient, config);

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
    bondManager,
    p2pClient,
    telemetry,
    proverNodeConfig,
  );
}

// WORKTODO: will there need to be a quote provider that works via p2p?
function createQuoteProvider(
  config: QuoteProviderConfig,
  // ,p2pClient?: P2PClient
) {
  // if (p2pClient) {
  //   return new P2PQuoteProvider(p2pClient);
  // }
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
