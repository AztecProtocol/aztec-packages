import { type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { GovernanceContract, createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';

import { getAztecBin, isK8sConfig, runProjectScript, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_via_cli');

describe('upgrade via cli', () => {
  let pxe: PXE;
  const forwardProcesses: ChildProcess[] = [];
  let ETHEREUM_HOSTS: string[];
  beforeAll(async () => {
    let PXE_URL: string;
    if (isK8sConfig(config)) {
      {
        const { process, port } = await startPortForward({
          resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
          namespace: config.NAMESPACE,
          containerPort: config.CONTAINER_PXE_PORT,
        });
        forwardProcesses.push(process);
        PXE_URL = `http://127.0.0.1:${port}`;
      }
      {
        const { process, port } = await startPortForward({
          resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
          namespace: config.NAMESPACE,
          containerPort: config.CONTAINER_ETHEREUM_PORT,
        });
        forwardProcesses.push(process);
        ETHEREUM_HOSTS = [`http://127.0.0.1:${port}`];
      }
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

    debugLogger.info('got node info', info);
    // spartan/scripts/upgrade_rollup_with_lock.sh \
    // --aztec-bin $AZTEC_BIN \
    // --registry $registry \
    // --address $ADDRESS \
    // --deposit-amount 200000000000000000000000 \
    // --mint

    const chain = createEthereumChain(ETHEREUM_HOSTS, info.l1ChainId);
    const { walletClient: l1WalletClient, publicClient: l1PublicClient } = createL1Clients(
      ETHEREUM_HOSTS,
      config.L1_ACCOUNT_MNEMONIC,
      chain.chainInfo,
    );

    const governance = new GovernanceContract(
      info.l1ContractAddresses.governanceAddress.toString(),
      l1PublicClient,
      l1WalletClient,
    );
    const { minimumVotes: voteAmount } = await governance.getConfiguration();

    await runProjectScript(
      'spartan/scripts/upgrade_rollup_with_lock.sh',
      [
        '--aztec-bin',
        getAztecBin(),
        '--registry',
        info.l1ContractAddresses.registryAddress.toString(),
        '--address',
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        '--deposit-amount',
        '200000000000000000000000',
        '--mint',
      ],
      debugLogger,
    );
  });
});
