import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type AztecNodeAdmin, AztecNodeAdminApiSchema } from './aztec-node-admin.js';
import type { SequencerConfig } from './configs.js';
import type { ProverConfig } from './prover-client.js';

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

  it('setConfig', async () => {
    await context.client.setConfig({ coinbase: EthAddress.random() });
  });

  it('flushTxs', async () => {
    await context.client.flushTxs();
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
  setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  flushTxs(): Promise<void> {
    return Promise.resolve();
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
