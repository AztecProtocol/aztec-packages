import { type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { RegistryContract, createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';

import { getAztecBin, isK8sConfig, runProjectScript, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

// technically it doesn't require a k8s env, but it doesn't seem we're keeping the "local" versions of the spartan scripts up to date
// and I didn't want to plumb through the config and test this with the local scripts.
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}

const debugLogger = createLogger('e2e:spartan-test:upgrade_via_cli');

describe('upgrade via cli', () => {
  let pxe: PXE;
  const forwardProcesses: ChildProcess[] = [];
  let ETHEREUM_HOSTS: string;
  let MNEMONIC: string;
  beforeAll(async () => {
    let PXE_URL: string;
    MNEMONIC = config.L1_ACCOUNT_MNEMONIC;
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
      ETHEREUM_HOSTS = `http://127.0.0.1:${port}`;
    }
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
  });

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it(
    'should be able to get node enr',
    async () => {
      const info = await pxe.getNodeInfo();

      const chain = createEthereumChain([ETHEREUM_HOSTS], info.l1ChainId);
      const l1Client = createExtendedL1Client([ETHEREUM_HOSTS], MNEMONIC, chain.chainInfo);

      const registry = new RegistryContract(l1Client, info.l1ContractAddresses.registryAddress.toString());
      const oldNumberOfVersions = await registry.getNumberOfVersions();

      const exitCode = await runProjectScript(
        'spartan/scripts/upgrade_rollup_with_cli.sh',
        ['--aztec-bin', getAztecBin(), '--registry', info.l1ContractAddresses.registryAddress.toString()],
        debugLogger,
        {
          MNEMONIC,
          ETHEREUM_HOSTS,
          L1_CHAIN_ID: info.l1ChainId.toString(),
          LOG_JSON: 'false',
          LOG_LEVEL: 'debug',
        },
      );
      expect(exitCode).toBe(0);

      const newNumberOfVersions = await registry.getNumberOfVersions();
      expect(newNumberOfVersions).toBe(oldNumberOfVersions + 1);
    },
    6 * config.AZTEC_PROOF_SUBMISSION_WINDOW * config.AZTEC_SLOT_DURATION * 1000,
  );
});
