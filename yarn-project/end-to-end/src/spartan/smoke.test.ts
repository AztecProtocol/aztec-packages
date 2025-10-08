import { type AztecNode, createAztecNodeClient, retryUntil } from '@aztec/aztec.js';
import { RollupContract, type ViemPublicClient, createEthereumChain } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';
import { createPublicClient, fallback, http } from 'viem';

import {
  getGitProjectRoot,
  installChaosMeshChart,
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForRPC,
} from './utils.js';

const config = setupEnvironment(process.env);

describe('smoke test', () => {
  const logger = createLogger('e2e:spartan-test:smoke');
  let aztecNode: AztecNode;
  let ethereumClient: ViemPublicClient;
  const forwardProcesses: ChildProcess[] = [];

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    const { process: ethereumProcess, port: ethereumPort } = await startPortForwardForEthereum(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    forwardProcesses.push(ethereumProcess);
    const nodeUrl = `http://127.0.0.1:${aztecRpcPort}`;

    aztecNode = createAztecNodeClient(nodeUrl);
    const nodeInfo = await aztecNode.getNodeInfo();

    const ethereumUrl = `http://127.0.0.1:${ethereumPort}`;
    const chain = createEthereumChain([ethereumUrl], nodeInfo.l1ChainId);
    ethereumClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback([http(ethereumUrl)]),
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
        60 * 60, // wait up to 1 hour, since if the rollup was just deployed there will be no committee for 2 epochs
        12, // 12 seconds between each check
      );
    },
    60 * 60 * 1000,
  );

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
});
