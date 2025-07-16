import { sleep } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { type TestWallets, performTransfers, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import {
  applyProverFailure,
  deleteResourceByLabel,
  isK8sConfig,
  setupEnvironment,
  startPortForward,
  waitForResourceByLabel,
} from './utils.js';

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}
const { NAMESPACE, CONTAINER_PXE_PORT, CONTAINER_ETHEREUM_PORT, SPARTAN_DIR } = config;
const debugLogger = createLogger('e2e:spartan-test:reorg');

async function checkBalances(testWallets: TestWallets, mintAmount: bigint, totalAmountTransferred: bigint) {
  for (const w of testWallets.wallets) {
    expect(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate()).toBe(
      mintAmount - totalAmountTransferred,
    );
  }

  expect(
    await testWallets.tokenAdminWallet.methods.balance_of_public(testWallets.recipientWallet.getAddress()).simulate(),
  ).toBe(totalAmountTransferred * BigInt(testWallets.wallets.length));
}

describe('reorg test', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const MINT_AMOUNT = 2_000_000n;
  const SETUP_EPOCHS = 2;
  const TRANSFER_AMOUNT = 1n;
  let ETHEREUM_HOSTS: string;
  let PXE_URL: string;
  const forwardProcesses: ChildProcess[] = [];

  let testWallets: TestWallets;

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it('survives a reorg', async () => {
    const { process: pxeProcess, port: pxePort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: NAMESPACE,
      containerPort: CONTAINER_PXE_PORT,
    });
    forwardProcesses.push(pxeProcess);
    PXE_URL = `http://127.0.0.1:${pxePort}`;

    const { process: ethProcess, port: ethPort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
      namespace: NAMESPACE,
      containerPort: CONTAINER_ETHEREUM_PORT,
    });
    forwardProcesses.push(ethProcess);
    ETHEREUM_HOSTS = `http://127.0.0.1:${ethPort}`;
    testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, debugLogger);
    const rollupCheatCodes = new RollupCheatCodes(
      new EthCheatCodesWithState([ETHEREUM_HOSTS]),
      await testWallets.pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

    await performTransfers({
      testWallets,
      rounds: Number(epochDuration) * SETUP_EPOCHS,
      transferAmount: TRANSFER_AMOUNT,
      logger: debugLogger,
    });
    await checkBalances(testWallets, MINT_AMOUNT, TRANSFER_AMOUNT * epochDuration * BigInt(SETUP_EPOCHS));

    // get the tips before the reorg
    const { pending: preReorgPending, proven: preReorgProven } = await rollupCheatCodes.getTips();

    // kill the provers
    const stdout = await applyProverFailure({
      namespace: NAMESPACE,
      spartanDir: SPARTAN_DIR,
      durationSeconds: Number(epochDuration * slotDuration) * 2,
      logger: debugLogger,
    });
    debugLogger.info(stdout);

    // We only need 2 epochs for a reorg to be triggered, but 3 gives time for the bot to be restarted and the chain to re-stabilize
    // TODO(#9613): why do we need to wait for 3 epochs?
    debugLogger.info(`Waiting for 3 epochs to pass`);
    await sleep(Number(epochDuration * slotDuration) * 3 * 1000);

    // TODO(#9327): begin delete
    // The bot must be restarted because the PXE does not handle reorgs without a restart.
    // When the issue is fixed, we can remove the following delete, wait, startPortForward, and setupTestWallets
    await deleteResourceByLabel({ resource: 'pods', namespace: NAMESPACE, label: 'app=pxe' });
    await sleep(30 * 1000);
    await waitForResourceByLabel({ resource: 'pods', namespace: NAMESPACE, label: 'app=pxe' });
    await sleep(30 * 1000);
    await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: NAMESPACE,
      containerPort: CONTAINER_PXE_PORT,
    });
    forwardProcesses.push(pxeProcess);
    PXE_URL = `http://127.0.0.1:${pxePort}`;
    testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, debugLogger);
    // TODO(#9327): end delete

    await performTransfers({
      testWallets,
      rounds: Number(epochDuration) * SETUP_EPOCHS,
      transferAmount: TRANSFER_AMOUNT,
      logger: debugLogger,
    });

    // expect the block height to be at least 4 epochs worth of slots
    const { pending: newPending, proven: newProven } = await rollupCheatCodes.getTips();
    expect(newPending).toBeGreaterThan(preReorgPending);
    expect(newPending).toBeGreaterThan(4 * Number(epochDuration));
    expect(newProven).toBeGreaterThan(preReorgProven);
    expect(newProven).toBeGreaterThan(3 * Number(epochDuration));
  });
});
