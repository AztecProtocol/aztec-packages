import { createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, BatchChonkVerifier, QueuedIVCVerifier } from '@aztec/bb-prover';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { createBlobClientWithFileStores } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { getPublicClient, makeL1HttpTransport } from '@aztec/ethereum/client';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import { pickL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { type KeyStore, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { createForwarderL1TxUtilsFromSigners, createL1TxUtilsFromSigners } from '@aztec/node-lib/factories';
import { type P2PClientDeps, createP2PClient } from '@aztec/p2p';
import { type ProverNode, type ProverNodeDeps, createProverNode } from '@aztec/prover-node';
import { createKeyStoreForProver } from '@aztec/prover-node/config';
import {
  FeeSnapshotService,
  GlobalVariableBuilder,
  SequencerClient,
  type SequencerPublisher,
  getDefaultFeeSnapshotServiceConfig,
} from '@aztec/sequencer-client';
import { type AutomineSequencer, createAutomineSequencer } from '@aztec/sequencer-client/automine';
import {
  AttestationsBlockWatcher,
  AttestedInvalidProposalWatcher,
  BroadcastedInvalidCheckpointProposalWatcher,
  CheckpointEquivocationWatcher,
  DataWithholdingWatcher,
  type SlasherClientInterface,
  type Watcher,
  createSlasher,
} from '@aztec/slasher';
import { CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import { type ClientProtocolCircuitVerifier, tryStop } from '@aztec/stdlib/interfaces/server';
import { type DebugLogStore, InMemoryDebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import {
  FullNodeCheckpointsBuilder as CheckpointsBuilder,
  FullNodeCheckpointsBuilder,
  NodeKeystoreAdapter,
  type ProposalHandler,
  ValidatorClient,
  createProposalHandler,
  createValidatorClient,
} from '@aztec/validator-client';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';
import { createWorldState, createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient } from 'viem';

import { type AztecNodeConfig, createKeyStoreForValidator } from './aztec-node/config.js';
import { AztecNodeService } from './aztec-node/server.js';
import { createSentinel } from './sentinel/factory.js';

/** Dependencies that can be injected when creating a node, mostly to override defaults in tests. */
export interface CreateAztecNodeDeps {
  telemetry?: TelemetryClient;
  logger?: Logger;
  publisher?: SequencerPublisher;
  dateProvider?: DateProvider;
  p2pClientDeps?: P2PClientDeps;
  proverNodeDeps?: Partial<ProverNodeDeps>;
  slashingProtectionDb?: SlashingProtectionDatabase;
}

/** Options controlling which subsystems are started when creating a node. */
export interface CreateAztecNodeOptions {
  genesis?: GenesisData;
  dontStartSequencer?: boolean;
  dontStartProverNode?: boolean;
}

/**
 * Initializes the Aztec Node, waiting for its components to sync.
 * @param inputConfig - The configuration to be used by the aztec node.
 * @returns A fully synced Aztec Node for use in development/testing.
 */
export async function createAztecNodeService(
  inputConfig: AztecNodeConfig,
  deps: CreateAztecNodeDeps = {},
  options: CreateAztecNodeOptions = {},
): Promise<AztecNodeService> {
  const config = { ...inputConfig }; // Copy the config so we dont mutate the input object
  const log = deps.logger ?? createLogger('node');

  // Initialise the bb.js sync WASM singleton here, before any subsystem runs.
  const { BarretenbergSync } = await import('@aztec/bb.js');
  await BarretenbergSync.initSingleton();

  const packageVersion = getPackageVersion();
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const dateProvider = deps.dateProvider ?? new DateProvider();
  const ethereumChain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);

  // Build a key store from file if given or from environment otherwise.
  // We keep the raw KeyStore available so we can merge with prover keys if enableProverNode is set.
  let keyStoreManager: KeystoreManager | undefined;
  const keyStoreProvided = config.keyStoreDirectory !== undefined && config.keyStoreDirectory.length > 0;
  if (keyStoreProvided) {
    const keyStores = loadKeystores(config.keyStoreDirectory!);
    keyStoreManager = new KeystoreManager(mergeKeystores(keyStores));
  } else {
    const rawKeyStores: KeyStore[] = [];
    const validatorKeyStore = createKeyStoreForValidator(config);
    if (validatorKeyStore) {
      rawKeyStores.push(validatorKeyStore);
    }
    if (config.enableProverNode) {
      const proverKeyStore = createKeyStoreForProver(config);
      if (proverKeyStore) {
        rawKeyStores.push(proverKeyStore);
      }
    }
    if (rawKeyStores.length > 0) {
      keyStoreManager = new KeystoreManager(rawKeyStores.length === 1 ? rawKeyStores[0] : mergeKeystores(rawKeyStores));
    }
  }

  await keyStoreManager?.validateSigners();

  // If we are a validator, verify our configuration before doing too much more.
  if (!config.disableValidator) {
    if (keyStoreManager === undefined) {
      throw new Error('Failed to create key store, a requirement for running a validator');
    }
    if (!keyStoreProvided && process.env.NODE_ENV !== 'test') {
      log.warn("Keystore created from env: it's recommended to use a file-based key store for production");
    }
    ValidatorClient.validateKeyStoreConfiguration(keyStoreManager, log);
  }

  // validate that the actual chain id matches that specified in configuration
  if (config.l1ChainId !== ethereumChain.chainInfo.id) {
    throw new Error(
      `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
    );
  }

  const publicClient = createPublicClient({
    chain: ethereumChain.chainInfo,
    transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
    pollingInterval: config.viemPollingIntervalMS,
  });

  const l1ContractsAddresses = await RegistryContract.collectAddresses(
    publicClient,
    config.registryAddress,
    config.rollupVersion ?? 'canonical',
  );

  Object.assign(config, l1ContractsAddresses);

  const rollupContract = new RollupContract(publicClient, config.rollupAddress.toString());
  const [l1GenesisTime, slotDuration, epochDuration, rollupVersionFromRollup, rollupManaLimit] = await Promise.all([
    rollupContract.getL1GenesisTime(),
    rollupContract.getSlotDuration(),
    rollupContract.getEpochDuration(),
    rollupContract.getVersion(),
    rollupContract.getManaLimit().then(Number),
  ] as const);

  config.rollupVersion ??= Number(rollupVersionFromRollup);

  if (config.rollupVersion !== Number(rollupVersionFromRollup)) {
    log.warn(
      `Registry looked up and returned a rollup with version (${config.rollupVersion}), but this does not match with version detected from the rollup directly: (${rollupVersionFromRollup}).`,
    );
  }

  const blobClient = await createBlobClientWithFileStores(config, log.createChild('blob-client'));

  // attempt snapshot sync if possible
  await trySnapshotSync(config, log);

  const epochCache = await EpochCache.create(config.rollupAddress, config, { dateProvider });

  // Track started resources so we can clean up on partial failure during node creation.
  const started: { stop?(): Promise<void> | void }[] = [];
  try {
    config.skipOrphanProposedBlockPruning ||= !!config.useAutomineSequencer;

    checkConfigMatchesRollup(config, {
      slotDuration: Number(slotDuration),
      epochDuration: Number(epochDuration),
    });

    // Create world-state first so we can retrieve the initial header before constructing the archiver.
    const nativeWs = await createWorldState(config, options.genesis);
    const initialHeader = nativeWs.getInitialHeader();
    const initialBlockHash = await initialHeader.hash();
    const archiver = await createArchiver(
      config,
      { blobClient, epochCache, telemetry, dateProvider },
      { blockUntilSync: !config.skipArchiverInitialSync },
      initialHeader,
      initialBlockHash,
    );
    started.push(archiver);

    // The synchronizer takes ownership of the native world-state from here
    const worldStateSynchronizer = await createWorldStateSynchronizer(config, archiver, nativeWs, telemetry);
    started.push(worldStateSynchronizer);
    const useRealVerifiers = config.realProofs || config.debugForceTxProofVerification;
    let peerProofVerifier: ClientProtocolCircuitVerifier;
    let rpcProofVerifier: ClientProtocolCircuitVerifier;
    if (useRealVerifiers) {
      peerProofVerifier = await BatchChonkVerifier.new(config, config.bbChonkVerifyMaxBatch, 'peer');
      const rpcVerifier = await BBCircuitVerifier.new(config);
      rpcProofVerifier = new QueuedIVCVerifier(rpcVerifier, config.numConcurrentIVCVerifiers);
    } else {
      peerProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
      rpcProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
    }
    started.push(peerProofVerifier, rpcProofVerifier);

    let debugLogStore: DebugLogStore;
    if (!config.realProofs) {
      log.warn(`Aztec node is accepting fake proofs`);

      debugLogStore = new InMemoryDebugLogStore();
      log.info(
        'Aztec node started in test mode (realProofs set to false) hence debug logs from public functions will be collected and served',
      );
    } else {
      debugLogStore = new NullDebugLogStore();
    }

    const globalVariableBuilderConfig = {
      rollupAddress: config.rollupAddress,
      ethereumSlotDuration: config.ethereumSlotDuration,
      rollupVersion: BigInt(config.rollupVersion),
      l1GenesisTime,
      slotDuration: Number(slotDuration),
    };

    const globalVariableBuilder = new GlobalVariableBuilder(publicClient, globalVariableBuilderConfig);

    // Serve fee RPCs (and the p2p mempool fee policy) from a background snapshot refreshed per L1 block, so
    // warm calls issue zero L1 requests. The service pins its reads to the archiver's synced L1 identity.
    const feeSnapshotService = new FeeSnapshotService(
      rollupContract,
      archiver,
      dateProvider,
      getDefaultFeeSnapshotServiceConfig({
        slotDuration: Number(slotDuration),
        l1GenesisTime,
        ethereumSlotDuration: config.ethereumSlotDuration,
        epochDuration: Number(epochDuration),
      }),
      log.createChild('fee-snapshot'),
    );
    feeSnapshotService.start();
    started.push(feeSnapshotService);
    const feeProvider = feeSnapshotService;

    const collectOffenses = !config.disableValidator || config.enableOffenseCollection;

    // A prover node may still be proving an epoch whose blocks have already finalized on L1. Its proof
    // submission window spans (proofSubmissionEpochs + 1) epochs, so its tx pool must keep finalized txs
    // for at least that long to re-fetch them for proving and failure upload. Operators may configure a
    // larger margin but not a smaller one.
    if (config.enableProverNode) {
      const proofSubmissionEpochs = await rollupContract.getProofSubmissionEpochs();
      const proverRetentionFloorSlots = (proofSubmissionEpochs + 1) * Number(epochDuration);
      const configuredSlots = config.keepFinalizedTxsForSlots ?? 0;
      if (proverRetentionFloorSlots > configuredSlots) {
        log.warn(
          `Increasing keepFinalizedTxsForSlots from ${configuredSlots} to ${proverRetentionFloorSlots} ` +
            `(proof submission window of ${proofSubmissionEpochs + 1} epochs) to retain finalized txs for proving`,
        );
        config.keepFinalizedTxsForSlots = proverRetentionFloorSlots;
      }
    }

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(
      config,
      archiver,
      peerProofVerifier,
      worldStateSynchronizer,
      epochCache,
      feeProvider,
      packageVersion,
      dateProvider,
      telemetry,
      deps.p2pClientDeps,
      initialBlockHash,
    );
    started.push(p2pClient);
    archiver.setCheckpointProposalPresence(p2pClient);

    // We'll accumulate sentinel watchers here
    const watchers: Watcher[] = [];

    // Create FullNodeCheckpointsBuilder for block proposal handling and tx validation.
    // Override maxTxsPerCheckpoint with the validator-specific limit if set.
    const validatorCheckpointsBuilder = new FullNodeCheckpointsBuilder(
      {
        ...config,
        l1GenesisTime,
        slotDuration: Number(slotDuration),
        rollupManaLimit,
        maxTxsPerCheckpoint: config.validateMaxTxsPerCheckpoint,
      },
      worldStateSynchronizer,
      archiver,
      dateProvider,
      telemetry,
    );

    let validatorClient: ValidatorClient | undefined;

    // The proposal handler (validator-owned or standalone) tracks invalid-proposal/equivocation slots and
    // feeds the attested-invalid-proposal watcher, so the watcher works on non-validator nodes too.
    let proposalHandler: ProposalHandler | undefined;

    // Tracks successful checkpoint re-execution by a checkpoint proposal handler.
    const reexecutionTracker = new CheckpointReexecutionTracker();

    if (!config.disableValidator) {
      // Create validator client if required
      validatorClient = await createValidatorClient(config, {
        checkpointsBuilder: validatorCheckpointsBuilder,
        worldState: worldStateSynchronizer,
        p2pClient,
        telemetry,
        dateProvider,
        epochCache,
        blockSource: archiver,
        l1ToL2MessageSource: archiver,
        keyStoreManager,
        blobClient,
        reexecutionTracker,
        slashingProtectionDb: deps.slashingProtectionDb,
      });

      // If we have a validator client, register it as a source of offenses for the slasher,
      // and have it register callbacks on the p2p client *before* we start it, otherwise messages
      // like attestations or auths will fail.
      if (validatorClient) {
        watchers.push(validatorClient);

        const vc = validatorClient;
        const getValidatorAddresses = () => vc.getValidatorAddresses().map(a => a.toString());
        proposalHandler = validatorClient.getProposalHandler();
        proposalHandler.register(p2pClient, true, archiver, getValidatorAddresses);

        if (!options.dontStartSequencer) {
          await validatorClient.registerHandlers();
        }
      }
    }

    // If there's no validator client, create a ProposalHandler to handle block and checkpoint proposals
    // for monitoring or reexecution. Reexecution (default) allows us to follow the pending chain,
    // while non-reexecution is used for validating the proposals and collecting their txs.
    // Checkpoint proposals rebuild blobs if the blob client can upload blobs.
    if (!validatorClient) {
      const reexecute = !!config.alwaysReexecuteBlockProposals;
      log.info(`Setting up proposal handler` + (reexecute ? ' with reexecution of proposals' : ''));
      proposalHandler = createProposalHandler(config, {
        checkpointsBuilder: validatorCheckpointsBuilder,
        worldState: worldStateSynchronizer,
        epochCache,
        blockSource: archiver,
        l1ToL2MessageSource: archiver,
        p2pClient,
        blobClient,
        dateProvider,
        telemetry,
        reexecutionTracker,
      });
      proposalHandler.register(p2pClient, reexecute, archiver);
    }

    // Start world state and wait for it to sync to the archiver.
    await worldStateSynchronizer.start();

    // Start p2p. Note that it depends on world state to be running.
    await p2pClient.start();

    let dataWithholdingWatcher: DataWithholdingWatcher | undefined;
    let attestationsBlockWatcher: AttestationsBlockWatcher | undefined;
    let attestedInvalidProposalWatcher: AttestedInvalidProposalWatcher | undefined;
    let broadcastedInvalidCheckpointProposalWatcher: BroadcastedInvalidCheckpointProposalWatcher | undefined;
    let checkpointEquivocationWatcher: CheckpointEquivocationWatcher | undefined;

    const validatorsSentinel = await createSentinel(epochCache, archiver, p2pClient, reexecutionTracker, config);
    if (validatorsSentinel) {
      watchers.push(validatorsSentinel);
    }

    if (collectOffenses) {
      dataWithholdingWatcher = new DataWithholdingWatcher(
        epochCache,
        archiver,
        p2pClient.getTxProvider(),
        p2pClient,
        reexecutionTracker,
        { chainId: config.l1ChainId, rollupAddress: config.rollupAddress },
        config,
      );
      watchers.push(dataWithholdingWatcher);

      broadcastedInvalidCheckpointProposalWatcher = new BroadcastedInvalidCheckpointProposalWatcher(
        p2pClient,
        archiver,
        epochCache,
        config,
      );
      watchers.push(broadcastedInvalidCheckpointProposalWatcher);

      // The proposal handler (validator-owned or standalone) is the source of invalid-proposal/equivocation
      // slots, so the watcher runs on non-validator offense collectors too.
      if (proposalHandler) {
        attestedInvalidProposalWatcher = new AttestedInvalidProposalWatcher(
          p2pClient,
          proposalHandler,
          archiver,
          epochCache,
          config,
          { log: log.createChild('attested-invalid-proposal-watcher') },
        );
        watchers.push(attestedInvalidProposalWatcher);
      }

      checkpointEquivocationWatcher = new CheckpointEquivocationWatcher(archiver, epochCache, config);
      watchers.push(checkpointEquivocationWatcher);

      attestationsBlockWatcher = new AttestationsBlockWatcher(archiver, epochCache, config, log.getBindings());
      watchers.push(attestationsBlockWatcher);
    }

    const watchersToStart = compactArray([
      validatorsSentinel,
      dataWithholdingWatcher,
      attestationsBlockWatcher,
      broadcastedInvalidCheckpointProposalWatcher,
      attestedInvalidProposalWatcher,
      checkpointEquivocationWatcher,
    ]);
    const startedWatchers: Watcher[] = [];
    const stopStartedWatchers = async () => {
      for (const watcher of startedWatchers) {
        await tryStop(watcher);
      }
    };

    // Start p2p-related services once the archiver has completed sync
    void archiver
      .waitForInitialSync()
      .then(async () => {
        for (const watcher of watchersToStart) {
          await watcher.start();
          startedWatchers.push(watcher);
        }
        log.info(`All p2p services started`);
      })
      .catch(err => log.error('Failed to start p2p services after archiver sync', err));
    started.push({ stop: stopStartedWatchers });

    // Validator enabled, create/start relevant service
    let sequencer: SequencerClient | undefined;
    let automineSequencer: AutomineSequencer | undefined;
    let slasherClient: SlasherClientInterface | undefined;

    // The slasher can run standalone to collect offenses for non-validators; it only writes to L1 when a
    // proposer is elected (which requires a sequencer), so running it read-only on a non-validator is safe.
    if (collectOffenses) {
      const validatorAddresses = keyStoreManager
        ? NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager).getAddresses()
        : [];

      slasherClient = await createSlasher(
        config,
        pickL1ContractAddresses(config),
        getPublicClient(config),
        watchers,
        dateProvider,
        epochCache,
        validatorAddresses,
        undefined, // logger
      );
      await slasherClient.start();
      started.push(slasherClient);
    }

    if (!config.disableValidator && validatorClient) {
      const l1TxUtils = config.sequencerPublisherForwarderAddress
        ? await createForwarderL1TxUtilsFromSigners(
            publicClient,
            keyStoreManager!.createAllValidatorPublisherSigners(),
            config.sequencerPublisherForwarderAddress,
            { ...config, scope: 'sequencer' },
            { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
          )
        : await createL1TxUtilsFromSigners(
            publicClient,
            keyStoreManager!.createAllValidatorPublisherSigners(),
            { ...config, scope: 'sequencer' },
            { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
          );

      // Create a funder L1TxUtils from the keystore funding account (if configured)
      const fundingSigner = keyStoreManager?.createFundingSigner();
      let funderL1TxUtils: L1TxUtils | undefined;
      if (fundingSigner) {
        const [funder] = await createL1TxUtilsFromSigners(
          publicClient,
          [fundingSigner],
          { ...config, scope: 'sequencer' },
          { telemetry, logger: log.createChild('l1-tx-utils:funder'), dateProvider },
        );
        funderL1TxUtils = funder;
      }

      // Create and start the sequencer client
      const checkpointsBuilder = new CheckpointsBuilder(
        { ...config, l1GenesisTime, slotDuration: Number(slotDuration), rollupManaLimit },
        worldStateSynchronizer,
        archiver,
        dateProvider,
        telemetry,
        debugLogStore,
      );

      if (config.useAutomineSequencer) {
        // Test-only path: deterministic, queue-driven sequencer for non-block-building e2e tests.
        // See `AUTOMINE_E2E_OPTS` in `end-to-end/src/fixtures/fixtures.ts`.
        automineSequencer = await createAutomineSequencer({
          config,
          l1TxUtils,
          funderL1TxUtils,
          publicClient,
          rollupContract,
          epochCache,
          blobClient,
          telemetry,
          dateProvider,
          keyStoreManager: keyStoreManager!,
          validatorClient,
          checkpointsBuilder,
          globalVariableBuilder,
          worldStateSynchronizer,
          archiver,
          p2pClient,
          l1Constants: {
            l1GenesisTime,
            slotDuration: Number(slotDuration),
            ethereumSlotDuration: config.ethereumSlotDuration,
            rollupManaLimit,
          },
          autoSettle: config.automineEnableProveEpoch,
          log,
        });
      } else {
        sequencer = await SequencerClient.new(config, {
          ...deps,
          epochCache,
          l1TxUtils,
          funderL1TxUtils,
          validatorClient,
          p2pClient,
          worldStateSynchronizer,
          slasherClient,
          checkpointsBuilder,
          l2BlockSource: archiver,
          l1ToL2MessageSource: archiver,
          telemetry,
          dateProvider,
          blobClient,
          nodeKeyStore: keyStoreManager!,
          globalVariableBuilder,
        });
      }
    }

    if (!options.dontStartSequencer && sequencer) {
      await sequencer.start();
      started.push(sequencer);
      log.verbose(`Sequencer started`);
    } else if (sequencer) {
      log.warn(`Sequencer created but not started`);
    }

    if (!options.dontStartSequencer && automineSequencer) {
      await automineSequencer.start();
      started.push({ stop: () => automineSequencer!.stop() });
      log.verbose(`AutomineSequencer started`);
    } else if (automineSequencer) {
      log.warn(`AutomineSequencer created but not started`);
    }

    // Create prover node subsystem if enabled
    let proverNode: ProverNode | undefined;
    if (config.enableProverNode) {
      proverNode = await createProverNode(config, {
        ...deps.proverNodeDeps,
        telemetry,
        dateProvider,
        archiver,
        worldStateSynchronizer,
        p2pClient,
        epochCache,
        blobClient,
        keyStoreManager,
      });

      if (!options.dontStartProverNode) {
        await proverNode.start();
        started.push(proverNode);
        log.info(`Prover node subsystem started`);
      } else {
        log.info(`Prover node subsystem created but not started`);
      }
    }

    const node = new AztecNodeService({
      config,
      p2pClient,
      blockSource: archiver,
      logsSource: archiver,
      contractDataSource: archiver,
      l1ToL2MessageSource: archiver,
      worldStateSynchronizer,
      sequencer,
      proverNode,
      slasherClient,
      validatorsSentinel,
      stopStartedWatchers,
      l1ChainId: ethereumChain.chainInfo.id,
      version: config.rollupVersion,
      globalVariableBuilder,
      rollupContract,
      feeProvider,
      feeSnapshotService,
      epochCache,
      packageVersion,
      peerProofVerifier,
      rpcProofVerifier,
      telemetry,
      log,
      blobClient,
      validatorClient,
      keyStoreManager,
      debugLogStore,
      automineSequencer,
    });

    return node;
  } catch (err) {
    log.error('Failed during node creation, stopping started resources', err);
    for (const resource of started.reverse()) {
      await tryStop(resource);
    }
    throw err;
  }
}

/**
 * Verifies the node's configured L1 timing matches the rollup contract it is pointed at, for the fields the
 * node's own config carries. Each comparison is guarded against an undefined config value, so a config that
 * does not carry a field is not checked. Throws a single error listing every mismatch. Runs in the shared
 * startup path for every node role.
 */
function checkConfigMatchesRollup(
  config: AztecNodeConfig,
  rollup: { slotDuration: number; epochDuration: number },
): void {
  const mismatches: string[] = [];
  if (config.aztecSlotDuration !== undefined && config.aztecSlotDuration !== rollup.slotDuration) {
    mismatches.push(`aztecSlotDuration is ${config.aztecSlotDuration} but the rollup reports ${rollup.slotDuration}`);
  }
  if (config.aztecEpochDuration !== undefined && config.aztecEpochDuration !== rollup.epochDuration) {
    mismatches.push(
      `aztecEpochDuration is ${config.aztecEpochDuration} but the rollup reports ${rollup.epochDuration}`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(
      `The node's configured L1 timing does not match the rollup contract it is pointed at: ${mismatches.join('; ')}`,
    );
  }
}
