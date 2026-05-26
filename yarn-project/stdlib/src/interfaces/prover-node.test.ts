import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import type { L2Tips } from '../block/l2_block_source.js';
import { type ProverNodeApi, ProverNodeApiSchema, type ProverNodeJob } from './prover-node.js';
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

  getJobs(): Promise<ProverNodeJob[]> {
    const startedAt = 1_767_225_600;
    const statuses: ProverNodeJob['status'][] = [
      'initialized',
      'processing',
      'awaiting-prover',
      'publishing-proof',
      'completed',
      'failed',
    ];
    return Promise.resolve(
      statuses.map((status, index) => ({
        uuid: `uuid${index + 1}`,
        status,
        epochNumber: 10,
        startedAt,
        stateTransitions: [
          { state: 'initialized', startedAt },
          { state: status, startedAt: startedAt + 1 },
        ],
        checkpointCount: 1,
        totalCheckpointCount: 2,
        blockCount: 3,
        totalBlockCount: 4,
        txCount: 5,
        totalTxCount: 6,
      })),
    );
  }

  startProof(epochNumber: number): Promise<void> {
    expect(typeof epochNumber).toBe('number');
    return Promise.resolve();
  }
}
