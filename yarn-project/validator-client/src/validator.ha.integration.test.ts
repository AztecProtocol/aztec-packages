/**
 * Integration tests for High-Availability validator setup
 *
 * These tests use real services (pglite database, HA signer, HA key store)
 * rather than mocks to verify the HA coordination works correctly.
 */
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Hex } from '@aztec/foundation/string';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { type KeyStore, KeystoreManager } from '@aztec/node-keystore';
import type { P2P, TxProvider } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import type { SlasherConfig, ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeCheckpointHeader,
  makeCheckpointProposal,
  mockTx,
} from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { INSERT_SCHEMA_VERSION, SCHEMA_SETUP, SCHEMA_VERSION } from '@aztec/validator-ha-signer/db';
import { DutyAlreadySignedError } from '@aztec/validator-ha-signer/errors';
import { createHASigner } from '@aztec/validator-ha-signer/factory';
import { Pool } from '@aztec/validator-ha-signer/test';
import type { ValidatorHASigner } from '@aztec/validator-ha-signer/validator-ha-signer';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import type { ValidatorClientConfig } from './config.js';
import { HAKeyStore } from './key_store/ha_key_store.js';
import type { ExtendedValidatorKeyStore } from './key_store/interface.js';
import { NodeKeystoreAdapter } from './key_store/node_keystore_adapter.js';
import { ValidatorMetrics } from './metrics.js';
import { ProposalHandler } from './proposal_handler.js';
import { ValidatorClient } from './validator.js';

