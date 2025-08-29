import type { PXE } from '@aztec/aztec.js';
import { RollupContract, getPublicClient } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';
import { foundry } from 'viem/chains';

import { startCompatiblePXE } from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

const config = setupEnvironment(process.env);

describe('smoke test', () => {
  const logger = createLogger('e2e:spartan-test:smoke');
  let pxe: PXE;
  const forwardProcesses: ChildProcess[] = [];
  let cleanup: undefined | (() => Promise<void>);

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const { process, port } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(process);
    const rpcUrl = `http://127.0.0.1:${port}`;
    ({ pxe, cleanup } = await startCompatiblePXE(rpcUrl, config.AZTEC_REAL_PROOFS, logger));
  });

  it('should be able to get node enr', async () => {
    const info = await pxe.getNodeInfo();

    logger.info(`info: ${JSON.stringify(info)}`);
    expect(info).toBeDefined();
    // expect enr to be a string starting with 'enr:-'
    expect(info.enr).toMatch(/^enr:-/);
  });

  // Leaving this test skipped commented out because it requires the ethereum node
  // to be running and forwarded, e.g.
  // kubectl port-forward -n smoke service/spartan-aztec-network-eth-execution 8545:8545
  // also because it assumes foundry.

  it.skip('should be able to get rollup info', async () => {
    // docs:start:get_node_info_pub_client
    const info = await pxe.getNodeInfo();
    const publicClient = getPublicClient({
      l1RpcUrls: ['http://localhost:8545'],
      l1ChainId: foundry.id,
    });
    // docs:end:get_node_info_pub_client

    const rollupContract = new RollupContract(publicClient, info.l1ContractAddresses.rollupAddress);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [pendingBlockNum, pendingArchive, provenBlockNum, provenArchive, myArchive, provenEpochNumber] =
      await rollupContract.status(60n);
    // console.log('pendingBlockNum', pendingBlockNum.toString());
    // console.log('pendingArchive', pendingArchive.toString());
    // console.log('provenBlockNum', provenBlockNum.toString());
    // console.log('provenArchive', provenArchive.toString());
    // console.log('myArchive', myArchive.toString());
    // console.log('provenEpochNumber', provenEpochNumber.toString());
  });
});
