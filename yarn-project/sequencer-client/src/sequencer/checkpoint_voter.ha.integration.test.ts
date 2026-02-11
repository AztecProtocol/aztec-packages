/**
 * Integration tests for High-Availability sequencer signing (governance & slashing votes)
 *
 * These tests use real services (pglite database, HA signer, HA key store)
 * rather than mocks to verify the HA coordination works correctly for sequencer
 * voting functions (governance and slashing).
 */
import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type {
  EmpireSlashingProposerContract,
  GovernanceProposerContract,
  RollupContract,
} from '@aztec/ethereum/contracts';
import { Multicall3 } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Hex } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type KeyStore, KeystoreManager } from '@aztec/node-keystore';
import type { ProposerSlashAction } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { HAKeyStore, NodeKeystoreAdapter, type ValidatorClient } from '@aztec/validator-client';
import type { ValidatorClientConfig } from '@aztec/validator-client/config';
import { INSERT_SCHEMA_VERSION, SCHEMA_SETUP, SCHEMA_VERSION } from '@aztec/validator-ha-signer/db';
import { createHASigner } from '@aztec/validator-ha-signer/factory';
import { Pool } from '@aztec/validator-ha-signer/test';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { SequencerClientConfig } from '../config.js';
import type { SequencerPublisherMetrics } from '../publisher/sequencer-publisher-metrics.js';
import { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import type { SequencerMetrics } from './metrics.js';
import type { SequencerRollupConstants } from './types.js';

describe('CheckpointVoter HA Integration', () => {
  let pglite: PGlite;
  let validatorPrivateKeys: `0x${string}`[];
  let validatorAccounts: PrivateKeyAccount[];
  let keyStoreManager: KeystoreManager;

  // Mock dependencies
  let rollupContract: MockProxy<RollupContract>;
  let governanceProposerContract: MockProxy<GovernanceProposerContract>;
  let slashingProposerContract: MockProxy<EmpireSlashingProposerContract>;
  let l1TxUtils: MockProxy<L1TxUtils>;
  let dateProvider: TestDateProvider;
  let sequencerMetrics: MockProxy<SequencerMetrics>;
  let publisherMetrics: MockProxy<SequencerPublisherMetrics>;
  let forwardSpy: jest.SpiedFunction<typeof Multicall3.forward>;

  // Track resources for cleanup
  let pools: Pool[];
  let validatorClients: ValidatorClient[];

  const TEST_L1_CONSTANTS: SequencerRollupConstants = {
    l1GenesisTime: 1n,
    slotDuration: 24,
    ethereumSlotDuration: DefaultL1ContractsConfig.ethereumSlotDuration,
  };

  /**
   * Helper to create mock governance contract with proper signer invocation
   */
  function createMockGovernanceContract(): MockProxy<GovernanceProposerContract> {
    const contract = mock<GovernanceProposerContract>();
    Object.defineProperty(contract, 'address', { value: EthAddress.random(), writable: false });
    contract.getRoundInfo.mockResolvedValue({
      lastSignalSlot: SlotNumber(1),
      payloadWithMostSignals: EthAddress.ZERO.toString(),
      quorumReached: false,
      executed: false,
    });
    contract.computeRound.mockResolvedValue(1n);
    // Mock must actually call the signer function to trigger HA protection
    contract.createSignalRequestWithSignature.mockImplementation(
      async (_payload, _slot, _chainId, _signerAddress, signer) => {
        const mockTypedData = {
          domain: { name: 'GovernanceProposer', version: '1', chainId: 1 },
          types: {
            Signal: [
              { name: 'payload', type: 'address' },
              { name: 'slot', type: 'uint256' },
            ],
          },
          primaryType: 'Signal',
          message: { payload: _payload, slot: _slot.toString() },
        };
        await signer(mockTypedData);
        return {
          to: contract.address.toString(),
          data: '0x' as `0x${string}`,
        };
      },
    );
    return contract;
  }

  /**
   * Helper to create mock slashing contract with proper signer invocation
   */
  function createMockSlashingContract(): MockProxy<EmpireSlashingProposerContract> {
    const contract = mock<EmpireSlashingProposerContract>();
    Object.defineProperty(contract, 'type', { value: 'empire', writable: false });
    Object.defineProperty(contract, 'address', { value: EthAddress.random(), writable: false });
    contract.getRoundInfo.mockResolvedValue({
      lastSignalSlot: SlotNumber(1),
      payloadWithMostSignals: EthAddress.ZERO.toString(),
      quorumReached: false,
      executed: false,
    });
    contract.computeRound.mockResolvedValue(1n);
    // Mock must actually call the signer function to trigger HA protection
    contract.createSignalRequestWithSignature.mockImplementation(
      async (_payload, _slot, _chainId, _signerAddress, signer) => {
        const mockTypedData = {
          domain: { name: 'SlashingProposer', version: '1', chainId: 1 },
          types: {
            Signal: [
              { name: 'payload', type: 'address' },
              { name: 'slot', type: 'uint256' },
            ],
          },
          primaryType: 'Signal',
          message: { payload: _payload, slot: _slot.toString() },
        };
        await signer(mockTypedData as any);
        return {
          to: contract.address.toString(),
          data: '0x' as any,
        };
      },
    );
    return contract;
  }

  /**
   * Helper to create mock L1 tx utils
   */
  function createMockL1TxUtils(validatorAccount: PrivateKeyAccount): MockProxy<L1TxUtils> {
    const txUtils = mock<L1TxUtils>();
    txUtils.client = {
      account: validatorAccount,
      getCode: () => Promise.resolve('0x1234' as `0x${string}`),
    } as any;
    txUtils.getSenderAddress.mockReturnValue(EthAddress.fromString(validatorAccount.address));
    txUtils.simulate.mockResolvedValue({
      gasUsed: 100000n,
      result: '0x',
    });
    // Mock getCode to return non-empty bytecode for governance/slashing payloads
    txUtils.getCode.mockResolvedValue('0x1234' as any);
    return txUtils;
  }

  beforeEach(async () => {
    // Initialize cleanup tracking arrays
    pools = [];
    validatorClients = [];

    // Create a fresh pglite database
    pglite = new PGlite();
    // Set up the database schema for testing
    for (const statement of SCHEMA_SETUP) {
      await pglite.query(statement);
    }
    await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);

    // Generate validator keys - using 5 validators
    validatorPrivateKeys = Array.from({ length: 5 }, () => generatePrivateKey());
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    // Set up spy for Multicall3.forward to track L1 transaction sending
    forwardSpy = jest.spyOn(Multicall3, 'forward');

    // Set up mocks using helper functions
    rollupContract = mock<RollupContract>();
    Object.defineProperty(rollupContract, 'address', { value: EthAddress.random(), writable: false });
    rollupContract.listenToSlasherChanged.mockReturnValue(undefined as any);
    rollupContract.getSlashingProposer.mockResolvedValue(undefined);

    governanceProposerContract = createMockGovernanceContract();
    slashingProposerContract = createMockSlashingContract();
    l1TxUtils = createMockL1TxUtils(validatorAccounts[0]);

    dateProvider = new TestDateProvider();
    sequencerMetrics = mock<SequencerMetrics>();
    publisherMetrics = mock<SequencerPublisherMetrics>();

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
  });

  afterEach(async () => {
    for (const validator of validatorClients) {
      await validator.stop();
    }

    for (const pool of pools) {
      await pool.end();
    }

    if (pglite) {
      await pglite.close();
      pglite = undefined as any;
    }

    // Restore the spy to avoid affecting other tests
    forwardSpy.mockRestore();
  });

  /**
   * Helper to create a CheckpointVoter with HA signing enabled using pglite
   * Returns the voter, publisher, and validator client for testing
   */
  async function createHACheckpointVoter(
    slot: SlotNumber,
    config: Partial<SequencerClientConfig & ValidatorClientConfig>,
  ): Promise<{
    voter: CheckpointVoter;
    publisher: SequencerPublisher;
    validatorClient: ValidatorClient;
  }> {
    const pool = new Pool({ pglite });
    pools.push(pool);

    const baseConfig: ValidatorClientConfig = {
      validatorPrivateKeys: new SecretValue(validatorPrivateKeys),
      attestationPollingIntervalMs: 1000,
      disableValidator: false,
      disabledValidators: [],
      validatorReexecute: false,
      haSigningEnabled: true,
      l1Contracts: { rollupAddress: EthAddress.fromString(rollupContract.address.toString()) },
      nodeId: config.nodeId || 'ha-node-1',
      pollingIntervalMs: 100,
      signingTimeoutMs: 3000,
      maxStuckDutiesAgeMs: 72000,
      databaseUrl: 'postgresql://test',
    };

    // Create HA signer with pglite pool
    const { signer: haSigner } = await createHASigner(baseConfig, { pool: pool as any });

    // Create base keystore
    const baseKeyStore = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);

    // Wrap with HA key store
    const haKeyStore = new HAKeyStore(baseKeyStore, haSigner);

    // Create publisher
    const publisherConfig = {
      ...config,
      viemPollingIntervalMS: 1000,
      l1PublishRetryIntervalMS: 1000,
      l1RpcUrl: 'http://localhost:8545',
      requiredConfirmations: 1,
      maxL1TxInclusionWaitPulseSeconds: 60,
      ethereumSlotDuration: DefaultL1ContractsConfig.ethereumSlotDuration,
      fishermanMode: false,
      l1ChainId: 1,
    };

    const blobClient = mock<BlobClientInterface>();
    blobClient.canUpload.mockReturnValue(false);

    const epochCache = mock<EpochCache>();
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: slot,
      ts: BigInt(Math.floor(Date.now() / 1000)),
      nowMs: BigInt(Date.now()),
    });

    const slashFactoryContract = mock<SlashFactoryContract>();

    const publisher = new SequencerPublisher(publisherConfig as any, {
      telemetry: getTelemetryClient(),
      blobClient,
      l1TxUtils,
      rollupContract,
      slashingProposerContract,
      governanceProposerContract,
      slashFactoryContract,
      epochCache,
      dateProvider,
      metrics: publisherMetrics,
      lastActions: {},
    });

    // Create mock validator client with real signing via HA keystore
    const validatorClient = mock<ValidatorClient>();

    // Delegate signWithAddress to the HA keystore for real HA protection
    validatorClient.signWithAddress.mockImplementation((address, msg, context) => {
      return haKeyStore.signTypedDataWithAddress(address, msg, context);
    });

    // Manage HA signer lifecycle through validator client mock
    validatorClient.start.mockImplementation(() => Promise.resolve(haSigner.start()));
    validatorClient.stop.mockImplementation(async () => await haSigner.stop());

    // Track for cleanup and start the signer
    validatorClients.push(validatorClient);
    await validatorClient.start();

    // Create the checkpoint voter
    const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);
    const voter = new CheckpointVoter(
      slot,
      publisher,
      attestorAddress,
      validatorClient,
      undefined, // slasherClient - we'll mock this per test
      TEST_L1_CONSTANTS,
      config as any,
      sequencerMetrics,
      publisher['log'],
    );

    return { voter, publisher, validatorClient };
  }

  /**
   * Helper to create a CheckpointVoter with slashing actions configured
   * Reduces duplication in tests that need both governance and slashing
   */
  async function createHACheckpointVoterWithSlasher(
    slot: SlotNumber,
    config: Partial<SequencerClientConfig & ValidatorClientConfig>,
    slashingActions: ProposerSlashAction[],
  ): Promise<{
    voter: CheckpointVoter;
    publisher: SequencerPublisher;
    validatorClient: ValidatorClient;
  }> {
    const result = await createHACheckpointVoter(slot, config);

    // Mock slasher client to return the provided actions
    const slasherClient = {
      getProposerActions: () => slashingActions,
    };

    // Create new voter with slasher client configured
    const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);
    const voter = new CheckpointVoter(
      slot,
      result.publisher,
      attestorAddress,
      result.validatorClient,
      slasherClient as any,
      TEST_L1_CONSTANTS,
      config as any,
      sequencerMetrics,
      result.publisher['log'],
    );

    return { voter, publisher: result.publisher, validatorClient: result.validatorClient };
  }

  /**
   * Helper to query the HA database and verify duty records
   * Useful for debugging and verifying HA coordination worked correctly
   */
  async function getDutyRecords(slot: SlotNumber) {
    const result = await pglite.query<{ slot: string; duty_type: string; node_id: string; started_at: Date }>(
      'SELECT slot, duty_type, node_id, started_at FROM validator_duties WHERE slot = $1 ORDER BY started_at',
      [slot.toString()],
    );
    return result.rows;
  }

  describe('High-Availability governance vote coordination', () => {
    it('should allow only one sequencer instance to enqueue a governance vote for the same slot', async () => {
      const slot = SlotNumber(100);
      const governancePayload = EthAddress.random();

      // Create 5 checkpoint voters for the same slot
      const voters = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createHACheckpointVoter(slot, {
            nodeId: `ha-node-${i + 1}`,
            governanceProposerPayload: governancePayload,
          }),
        ),
      );

      // All 5 voters try to enqueue governance votes simultaneously
      const results = await Promise.all(
        voters.map(({ voter }) => {
          const [governancePromise, _slashingPromise] = voter.enqueueVotes();
          return governancePromise;
        }),
      );

      // Count successes - enqueueVotes returns true/false, never throws
      const successCount = results.filter(r => r === true).length;
      const failureCount = results.filter(r => r === false).length;

      // Exactly one should succeed, others should fail due to HA coordination
      // DutyAlreadySignedError is caught and converted to false
      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);

      // Verify database state - exactly one governance vote duty should be recorded
      const duties = await getDutyRecords(slot);
      const governanceDuties = duties.filter(d => d.duty_type === 'GOVERNANCE_VOTE');
      expect(governanceDuties).toHaveLength(1);

      // The winning node should be one of our 5 nodes
      const winningNodeId = governanceDuties[0].node_id;
      expect(['ha-node-1', 'ha-node-2', 'ha-node-3', 'ha-node-4', 'ha-node-5']).toContain(winningNodeId);
    });

    it('should allow different sequencers to vote for different slots', async () => {
      const governancePayload = EthAddress.random();

      // Create 5 checkpoint voters for different slots
      const slots = Array.from({ length: 5 }, (_, i) => SlotNumber(100 + i));
      const voters = await Promise.all(
        slots.map((slot, i) =>
          createHACheckpointVoter(slot, {
            nodeId: `ha-node-${i + 1}`,
            governanceProposerPayload: governancePayload,
          }),
        ),
      );

      // Each voter enqueues votes for their respective slot
      const results = await Promise.all(
        voters.map(({ voter }) => {
          const [governancePromise, _slashingPromise] = voter.enqueueVotes();
          return governancePromise;
        }),
      );

      // All 5 should succeed since they're for different slots
      results.forEach(result => {
        expect(result).toBe(true);
      });

      // Verify database - each slot should have exactly one governance duty
      for (const slot of slots) {
        const duties = await getDutyRecords(slot);
        const governanceDuties = duties.filter(d => d.duty_type === 'GOVERNANCE_VOTE');
        expect(governanceDuties).toHaveLength(1);
      }
    });
  });

  describe('High-Availability slashing vote coordination', () => {
    it('should allow only one sequencer instance to enqueue slashing votes for the same slot', async () => {
      const slot = SlotNumber(200);
      const slashingPayload = EthAddress.random();

      // Create mock slashing actions
      const mockSlashingActions: ProposerSlashAction[] = [
        {
          type: 'vote-empire-payload',
          payload: slashingPayload,
        },
      ];

      // Create 5 checkpoint voters with slashing actions using the helper
      const voters = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createHACheckpointVoterWithSlasher(slot, { nodeId: `ha-node-${i + 1}` }, mockSlashingActions),
        ),
      );

      // All 5 voters try to enqueue slashing votes simultaneously
      const results = await Promise.all(
        voters.map(({ voter }) => {
          const [_governancePromise, slashingPromise] = voter.enqueueVotes();
          return slashingPromise;
        }),
      );

      // Count successes - enqueueVotes returns true/false, never throws
      const successCount = results.filter(r => r === true).length;
      const failureCount = results.filter(r => r === false).length;

      // Exactly one should succeed, others should fail due to HA coordination
      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);

      // Verify database state - exactly one slashing vote duty should be recorded
      const duties = await getDutyRecords(slot);
      const slashingDuties = duties.filter(d => d.duty_type === 'SLASHING_VOTE');
      expect(slashingDuties).toHaveLength(1);
    });

    it('should allow different sequencers to vote on slashing for different slots', async () => {
      const slashingPayload = EthAddress.random();

      // Create mock slashing actions
      const mockSlashingActions: ProposerSlashAction[] = [
        {
          type: 'vote-empire-payload',
          payload: slashingPayload,
        },
      ];

      // Create 5 checkpoint voters for different slots with slashing actions
      const slots = Array.from({ length: 5 }, (_, i) => SlotNumber(200 + i));
      const voters = await Promise.all(
        slots.map((slot, i) =>
          createHACheckpointVoterWithSlasher(slot, { nodeId: `ha-node-${i + 1}` }, mockSlashingActions),
        ),
      );

      // Each voter enqueues slashing votes for their respective slot
      const results = await Promise.all(
        voters.map(({ voter }) => {
          const [_governancePromise, slashingPromise] = voter.enqueueVotes();
          return slashingPromise;
        }),
      );

      // All 5 should succeed since they're for different slots
      results.forEach(result => {
        expect(result).toBe(true);
      });

      // Verify database - each slot should have exactly one slashing duty
      for (const slot of slots) {
        const duties = await getDutyRecords(slot);
        const slashingDuties = duties.filter(d => d.duty_type === 'SLASHING_VOTE');
        expect(slashingDuties).toHaveLength(1);
      }
    });

    it('should coordinate both governance and slashing votes independently and send them correctly', async () => {
      const slot = SlotNumber(300);
      const governancePayload = EthAddress.random();
      const slashingPayload = EthAddress.random();

      const mockSlashingActions: ProposerSlashAction[] = [
        {
          type: 'vote-empire-payload',
          payload: slashingPayload,
        },
      ];

      // Create 5 checkpoint voters that will vote on both governance and slashing
      const voters = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createHACheckpointVoterWithSlasher(
            slot,
            {
              nodeId: `ha-node-${i + 1}`,
              governanceProposerPayload: governancePayload,
            },
            mockSlashingActions,
          ),
        ),
      );

      // All voters enqueue both governance and slashing votes
      const allResults = await Promise.all(
        voters.map(async ({ voter }) => {
          const [governancePromise, slashingPromise] = voter.enqueueVotes();
          return {
            governance: await governancePromise,
            slashing: await slashingPromise,
          };
        }),
      );

      // Count successes for each vote type
      const governanceSuccessCount = allResults.filter(r => r.governance === true).length;
      const slashingSuccessCount = allResults.filter(r => r.slashing === true).length;

      // Exactly one should succeed for each vote type (they're independent)
      expect(governanceSuccessCount).toBe(1);
      expect(slashingSuccessCount).toBe(1);

      // Verify database state - both types of duties should be recorded independently
      const duties = await getDutyRecords(slot);
      const governanceDuties = duties.filter(d => d.duty_type === 'GOVERNANCE_VOTE');
      const slashingDuties = duties.filter(d => d.duty_type === 'SLASHING_VOTE');

      expect(governanceDuties).toHaveLength(1);
      expect(slashingDuties).toHaveLength(1);

      // The winning nodes might be different for each duty type (HA coordination is per-duty)
      // This is the realistic scenario where different nodes might win different duties
      const governanceWinner = governanceDuties[0].node_id;
      const slashingWinner = slashingDuties[0].node_id;
      expect(['ha-node-1', 'ha-node-2', 'ha-node-3', 'ha-node-4', 'ha-node-5']).toContain(governanceWinner);
      expect(['ha-node-1', 'ha-node-2', 'ha-node-3', 'ha-node-4', 'ha-node-5']).toContain(slashingWinner);
    });

    it('should handle HA coordination across multiple slots with multiple nodes', async () => {
      // Test a more realistic scenario: multiple nodes competing for duties across multiple slots
      // This verifies that HA coordination works correctly at scale
      const governancePayload = EthAddress.random();
      const slashingPayload = EthAddress.random();

      const mockSlashingActions: ProposerSlashAction[] = [
        {
          type: 'vote-empire-payload',
          payload: slashingPayload,
        },
      ];

      // Create 3 nodes that will compete for duties across 3 slots
      const slots = [SlotNumber(400), SlotNumber(401), SlotNumber(402)];
      const nodeIds = ['ha-node-1', 'ha-node-2', 'ha-node-3'];

      // Each node tries to sign duties for all 3 slots
      const allVoters: Array<{ slot: SlotNumber; nodeId: string; voter: CheckpointVoter }> = [];
      for (const slot of slots) {
        for (const nodeId of nodeIds) {
          const { voter } = await createHACheckpointVoterWithSlasher(
            slot,
            { nodeId, governanceProposerPayload: governancePayload },
            mockSlashingActions,
          );
          allVoters.push({ slot, nodeId, voter });
        }
      }

      // All voters try to enqueue votes
      const results = await Promise.all(
        allVoters.map(async ({ voter }) => {
          const [govPromise, slashPromise] = voter.enqueueVotes();
          return { governance: await govPromise, slashing: await slashPromise };
        }),
      );

      // For each slot, exactly one node should win each duty type
      for (const slot of slots) {
        const duties = await getDutyRecords(slot);
        const governanceDuties = duties.filter(d => d.duty_type === 'GOVERNANCE_VOTE');
        const slashingDuties = duties.filter(d => d.duty_type === 'SLASHING_VOTE');

        expect(governanceDuties).toHaveLength(1);
        expect(slashingDuties).toHaveLength(1);
      }

      // Verify overall: 3 slots × 2 duty types = 6 total successful enqueues
      const totalSuccesses =
        results.filter(r => r.governance === true).length + results.filter(r => r.slashing === true).length;
      expect(totalSuccesses).toBe(6);
    });
  });

  describe('Publisher request sending', () => {
    it('should verify that different nodes with different signed duties can all send their requests', async () => {
      // This tests the realistic HA scenario:
      // - Node A wins governance vote signing
      // - Node B wins slashing vote signing
      // - Both can independently send their enqueued requests to L1
      const slot = SlotNumber(450);
      const governancePayload = EthAddress.random();
      const slashingPayload = EthAddress.random();

      const mockSlashingActions: ProposerSlashAction[] = [{ type: 'vote-empire-payload', payload: slashingPayload }];

      // Node A: only governance (no slashing actions)
      const { voter: voterA, publisher: publisherA } = await createHACheckpointVoterWithSlasher(
        slot,
        { nodeId: 'ha-node-A', governanceProposerPayload: governancePayload },
        [],
      );

      // Node B: only slashing (no governance payload)
      const { voter: voterB, publisher: publisherB } = await createHACheckpointVoterWithSlasher(
        slot,
        { nodeId: 'ha-node-B', governanceProposerPayload: undefined }, // No governance
        mockSlashingActions,
      );

      // Clear mock calls before enqueuing to have clean assertions
      governanceProposerContract.createSignalRequestWithSignature.mockClear();
      slashingProposerContract.createSignalRequestWithSignature.mockClear();
      forwardSpy.mockClear();

      // Mock forwardSpy to simulate successful L1 transaction submission
      forwardSpy.mockResolvedValue({
        receipt: {
          transactionHash: '0x123',
          status: 'success',
          logs: [],
        } as any,
        errorMsg: undefined,
      });

      // Each node enqueues their respective votes
      const [govA] = voterA.enqueueVotes();
      const [, slashB] = voterB.enqueueVotes();

      const governanceResult = await govA;
      const slashingResult = await slashB;

      // Both should succeed since they're not competing
      expect(governanceResult).toBe(true);
      expect(slashingResult).toBe(true);

      // Verify different nodes handled different duties in the database
      const duties = await getDutyRecords(slot);
      const governanceDuty = duties.find(d => d.duty_type === 'GOVERNANCE_VOTE');
      const slashingDuty = duties.find(d => d.duty_type === 'SLASHING_VOTE');

      expect(governanceDuty?.node_id).toBe('ha-node-A');
      expect(slashingDuty?.node_id).toBe('ha-node-B');

      // Now verify that each publisher can actually send its enqueued request
      // Node A sends governance vote
      const resultA = await publisherA.sendRequests();
      expect(resultA).toBeDefined();

      // Verify Node A's publisher created the governance signal with signature
      expect(governanceProposerContract.createSignalRequestWithSignature).toHaveBeenCalledTimes(1);
      expect(governanceProposerContract.createSignalRequestWithSignature).toHaveBeenCalledWith(
        governancePayload.toString(),
        slot,
        expect.any(Number), // chainId
        expect.any(String), // signerAddress
        expect.any(Function), // signer function
      );

      // Verify Node A's request was sent to L1 via Multicall3.forward
      expect(forwardSpy).toHaveBeenCalledTimes(1);

      // Clear the forward spy for Node B
      forwardSpy.mockClear();

      // Node B sends slashing vote
      const resultB = await publisherB.sendRequests();
      expect(resultB).toBeDefined();

      // Verify Node B's publisher created the slashing signal with signature
      expect(slashingProposerContract.createSignalRequestWithSignature).toHaveBeenCalledTimes(1);
      expect(slashingProposerContract.createSignalRequestWithSignature).toHaveBeenCalledWith(
        slashingPayload.toString(),
        slot,
        expect.any(Number), // chainId
        expect.any(String), // signerAddress
        expect.any(Function), // signer function
      );

      // Verify Node B's request was sent to L1 via Multicall3.forward
      expect(forwardSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle concurrent attempts with proper error handling (no exceptions)', async () => {
      const slot = SlotNumber(500);
      const governancePayload = EthAddress.random();

      // Create 3 voters
      const voters = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          createHACheckpointVoter(slot, {
            nodeId: `ha-node-${i + 1}`,
            governanceProposerPayload: governancePayload,
          }),
        ),
      );

      // Try to enqueue votes - should never throw, always return boolean
      const results = await Promise.all(
        voters.map(({ voter }) => {
          const [governancePromise, _slashingPromise] = voter.enqueueVotes();
          return governancePromise;
        }),
      );

      // Count successes - enqueueVotes returns true/false, never throws
      const successCount = results.filter(r => r === true).length;
      const failureCount = results.filter(r => r === false).length;

      // One should succeed, others should gracefully fail (return false, not throw)
      expect(successCount).toBe(1);
      expect(failureCount).toBe(2);

      // Verify only one duty was recorded in the database
      const duties = await getDutyRecords(slot);
      expect(duties.filter(d => d.duty_type === 'GOVERNANCE_VOTE')).toHaveLength(1);
    });
  });
});
