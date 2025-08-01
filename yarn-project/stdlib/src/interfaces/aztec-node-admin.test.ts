import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

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
});

class MockAztecNodeAdmin implements AztecNodeAdmin {
  constructor() {}
  setConfig(config: Partial<SequencerConfig & ProverConfig & SlasherConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
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
