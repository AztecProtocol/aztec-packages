import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type Offense, OffenseType } from '../slashing/index.js';
import { type AztecNodeAdmin, AztecNodeAdminApiSchema } from './aztec-node-admin.js';
import type { SequencerConfig } from './configs.js';
import type { ProverConfig } from './prover-client.js';
import type { ValidatorClientFullConfig } from './server.js';
import type { SlasherConfig } from './slasher.js';

describe('AztecNodeAdminApiSchema', () => {
  let handler: MockAztecNodeAdmin;
  let context: JsonRpcTestContext<AztecNodeAdmin>;

  const tested: Set<string> = new Set();

  beforeEach(async () => {
    handler = new MockAztecNodeAdmin();
    context = await createJsonRpcTestSetup<AztecNodeAdmin>(handler, AztecNodeAdminApiSchema);
  });

  afterEach(() => {
    tested.add(/^AztecNodeAdminApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(AztecNodeAdminApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getConfig', async () => {
    const config = await context.client.getConfig();
    expect(config).toMatchObject({
      coinbase: expect.any(EthAddress),
      maxPendingTxCount: expect.any(Number),
    });
  });

  it('setConfig', async () => {
    await context.client.setConfig({ coinbase: EthAddress.random() });
  });

  it('startSnapshotUpload', async () => {
    await context.client.startSnapshotUpload('foo');
  });

  it('rollbackTo', async () => {
    await context.client.rollbackTo(123);
  });

  it('pauseSync', async () => {
    await context.client.pauseSync();
  });

  it('resumeSync', async () => {
    await context.client.resumeSync();
  });

  it('pauseSequencer', async () => {
    await context.client.pauseSequencer();
  });

  it('resumeSequencer', async () => {
    await context.client.resumeSequencer();
  });

  it('getSlashOffenses', async () => {
    const offenses = await context.client.getSlashOffenses('all');
    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({
      validator: expect.any(EthAddress),
      amount: expect.any(BigInt),
      offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      epochOrSlot: expect.any(BigInt),
    });
  });

  it('reloadKeystore', async () => {
    await context.client.reloadKeystore();
  });
});

class MockAztecNodeAdmin implements AztecNodeAdmin {
  constructor() {}
  setConfig(config: Partial<SequencerConfig & ProverConfig & SlasherConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  getSlashOffenses(): Promise<Offense[]> {
    return Promise.resolve([
      {
        validator: EthAddress.random(),
        amount: 1000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 1n,
      },
    ]);
  }
  getConfig(): Promise<
    ValidatorClientFullConfig & SequencerConfig & ProverConfig & SlasherConfig & { maxPendingTxCount: number }
  > {
    return Promise.resolve({
      realProofs: false,
      proverTestDelayType: 'fixed',
      proverTestDelayMs: 100,
      proverTestDelayFactor: 1,
      cancelJobsOnStop: false,
      enqueueConcurrency: 10,
      proverAgentCount: 1,
      coinbase: EthAddress.random(),
      maxPendingTxCount: 1000,
      slashAmountSmall: 500n,
      slashAmountMedium: 1000n,
      slashAmountLarge: 2000n,
      slashValidatorsAlways: [],
      slashValidatorsNever: [],
      slashDataWithholdingPenalty: 1000n,
      slashDataWithholdingToleranceSlots: 3,
      slashInactivityTargetPercentage: 0.5,
      slashInactivityConsecutiveEpochThreshold: 1,
      slashInactivityPenalty: 1000n,
      slashBroadcastedInvalidBlockPenalty: 1n,
      slashBroadcastedInvalidCheckpointProposalPenalty: 1n,
      slashDuplicateProposalPenalty: 1n,
      slashDuplicateAttestationPenalty: 1n,
      slashAttestInvalidCheckpointProposalPenalty: 1000n,
      secondsBeforeInvalidatingBlockAsCommitteeMember: 0,
      secondsBeforeInvalidatingBlockAsNonCommitteeMember: 0,
      slashProposeInvalidAttestationsPenalty: 1000n,
      slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty: 1000n,
      slashOffenseExpirationRounds: 4,
      slashMaxPayloadSize: 50,
      slashUnknownPenalty: 1000n,
      slashGracePeriodL2Slots: 0,
      slashExecuteRoundsLookBack: 4,

      disableValidator: false,
      disabledValidators: [],
      attestationPollingIntervalMs: 1000,
      disableTransactions: false,
      haSigningEnabled: false,
      nodeId: 'test-node-id',
      pollingIntervalMs: 50,
      signingTimeoutMs: 3000,
      maxStuckDutiesAgeMs: 72000,
      dataStoreMapSizeKb: 128 * 1024 * 1024,
      l1ChainId: 1,
      rollupAddress: EthAddress.random(),
    });
  }
  startSnapshotUpload(_location: string): Promise<void> {
    return Promise.resolve();
  }
  rollbackTo(_targetBlockNumber: number, _force?: boolean, _resumeSync?: boolean): Promise<void> {
    return Promise.resolve();
  }
  pauseSync(): Promise<void> {
    return Promise.resolve();
  }
  resumeSync(): Promise<void> {
    return Promise.resolve();
  }
  pauseSequencer(): Promise<void> {
    return Promise.resolve();
  }
  resumeSequencer(): Promise<void> {
    return Promise.resolve();
  }
  reloadKeystore(): Promise<void> {
    return Promise.resolve();
  }
}
