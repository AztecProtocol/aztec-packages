import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { makeBaseParityInputs } from '@aztec/stdlib/testing';

import { MockAgent } from '../test/mock_agent.js';
import { MockProver } from '../test/mock_prover.js';
import { makeRandomProvingJobId } from './fixtures.js';
import { InlineProofStore } from './proof_store/inline_proof_store.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';

describe('ProvingBroker Benchmarks', () => {
  let broker: ProvingBroker;
  let prover: MockProver;
  let agent: MockAgent;
  let proofStore: InlineProofStore;
  const brokerIntervalMs = 100;
  const agentPollIntervalMs = 100;
  const maxRetries = 2;

  beforeEach(async () => {
    // Initialize the broker with in-memory database
    const database = new InMemoryBrokerDatabase();
    broker = new ProvingBroker(database, {
      proverBrokerJobTimeoutMs: 1000,
      proverBrokerPollIntervalMs: brokerIntervalMs,
      proverBrokerJobMaxRetries: maxRetries,
      proverBrokerMaxEpochsToKeepResultsFor: 1,
    });

    // Initialize the mock prover
    prover = new MockProver();

    // Initialize the proof store
    proofStore = new InlineProofStore();

    // Initialize the mock agent
    agent = new MockAgent(broker, proofStore, prover, [ProvingRequestType.BASE_PARITY], agentPollIntervalMs);

    // Start both broker and agent
    await broker.start();
    agent.start();
  });

  afterEach(async () => {
    agent.stop();
    await broker.stop();
  });

  it('should process a base parity proof request', async () => {
    // Create test inputs
    const inputs = makeBaseParityInputs();
    const inputsUri = await proofStore.saveProofInput(makeRandomProvingJobId(), ProvingRequestType.BASE_PARITY, inputs);

    // Submit the job
    const jobId = makeRandomProvingJobId();
    await broker.enqueueProvingJob({
      id: jobId,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri,
      epochNumber: 1,
    });

    // Wait for the job to be processed
    const startTime = Date.now();
    let status;
    while (Date.now() - startTime < 5000) {
      // 5 second timeout
      status = await broker.getProvingJobStatus(jobId);
      if (status.status === 'fulfilled' || status.status === 'rejected') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Verify the result
    expect(status).toBeDefined();
    expect(status?.status).toBe('fulfilled');
    if (status?.status === 'fulfilled') {
      expect(status.value).toBeDefined();
    }
  });

  it('should benchmark base parity proof processing time', async () => {
    // Create test inputs
    const inputs = makeBaseParityInputs();
    const inputsUri = await proofStore.saveProofInput(makeRandomProvingJobId(), ProvingRequestType.BASE_PARITY, inputs);

    // Submit the job and measure time
    const jobId = makeRandomProvingJobId();
    const startTime = performance.now();

    await broker.enqueueProvingJob({
      id: jobId,
      type: ProvingRequestType.BASE_PARITY,
      inputsUri,
      epochNumber: 1,
    });

    // Wait for the job to be processed
    let status;
    while (performance.now() - startTime < 5000) {
      // 5 second timeout
      status = await broker.getProvingJobStatus(jobId);
      if (status.status === 'fulfilled' || status.status === 'rejected') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // Verify the result
    expect(status).toBeDefined();
    expect(status?.status).toBe('fulfilled');
    if (status?.status === 'fulfilled') {
      expect(status.value).toBeDefined();
    }

    // Report the benchmark results
    expect(processingTime).toBeLessThan(5000); // Ensure it completes within timeout
    expect(processingTime).toBeGreaterThan(0); // Ensure it takes some time
  });
});
