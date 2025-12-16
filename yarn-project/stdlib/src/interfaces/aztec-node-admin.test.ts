import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type Offense, OffenseType, type SlashPayloadRound } from '../slashing/index.js';
import { type AztecNodeAdmin, AztecNodeAdminApiSchema } from './aztec-node-admin.js';
import type { SequencerConfig } from './configs.js';
import type { ProverConfig } from './prover-client.js';
import type { ValidatorClientConfig } from './server.js';
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
      maxTxPoolSize: expect.any(Number),
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

  it('getSlashPayloads', async () => {
    const payloads = await context.client.getSlashPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      address: expect.any(EthAddress),
      slashes: [
        {
          validator: expect.any(EthAddress),
          amount: 1000n,
          offenses: [{ offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, epochOrSlot: 1n }],
        },
      ],
      votes: 1n,
      round: 1n,
      timestamp: 1000n,
    } satisfies SlashPayloadRound);
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
});

class MockAztecNodeAdmin implements AztecNodeAdmin {
  constructor() {}
  setConfig(config: Partial<SequencerConfig & ProverConfig & SlasherConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  getSlashPayloads(): Promise<SlashPayloadRound[]> {
    return Promise.resolve([
      {
        address: EthAddress.random(),
        slashes: [
          {
            validator: EthAddress.random(),
            amount: 1000n,
            offenses: [
              {
                offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
                epochOrSlot: 1n,
              },
            ],
          },
        ],
        timestamp: 1000n,
        votes: 1n,
        round: 1n,
      },
    ]);
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
    ValidatorClientConfig & SequencerConfig & ProverConfig & SlasherConfig & { maxTxPoolSize: number }
  > {
    return Promise.resolve({
      realProofs: false,
      proverTestDelayType: 'fixed',
      proverTestDelayMs: 100,
      proverTestDelayFactor: 1,
      proverAgentCount: 1,
      coinbase: EthAddress.random(),
      maxTxPoolSize: 1000,
      slashAmountSmall: 500n,
      slashAmountMedium: 1000n,
      slashAmountLarge: 2000n,
      slashMinPenaltyPercentage: 0.1,
      slashMaxPenaltyPercentage: 3.0,
      slashValidatorsAlways: [],
      slashValidatorsNever: [],
      slashPrunePenalty: 1000n,
      slashDataWithholdingPenalty: 1000n,
      slashInactivityTargetPercentage: 0.5,
      slashInactivityConsecutiveEpochThreshold: 1,
      slashInactivityPenalty: 1000n,
      slashBroadcastedInvalidBlockPenalty: 1n,
      secondsBeforeInvalidatingBlockAsCommitteeMember: 0,
      secondsBeforeInvalidatingBlockAsNonCommitteeMember: 0,
      slashProposeInvalidAttestationsPenalty: 1000n,
      slashAttestDescendantOfInvalidPenalty: 1000n,
      slashOffenseExpirationRounds: 4,
      slashMaxPayloadSize: 50,
      slashUnknownPenalty: 1000n,
      slashGracePeriodL2Slots: 0,
      slashExecuteRoundsLookBack: 4,
      slasherClientType: 'tally' as const,
      disableValidator: false,
      disabledValidators: [],
      attestationPollingIntervalMs: 1000,
      validatorReexecute: true,
      validatorReexecuteDeadlineMs: 1000,
    });
  }
  startSnapshotUpload(_location: string): Promise<void> {
    return Promise.resolve();
  }
  rollbackTo(_targetBlockNumber: number): Promise<void> {
    return Promise.resolve();
  }
  pauseSync(): Promise<void> {
    return Promise.resolve();
  }
  resumeSync(): Promise<void> {
    return Promise.resolve();
  }
}
