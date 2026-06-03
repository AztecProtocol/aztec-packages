import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import type { L2Tips } from '../block/l2_block_source.js';
import { type EpochProvingJobState, type ProverNodeApi, ProverNodeApiSchema } from './prover-node.js';
import type { WorldStateSyncStatus } from './world_state.js';

describe('ProvingNodeApiSchema', () => {
  let handler: MockProverNode;
  let context: JsonRpcTestContext<ProverNodeApi>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockProverNode();
    context = await createJsonRpcTestSetup<ProverNodeApi>(handler, ProverNodeApiSchema);
  });

  afterEach(() => {
    tested.add(/^ProvingNodeApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(ProverNodeApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getJobs', async () => {
    const jobs = await context.client.getJobs();
    const expected = await handler.getJobs();
    expect(jobs).toEqual(expected);
  });

  it('startProof', async () => {
    await context.client.startProof(BlockNumber(1));
  });

  it('getL2Tips', async () => {
    const result = await context.client.getL2Tips();
    const expectedTipId = {
      block: { number: 1, hash: `0x01` },
      checkpoint: { number: 1, hash: `0x01` },
    };
    expect(result).toEqual({
      proposed: { number: 1, hash: `0x01` },
      checkpointed: expectedTipId,
      proposedCheckpoint: expectedTipId,
      proven: expectedTipId,
      finalized: expectedTipId,
    });
  });

  it('getWorldStateSyncStatus', async () => {
    const response = await context.client.getWorldStateSyncStatus();
    expect(response).toEqual(await handler.getWorldStateSyncStatus());
  });
});

class MockProverNode implements ProverNodeApi {
  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    return Promise.resolve({
      finalizedBlockNumber: BlockNumber(1),
      latestBlockHash: '0x',
      latestBlockNumber: BlockNumber(1),
      oldestHistoricBlockNumber: BlockNumber(1),
      treesAreSynched: true,
    });
  }

  getL2Tips(): Promise<L2Tips> {
    const tipId = {
      block: { number: BlockNumber(1), hash: `0x01` },
      checkpoint: { number: CheckpointNumber(1), hash: `0x01` },
    };
    return Promise.resolve({
      proposed: { number: BlockNumber(1), hash: `0x01` },
      checkpointed: tipId,
      proposedCheckpoint: tipId,
      proven: tipId,
      finalized: tipId,
    });
  }

  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]> {
    return Promise.resolve([
      { uuid: 'uuid1', status: 'initialized', epochNumber: 10 },
      { uuid: 'uuid2', status: 'awaiting-checkpoints', epochNumber: 10 },
      { uuid: 'uuid3', status: 'awaiting-predecessor', epochNumber: 10 },
      { uuid: 'uuid4', status: 'publishing-proof', epochNumber: 10 },
      { uuid: 'uuid5', status: 'completed', epochNumber: 10 },
      { uuid: 'uuid6', status: 'superseded', epochNumber: 10 },
      { uuid: 'uuid7', status: 'failed', epochNumber: 10 },
    ]);
  }

  startProof(epochNumber: number): Promise<void> {
    expect(typeof epochNumber).toBe('number');
    return Promise.resolve();
  }
}
