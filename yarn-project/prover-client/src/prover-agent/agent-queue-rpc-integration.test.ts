import { ProvingJobSourceSchema, type ServerCircuitProver } from '@aztec/circuit-types';
import { ClientIvcProof } from '@aztec/circuits.js';
import { TubeInputs } from '@aztec/circuits.js/rollup';
import {
  makeAvmCircuitInputs,
  makeBaseParityInputs,
  makeBlockMergeRollupInputs,
  makeBlockRootRollupInputs,
  makeEmptyBlockRootRollupInputs,
  makeMergeRollupInputs,
  makePrivateBaseRollupInputs,
  makePublicBaseRollupInputs,
  makeRootParityInputs,
  makeRootRollupInputs,
  makeSingleTxBlockRootRollupInputs,
} from '@aztec/circuits.js/testing';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { type SafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { getTelemetryClient } from '@aztec/telemetry-client';

import getPort from 'get-port';

import { MockProver } from '../test/mock_prover.js';
import { MemoryProvingQueue } from './memory-proving-queue.js';
import { ProverAgent } from './prover-agent.js';
import { createProvingJobSourceServer } from './rpc.js';

describe('Prover agent <-> queue integration', () => {
  let queue: MemoryProvingQueue;
  let queueRpcServer: SafeJsonRpcServer;
  let agent: ProverAgent;
  let prover: ServerCircuitProver;

  type MakeInputs = {
    [K in keyof ServerCircuitProver]: () => Parameters<ServerCircuitProver[K]>[0];
  };

  const makeInputs: MakeInputs = {
    getAvmProof: makeAvmCircuitInputs,
    getBaseParityProof: makeBaseParityInputs,
    getPrivateBaseRollupProof: makePrivateBaseRollupInputs,
    getPublicBaseRollupProof: makePublicBaseRollupInputs,
    getRootParityProof: makeRootParityInputs,
    getBlockMergeRollupProof: makeBlockMergeRollupInputs,
    getEmptyBlockRootRollupProof: makeEmptyBlockRootRollupInputs,
    getBlockRootRollupProof: makeBlockRootRollupInputs,
    getSingleTxBlockRootRollupProof: makeSingleTxBlockRootRollupInputs,
    getMergeRollupProof: makeMergeRollupInputs,
    getRootRollupProof: makeRootRollupInputs,
    getTubeProof: () => new TubeInputs(ClientIvcProof.empty()),
  };

  beforeEach(async () => {
    prover = new MockProver();

    queue = new MemoryProvingQueue(getTelemetryClient(), 100, 10);
    queue.start();
    const port = await getPort();
    queueRpcServer = createProvingJobSourceServer(queue);
    queueRpcServer.start(port);

    agent = new ProverAgent(prover, 1, 10);
    const queueRpcClient = createSafeJsonRpcClient(`http://127.0.0.1:${port}`, ProvingJobSourceSchema);
    agent.start(queueRpcClient);
  });

  afterEach(async () => {
    await agent.stop();
    await queueRpcServer.stop();
    await queue.stop();
  });

  // TODO: This test hangs instead of failing when the Inputs are not registered on the RPC wrapper
  it.each(Object.entries(makeInputs))('can call %s over JSON-RPC', async (fnName, makeInputs) => {
    const resp = await queue[fnName as keyof ServerCircuitProver](makeInputs() as any);
    expect(resp).toBeDefined();
  });
});
