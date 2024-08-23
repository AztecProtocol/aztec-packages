import { PublicKernelType, type ServerCircuitProver } from '@aztec/circuit-types';
import { ClientIvcProof, Fr, PrivateKernelEmptyInputData, TubeInputs } from '@aztec/circuits.js';
import {
  makeAvmCircuitInputs,
  makeBaseParityInputs,
  makeBaseRollupInputs,
  makeBlockMergeRollupInputs,
  makeBlockRootRollupInputs,
  makeHeader,
  makeMergeRollupInputs,
  makePublicKernelCircuitPrivateInputs,
  makePublicKernelTailCircuitPrivateInputs,
  makeRootParityInputs,
  makeRootRollupInputs,
} from '@aztec/circuits.js/testing';
import { getConfigFromMappings } from '@aztec/foundation/config';
import { createAndStartTelemetryClient, telemetryClientConfigMappings } from '@aztec/telemetry-client/start';

import { parentPort, workerData } from 'node:worker_threads';

import { MemoryProvingQueue } from '../../prover-agent/memory-proving-queue.js';
import { createProvingJobSourceServer } from '../../prover-agent/rpc.js';

interface Options {
  jobGenerateIntervalMs?: number;
  jobTimeoutMs?: number;
  jobPollingIntervalMs?: number;
  port?: number;
}

const {
  jobGenerateIntervalMs = 500,
  port = 8080,
  jobTimeoutMs = 60_000,
  jobPollingIntervalMs = 1000,
} = workerData as Options;

const client = await createAndStartTelemetryClient(getConfigFromMappings(telemetryClientConfigMappings));
const queue = new MemoryProvingQueue(client, jobTimeoutMs, jobPollingIntervalMs);

const server = createProvingJobSourceServer(queue);

queue.start();
server.start(port);

parentPort?.postMessage('ready');

setInterval(enqueueRandomJob, jobGenerateIntervalMs);

type MakeInputs = {
  [K in keyof ServerCircuitProver]: () => Parameters<ServerCircuitProver[K]>[0];
};

const makeInputs: MakeInputs = {
  getAvmProof: makeAvmCircuitInputs,
  getBaseParityProof: makeBaseParityInputs,
  getBaseRollupProof: makeBaseRollupInputs,
  getRootParityProof: makeRootParityInputs,
  getBlockMergeRollupProof: makeBlockMergeRollupInputs,
  getBlockRootRollupProof: makeBlockRootRollupInputs,
  getEmptyPrivateKernelProof: () =>
    new PrivateKernelEmptyInputData(makeHeader(), Fr.random(), Fr.random(), Fr.random()),
  getEmptyTubeProof: () => new PrivateKernelEmptyInputData(makeHeader(), Fr.random(), Fr.random(), Fr.random()),
  getMergeRollupProof: makeMergeRollupInputs,
  getPublicKernelProof: () => {
    return {
      type: PublicKernelType.APP_LOGIC,
      inputs: makePublicKernelCircuitPrivateInputs(),
    };
  },
  getPublicTailProof: () => {
    return {
      type: PublicKernelType.TAIL,
      inputs: makePublicKernelTailCircuitPrivateInputs(),
    };
  },
  getRootRollupProof: makeRootRollupInputs,
  getTubeProof: () => new TubeInputs(ClientIvcProof.empty()),
};

function enqueueRandomJob() {
  const jobName = Object.keys(makeInputs)[
    Math.floor(Math.random() * Object.keys(makeInputs).length)
  ] as keyof MakeInputs;
  const inputs = makeInputs[jobName]();
  queue[`${jobName}`](inputs as any).catch(() => {});
}
