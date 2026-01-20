import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { INITIAL_CHECKPOINT_NUMBER } from '@aztec/constants';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import {
  applyValidatorKill,
  awaitCheckpointNumber,
  getGitProjectRoot,
  getSequencers,
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForRPC,
  uninstallChaosMesh,
} from './utils.js';

const logger = createLogger('e2e:spartan-test:validator-ha');

describe('validator ha', () => {
  jest.setTimeout(60 * 60 * 1000);

  const config = setupEnvironment(process.env);
  const { NAMESPACE } = config;
  const forwardProcesses: ChildProcess[] = [];
  let spartanDir: string;
  let rollupCheatCodes: RollupCheatCodes;

  const KILL_ROUNDS = 5;
  const KILL_PERCENT = 50; // kill 50% of sequencers
  const KILL_DURATION_SEC = 120;
  const GRACE_DURATION_SEC = 15;

  beforeAll(async () => {
    spartanDir = `${getGitProjectRoot()}/spartan`;

    // Setup port forwards
    const { process: rpcProcess, port: rpcPort } = await startPortForwardForRPC(NAMESPACE);
    forwardProcesses.push(rpcProcess);
    const nodeUrl = `http://127.0.0.1:${rpcPort}`;

    const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(NAMESPACE);
    forwardProcesses.push(ethProcess);
    const ethereumHost = `http://127.0.0.1:${ethPort}`;

    // Setup rollup cheat codes for monitoring
    const node = createAztecNodeClient(nodeUrl);
    const ethCheatCodes = new EthCheatCodesWithState([ethereumHost], new DateProvider());
    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, await node.getNodeInfo().then(n => n.l1ContractAddresses));
    await awaitCheckpointNumber(rollupCheatCodes, CheckpointNumber(INITIAL_CHECKPOINT_NUMBER + 1), 60 * 60, logger);
  });

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it('survives random validator kills without stalling block production', async () => {
    const sequencers = await getSequencers(NAMESPACE);
    logger.info(`Found ${sequencers.length} validators in namespace ${NAMESPACE}`);

    for (let round = 1; round <= KILL_ROUNDS; round++) {
      const chaosName = `${NAMESPACE}-validator-kill-${round}`;
      try {
        const tipsBefore = await rollupCheatCodes.getTips();
        logger.info(`Round ${round}/${KILL_ROUNDS}: Killing ${KILL_PERCENT}% of validators`);
        logger.info(`Current checkpoint: ${tipsBefore.pending}`);

        await applyValidatorKill({
          instanceName: chaosName,
          namespace: NAMESPACE,
          spartanDir,
          logger,
          values: {
            'validatorKill.percent': KILL_PERCENT,
            'validatorKill.duration': `${KILL_DURATION_SEC}s`,
            'global.chaosResourceNamespace': NAMESPACE,
          },
        });

        logger.info(`Waiting for pod chaos experiment to end`);

        await sleep((KILL_DURATION_SEC + GRACE_DURATION_SEC) * 1000);

        const tipsAfter = await rollupCheatCodes.getTips();
        logger.info(`Round ${round} complete: checkpoint advanced from ${tipsBefore.pending} to ${tipsAfter.pending}`);
        expect(tipsAfter.pending).toBeGreaterThan(tipsBefore.pending);
      } finally {
        await uninstallChaosMesh(chaosName, NAMESPACE, logger);
      }
    }

    logger.info(`All ${KILL_ROUNDS} rounds completed`);
  });
});
