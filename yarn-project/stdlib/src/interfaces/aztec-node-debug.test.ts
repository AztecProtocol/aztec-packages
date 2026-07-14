import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { type AztecNodeDebug, AztecNodeDebugApiSchema } from './aztec-node-debug.js';

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

  it('prove', async () => {
    expect(await context.client.prove()).toEqual(7);
    expect(await context.client.prove(CheckpointNumber(3))).toEqual(3);
  });

  it('warpL2TimeAtLeastTo', async () => {
    await context.client.warpL2TimeAtLeastTo(1234567890);
  });

  it('warpL2TimeAtLeastBy', async () => {
    await context.client.warpL2TimeAtLeastBy(42);
  });

  it('registerContractFunctionSignatures', async () => {
    await context.client.registerContractFunctionSignatures(['test()']);
  });
});

class MockAztecNodeDebug implements AztecNodeDebug {
  mineBlock(): Promise<void> {
    return Promise.resolve();
  }

  prove(upToCheckpoint?: CheckpointNumber): Promise<CheckpointNumber> {
    return Promise.resolve(upToCheckpoint ?? CheckpointNumber(7));
  }

  warpL2TimeAtLeastTo(_targetTimestamp: number): Promise<void> {
    return Promise.resolve();
  }

  warpL2TimeAtLeastBy(_duration: number): Promise<void> {
    return Promise.resolve();
  }

  registerContractFunctionSignatures(_signatures: string[]): Promise<void> {
    return Promise.resolve();
  }
}
