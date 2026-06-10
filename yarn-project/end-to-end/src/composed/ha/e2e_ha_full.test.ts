/**
 * High-Availability Full E2E Test
 *
 * Tests a complete HA setup with multiple nodes coordinating via PostgreSQL
 * and Web3Signer for remote signing. Verifies that blocks are produced,
 * attestations are signed, and no double-signing occurs.
 */
import type { InitialAccountData } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { GovernanceProposerContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { EthCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { SecretValue } from '@aztec/foundation/config';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import { InterruptibleSleep, sleep } from '@aztec/foundation/sleep';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { type AttestationInfo, getAttestationInfoFromPublishedCheckpoint } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { TopicType } from '@aztec/stdlib/p2p';
import { OffenseType } from '@aztec/stdlib/slashing';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import type { ValidatorClient } from '@aztec/validator-client';
import { PostgresSlashingProtectionDatabase } from '@aztec/validator-ha-signer/db';
import { type DutyRow, DutyStatus, DutyType } from '@aztec/validator-ha-signer/types';

import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import {
  type HADatabaseConfig,
  cleanupHADatabase,
  createHADatabaseConfig,
  createInitialValidatorsFromPrivateKeys,
  getAddressesFromPrivateKeys,
  getValidatorDuties,
  setupHADatabase,
  verifyNoDuplicateAttestations,
} from '../../fixtures/ha_setup.js';
import {
  SCHNORR_HARDCODED_PRIVATE_KEY,
  SchnorrHardcodedKeyAccountContract,
} from '../../fixtures/schnorr_hardcoded_account_contract.js';
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';
import {
  createWeb3SignerKeystore,
  getWeb3SignerTestKeystoreDir,
  getWeb3SignerUrl,
  refreshWeb3Signer,
} from '../../fixtures/web3signer.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';

const NODE_COUNT = 5;
const VALIDATOR_COUNT = 4;
const COMMITTEE_SIZE = 4;

type SyncImmediateBlockSource = {
  syncImmediate: () => Promise<void>;
};

function hasSyncImmediate(value: unknown): value is SyncImmediateBlockSource {
  return (
    typeof value === 'object' && value !== null && 'syncImmediate' in value && typeof value.syncImmediate === 'function'
  );
}

async function getHardcodedAccountData(secret: Fr, salt: Fr): Promise<InitialAccountData> {
  const contract = new SchnorrHardcodedKeyAccountContract();
  const address = await getAccountContractAddress(contract, secret, salt);
  return { secret, salt, signingKey: SCHNORR_HARDCODED_PRIVATE_KEY, address };
}

async function registerHardcodedAccount(wallet: TestWallet, accountData: InitialAccountData): Promise<AztecAddress> {
  const accountManager = await wallet.createAccount({
    secret: accountData.secret,
    salt: accountData.salt,
    contract: new SchnorrHardcodedKeyAccountContract(),
  });
  return accountManager.address;
}

async function registerTestContract(wallet: TestWallet): Promise<TestContract> {
  const instance = await getContractInstanceFromInstantiationParams(TestContract.artifact, {
    constructorArgs: [],
    constructorArtifact: undefined,
    salt: Fr.ZERO,
    publicKeys: undefined,
    deployer: undefined,
  });
  await wallet.registerContract(instance, TestContract.artifact);
  return TestContract.at(instance.address, wallet);
}

async function submitTriggerTx(wallet: TestWallet, testContract: TestContract, from: AztecAddress): Promise<TxHash> {
  const tx = await proveInteraction(wallet, testContract.methods.emit_nullifier(Fr.random()), { from });
  return await tx.send({ wait: NO_WAIT });
}

async function waitForTriggerTx(node: AztecNode, txHash: TxHash): Promise<TxReceipt> {
  const receipt = await waitForTx(node, txHash, { waitForStatus: TxStatus.CHECKPOINTED });
  if (!receipt.blockNumber) {
    throw new Error('Trigger tx was checkpointed without a block number');
  }
  return receipt;
}

async function setDateProviderToNextBlockSlot(
  node: AztecNode,
  ethCheatCodes: EthCheatCodes,
  dateProvider: TestDateProvider,
  aztecSlotDuration: number,
): Promise<void> {
  const latestBlock = await node.getBlockData('latest');
  if (!latestBlock) {
    throw new Error('Could not load latest block for HA trigger tx');
  }

  // Jump to the next L2 slot boundary that also covers the L1 chain clock. The compose anvil mines
  // blocks only on demand (no interval mining), so its chain timestamp moves independently of the test
  // clock and may sit several slots past the latest L2 block. Aligning blindly to `latest block + 1
  // slot` can rewind the test clock below L1 time, making sequencers (which schedule on the test
  // clock) build proposals for slots that have already expired on L1.
  const latestBlockTimestamp = Number(latestBlock.header.globalVariables.timestamp);
  const nextL1Timestamp = await ethCheatCodes.nextBlockTimestamp();
  const slotsAhead = Math.max(1, Math.ceil((nextL1Timestamp - latestBlockTimestamp) / aztecSlotDuration));
  dateProvider.setTime((latestBlockTimestamp + slotsAhead * aztecSlotDuration) * 1000);
}

// TODO: re-enable once HA block building is reconciled with the always-enforced timetable (#23821).
describe.skip('HA Full Setup', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let logger: Logger;
  let wallet: TestWallet;
  let ownerAddress: AztecAddress;
  let testContract: TestContract;
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;
  let ethCheatCodes: EthCheatCodes;
  let teardown: () => Promise<void> = async () => {};
  let dateProvider: TestDateProvider;
  let genesis: GenesisData | undefined;

  // HA specific resources
  let haNodePools: Pool[]; // Database pools for HA nodes (for cleanup)
  let haNodeServices: AztecNodeService[]; // All N HA peer nodes
  let haSequencersStarted = false;
  const stoppedHANodeIndexes = new Set<number>();
  let haKeystoreDirs: string[];
  let mainPool: Pool;
  let databaseConfig: HADatabaseConfig;
  let attesterPrivateKeys: `0x${string}`[];
  let attesterAddresses: string[];
  let publisherPrivateKeys: `0x${string}`[];
  let publisherAddresses: string[];
  let web3SignerUrl: string;
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let governanceProposer: GovernanceProposerContract;
  /** Per-node initial keystore JSON (all 4 attesters, node's own publisher) for restore after reload test */
  let initialKeystoreJsons: string[];
  const getSignatureContext = () => ({
    chainId: config.l1ChainId,
    rollupAddress: deployL1ContractsValues.l1ContractAddresses.rollupAddress,
  });

  const startHASequencers = async () => {
    if (haSequencersStarted) {
      return;
    }

    await Promise.all(
      haNodeServices.map(async (service, i) => {
        logger.info(`Starting HA peer node ${i} sequencer`);
        await service.getSequencer()?.start();
      }),
    );
    haSequencersStarted = true;
    logger.info('All HA peer sequencers started');
  };

  /**
   * Mines as many L1 blocks as needed to bring anvil's chain clock up to the test clock, never past
   * it. The compose anvil runs in automine with a +ethereumSlotDuration timestamp interval per block
   * and no interval mining, so L1 chain time stands still unless a tx lands or we mine here — this is
   * the suite's only L1 heartbeat. Overshooting the test clock is as harmful as falling behind:
   * sequencers schedule proposals on the test clock, and a proposal mined after its target slot has
   * expired on L1 is silently dropped, pruning the pending block it carried.
   */
  const advanceL1ChainTimeToTestClock = async () => {
    const nextL1Timestamp = await ethCheatCodes.nextBlockTimestamp();
    const testClockNow = Math.floor(dateProvider.now() / 1000);
    const blocksToMine = Math.floor((testClockNow - nextL1Timestamp) / config.ethereumSlotDuration) + 1;
    if (blocksToMine > 0) {
      await ethCheatCodes.mine(blocksToMine);
    }
  };

  const syncHAL1Data = async () => {
    await advanceL1ChainTimeToTestClock();
    await Promise.all(
      haNodeServices.map(async service => {
        try {
          const blockSource = service.getBlockSource();
          if (hasSyncImmediate(blockSource)) {
            await blockSource.syncImmediate();
          }
        } catch (error) {
          logger.debug('Skipping HA L1 sync nudge for stopped node', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  };

  const alignDateProviderToNextBlockSlot = async () => {
    await setDateProviderToNextBlockSlot(aztecNode, ethCheatCodes, dateProvider, config.aztecSlotDuration);
  };

  /**
   * Waits for the trigger tx to be checkpointed while emulating a self-advancing L1, nudging chain
   * time and archiver sync once per L1 slot of wall time. Without the heartbeat, L1 time freezes
   * while the test thread is blocked here (nothing mines on the on-demand compose anvil), the
   * proposers' archiver-sync gate — whose deadline runs on the free-running test clock — can then
   * never pass, and a single missed slot becomes an unrecoverable stall until the jest timeout.
   */
  const waitForTriggerTxWithL1Heartbeat = async (txHash: TxHash): Promise<TxReceipt> => {
    let waiting = true;
    const heartbeatSleep = new InterruptibleSleep();
    const heartbeat = (async () => {
      while (waiting) {
        await heartbeatSleep.sleep(config.ethereumSlotDuration * 1000);
        if (!waiting) {
          break;
        }
        try {
          await syncHAL1Data();
        } catch (error) {
          logger.debug('Error advancing L1 time while awaiting trigger tx', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    try {
      return await waitForTriggerTx(aztecNode, txHash);
    } finally {
      waiting = false;
      heartbeatSleep.interrupt();
      await heartbeat;
    }
  };

  const sendTriggerTx = async (): Promise<TxReceipt> => {
    await alignDateProviderToNextBlockSlot();
    const txHash = await submitTriggerTx(wallet, testContract, ownerAddress);
    await syncHAL1Data();
    return await waitForTriggerTxWithL1Heartbeat(txHash);
  };

  const stopHANode = async (nodeIndex: number) => {
    if (stoppedHANodeIndexes.has(nodeIndex)) {
      return;
    }

    logger.info(`Stopping HA peer node ${nodeIndex}`);
    await haNodeServices[nodeIndex].stop();
    stoppedHANodeIndexes.add(nodeIndex);
  };

  beforeAll(async () => {
    // Check required environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable must be set for HA tests');
    }

    web3SignerUrl = getWeb3SignerUrl();
    if (!web3SignerUrl) {
      throw new Error('WEB3_SIGNER_URL environment variable must be set for HA tests');
    }

    // Setup database configuration
    databaseConfig = createHADatabaseConfig('ha-full-test');

    // Connect to database (migrations already run by docker-compose entrypoint)
    mainPool = setupHADatabase(databaseConfig.databaseUrl.getValue()!);

    attesterPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );

    publisherPrivateKeys = Array.from(
      { length: NODE_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_COUNT)!.toString('hex')}` as `0x${string}`,
    );

    const web3SignerDir = getWeb3SignerTestKeystoreDir();
    const allKeys = [...attesterPrivateKeys, ...publisherPrivateKeys];
    for (const key of allKeys) {
      await createWeb3SignerKeystore(web3SignerDir, key);
    }

    attesterAddresses = getAddressesFromPrivateKeys(attesterPrivateKeys);

    publisherAddresses = getAddressesFromPrivateKeys(publisherPrivateKeys);

    // Refresh Web3Signer to load all the keys (attesters + publishers)
    await refreshWeb3Signer(web3SignerUrl, ...attesterAddresses, ...publisherAddresses);

    // Create database pools for HA nodes
    haNodePools = Array.from(
      { length: NODE_COUNT },
      () => new Pool({ connectionString: databaseConfig.databaseUrl.getValue()! }),
    );

    const initialValidators = createInitialValidatorsFromPrivateKeys(attesterPrivateKeys);
    const hardcodedAccountData = await getHardcodedAccountData(Fr.random(), Fr.random());

    ({ teardown, logger, wallet, aztecNode, config, ethCheatCodes, dateProvider, deployL1ContractsValues, genesis } =
      await setup(
        0,
        {
          ...PIPELINING_SETUP_OPTS,
          initialFundedAccounts: [hardcodedAccountData],
          initialValidators,
          sequencerPublisherPrivateKeys: [new SecretValue(publisherPrivateKeys[0])],
          aztecTargetCommitteeSize: COMMITTEE_SIZE,
          // The full HA docker/Web3Signer stack can still be joining and syncing after the shared
          // 12s pipelining preset's 2.5s start window has closed. Keep real sequencing, but give
          // HA validators enough time to pass the enforced build-start gate in CI.
          aztecSlotDuration: 16,
          // This suite validates HA coordination on tx-bearing checkpoints. Requiring one tx avoids a startup empty
          // checkpoint from occupying the shared HA publisher while the trigger tx is still being prepared.
          minTxsPerBlock: 1,
          archiverPollingIntervalMS: 200,
          sequencerPollingIntervalMS: 200,
          worldStateBlockCheckIntervalMS: 200,
          blockCheckIntervalMS: 200,
          startProverNode: true,
          // The bootstrap node is only an RPC/P2P anchor. HA validators are the first block producers in this suite.
          disableValidator: true,
          skipAccountDeployment: true,
          // Enable P2P for transaction gossip
          p2pEnabled: true,
          // Enable slashing for testing governance + slashing vote coordination
          slasherEnabled: true,
          slashingRoundSizeInEpochs: 1, // 32 slots (1 epoch)
          slashingQuorum: 17, // >50% of 32 slots for tally quorum,
        },
        { syncChainTip: 'proven' },
      ));

    ownerAddress = await registerHardcodedAccount(wallet, hardcodedAccountData);
    testContract = await registerTestContract(wallet);

    if (!dateProvider) {
      throw new Error('dateProvider must be provided by setup for HA tests');
    }

    logger.info('Bootstrap node setup complete; registered funded hardcoded account and test contract locally');

    // Get bootstrap node's P2P ENR for HA nodes to connect to
    const bootstrapNodeEnr = await aztecNode.getEncodedEnr();
    if (!bootstrapNodeEnr) {
      throw new Error('Failed to get bootstrap node ENR - P2P may not be enabled');
    }
    logger.info(`Bootstrap node ENR: ${bootstrapNodeEnr}`);

    // L1 contract wrappers for querying votes
    governanceProposer = new GovernanceProposerContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
    );
    logger.info('L1 contract wrappers initialized');

    haNodeServices = [];
    haKeystoreDirs = [];
    logger.info(`Starting ${NODE_COUNT} HA peer nodes...`);

    // Per-node keystore: all attesters but only this node's publisher to avoid nonce conflicts.
    // When keyStoreDirectory is set the node loads validators/publishers from file only, so we omit them from config.
    initialKeystoreJsons = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const nodeId = `${databaseConfig.nodeId}-${i + 1}`;
      logger.info(`Starting HA peer node ${i} with nodeId: ${nodeId}`);

      const keystoreContent = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesterAddresses,
            feeRecipient: AztecAddress.ZERO.toString(),
            coinbase: EthAddress.fromString(attesterAddresses[0]).toChecksumString(),
            remoteSigner: web3SignerUrl,
            publisher: [publisherAddresses[i]],
          },
        ],
      };
      const keystoreJson = JSON.stringify(keystoreContent, null, 2);
      initialKeystoreJsons.push(keystoreJson);

      const keystoreDir = await mkdtemp(join(tmpdir(), `ha-keystore-${i}-`));
      haKeystoreDirs.push(keystoreDir);
      await writeFile(join(keystoreDir, 'keystore.json'), keystoreJson);

      const dataDirectory = config.dataDirectory ? `${config.dataDirectory}-${i}` : undefined;

      const nodeConfig: AztecNodeConfig = {
        ...config,
        nodeId,
        keyStoreDirectory: keystoreDir,
        // Ensure txs are included in proposals to test full signing path
        publishTxsWithProposals: true,
        dataDirectory,
        databaseUrl: databaseConfig.databaseUrl,
        pollingIntervalMs: databaseConfig.pollingIntervalMs,
        signingTimeoutMs: databaseConfig.signingTimeoutMs,
        maxStuckDutiesAgeMs: databaseConfig.maxStuckDutiesAgeMs,
        haSigningEnabled: true,
        disableValidator: false,
        // Enable P2P for transaction and block gossip
        p2pEnabled: true,
        p2pPort: (config.p2pPort ?? 40400) + i + 1,
        // Connect to bootstrap node for tx gossip
        bootstrapNodes: [bootstrapNodeEnr],
        web3SignerUrl,
      };

      const nodeService = await withLoggerBindings({ actor: `HA-${i}` }, async () => {
        return await AztecNodeService.createAndSync(
          nodeConfig,
          { dateProvider },
          { genesis, dontStartSequencer: true },
        );
      });

      haNodeServices.push(nodeService);
      logger.info(`HA peer node ${i} started successfully`);
    }

    logger.info(`All ${NODE_COUNT} HA peer nodes started and coordinating via PostgreSQL database`);
    logger.info('Waiting for HA peer nodes to join the tx gossip mesh');
    await retryUntil(
      async () => {
        const meshStates = await Promise.all(
          haNodeServices.map(async (service, nodeIndex) => {
            const p2p = service.getP2P();
            const [peers, txMeshPeerCount] = await Promise.all([
              p2p.getPeers(),
              p2p.getGossipMeshPeerCount(TopicType.tx),
            ]);

            return { nodeIndex, peerCount: peers.length, txMeshPeerCount };
          }),
        );

        logger.debug('HA tx gossip mesh status', { meshStates });
        return meshStates.every(({ peerCount, txMeshPeerCount }) => peerCount > 0 && txMeshPeerCount > 0)
          ? true
          : undefined;
      },
      'HA tx gossip mesh readiness',
      60,
      1,
    );

    logger.info(`Test account registered at ${ownerAddress}`);
  });

  afterAll(async () => {
    dateProvider?.reset();

    // Stop all HA peer nodes in parallel with a per-node deadline. A single stuck node can otherwise
    // block the serial loop long enough to blow the jest hook timeout — e.g. a sequencer.stop() that
    // awaits an L1 publish whose tx-timeout was computed on a test-warped clock and never fires.
    if (haNodeServices) {
      const STOP_DEADLINE_MS = 30_000;
      await Promise.allSettled(
        haNodeServices.map((_, i) => {
          return Promise.race([
            stopHANode(i).catch(error => {
              logger.error(`Failed to stop HA peer node ${i}: ${error}`);
            }),
            sleep(STOP_DEADLINE_MS).then(() => {
              logger.error(`HA peer node ${i} stop did not return within ${STOP_DEADLINE_MS}ms; abandoning`);
            }),
          ]);
        }),
      );
    }

    // Cleanup HA keystore temp directories
    if (haKeystoreDirs) {
      for (let i = 0; i < haKeystoreDirs.length; i++) {
        try {
          await rm(haKeystoreDirs[i], { recursive: true });
        } catch (error) {
          logger.error(`Failed to remove HA keystore dir ${i}: ${error}`);
        }
      }
    }

    // Cleanup HA resources (database pools, etc.)
    if (haNodePools) {
      for (const pool of haNodePools) {
        try {
          await pool.end();
        } catch (error) {
          logger.error(`Failed to close HA node pool: ${error}`);
        }
      }
    }
    await cleanupHADatabase(mainPool, logger);
    await mainPool.end();

    // Cleanup bootstrap node and test infrastructure (this cleans up the shared data directory)
    await teardown();
  });

  afterEach(async () => {
    // Restore any mocked functions
    jest.restoreAllMocks();

    // Clean up database state between tests
    try {
      await mainPool.query('DELETE FROM validator_duties');
    } catch (error) {
      // Ignore cleanup errors (table might not exist on first run failure)
      logger?.warn(`Failed to clean up validator_duties: ${error}`);
    }
  });

  it('should produce blocks with HA coordination and attestations', async () => {
    logger.info('Testing full HA setup: block production, attestations, and coordination');

    // Send a tx to trigger block building. The account and contract are funded/registered at genesis,
    // so HA validators are the first block producers exercised by this suite.
    logger.info(`Sending trigger tx from ${ownerAddress}`);
    const txHash = await submitTriggerTx(wallet, testContract, ownerAddress);
    // HA nodes cold-start with their archivers synced through the previous L2 slot. Move the
    // test clock back one slot before starting their sequencers so the first HA proposal builds
    // the next slot their local sync gate permits, instead of immediately chasing a future slot.
    dateProvider.setTime(dateProvider.now() - config.aztecSlotDuration * 1000);
    await startHASequencers();
    await syncHAL1Data();
    const receipt = await waitForTriggerTxWithL1Heartbeat(txHash);

    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Trigger tx checkpointed in block ${receipt.blockNumber}`);

    // Get the block with attestations
    const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      includeTransactions: true,
      onlyCheckpointed: true,
    });
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }

    // Verify txs were included in the block (tests full signing path)
    expect(block.body!.txEffects.length).toBeGreaterThan(0);
    logger.info(`Block contains ${block.body!.txEffects.length} transaction(s)`);

    // get attestations from checkpoint
    const [checkpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1, { includeAttestations: true });
    const attestations = (checkpoint.attestations ?? []).filter(a => !a.signature.isEmpty());

    // Should have enough attestations for quorum
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    expect(attestations.length).toBeGreaterThanOrEqual(quorum);
    logger.info(`Found ${attestations.length} attestations (quorum: ${quorum})`);

    // Verify signatures are valid (signed by Web3Signer)
    for (const attestation of attestations) {
      expect(attestation.signature.isEmpty()).toBe(false);
      expect(attestation.signature.r).toBeDefined();
      expect(attestation.signature.s).toBeDefined();
      expect(attestation.signature.v).toBeDefined();
    }
    logger.info(`Verified ${attestations.length} signatures from Web3Signer`);

    // Query database to verify HA coordination
    const slotNumber = BigInt(block.header.globalVariables.slotNumber);
    logger.info(`Querying duties for slot ${slotNumber} (block ${receipt.blockNumber})`);
    const allDuties = await getValidatorDuties(mainPool, slotNumber);
    expect(allDuties.length).toBeGreaterThan(0);
    logger.info(`Found ${allDuties.length} total duties in database`);

    // Check block proposal duty
    const blockProposalDuties = allDuties.filter(d => d.dutyType === 'BLOCK_PROPOSAL');
    expect(blockProposalDuties.length).toBe(1); // Only one node should propose
    expect(blockProposalDuties[0].completedAt).toBeDefined();
    logger.info(`Block proposed by node ${blockProposalDuties[0].nodeId}`);

    // Check that checkpoint proposal duty was also recorded (separate from block proposal)
    const checkpointProposalDuties = allDuties.filter(d => d.dutyType === 'CHECKPOINT_PROPOSAL');
    expect(checkpointProposalDuties.length).toBe(1);
    logger.info(`Found ${checkpointProposalDuties.length} checkpoint proposal duty`);

    // Check attestation duties
    // All validators attest (tracked in DB), but the checkpoint posted to L1 is trimmed to quorum.
    const attestationDuties = allDuties.filter(d => d.dutyType === 'ATTESTATION');
    expect(attestationDuties.length).toBe(VALIDATOR_COUNT);
    expect(attestations.length).toBe(quorum);
    logger.info(
      `Found ${attestationDuties.length} attestation duties, ${attestations.length} in checkpoint (quorum: ${quorum})`,
    );

    // Verify no duplicate attestations per validator (HA protection ensures 1 per validator address)
    const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);

    // Verify we got attestations from multiple validators
    expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
    logger.info(`${dutiesByValidator.size} unique validators attested (quorum: ${quorum})`);

    // P2P LAYER CHECK: Verify only one attestation per validator was sent over P2P
    const p2pNode = haNodeServices[0];
    const p2p = p2pNode.getP2P();
    const slot = SlotNumber(Number(slotNumber));

    // Get all attestations from P2P pool for this slot (before deduplication)
    const p2pAttestations = await p2p.getCheckpointAttestationsForSlot(slot);
    const p2pAttestationsWithSignatures = p2pAttestations.filter(a => !a.signature.isEmpty());

    // P2P pool has attestations from all committee members; checkpoint on L1 is trimmed to quorum
    expect(p2pAttestationsWithSignatures.length).toBe(COMMITTEE_SIZE);
    const p2pValidatorAddresses = new Map<string, number>();
    for (const attestation of p2pAttestationsWithSignatures) {
      const sender = attestation.getSender();
      if (sender) {
        const addr = sender.toString();
        p2pValidatorAddresses.set(addr, (p2pValidatorAddresses.get(addr) || 0) + 1);
      }
    }

    // Verify no validator sent multiple attestations over P2P
    // Each validator should have sent exactly one attestation
    for (const [_, count] of p2pValidatorAddresses.entries()) {
      expect(count).toBe(1);
    }
  });

  it('should coordinate governance voting across HA nodes', async () => {
    logger.info('Testing real governance voting with HA coordination');

    const mockGovernancePayload = deployL1ContractsValues.l1ContractAddresses.governanceAddress;
    logger.info(`Setting governance payload: ${mockGovernancePayload.toString()}`);

    // Configure all HA nodes to vote for this payload
    for (let i = 0; i < NODE_COUNT; i++) {
      await haNodeServices[i].setConfig({
        governanceProposerPayload: mockGovernancePayload,
      });
    }
    logger.info(`All ${NODE_COUNT} HA nodes configured to vote for governance payload`);

    // Send a transaction to trigger block building which will also trigger voting
    logger.info('Sending transaction to trigger block building...');
    const receipt = await sendTriggerTx();
    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Transaction mined in block ${receipt.blockNumber}`);

    // Get the slot of the block that was just built
    const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      includeTransactions: true,
      onlyCheckpointed: true,
    });
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }
    const blockSlot = block.header.globalVariables.slotNumber;
    logger.info(`Block was built in slot ${blockSlot}`);

    // Compute round for governance voting from the block slot
    const round = await governanceProposer.computeRound(blockSlot);
    logger.info(`Block slot ${blockSlot}, governance round ${round}`);

    // Wait for at least one on-chain governance signal for our payload to land, then assert on
    // the round *outcome* (payload-with-most-signals) rather than on a strict per-node duty
    // count equality.
    //
    // Why not assert `l1VoteCount === uniqueSlots.size` like the previous version did? HA
    // signing intentionally suppresses duplicate signatures across nodes for the same
    // `(slot, validator)` duty: only one of the N HA peers actually emits the L1 tx for each
    // scheduled slot. Under pipelining there is an additional build-slot-vs-target-slot offset
    // where a vote signed in build slot N targets slot N+1, so at any measurement time the DB
    // can have a duty row for slot S whose L1 tx hasn't mined yet. The old strict equality
    // pinned the test to behavior that doesn't hold under either of those.
    //
    // What we actually care about: the HA cluster coordinated well enough that at least one
    // successful governance signal landed for our payload, the round-winner converges on the
    // payload we configured, no duty was double-signed for the same `(slot, validator)`, and
    // every recorded duty ended in SIGNED state.
    logger.info('Polling L1 for governance signals to confirm HA cluster coordination...');
    const rollupAddr = deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString() as `0x${string}`;
    const govProposerAddr =
      deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString() as `0x${string}`;

    const { l1VoteCount, lastSignalSlot, payloadWithMostSignals } = await retryUntil(
      async () => {
        const snapshotBlock = await deployL1ContractsValues.l1Client.getBlockNumber();
        const [roundData, l1VoteCountBig] = await Promise.all([
          deployL1ContractsValues.l1Client.readContract({
            address: govProposerAddr,
            abi: GovernanceProposerAbi,
            functionName: 'getRoundData',
            args: [rollupAddr, round],
            blockNumber: snapshotBlock,
          }),
          deployL1ContractsValues.l1Client.readContract({
            address: govProposerAddr,
            abi: GovernanceProposerAbi,
            functionName: 'signalCount',
            args: [rollupAddr, round, mockGovernancePayload.toString() as `0x${string}`],
            blockNumber: snapshotBlock,
          }),
        ]);
        const lastSignalSlot = Number(roundData.lastSignalSlot);
        const l1VoteCount = Number(l1VoteCountBig);
        logger.info(
          `L1 round ${round}: lastSignalSlot=${lastSignalSlot}, l1VoteCount=${l1VoteCount}, ` +
            `payloadWithMostSignals=${roundData.payloadWithMostSignals} ` +
            `(snapshot at L1 block ${snapshotBlock})`,
        );
        if (l1VoteCount === 0) {
          return undefined;
        }
        return {
          l1VoteCount,
          lastSignalSlot,
          payloadWithMostSignals: roundData.payloadWithMostSignals,
        };
      },
      `L1 governance round to land >= 1 signal`,
      120,
      0.5,
    );

    // Outcome 1: the round leader payload is the one we configured all HA nodes to vote for.
    // This is the strongest "governance state advanced toward our payload" assertion the
    // contract exposes per-round short of executing the proposal (which needs QUORUM_SIZE
    // signals -- defaults to ~151 and takes many minutes to reach, way beyond a unit-test
    // budget).
    expect(l1VoteCount).toBeGreaterThan(0);
    expect(payloadWithMostSignals.toLowerCase()).toBe(mockGovernancePayload.toString().toLowerCase());
    logger.info(
      `Governance round ${round} coordinated on payload ${payloadWithMostSignals}: ${l1VoteCount} signals on L1`,
    );

    // Outcome 2: every duty the HA cluster recorded for this round is in a healthy state, and
    // no (slot, validator) pair was signed twice — i.e. HA dedup actually suppressed duplicates.
    // We tolerate `uniqueDutySlots > l1VoteCount` (in-flight L1 txs that haven't mined yet) and
    // `uniqueDutySlots < l1VoteCount` (duties that completed too recently to be visible at the
    // snapshot read) — the only invariant we hold is "no two HA nodes both signed the same
    // (slot, validator)".
    const dbResult = await mainPool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot::numeric <= $1 AND duty_type = 'GOVERNANCE_VOTE' ORDER BY slot, started_at`,
      [lastSignalSlot.toString()],
    );
    const governanceVoteDuties = dbResult.rows;

    expect(governanceVoteDuties.length).toBeGreaterThan(0);

    const dutyKeys = governanceVoteDuties.map(row => `${row.slot}-${row.validator_address}`);
    const uniqueDutyKeys = new Set(dutyKeys);
    expect(uniqueDutyKeys.size).toBe(governanceVoteDuties.length);

    for (const duty of governanceVoteDuties) {
      logger.info(
        `  Governance vote duty: slot ${duty.slot}, validator ${duty.validator_address}, node ${duty.node_id}, status ${duty.status}`,
      );
      expect(duty.status).toBe(DutyStatus.SIGNED);
      expect(duty.completed_at).toBeDefined();
    }

    const uniqueSlots = new Set(governanceVoteDuties.map(row => row.slot));
    logger.info(
      `L1 vote count: ${l1VoteCount}, governance vote duties: ${governanceVoteDuties.length}, ` +
        `unique slots with votes: ${uniqueSlots.size} (slots: ${[...uniqueSlots].join(', ')})`,
    );

    logger.info('Governance voting with HA coordination and L1 verification complete');
  });

  it('should reload keystore via admin API and keep building blocks after swapping attesters', async () => {
    logger.info('Testing reloadKeystore: swap all attesters across HA nodes');

    const groupA = attesterAddresses.slice(0, 2);
    const groupB = attesterAddresses.slice(2, 4);

    const writeKeystoreForNode = async (nodeIdx: number, attesters: string[]) => {
      const ks = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesters,
            feeRecipient: AztecAddress.ZERO.toString(),
            coinbase: EthAddress.fromString(attesters[0]).toChecksumString(),
            remoteSigner: web3SignerUrl,
            publisher: [publisherAddresses[nodeIdx]],
          },
        ],
      };
      await writeFile(join(haKeystoreDirs[nodeIdx], 'keystore.json'), JSON.stringify(ks, null, 2));
    };

    const verifyNodeAttesters = (nodeIdx: number, expectedAttesters: string[], label: string) => {
      const vc: ValidatorClient = (haNodeServices[nodeIdx] as any).validatorClient;
      const addrs = vc.getValidatorAddresses();
      expect(addrs).toHaveLength(expectedAttesters.length);
      for (const expected of expectedAttesters) {
        expect(addrs.some(a => a.equals(EthAddress.fromString(expected)))).toBe(true);
      }
      logger.info(`Node ${nodeIdx}: ${addrs.length} attesters (${label})`);
    };

    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;

    try {
      // Phase 1: Nodes 0,1,2 get attesters [A0,A1], nodes 3,4 get [A2,A3]
      logger.info('Phase 1: Initial attester split');
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeKeystoreForNode(i, i < 3 ? groupA : groupB);
        await haNodeServices[i].reloadKeystore();
      }
      for (let i = 0; i < NODE_COUNT; i++) {
        verifyNodeAttesters(i, i < 3 ? groupA : groupB, i < 3 ? 'group A' : 'group B');
      }

      // Phase 2: Swap — nodes 0,1,2 get [A2,A3], nodes 3,4 get [A0,A1]
      logger.info('Phase 2: Swapping all attesters');
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeKeystoreForNode(i, i < 3 ? groupB : groupA);
        await haNodeServices[i].reloadKeystore();
      }
      for (let i = 0; i < NODE_COUNT; i++) {
        verifyNodeAttesters(i, i < 3 ? groupB : groupA, i < 3 ? 'group B (swapped)' : 'group A (swapped)');
      }

      const receipt = await sendTriggerTx();
      expect(receipt.blockNumber).toBeDefined();
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      const [cp] = await aztecNode.getCheckpoints(block!.checkpointNumber, 1, { includeAttestations: true });
      const att = (cp.attestations ?? []).filter(a => !a.signature.isEmpty());
      expect(att.length).toBeGreaterThanOrEqual(quorum);
      logger.info(`Phase 2: block ${receipt.blockNumber}, ${att.length} attestations (quorum ${quorum})`);
    } finally {
      // Restore each node's saved initial keystore so subsequent tests see original state
      for (let i = 0; i < NODE_COUNT; i++) {
        await writeFile(join(haKeystoreDirs[i], 'keystore.json'), initialKeystoreJsons[i]);
        await haNodeServices[i].reloadKeystore();
      }
    }
  });

  // NOTE: this test needs to run last
  it('should distribute work across multiple HA nodes', async () => {
    logger.info('Testing HA resilience by killing nodes after they produce blocks');

    // We'll produce NODE_COUNT blocks (5 total with NODE_COUNT=5)
    // Each node produces exactly 1 block, and we kill it after it produces
    // The last remaining node will produce the final block
    const blockCount = NODE_COUNT;
    const receipts = [];
    const killedNodes: number[] = []; // Track indices of killed nodes
    const blockProducers = new Map<number, string>(); // Map block index to node ID
    let previousBlockNumber: number | undefined;

    const nodeIds: string[] = [];
    for (const service of haNodeServices) {
      nodeIds.push((await service.getConfig()).nodeId);
    }

    for (let i = 0; i < blockCount; i++) {
      logger.info(`\n=== Producing block ${i + 1}/${blockCount} ===`);
      logger.info(`Active nodes: ${haNodeServices.length - killedNodes.length}/${NODE_COUNT}`);

      const receipt = await sendTriggerTx();

      expect(receipt.blockNumber).toBeDefined();

      // Verify this transaction is in a different block than the previous one
      if (previousBlockNumber !== undefined) {
        expect(receipt.blockNumber).toBeGreaterThan(previousBlockNumber);
      }

      previousBlockNumber = receipt.blockNumber;
      receipts.push(receipt);

      // Find which node produced this block
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.header.globalVariables.slotNumber);
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const blockProposalDuty = duties.find(d => d.dutyType === 'BLOCK_PROPOSAL');

      if (!blockProposalDuty) {
        throw new Error(`No block proposal duty found for slot ${slotNumber}`);
      }

      blockProducers.set(i, blockProposalDuty.nodeId);
      logger.info(`Block ${receipt.blockNumber} produced by node ${blockProposalDuty.nodeId}`);

      const producerNodeId = blockProposalDuty.nodeId;
      const producerNodeIndex = nodeIds.findIndex(nodeId => nodeId === producerNodeId);

      if (producerNodeIndex === -1) {
        throw new Error(`Could not find active node with ID ${producerNodeId}`);
      }

      // Kill the node that produced this block, unless it's the last block
      if (i < blockCount - 1) {
        logger.info(`Killing node ${producerNodeId} that produced this block`);
        await stopHANode(producerNodeIndex);
        killedNodes.push(producerNodeIndex);
      } else {
        // The final survivor is kept online for the slash-offense assertion below, but its sequencer
        // is no longer needed. Stop it before running the remaining assertions so it cannot start a
        // new empty checkpoint and then block service shutdown while awaiting a delayed L1 publish.
        logger.info(`Last block produced; stopping sequencer for survivor ${producerNodeId}`);
        await haNodeServices[producerNodeIndex].getSequencer()?.stop();
      }

      logger.info(`Block ${i + 1}/${blockCount} completed. Killed nodes: ${killedNodes.length}/${NODE_COUNT}`);
    }

    // Verify we got the expected number of distinct blocks
    const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
    const uniqueBlockNumbers = new Set(blockNumbers);
    expect(uniqueBlockNumbers.size).toBe(blockCount);
    logger.info(`Created ${uniqueBlockNumbers.size} distinct blocks: ${Array.from(uniqueBlockNumbers).join(', ')}`);

    // Verify each node produced at least 1 block
    const nodeBlockCounts = new Map<string, number>();
    for (const nodeId of blockProducers.values()) {
      const count = nodeBlockCounts.get(nodeId) || 0;
      nodeBlockCounts.set(nodeId, count + 1);
    }

    logger.info(`Block production by node: ${JSON.stringify(Array.from(nodeBlockCounts.entries()))}`);

    // Verify: each node should have produced at least 1 block
    // (there may be empty blocks produced during node transitions)
    for (const [nodeId, count] of nodeBlockCounts.entries()) {
      expect(count).toBeGreaterThanOrEqual(1);
      logger.info(`Node ${nodeId} produced ${count} block(s) as expected`);
    }

    // Verify all nodes participated (NODE_COUNT nodes total)
    expect(nodeBlockCounts.size).toBe(NODE_COUNT);
    logger.info(`All ${NODE_COUNT} nodes participated in block production`);

    // Verify no double-signing occurred across all blocks
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    for (const receipt of receipts) {
      const [block] = await aztecNode.getBlocks(receipt.blockNumber!, 1, {
        includeL1PublishInfo: true,
        includeAttestations: true,
        includeTransactions: true,
        onlyCheckpointed: true,
      });
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.header.globalVariables.slotNumber);

      // PRIMARY CHECK: Database records show all attestation duties attempted/completed
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const attestationDuties = duties.filter(d => d.dutyType === 'ATTESTATION');

      // Verify no duplicate attestation duties per validator (HA protection ensures 1 per validator)
      const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);
      expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
      logger.info(
        `Block ${receipt.blockNumber}: Database shows ${dutiesByValidator.size} unique validators attested (quorum: ${quorum}), no double-signing detected in DB`,
      );

      // SECONDARY CHECK: Verify checkpoint attestations match database records
      const [publishedCheckpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1, {
        includeAttestations: true,
      });
      const attestationInfos = getAttestationInfoFromPublishedCheckpoint(
        {
          attestations: publishedCheckpoint.attestations ?? [],
          checkpoint: new Checkpoint(
            publishedCheckpoint.archive,
            publishedCheckpoint.header,
            [],
            publishedCheckpoint.number,
            publishedCheckpoint.feeAssetPriceModifier,
          ),
        },
        getSignatureContext(),
      );

      // Filter to only valid attestations with recovered addresses
      const validAttestations = attestationInfos.filter(
        (info: AttestationInfo) => info.status === 'recovered-from-signature' && info.address !== undefined,
      );

      // Verify checkpoint has exactly quorum attestations (trimmed to minimum required)
      const checkpointValidatorAddresses = new Set<string>(validAttestations.map(info => info.address!.toString()));
      expect(checkpointValidatorAddresses.size).toBe(quorum);

      // Verify every validator in the checkpoint has a corresponding DB duty record
      // (checkpoint is trimmed to quorum, so it's a subset of DB records)
      for (const validatorAddress of checkpointValidatorAddresses) {
        expect(dutiesByValidator.has(validatorAddress)).toBe(true);
      }
    }

    // GOSSIP-LAYER CHECK: each HA node's libp2p service detects when a signer attests to two
    // distinct payloads at the same slot and fires `duplicateAttestationCallback` -> validator
    // client emits WANT_TO_SLASH_EVENT -> SlashOffensesCollector persists a DUPLICATE_ATTESTATION
    // offense. We assert no such offense (or DUPLICATE_PROPOSAL) was collected on any surviving
    // HA node. Killed nodes are unreachable, but the surviving node — which has been alive the
    // whole test — has observed all gossiped attestations and proposals across every slot.
    const aliveNodes = haNodeServices.filter((_, idx) => !killedNodes.includes(idx));
    const allOffenses = (await Promise.all(aliveNodes.map(n => n.getSlashOffenses('all')))).flat();
    const equivocationOffenses = allOffenses.filter(
      o => o.offenseType === OffenseType.DUPLICATE_ATTESTATION || o.offenseType === OffenseType.DUPLICATE_PROPOSAL,
    );
    expect(equivocationOffenses).toEqual([]);

    dateProvider.reset();
    await Promise.all(haNodeServices.map((_, nodeIndex) => stopHANode(nodeIndex)));
  });

  describe('Clock Skew and Timezone Safety', () => {
    const rollupAddress = EthAddress.random();
    const validatorAddress = EthAddress.random();
    it('should not be affected by process.env.TZ changes', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(mainPool);
      const originalTZ = process.env.TZ;

      try {
        // Node 1 in UTC creates and signs a duty
        process.env.TZ = 'UTC';
        const duty1 = await spDb.tryInsertOrGetExisting({
          rollupAddress,
          validatorAddress,
          slot: SlotNumber(100),
          blockNumber: BlockNumber(0),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATION,
          messageHash: Buffer32.random().toString(),
          nodeId: 'node-utc',
        });
        expect(duty1.isNew).toBe(true);
        await spDb.updateDutySigned(
          rollupAddress,
          validatorAddress,
          SlotNumber(100),
          DutyType.ATTESTATION,
          '0xsig',
          duty1.record.lockToken,
          -1,
        );

        // Wait for real database time to pass (duties need different timestamps in PostgreSQL)
        await sleep(100);

        // Node 2 in Tokyo creates and signs a duty at approximately the same time
        process.env.TZ = 'Asia/Tokyo';
        const duty2 = await spDb.tryInsertOrGetExisting({
          rollupAddress,
          validatorAddress,
          slot: SlotNumber(101),
          blockNumber: BlockNumber(0),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATION,
          messageHash: Buffer32.random().toString(),
          nodeId: 'node-tokyo',
        });
        expect(duty2.isNew).toBe(true);
        await spDb.updateDutySigned(
          rollupAddress,
          validatorAddress,
          SlotNumber(101),
          DutyType.ATTESTATION,
          '0xsig',
          duty2.record.lockToken,
          -1,
        );

        // Verify both duties were stored at correct absolute times (seconds apart, not hours)
        const result = await mainPool.query<{ slot: string; unix_timestamp: string }>(
          `SELECT slot, EXTRACT(EPOCH FROM started_at) as unix_timestamp
           FROM validator_duties
           WHERE slot IN ('100', '101')
           ORDER BY slot DESC`,
        );

        const timestamp1 = parseFloat(result.rows[0].unix_timestamp);
        const timestamp2 = parseFloat(result.rows[1].unix_timestamp);
        const diffSeconds = Math.abs(timestamp1 - timestamp2);

        // Should be less than 10 seconds apart (not hours due to timezone interpretation)
        expect(diffSeconds).toBeLessThan(10);
      } finally {
        process.env.TZ = originalTZ;
      }
    });

    it('should not delete recent duties when node clock is ahead (using cleanupOldDuties)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(mainPool);

      // Ensure clean slate for this test
      await mainPool.query('DELETE FROM validator_duties WHERE slot = $1', ['200']);

      // Create and sign a duty using our actual methods
      const duty = await spDb.tryInsertOrGetExisting({
        rollupAddress,
        validatorAddress,
        slot: SlotNumber(200),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: Buffer32.random().toString(),
        nodeId: 'test-node',
      });
      expect(duty.isNew).toBe(true);

      await spDb.updateDutySigned(
        rollupAddress,
        validatorAddress,
        SlotNumber(200),
        DutyType.ATTESTATION,
        '0xsig',
        duty.record.lockToken,
        -1,
      );

      // Verify duty exists before cleanup
      const beforeCleanup = await mainPool.query<DutyRow>(
        `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
        ['200', validatorAddress.toString().toLowerCase()],
      );
      expect(beforeCleanup.rows.length).toBe(1);
      expect(beforeCleanup.rows[0].status).toBe('signed');

      // Simulate node with clock 2 hours ahead using dateProvider
      // NOTE: Database cleanup uses PostgreSQL's CURRENT_TIMESTAMP, not application time
      // This test verifies that even if the application clock is skewed, cleanup
      // correctly uses database time to determine duty age
      dateProvider.setTime(Date.now() + 2 * 60 * 60 * 1000); // 2 hours ahead

      try {
        // Use our actual cleanupOldDuties method
        const numCleaned = await spDb.cleanupOldDuties(60 * 60 * 1000); // 1 hour

        // Should NOT delete the duty we just created (it uses DB's clock, not node's)
        expect(numCleaned).toBe(0);
      } finally {
        // Reset dateProvider back to real time
        dateProvider.reset();
      }

      // Verify duty still exists
      const result = await mainPool.query<DutyRow>(
        `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
        ['200', validatorAddress.toString().toLowerCase()],
      );
      expect(result.rows.length).toBe(1);
    });

    it('should delete old duties based on DB time, not node time (using cleanupOldDuties)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(mainPool);

      // Ensure clean slate for this test
      await mainPool.query('DELETE FROM validator_duties WHERE slot = $1', ['300']);

      // Create and sign a duty using our actual methods
      const duty = await spDb.tryInsertOrGetExisting({
        rollupAddress,
        validatorAddress,
        slot: SlotNumber(300),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: Buffer32.random().toString(),
        nodeId: 'test-node',
      });
      expect(duty.isNew).toBe(true);

      await spDb.updateDutySigned(
        rollupAddress,
        validatorAddress,
        SlotNumber(300),
        DutyType.ATTESTATION,
        '0xsig',
        duty.record.lockToken,
        -1,
      );

      // Manually backdate the duty to 2 hours old (simulating an old duty from DB's perspective)
      const updateResult = await mainPool.query(
        `UPDATE validator_duties
         SET started_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
             completed_at = CURRENT_TIMESTAMP - INTERVAL '2 hours'
         WHERE slot = $1 AND validator_address = $2`,
        ['300', validatorAddress.toString().toLowerCase()],
      );
      expect(updateResult.rowCount).toBe(1);

      // Verify duty is backdated (should be ~2 hours old)
      const beforeCleanup = await mainPool.query<DutyRow & { age_seconds: string }>(
        `SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) as age_seconds
         FROM validator_duties WHERE slot = $1`,
        ['300'],
      );
      expect(beforeCleanup.rows.length).toBe(1);
      expect(beforeCleanup.rows[0].status).toBe('signed');
      expect(parseFloat(beforeCleanup.rows[0].age_seconds)).toBeGreaterThan(7000); // ~2 hours in seconds

      // Simulate node with clock 1 hour behind using
      dateProvider.setTime(Date.now() - 1 * 60 * 60 * 1000); // 1 hour behind

      try {
        // Use our actual cleanupOldDuties method - should delete based on DB time
        const numCleaned = await spDb.cleanupOldDuties(60 * 60 * 1000); // 1 hour
        expect(numCleaned).toBeGreaterThanOrEqual(1);
      } finally {
        // Reset dateProvider back to real time
        dateProvider.reset();
      }

      // Verify duty was deleted
      const result = await mainPool.query<DutyRow>(
        `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
        ['300', validatorAddress.toString().toLowerCase()],
      );
      expect(result.rows.length).toBe(0);
    });

    it('should not delete recent stuck duties when node clock is ahead (using cleanupOwnStuckDuties)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(mainPool);

      // Create a signing duty (stuck, not completed) using our actual method
      const duty = await spDb.tryInsertOrGetExisting({
        rollupAddress,
        validatorAddress,
        slot: SlotNumber(400),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: Buffer32.random().toString(),
        nodeId: 'stuck-node',
      });
      expect(duty.isNew).toBe(true);
      // Don't call updateDutySigned - leave it in 'signing' state (stuck)

      // Simulate node with clock 3 hours ahead
      dateProvider.setTime(Date.now() + 3 * 60 * 60 * 1000); // 3 hours ahead

      try {
        // Use our actual cleanupOwnStuckDuties method
        const numCleaned = await spDb.cleanupOwnStuckDuties('stuck-node', 60 * 60 * 1000); // 1 hour

        // Should NOT delete the duty (it uses DB's clock, not node's)
        expect(numCleaned).toBe(0);
      } finally {
        // Reset dateProvider back to real time
        dateProvider.reset();
      }
    });
  });
});
