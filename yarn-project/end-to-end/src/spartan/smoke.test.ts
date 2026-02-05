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

describe('smoke test', () => {
  const logger = createLogger('e2e:spartan-test:smoke');
  let aztecNode: AztecNode;
  let ethereumClient: ViemPublicClient;
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
  });

  it('should be able to get node enr', async () => {
    const info = await aztecNode.getNodeInfo();

    logger.info(`info: ${JSON.stringify(info)}`);
    expect(info).toBeDefined();
    expect(info.enr).toMatch(/^enr:-/);
  });

  it(
    'should have a committee',
    async () => {
      const nodeInfo = await aztecNode.getNodeInfo();
      const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
      const epochDuration = await rollup.getEpochDuration();
      logger.info(`Epoch duration: ${epochDuration}`);
      logger.info('Waiting for committee');
      await retryUntil(
        async () => {
          const slot = await rollup.getSlotNumber();
          logger.info(`Slot: ${slot}`);

          const committee = await rollup.getCurrentEpochCommittee();
          return committee !== undefined;
        },
        'committee',
        60 * 60 * 2, // wait up to 2 hours, since if the rollup was just deployed there will be no committee for 2 epochs
        12, // 12 seconds between each check
      );
    },
    60 * 60 * 1000,
  );

  it('should have mined a checkpoint', async () => {
    const nodeInfo = await aztecNode.getNodeInfo();
    const rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
    logger.info('Waiting for the first checkpoint to mine');
    await retryUntil(
      async () => {
        const checkpointNumber = await rollup.getCheckpointNumber();
        return checkpointNumber >= CheckpointNumber(1);
      },
      'get checkpoint number',
      60 * 60, // This should be quick since the committee is already formed (see test case above)
      12,
    );
  });

  it('can add chaos', async () => {
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
  });

  it('can establish all port forwards used by spartan tests', async () => {
    // This test validates all the port forwarding mechanisms used across the spartan test suite.
    // It helps build confidence that the K8s infrastructure is accessible before running more complex tests.

    const testForwardProcesses: ChildProcess[] = [];
    const RETRY_TIMEOUT_SECONDS = 60 * 60; // 1 hour
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
  });
});
