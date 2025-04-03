import { type PXE, createCompatibleClient, sleep } from '@aztec/aztec.js';
import { type ViemWalletClient, createEthereumChain, createL1Clients } from '@aztec/ethereum';
import type { EnvVar } from '@aztec/foundation/config';
import { createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';

import type { ChildProcess } from 'child_process';
import { type Account, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther } from 'viem/utils';

import {
  isK8sConfig,
  kubectlRun,
  readFromValuesFile,
  runAztecBin,
  runAztecBinWithOutput,
  setupEnvironment,
  startPortForward,
} from './utils.js';

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
  const deployAdditionalValidators = async (
    validatorAddresses: string[],
    keys: string[],
    enr: string,
    registryAddress: string,
    extraEnv: Partial<Record<EnvVar, string>>,
  ) => {
    const validatorContainers = [];
    for (let i = 0; i < validatorAddresses.length; i++) {
      const validator = await deployAdditionalValidator(
        i,
        validatorAddresses[i],
        keys[i],
        enr,
        registryAddress,
        extraEnv,
      );
      validatorContainers.push(validator);
    }
    return validatorContainers;
  };

  const deployAdditionalValidator = async (
    index: number,
    validatorAddress: string,
    key: string,
    enr: string,
    registryAddress: string,
    extraEnv: Partial<Record<EnvVar, string>>,
  ) => {
    return await kubectlRun(
      // Container name
      `additional-validator-${index}`,
      // Namespace
      config.NAMESPACE,
      // Image tag
      `aztecprotocol/aztec:${config.AZTEC_DOCKER_TAG}`,
      // Environment variables
      {
        // TODO: include in config
        ...extraEnv,
        LOG_LEVEL: 'debug',
        ETHEREUM_SLOT_DURATION: config.ETHEREUM_SLOT_DURATION.toString(),
        L1_CHAIN_ID: '1337',
        SEQ_MIN_TX_PER_BLOCK: '0',
        P2P_PEER_CHECK_INTERVAL_MS: '2000', // Faster heartbeat for faster discovery
      },
      // Command to run
      'sh',
      // Command arguments
      [
        '-c',
        `export POD_IP=$(hostname -i) && node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --node --archiver --sequencer --l1-rpc-urls http://${config.INSTANCE_NAME}-aztec-network-eth-execution.${config.NAMESPACE}.svc.cluster.local:8545 --l1-consensus-host-urls http://${config.INSTANCE_NAME}-aztec-network-eth-beacon.${config.NAMESPACE}.svc.cluster.local:5052 --sequencer.validatorPrivateKey ${key} --sequencer.coinbase ${validatorAddress} --p2p-enabled true --p2p.p2pIp $POD_IP --p2p.bootstrapNodes ${enr} --registry-address ${registryAddress}`,
      ],
    );
  };

  /**
   * Wait for the validators to be in the committee
   *
   * Will return true if the validators are found in the committee
   * Will log if the validators are found in the validators set
   *
   * @param accounts - The accounts of the validators to wait for
   * @param rollupAddress - The address of the rollup
   */
  const waitForValidatorsToBeInCommittee = async (validatorAddresses: string[], rollupAddress: string) => {
    const timeout = 2 * 60 * 1000; // 2 minutes
    await executeTimeout(
      async () => {
        while (true) {
          // Run the aztec info cli command to see if the validators are in the set or committee
          const { exitCode, output } = await runAztecBinWithOutput(
            ['debug-rollup', '--rollup', rollupAddress, '--l1-rpc-urls', ETHEREUM_HOSTS],
            debugLogger,
          );

          if (exitCode !== 0) {
            debugLogger.error(`Error running aztec info command`, {
              output,
            });
          }

          // Extract validators and committee from output
          const validatorsMatch = output.match(/Validators: (.*)/);
          const committeeMatch = output.match(/Committee: (.*)/);

          if (!validatorsMatch || !committeeMatch) {
            continue;
          }

          const validators = validatorsMatch[1].split(', ').map(addr => addr.toLowerCase());
          const committee = committeeMatch[1].split(', ').map(addr => addr.toLowerCase());

          // Check if our validators are in the validators list
          for (const validatorAddress of validatorAddresses) {
            if (validators.includes(validatorAddress)) {
              debugLogger.info(`Validator ${validatorAddress} is in the validators set`);
            }
          }

          // Check if both validators are in the committee
          const allInCommittee = validatorAddresses.every(validatorAddress => committee.includes(validatorAddress));

          if (allInCommittee) {
            debugLogger.info('All validators are in the committee');
            return true;
          }

          // Wait a bit before checking again
          await sleep(5000);
        }
      },
      timeout,
      () => new Error('Timeout waiting for validators to be in committee'),
    );
  };

  const waitForValidatorsToProduceBlocks = async (validatorAddresses: string[]) => {
    // Call get block, check if the coinbase is one of the validators
    const timeout = 3 * 60 * 1000; // 3 minutes
    await executeTimeout(
      async () => {
        debugLogger.info('Waiting for validators to produce blocks');
        const successfulProposers = new Set<string>();
        while (true) {
          // Get the latest block
          const block = await pxe.getBlock(-1);
          if (!block) {
            debugLogger.info('No block found, waiting for next block');
            await sleep(5000);
            continue;
          }

          debugLogger.info(
            `Block ${block.number} has been produced with coinbase ${block.header.globalVariables.coinbase} and fee recipient ${block.header.globalVariables.feeRecipient}`,
          );

          for (const validatorAddress of validatorAddresses) {
            if (block.header.globalVariables.coinbase.toString().toLowerCase() === validatorAddress) {
              debugLogger.info(`Validator ${validatorAddress} has produced a block`);
              successfulProposers.add(validatorAddress);
            }
          }

          if (successfulProposers.size === validatorAddresses.length) {
            debugLogger.info('All validators have produced a block');
            return true;
          }

          // Wait a bit before checking again
          await sleep(5000);
        }
      },
      timeout,
      () => new Error('Timeout waiting for validators to produce blocks'),
    );
  };

  it(
    'should be able to add additional validators',
    async () => {
      const info = await pxe.getNodeInfo();
      if (!info.enr) {
        throw new Error('No ENR found for the boot node');
      }
      const enr = info.enr;
      const rollupAddress = info.l1ContractAddresses.rollupAddress.toString();
      const chain = createEthereumChain([ETHEREUM_HOSTS], 1337);

      const testAccounts = readFromValuesFile('aztec-network', config.VALUES_FILE, 'aztec.testAccounts');
      const sponsoredFPC = readFromValuesFile('aztec-network', config.VALUES_FILE, 'aztec.sponsoredFPC');

      const extraEnv: Partial<Record<EnvVar, string>> = {
        TEST_ACCOUNTS: testAccounts!.toString(),
        SPONSORED_FPC: sponsoredFPC!.toString(),
      };

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
      const validatorAddresses = accounts.map(a => a.address.toString().toLowerCase());
      await deployAdditionalValidators(
        validatorAddresses,
        keys,
        enr,
        info.l1ContractAddresses.registryAddress.toString(),
        extraEnv,
      );

      // Check that all of the validators now exist in the committee
      await waitForValidatorsToBeInCommittee(validatorAddresses, rollupAddress);

      // Wait for those validators to produce a block
      await waitForValidatorsToProduceBlocks(validatorAddresses);
    },
    6 * config.AZTEC_PROOF_SUBMISSION_WINDOW * config.AZTEC_SLOT_DURATION * 1000,
  );
});
