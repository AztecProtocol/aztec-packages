import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';
import { createPublicClient, fallback, http } from 'viem';

import { startPortForwardForEthereum, startPortForwardForRPC } from './k8s.js';

/**
 * Snapshot of chain state captured during setup for comparison in teardown.
 */
export interface ChainHealthSnapshot {
  blockNumber: number;
  checkpointNumber: CheckpointNumber;
  timestamp: number;
}

/**
 * Pre-flight and post-flight health checks for the Aztec network.
 *
 * Use in beforeAll/afterAll to validate the chain is healthy before tests run
 * and verify it continued progressing during the test.
 *
 * @example
 * ```typescript
 * const health = new ChainHealth(config.NAMESPACE, logger);
 *
 * beforeAll(async () => {
 *   await health.setup();
 * });
 *
 * afterAll(async () => {
 *   await health.teardown();
 * });
 * ```
 */
export class ChainHealth {
  private namespace: string;
  private logger: Logger;
  private snapshot?: ChainHealthSnapshot;

  constructor(namespace: string, logger: Logger) {
    this.namespace = namespace;
    this.logger = logger;
  }

  /**
   * Pre-flight health check. Validates chain is in a testable state and captures
   * initial state for comparison in teardown.
   *
   * Checks performed:
   * - Node is reachable and returns valid info
   * - ENR exists
   * - L1 is accessible
   * - At least 1 L2 block has been mined
   * - Committee exists
   * - At least 1 checkpoint has been reached
   *
   * @throws Error if any health check fails
   */
  async setup(): Promise<void> {
    const processes: ChildProcess[] = [];

    try {
      // Establish temporary connections
      const { process: rpcProcess, port: rpcPort } = await startPortForwardForRPC(this.namespace);
      processes.push(rpcProcess);

      const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(this.namespace);
      processes.push(ethProcess);

      const nodeUrl = `http://127.0.0.1:${rpcPort}`;
      const ethereumUrl = `http://127.0.0.1:${ethPort}`;

      // Create clients
      const node = createAztecNodeClient(nodeUrl);

      // Check 1: Node is reachable
      let nodeInfo;
      try {
        nodeInfo = await node.getNodeInfo();
      } catch (err) {
        throw new Error(`Health check failed: Node is not reachable at ${nodeUrl}. Error: ${err}`);
      }

      if (!nodeInfo) {
        throw new Error('Health check failed: Node returned empty info');
      }

      // Check 2: ENR exists (P2P identity)
      if (!nodeInfo.enr || !nodeInfo.enr.startsWith('enr:-')) {
        throw new Error(`Health check failed: Invalid or missing ENR. Got: ${nodeInfo.enr}`);
      }

      // Check 3: L1 is accessible
      const chain = createEthereumChain([ethereumUrl], nodeInfo.l1ChainId);
      const ethereumClient: ViemPublicClient = createPublicClient({
        chain: chain.chainInfo,
        transport: fallback([http(ethereumUrl, { batch: false })]),
      });

      try {
        await ethereumClient.getBlockNumber();
      } catch (err) {
        throw new Error(`Health check failed: L1 is not accessible at ${ethereumUrl}. Error: ${err}`);
      }

      // Check 4: At least 1 L2 block mined
      let l2BlockNumber;
      try {
        l2BlockNumber = await node.getBlockNumber();
      } catch (err) {
        throw new Error(`Health check failed: Could not get L2 block number. Error: ${err}`);
      }

      if (l2BlockNumber < 1) {
        throw new Error(`Health check failed: No L2 blocks mined yet. Block number: ${l2BlockNumber}`);
      }

      // Check 5: Committee exists
      const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);

      let committee;
      try {
        committee = await rollup.getCurrentEpochCommittee();
      } catch (err) {
        throw new Error(`Health check failed: Could not get committee. Error: ${err}`);
      }

      if (!committee || committee.length === 0) {
        throw new Error('Health check failed: No committee exists. Validators may not be registered yet.');
      }

      // Check 6: At least 1 checkpoint reached
      let checkpointNumber;
      try {
        checkpointNumber = await rollup.getCheckpointNumber();
      } catch (err) {
        throw new Error(`Health check failed: Could not get checkpoint number. Error: ${err}`);
      }

      if (checkpointNumber < CheckpointNumber(1)) {
        throw new Error(
          `Health check failed: No checkpoint reached yet. Checkpoint number: ${checkpointNumber}. ` +
            'The proving pipeline may not have completed a proof yet.',
        );
      }

      // Capture snapshot for teardown comparison
      this.snapshot = {
        blockNumber: l2BlockNumber,
        checkpointNumber,
        timestamp: Date.now(),
      };

      this.logger.info('Pre-flight health check passed');
    } finally {
      processes.forEach(p => p.kill());
    }
  }

  /**
   * Post-flight health check. Verifies the chain continued progressing during the test.
   *
   * For tests that ran longer than the threshold, checks:
   * - Block number increased since setup
   * - Checkpoint number increased since setup
   *
   * For shorter tests, skips the check.
   *
   * @throws Error if chain did not progress
   */
  async teardown(): Promise<void> {
    if (!this.snapshot) {
      this.logger.warn('Teardown called without setup - skipping chain progress check');
      return;
    }

    const processes: ChildProcess[] = [];
    // Minimum test duration to check chain progression
    const PROGRESS_CHECK_THRESHOLD_SECONDS = 120;

    try {
      const elapsedSeconds = Math.round((Date.now() - this.snapshot.timestamp) / 1000);

      // Skip progress check for short tests
      if (elapsedSeconds <= PROGRESS_CHECK_THRESHOLD_SECONDS) {
        this.logger.info('Post-flight health check passed (skipped progress check - test too short)');
        return;
      }

      const { process: rpcProcess, port: rpcPort } = await startPortForwardForRPC(this.namespace);
      processes.push(rpcProcess);

      const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(this.namespace);
      processes.push(ethProcess);

      const nodeUrl = `http://127.0.0.1:${rpcPort}`;
      const ethereumUrl = `http://127.0.0.1:${ethPort}`;
      const node = createAztecNodeClient(nodeUrl);

      // Check that block number increased
      let currentBlockNumber;
      try {
        currentBlockNumber = await node.getBlockNumber();
      } catch (err) {
        throw new Error(`Teardown health check failed: Could not get block number. Error: ${err}`);
      }

      if (currentBlockNumber <= this.snapshot.blockNumber) {
        throw new Error(
          `Chain did not progress during test. ` +
            `Block number at setup: ${this.snapshot.blockNumber}, ` +
            `Block number at teardown: ${currentBlockNumber}, ` +
            `Elapsed time: ${elapsedSeconds}s. ` +
            `The chain may have stalled during the test.`,
        );
      }

      // Check that checkpoint number increased
      const nodeInfo = await node.getNodeInfo();
      const chain = createEthereumChain([ethereumUrl], nodeInfo.l1ChainId);
      const ethereumClient: ViemPublicClient = createPublicClient({
        chain: chain.chainInfo,
        transport: fallback([http(ethereumUrl, { batch: false })]),
      });

      const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
      let currentCheckpoint;
      try {
        currentCheckpoint = await rollup.getCheckpointNumber();
      } catch (err) {
        throw new Error(`Teardown health check failed: Could not get checkpoint number. Error: ${err}`);
      }

      if (currentCheckpoint <= this.snapshot.checkpointNumber) {
        throw new Error(
          `Proving pipeline did not progress during test. ` +
            `Checkpoint at setup: ${this.snapshot.checkpointNumber}, ` +
            `Checkpoint at teardown: ${currentCheckpoint}, ` +
            `Elapsed time: ${elapsedSeconds}s. ` +
            `The proving pipeline may have stalled during the test.`,
        );
      }

      this.logger.info('Post-flight health check passed');
    } finally {
      processes.forEach(p => p.kill());
      this.snapshot = undefined;
    }
  }
}
