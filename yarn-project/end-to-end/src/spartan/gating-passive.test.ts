import { EthCheatCodes, createCompatibleClient, sleep } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { expect, jest } from '@jest/globals';

import { RollupCheatCodes } from '../../../aztec.js/src/utils/cheat_codes.js';
import {
  applyBootNodeFailure,
  applyNetworkShaping,
  applyValidatorKill,
  awaitL2BlockNumber,
  enableValidatorDynamicBootNode,
  getConfig,
  isK8sConfig,
  restartBot,
  startPortForward,
} from './utils.js';

const config = getConfig(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}
const {
  NAMESPACE,
  HOST_PXE_PORT,
  HOST_ETHEREUM_PORT,
  CONTAINER_PXE_PORT,
  CONTAINER_ETHEREUM_PORT,
  SPARTAN_DIR,
  INSTANCE_NAME,
} = config;
const debugLogger = createDebugLogger('aztec:spartan-test:reorg');

describe('a test that passively observes the network in the presence of network chaos', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const ETHEREUM_HOST = `http://127.0.0.1:${HOST_ETHEREUM_PORT}`;
  const PXE_URL = `http://127.0.0.1:${HOST_PXE_PORT}`;
  // 50% is the max that we expect to miss
  const MAX_MISSED_SLOT_PERCENT = 0.5;

  it('survives network chaos', async () => {
    await startPortForward({
      resource: 'svc/spartan-aztec-network-pxe',
      namespace: NAMESPACE,
      containerPort: CONTAINER_PXE_PORT,
      hostPort: HOST_PXE_PORT,
    });
    await startPortForward({
      resource: 'svc/spartan-aztec-network-ethereum',
      namespace: NAMESPACE,
      containerPort: CONTAINER_ETHEREUM_PORT,
      hostPort: HOST_ETHEREUM_PORT,
    });
    const client = await createCompatibleClient(PXE_URL, debugLogger);
    const ethCheatCodes = new EthCheatCodes(ETHEREUM_HOST);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await client.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

    // make it so the validator will use its peers to bootstrap
    await enableValidatorDynamicBootNode(INSTANCE_NAME, NAMESPACE, SPARTAN_DIR, debugLogger);

    // restart the bot to ensure that it's not affected by the previous test
    await restartBot(NAMESPACE, debugLogger);

    // wait for the chain to build at least 1 epoch's worth of blocks
    // note, don't forget that normally an epoch doesn't need epochDuration worth of blocks,
    // but here we do double duty:
    // we want a handful of blocks, and we want to pass the epoch boundary
    await awaitL2BlockNumber(rollupCheatCodes, epochDuration, 60 * 5, debugLogger);

    let deploymentOutput: string = '';
    deploymentOutput = await applyNetworkShaping({
      valuesFile: 'network-requirements.yaml',
      namespace: NAMESPACE,
      spartanDir: SPARTAN_DIR,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    deploymentOutput = await applyBootNodeFailure({
      durationSeconds: 60 * 60 * 24,
      namespace: NAMESPACE,
      spartanDir: SPARTAN_DIR,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    await restartBot(NAMESPACE, debugLogger);

    const rounds = 3;
    for (let i = 0; i < rounds; i++) {
      debugLogger.info(`Round ${i + 1}/${rounds}`);
      deploymentOutput = await applyValidatorKill({
        namespace: NAMESPACE,
        spartanDir: SPARTAN_DIR,
        logger: debugLogger,
      });
      debugLogger.info(deploymentOutput);
      debugLogger.info(`Waiting for 1 epoch to pass`);
      const controlTips = await rollupCheatCodes.getTips();
      await sleep(Number(epochDuration * slotDuration) * 1000);
      const newTips = await rollupCheatCodes.getTips();

      const expectedPending =
        controlTips.pending + BigInt(Math.floor((1 - MAX_MISSED_SLOT_PERCENT) * Number(epochDuration)));
      expect(newTips.pending).toBeGreaterThan(expectedPending);
      // calculate the percentage of slots missed
      const perfectPending = controlTips.pending + BigInt(Math.floor(Number(epochDuration)));
      const missedSlots = Number(perfectPending) - Number(newTips.pending);
      const missedSlotsPercentage = (missedSlots / Number(epochDuration)) * 100;
      debugLogger.info(`Missed ${missedSlots} slots, ${missedSlotsPercentage.toFixed(2)}%`);
    }
  });
});
