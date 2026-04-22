import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type AztecNodeDebug, AztecNodeDebugApiSchema, type L1TxDelayerRole } from './aztec-node-debug.js';

describe('AztecNodeDebugApiSchema', () => {
  let handler: MockAztecNodeDebug;
  let context: JsonRpcTestContext<AztecNodeDebug>;

  const tested: Set<string> = new Set();

  beforeEach(async () => {
    handler = new MockAztecNodeDebug();
    context = await createJsonRpcTestSetup<AztecNodeDebug>(handler, AztecNodeDebugApiSchema);
  });

  afterEach(() => {
    tested.add(/^AztecNodeDebugApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(AztecNodeDebugApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('mineBlock', async () => {
    await context.client.mineBlock();
  });

  it('pauseNextL1TxUntilTimestamp', async () => {
    await context.client.pauseNextL1TxUntilTimestamp('sequencer', 12345n);
  });

  it('pauseNextL1TxUntilBlock', async () => {
    await context.client.pauseNextL1TxUntilBlock('prover', 42n);
  });

  it('cancelNextL1Tx', async () => {
    await context.client.cancelNextL1Tx('sequencer');
  });

  it('getSentL1TxHashes', async () => {
    await expect(context.client.getSentL1TxHashes('sequencer')).resolves.toEqual(['0xabcd']);
  });

  it('getCancelledL1Txs', async () => {
    await expect(context.client.getCancelledL1Txs('prover')).resolves.toEqual(['0xdeadbeef']);
  });
});

class MockAztecNodeDebug implements AztecNodeDebug {
  mineBlock(): Promise<void> {
    return Promise.resolve();
  }
  pauseNextL1TxUntilTimestamp(_role: L1TxDelayerRole, _timestamp: bigint): Promise<void> {
    return Promise.resolve();
  }
  pauseNextL1TxUntilBlock(_role: L1TxDelayerRole, _blockNumber: bigint): Promise<void> {
    return Promise.resolve();
  }
  cancelNextL1Tx(_role: L1TxDelayerRole): Promise<void> {
    return Promise.resolve();
  }
  getSentL1TxHashes(_role: L1TxDelayerRole): Promise<`0x${string}`[]> {
    return Promise.resolve(['0xabcd']);
  }
  getCancelledL1Txs(_role: L1TxDelayerRole): Promise<`0x${string}`[]> {
    return Promise.resolve(['0xdeadbeef']);
  }
}
