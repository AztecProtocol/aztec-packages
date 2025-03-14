import { type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { type ViemWalletClient, createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import type { ChildProcess } from 'child_process';
import { type Account, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther } from 'viem/utils';

import { execHelmCommand, getChartDir, isK8sConfig, runAztecBin, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}

const debugLogger = createLogger('e2e:spartan-test:add-additional-validators');

describe('add additional validators', () => {
  let pxe: PXE;
  const forwardProcesses: ChildProcess[] = [];
  let ETHEREUM_HOSTS: string;
  beforeAll(async () => {
    let PXE_URL: string;
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

  const generateValidatorAddresses = (numberOfValidators: number) => {
    const keys: string[] = [];
    const accounts: Account[] = [];
    for (let i = 0; i < numberOfValidators; i++) {
      const key = generatePrivateKey();
      const account = privateKeyToAccount(key);
      keys.push(key);
      accounts.push(account);
    }
    return { keys, accounts };
  };

  // We assume that the base account is already funded
  const fundAccount = async (walletClient: ViemWalletClient, account: Account) => {
    await walletClient.sendTransaction({
      to: account.address,
      value: parseEther('100'),
    });
  };

  const addValidatorViaCli = async (rollupAddress: string, account: Account) => {
    const validatorAddress = account.address;

    const exitCode = await runAztecBin(
      [
        'add-l1-validator',
        '--validator',
        validatorAddress,
        '--mnemonic',
        config.L1_ACCOUNT_MNEMONIC,
        '--rollup',
        rollupAddress,
        '--l1-chain-id',
        '1337',
        '--l1-rpc-urls',
        ETHEREUM_HOSTS,
      ],
      debugLogger,
    );
    expect(exitCode).toBe(0);
  };

  /**
   * Deploy the additional validators using the helm chart
   * @param keys - The private keys of the validators to deploy
   */
  const deployAdditionalValidators = async (keys: string[], enr: string, registryAddress: string) => {
    await execHelmCommand({
      instanceName: 'add-val',
      namespace: config.NAMESPACE,
      helmChartDir: getChartDir(config.SPARTAN_DIR, 'add-validators'),
      values: {
        'aztec.image': `aztecprotocol/aztec:${config.AZTEC_DOCKER_TAG}`,
        'network.bootNodes': enr,
        'network.l1ExecutionUrl': `http://${config.INSTANCE_NAME}-aztec-network-eth-execution.${config.NAMESPACE}.svc.cluster.local:8545`,
        'network.l1ConsensusUrl': `http://${config.INSTANCE_NAME}-aztec-network-eth-beacon.${config.NAMESPACE}.svc.cluster.local:5052`,
        'network.registryAddress': registryAddress,
        'validator.privateKeys': keys,
        'validator.replicas': keys.length,
      },
      valuesFile: undefined,
      timeout: '15m',
    });
  };

  it(
    'should be able to add additional validators',
    async () => {
      const info = await pxe.getNodeInfo();
      if (!info.enr) {
        throw new Error('No ENR found for the boot node');
      }
      const chain = createEthereumChain([ETHEREUM_HOSTS], 1337);

      // Get the L1 client to interact with the registry contract
      const l1Clients = createL1Clients([ETHEREUM_HOSTS], config.L1_ACCOUNT_MNEMONIC, chain.chainInfo);

      // Generate new validators (2 in this example)
      const { keys, accounts } = generateValidatorAddresses(2);
      debugLogger.info(`Generated ${accounts.length} new validator accounts`, {
        addresses: accounts.map(a => a.address.toString()),
      });

      debugLogger.info(`Funding new validators`);
      for (const account of accounts) {
        await fundAccount(l1Clients.walletClient, account);
      }

      // Fund new validators
      debugLogger.info(`Adding validators via CLI`);
      for (const account of accounts) {
        await addValidatorViaCli(info.l1ContractAddresses.rollupAddress.toString(), account);
      }

      debugLogger.info(`Deploying additional validators`);
      await deployAdditionalValidators(keys, info.enr, info.l1ContractAddresses.registryAddress.toString());
    },
    6 * config.AZTEC_PROOF_SUBMISSION_WINDOW * config.AZTEC_SLOT_DURATION * 1000,
  );
});
