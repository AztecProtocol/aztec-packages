import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import type { MonitoredSlashPayload } from '../slashing/index.js';
import { type AztecNodeAdmin, AztecNodeAdminApiSchema } from './aztec-node-admin.js';
import type { SequencerConfig } from './configs.js';
import type { ProverConfig } from './prover-client.js';
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

  it('getSlasherMonitoredPayloads', async () => {
    const payloads: MonitoredSlashPayload[] = await context.client.getSlasherMonitoredPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      payloadAddress: expect.any(EthAddress),
      validators: expect.arrayContaining([expect.any(EthAddress)]),
      amounts: expect.arrayContaining([expect.any(BigInt)]),
      offenses: [],
      observedAtSeconds: expect.any(Number),
      totalAmount: expect.any(BigInt),
    });
  });
});

class MockAztecNodeAdmin implements AztecNodeAdmin {
  constructor() {}
  setConfig(config: Partial<SequencerConfig & ProverConfig & SlasherConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  getSlasherMonitoredPayloads(): Promise<MonitoredSlashPayload[]> {
    return Promise.resolve([
      {
        payloadAddress: EthAddress.random(),
        validators: [EthAddress.random(), EthAddress.random()],
        amounts: [100n, 200n],
        offenses: [],
        observedAtSeconds: Math.floor(Date.now() / 1000),
        totalAmount: 300n,
      },
    ]);
  }
  getConfig(): Promise<SequencerConfig & ProverConfig & SlasherConfig & { maxTxPoolSize: number }> {
    return Promise.resolve({
      realProofs: false,
      proverTestDelayType: 'fixed',
      proverTestDelayMs: 100,
      proverTestDelayFactor: 1,
      proverAgentCount: 1,
      coinbase: EthAddress.random(),
      maxTxPoolSize: 1000,
      slashPayloadTtlSeconds: 1000,
      slashPruneEnabled: false,
      slashPrunePenalty: 1000n,
      slashPruneMaxPenalty: 1000n,
      slashInvalidBlockEnabled: false,
      slashInvalidBlockPenalty: 1000n,
      slashInvalidBlockMaxPenalty: 1000n,
      slashInactivityEnabled: false,
      slashInactivityCreateTargetPercentage: 0.5,
      slashInactivitySignalTargetPercentage: 0.5,
      slashInactivityCreatePenalty: 1000n,
      slashInactivityMaxPenalty: 1000n,
      slashProposerRoundPollingIntervalSeconds: 1000,
      slasherPrivateKey: new SecretValue<string | undefined>(undefined),
      secondsBeforeInvalidatingBlockAsCommitteeMember: 0,
      secondsBeforeInvalidatingBlockAsNonCommitteeMember: 0,
      slashProposeInvalidAttestationsPenalty: 1000n,
      slashProposeInvalidAttestationsMaxPenalty: 1000n,
      slashAttestDescendantOfInvalidPenalty: 1000n,
      slashAttestDescendantOfInvalidMaxPenalty: 1000n,
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