describe('ValidatorClient HA Integration', () => {
  let pglite: PGlite;
  let validatorPrivateKeys: `0x${string}`[];
  let validatorAccounts: PrivateKeyAccount[];
  let keyStoreManager: KeystoreManager;

  // Mock dependencies
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource & L2BlockSink>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let txProvider: MockProxy<TxProvider>;
  let blobClient: MockProxy<BlobClientInterface>;
  let dateProvider: TestDateProvider;
  let rollupAddress: EthAddress;

  // Track resources for cleanup
  let pools: Pool[];
  let validators: ValidatorClient[];

  beforeEach(async () => {
    // Initialize cleanup tracking arrays
    pools = [];
    validators = [];
    // Create a fresh pglite database for each test to ensure complete isolation
    pglite = new PGlite();
    // Set up the database schema for testing
    for (const statement of SCHEMA_SETUP) {
      await pglite.query(statement);
    }
    await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);

    // Generate validator keys - using 5 validators to test HA coordination at scale
    validatorPrivateKeys = Array.from({ length: 5 }, () => generatePrivateKey());
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    // Set up mocks
    p2pClient = mock<P2P>();
    p2pClient.getCheckpointAttestationsForSlot.mockImplementation(() => Promise.resolve([]));
    p2pClient.addOwnCheckpointAttestations.mockResolvedValue();
    p2pClient.broadcastCheckpointAttestations.mockResolvedValue();
    const slotDuration = 24;
    checkpointsBuilder = mock<FullNodeCheckpointsBuilder>();
    checkpointsBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
      rollupManaLimit: 200_000_000,
    });
    worldState = mock<WorldStateSynchronizer>();
    epochCache = mock<EpochCache>();
    epochCache.getL1Constants.mockReturnValue({
      l1GenesisTime: 0n,
      slotDuration,
      ethereumSlotDuration: 4,
    } as any);
    // Default mock: return all addresses passed (all are in committee)
    epochCache.filterInCommittee.mockImplementation((_slot, addresses) => Promise.resolve(addresses));
    blockSource = mock<L2BlockSource & L2BlockSink>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    txProvider = mock<TxProvider>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    dateProvider = new TestDateProvider();
    blobClient = mock<BlobClientInterface>();
    blobClient.canUpload.mockReturnValue(false);
    blobClient.sendBlobsToFilestore.mockResolvedValue(true);

    // Create keystore
    const keyStore: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: validatorPrivateKeys.map(key => key as Hex<32>),
          feeRecipient: AztecAddress.ZERO,
        },
      ],
    };
    keyStoreManager = new KeystoreManager(keyStore);

    rollupAddress = TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress;

    // Create 5 HA validator instances for use across all tests
    const baseConfig: ValidatorClientConfig &
      Pick<
        SlasherConfig,
        | 'slashBroadcastedInvalidBlockPenalty'
        | 'slashBroadcastedInvalidCheckpointProposalPenalty'
        | 'slashDuplicateProposalPenalty'
        | 'slashDuplicateAttestationPenalty'
        | 'slashAttestInvalidCheckpointProposalPenalty'
      > & { blockDurationMs: number } = {
      validatorPrivateKeys: new SecretValue(validatorPrivateKeys),
      attestationPollingIntervalMs: 1000,
      blockDurationMs: 3000,
      disableValidator: false,
      disabledValidators: [],
      slashBroadcastedInvalidBlockPenalty: 1n,
      slashBroadcastedInvalidCheckpointProposalPenalty: 1n,
      rollupAddress,
      l1ChainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId,
      slashDuplicateProposalPenalty: 1n,
      slashDuplicateAttestationPenalty: 1n,
      slashAttestInvalidCheckpointProposalPenalty: 1n,
      haSigningEnabled: true,
      nodeId: 'ha-node-1', // temporary
      pollingIntervalMs: 100,
      signingTimeoutMs: 3000,
      maxStuckDutiesAgeMs: 72000,
      databaseUrl: new SecretValue('postgresql://test'),
      dataStoreMapSizeKb: 128 * 1024 * 1024,
    };

    // Create 5 validator nodes with unique node IDs
    for (let i = 0; i < 5; i++) {
      const pool = new Pool({ pglite });
      pools.push(pool);
      const config = { ...baseConfig, nodeId: `ha-node-${i + 1}` };
      const validator = await createHAValidator(pool, config);
      await validator.start();
      validators.push(validator);
    }
  });

  afterEach(async () => {
    // Stop all HA validators
    for (const validator of validators) {
      await validator.stop();
    }

    // Close pglite instance
    if (pglite) {
      await pglite.close();
      pglite = undefined as any;
    }
  });

  /**
   * Helper to create a ValidatorClient with HA signing enabled using pglite
   * Tracks resources for cleanup
   */
  async function createHAValidator(
    pool: Pool,
    config: ValidatorClientConfig &
      Pick<
        SlasherConfig,
        | 'slashBroadcastedInvalidBlockPenalty'
        | 'slashBroadcastedInvalidCheckpointProposalPenalty'
        | 'slashDuplicateProposalPenalty'
        | 'slashDuplicateAttestationPenalty'
        | 'slashAttestInvalidCheckpointProposalPenalty'
      > & { blockDurationMs: number },
  ): Promise<ValidatorClient> {
    // Track pool for cleanup
    pools.push(pool);
    // Create HA signer with pglite pool
    const { signer: haSigner } = await createHASigner(config, { pool: pool as any });

    // Create base keystore
    const baseKeyStore = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);

    // Wrap with HA key store
    const haKeyStore = new HAKeyStore(baseKeyStore, haSigner);

    // Create block proposal handler
    const metrics = new ValidatorMetrics(getTelemetryClient());
    const consensusTimetable = new ConsensusTimetable({
      l1Constants: epochCache.getL1Constants(),
      blockDuration: 3,
    });
    const blockProposalValidator = new BlockProposalValidator(epochCache, consensusTimetable, {
      txsPermitted: true,
      maxTxsPerBlock: undefined,
      signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
      clockDisparityMs: 500,
    });
    const proposalHandler = new ProposalHandler(
      checkpointsBuilder,
      worldState,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      blockProposalValidator,
      epochCache,
      consensusTimetable,
      config,
      blobClient,
      new CheckpointReexecutionTracker(),
      metrics,
      dateProvider,
      getTelemetryClient(),
    );

    const validator = new TestValidatorClient(
      haKeyStore,
      epochCache,
      p2pClient,
      proposalHandler,
      blockSource,
      checkpointsBuilder,
      worldState,
      l1ToL2MessageSource,
      config,
      blobClient,
      undefined as unknown as ValidatorHASigner,
      dateProvider,
      getTelemetryClient(),
    ) as ValidatorClient;

    // Note: Validator is tracked in the calling code (beforeEach)
    return validator;
  }

  // Allow access to the constructor
  class TestValidatorClient extends ValidatorClient {
    constructor(
      keyStore: ExtendedValidatorKeyStore,
      epochCache: EpochCache,
      p2pClient: P2P,
      proposalHandler: ProposalHandler,
      blockSource: L2BlockSource,
      checkpointsBuilder: FullNodeCheckpointsBuilder,
      worldState: WorldStateSynchronizer,
      l1ToL2MessageSource: L1ToL2MessageSource,
      config: ValidatorClientFullConfig,
      blobClient: BlobClientInterface,
      slashingProtectionSigner: ValidatorHASigner,
      dateProvider: DateProvider = new DateProvider(),
      telemetry: TelemetryClient = getTelemetryClient(),
    ) {
      super(
        keyStore,
        epochCache,
        p2pClient,
        proposalHandler,
        blockSource,
        checkpointsBuilder,
        worldState,
        l1ToL2MessageSource,
        config,
        blobClient,
        slashingProtectionSigner,
        dateProvider,
        telemetry,
      );
    }
  }

  describe('High-Availability signing coordination', () => {
    it('should allow only one validator instance to create a block proposal for the same slot', async () => {
      // Use all 5 validators - all try to create the same block proposal
      const blockHeader = makeBlockHeader(1);
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);
      const inHash = computeInHashFromL1ToL2Messages([]);
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3].map(() => mockTx()));
      const proposerAddress = EthAddress.fromString(validatorAccounts[0].address);

      // All 5 validators try to create a block proposal for the same slot simultaneously
      const results = await Promise.allSettled(
        validators.map(v =>
          v.createBlockProposal(
            blockHeader,
            CheckpointNumber(1),
            indexWithinCheckpoint,
            inHash,
            archive,
            txs,
            proposerAddress,
            {
              publishFullTxs: false,
            },
          ),
        ),
      );

      // Exactly one should succeed, others should fail with DutyAlreadySignedError
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(
        r => r.status === 'rejected' && r.reason instanceof DutyAlreadySignedError,
      ).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);

      // Verify the successful proposal is valid
      const successfulResult = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined;
      expect(successfulResult).toBeDefined();
      expect(successfulResult?.value).toBeDefined();
      expect(successfulResult?.value?.getSender()).toEqual(proposerAddress);
    });

    it('should allow different validators to create proposals for different slots', async () => {
      const proposerAddress = EthAddress.fromString(validatorAccounts[0].address);
      const txs = await Promise.all([1, 2, 3].map(() => mockTx()));
      const inHash = computeInHashFromL1ToL2Messages([]);

      // Each of the 5 validators creates a proposal for a different slot
      const proposals = await Promise.all(
        validators.map((v, i) => {
          const blockHeader = makeBlockHeader(i + 1);
          const archive = Fr.random();
          return v.createBlockProposal(
            blockHeader,
            CheckpointNumber(1),
            IndexWithinCheckpoint(0),
            inHash,
            archive,
            txs,
            proposerAddress,
            { publishFullTxs: false },
          );
        }),
      );

      // All 5 should succeed since they're for different slots
      expect(proposals).toHaveLength(5);
      proposals.forEach(proposal => {
        expect(proposal).toBeDefined();
        expect(proposal.getSender()).toEqual(proposerAddress);
      });
    });

    it('should coordinate attestations when multiple validators attest to the same checkpoint proposal', async () => {
      // Create checkpoint proposal using the test helper (without HA signing)
      // This bypasses HA signing for proposal creation - we only want to test attestation HA coordination
      const testSlot = 200;
      const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
      const checkpointProposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(testSlot),
        lastBlock: {
          blockHeader: makeBlockHeader(testSlot),
          txHashes,
        },
      });

      // All 5 validators try to attest to the same checkpoint proposal simultaneously
      const results = await Promise.allSettled(
        validators.map(v => v.collectOwnAttestations(checkpointProposal, CheckpointNumber(1))),
      );

      // Check for errors - if all fail, at least one should have a meaningful error
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        const hasExpectedError = results.some(
          r => r.status === 'rejected' && r.reason instanceof DutyAlreadySignedError,
        );
        if (!hasExpectedError) {
          // Unexpected error - rethrow to see what went wrong
          throw new Error(
            `All validators failed with unexpected errors: ${results.map(r => (r.status === 'rejected' ? r.reason : '')).join(', ')}`,
          );
        }
      }

      // Count total attestations across all validators
      // HA coordination will ensure only one validator succeeds per address
      const totalAttestations = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .reduce((sum, r) => sum + r.value.length, 0);

      // We have 5 validator addresses, so total attestations should be 5
      // HA coordination ensures only one node signs per address
      expect(totalAttestations).toBe(5);
    });
  });
});
