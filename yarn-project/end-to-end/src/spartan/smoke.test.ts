import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import type { ChildProcess } from 'child_process';
import { createPublicClient, fallback, http } from 'viem';

import {
  type ServiceEndpoint,
  getEthereumEndpoint,
  getGitProjectRoot,
  getRPCEndpoint,
  getSequencers,
  installChaosMeshChart,
  setupEnvironment,
  startPortForward,
  startPortForwardForEthereum,
  startPortForwardForRPC,
} from './utils.js';

const config = setupEnvironment(process.env);

// Smoke checks for a live k8s deployment: node ENR reachable, committee forms within the validator-set lag
// window, first checkpoint mined, Chaos Mesh injectable, and all spartan port-forward paths open.
// Runs against the namespace set in NAMESPACE; port-forwards to RPC and Ethereum endpoints.
describe('smoke test', () => {
  const logger = createLogger('e2e:spartan-test:smoke');
  let aztecNode: AztecNode;
  let ethereumClient: ViemPublicClient;
  let committeeTimeoutMs: number = 60 * 60 * 1000; // 1 hour default, overridden in beforeAll
  const endpoints: ServiceEndpoint[] = [];

  afterAll(() => {
    endpoints.forEach(e => e.process?.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    const ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint, ethEndpoint);

    aztecNode = createAztecNodeClient(rpcEndpoint.url);
    const nodeInfo = await aztecNode.getNodeInfo();

    const chain = createEthereumChain([ethEndpoint.url], nodeInfo.l1ChainId);
    ethereumClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback([http(ethEndpoint.url, { batch: false })]),
    });

    // Compute dynamic timeout for committee formation.
    // Committee forms after `lag` epochs; add 1 extra epoch as margin.
    const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
    const [epochDuration, slotDuration, lag] = await Promise.all([
      rollup.getEpochDuration(),
      rollup.getSlotDuration(),
      rollup.getLagInEpochsForValidatorSet(),
    ]);
    const epochSeconds = epochDuration * slotDuration;
    committeeTimeoutMs = (lag + 1) * epochSeconds * 1000;
    logger.info(
      `Epoch duration: ${epochDuration} slots, slot duration: ${slotDuration}s, validator set lag: ${lag} epochs, committee timeout: ${committeeTimeoutMs}ms`,
    );
  });

  it(
    'should be able to get node enr',
    async () => {
      const info = await aztecNode.getNodeInfo();

      logger.info(`info: ${JSON.stringify(info)}`);
      expect(info).toBeDefined();
      expect(info.enr).toMatch(/^enr:-/);
    },
    5 * 60 * 1000, // 5 minutes
  );

  it(
    'should have a committee',
    async () => {
      const nodeInfo = await aztecNode.getNodeInfo();
      const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
      const timeoutSeconds = committeeTimeoutMs / 1000;

      logger.info(`Waiting for committee (timeout: ${timeoutSeconds}s)`);

      await retryUntil(
        async () => {
          const slot = await rollup.getSlotNumber();
          logger.info(`Slot: ${slot}`);
          const committee = await rollup.getCurrentEpochCommittee();
          return committee !== undefined;
        },
        'committee',
        timeoutSeconds,
        12, // 12 seconds between each check
      );
    },
    committeeTimeoutMs,
  );

  it(
    'should have mined a checkpoint',
    async () => {
      const nodeInfo = await aztecNode.getNodeInfo();
      const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
      logger.info('Waiting for the first checkpoint to mine');
      await retryUntil(
        async () => {
          const checkpointNumber = await rollup.getCheckpointNumber();
          return checkpointNumber >= CheckpointNumber(1);
        },
        'get checkpoint number',
        20 * 60, // This should be quick since the committee is already formed (see test case above)
        12,
      );
    },
    20 * 60 * 1000, // 20 minutes
  );

  it(
    'can add chaos',
    async () => {
      const chaosValuesFile = process.env.CHAOS_SCENARIO_VALUES || 'prover-kill.yaml';
      const spartanDir = `${getGitProjectRoot()}/spartan`;
      logger.info(`Applying Chaos Mesh scenario: ${chaosValuesFile}`);
      await installChaosMeshChart({
        instanceName: 'smoke-chaos',
        targetNamespace: config.NAMESPACE,
        valuesFile: chaosValuesFile,
        helmChartDir: `${spartanDir}/aztec-chaos-scenarios`,
        logger,
      });
    },
    5 * 60 * 1000, // 5 minutes
  );

  it(
    'can establish all port forwards used by spartan tests',
    async () => {
      // This test validates all the port forwarding mechanisms used across the spartan test suite.
      // It helps build confidence that the K8s infrastructure is accessible before running more complex tests.

      const testForwardProcesses: ChildProcess[] = [];
      const RETRY_TIMEOUT_SECONDS = 30 * 60; // 30 minutes
      const RETRY_INTERVAL_SECONDS = 12;

      try {
        logger.info('Testing all port forwards...');

        const [rpcResult, ethResult, promResult, adminResult] = await Promise.all([
          // Test RPC port forward
          retryUntil(
            async () => {
              try {
                const { process: rpcProcess, port: rpcPort } = await startPortForwardForRPC(config.NAMESPACE);
                const rpcUrl = `http://127.0.0.1:${rpcPort}`;
                const testNode = createAztecNodeClient(rpcUrl);
                const nodeInfo = await testNode.getNodeInfo();
                if (nodeInfo?.enr?.startsWith('enr:-')) {
                  return { process: rpcProcess, port: rpcPort };
                }
                rpcProcess.kill();
                return undefined;
              } catch {
                return undefined;
              }
            },
            'RPC port forward',
            RETRY_TIMEOUT_SECONDS,
            RETRY_INTERVAL_SECONDS,
          ),

          // Test Ethereum port forward
          retryUntil(
            async () => {
              try {
                const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(config.NAMESPACE);
                const ethUrl = `http://127.0.0.1:${ethPort}`;
                const testEthClient = createPublicClient({ transport: http(ethUrl) });
                const blockNumber = await testEthClient.getBlockNumber();
                if (blockNumber >= 0n) {
                  return { process: ethProcess, port: ethPort, blockNumber };
                }
                ethProcess.kill();
                return undefined;
              } catch {
                return undefined;
              }
            },
            'Ethereum port forward',
            RETRY_TIMEOUT_SECONDS,
            RETRY_INTERVAL_SECONDS,
          ),

          // Test Prometheus port forward
          retryUntil(
            async () => {
              // Try metrics namespace first
              try {
                const result = await startPortForward({
                  resource: `svc/metrics-prometheus-server`,
                  namespace: 'metrics',
                  containerPort: 80,
                });
                return { ...result, namespace: 'metrics' };
              } catch {
                // Fall back to test namespace
                try {
                  const result = await startPortForward({
                    resource: `svc/prometheus-server`,
                    namespace: config.NAMESPACE,
                    containerPort: 80,
                  });
                  return { ...result, namespace: config.NAMESPACE };
                } catch {
                  return undefined;
                }
              }
            },
            'Prometheus port forward',
            RETRY_TIMEOUT_SECONDS,
            RETRY_INTERVAL_SECONDS,
          ),

          // Test validator admin port forward (uses dynamic discovery via label selectors)
          retryUntil(
            async () => {
              try {
                // Dynamically discover validator pods instead of hardcoding names
                const validators = await getSequencers(config.NAMESPACE);
                if (!validators.length) {
                  return undefined;
                }
                const result = await startPortForward({
                  resource: `pod/${validators[0]}`,
                  namespace: config.NAMESPACE,
                  containerPort: 8880,
                });
                return result;
              } catch {
                return undefined;
              }
            },
            'Validator admin port forward',
            RETRY_TIMEOUT_SECONDS,
            RETRY_INTERVAL_SECONDS,
          ),
        ]);

        testForwardProcesses.push(rpcResult.process, ethResult.process, promResult.process, adminResult.process);

        expect(rpcResult.port).toBeGreaterThan(0);
        logger.info(`RPC port forward OK on port ${rpcResult.port}`);

        expect(ethResult.port).toBeGreaterThan(0);
        logger.info(`Ethereum port forward OK on port ${ethResult.port}, block number: ${ethResult.blockNumber}`);

        expect(promResult.port).toBeGreaterThan(0);
        logger.info(`Prometheus port forward OK on port ${promResult.port} (${promResult.namespace} namespace)`);

        expect(adminResult.port).toBeGreaterThan(0);
        logger.info(`Validator admin port forward OK on port ${adminResult.port}`);

        logger.info('All port forward checks completed successfully');
      } finally {
        // Clean up all test port forwards
        for (const proc of testForwardProcesses) {
          proc.kill();
        }
      }
    },
    30 * 60 * 1000,
  ); // 30 minutes
});
