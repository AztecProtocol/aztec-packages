import { EpochNumber } from '@aztec/foundation/branded-types';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { createNamespacedSafeJsonRpcServer, startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import type { ProofUri, ProvingJob } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { makeInputsUri, makeRandomProvingJobId } from './fixtures.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';
import { ProvingJobBrokerSchema, createProvingJobBrokerClient } from './rpc.js';

describe('ProvingBroker RPC', () => {
  it.each([true, false])('handles compression (isSmall=%s)', async (isSmall: boolean) => {
    const broker = new ProvingBroker(new InMemoryBrokerDatabase(), {
      proverBrokerJobTimeoutMs: 10000,
      proverBrokerPollIntervalMs: 100,
      proverBrokerJobMaxRetries: 3,
      proverBrokerMaxEpochsToKeepResultsFor: 1,
      proverBrokerDebugReplayEnabled: false,
    });
    await broker.start();

    const rpcServer = createNamespacedSafeJsonRpcServer({
      proverBroker: [broker, ProvingJobBrokerSchema],
    });

    const httpServer = await startHttpRpcServer(rpcServer, { host: '127.0.0.1' });

    try {
      const client = createProvingJobBrokerClient(
        `http://127.0.0.1:${httpServer.port}`,
        {},
        makeUndiciFetch(new Agent()),
      );

      // Small URI stays below threshold (uncompressed), large URI exceeds it (compressed)
      const inputsUri = isSmall ? makeInputsUri() : (randomBytes(2000).toString('hex') as ProofUri);
      const job: ProvingJob = {
        id: makeRandomProvingJobId(EpochNumber(1)),
        type: ProvingRequestType.PARITY_BASE,
        inputsUri,
        epochNumber: EpochNumber(1),
      };

      await client.enqueueProvingJob(job);

      const retrievedJob = await client.getProvingJob({ allowList: [ProvingRequestType.PARITY_BASE] });
      expect(retrievedJob?.job.id).toBe(job.id);
      expect(retrievedJob?.job.inputsUri).toBe(inputsUri);
    } finally {
      await broker.stop();
      httpServer.close();
    }
  });
});
