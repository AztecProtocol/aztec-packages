import { type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import type { ChildProcess } from 'child_process';
import { createPublicClient, getAddress, getContract, http } from 'viem';
import { foundry } from 'viem/chains';

import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:smoke');

describe('smoke test', () => {
  let pxe: PXE;
  const forwardProcesses: ChildProcess[] = [];
  beforeAll(async () => {
    let PXE_URL: string;
    if (isK8sConfig(config)) {
      const { process, port } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
      });
      forwardProcesses.push(process);
      PXE_URL = `http://127.0.0.1:${port}`;
    } else {
      PXE_URL = config.PXE_URL;
    }
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
  });

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it('should be able to get node enr', async () => {
    const info = await pxe.getNodeInfo();
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
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http('http://localhost:8545'),
    });
    // docs:end:get_node_info_pub_client

    const rollupContract = getContract({
      address: getAddress(info.l1ContractAddresses.rollupAddress.toString()),
      abi: RollupAbi,
      client: publicClient,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [pendingBlockNum, pendingArchive, provenBlockNum, provenArchive, myArchive, provenEpochNumber] =
      await rollupContract.read.status([60n]);
    // console.log('pendingBlockNum', pendingBlockNum.toString());
    // console.log('pendingArchive', pendingArchive.toString());
    // console.log('provenBlockNum', provenBlockNum.toString());
    // console.log('provenArchive', provenArchive.toString());
    // console.log('myArchive', myArchive.toString());
    // console.log('provenEpochNumber', provenEpochNumber.toString());
  });
});
