import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { createEthereumChain } from './chain.js';
import { DefaultL1ContractsConfig } from './config.js';
import { RollupContract } from './contracts/rollup.js';
import { type DeployL1ContractsArgs, type Operator, deployL1Contracts } from './deploy_l1_contracts.js';
import { startAnvil } from './test/start_anvil.js';

describe('deploy_l1_contracts', () => {
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let genesisArchiveRoot: Fr;
  let initialValidators: Operator[];

  // Use these environment variables to run against a live node. Eg to test against spartan's eth-devnet:
  // BLOCK_TIME=1 spartan/aztec-network/eth-devnet/run-locally.sh
  // LOG_LEVEL=verbose L1_RPC_URL=http://localhost:8545 L1_CHAIN_ID=1337 yarn test deploy_l1_contracts
  const chainId = process.env.L1_CHAIN_ID ? parseInt(process.env.L1_CHAIN_ID, 10) : 31337;
  let rpcUrl = process.env.L1_RPC_URL;
  let stop: () => Promise<void> = () => Promise.resolve();

  beforeAll(async () => {
    logger = createLogger('ethereum:test:deploy_l1_contracts');
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    genesisArchiveRoot = Fr.random();

    initialValidators = times(3, () => ({
      attester: EthAddress.random(),
      withdrawer: EthAddress.random(),
    }));

    if (!rpcUrl) {
      ({ stop, rpcUrl } = await startAnvil());
    }
  });

  afterAll(async () => {
    if (stop) {
      try {
        await stop();
      } catch (err) {
        createLogger('ethereum:cleanup').error(`Error during cleanup`, err);
      }
    }
  });

  const deploy = (args: Partial<DeployL1ContractsArgs> = {}) =>
    deployL1Contracts([rpcUrl!], privateKey, createEthereumChain([rpcUrl!], chainId).chainInfo, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot,
      l1TxConfig: { checkIntervalMs: 100 },
      realVerifier: false,
      ...args,
    });

  const getRollup = (deployed: Awaited<ReturnType<typeof deploy>>) =>
    new RollupContract(deployed.l1Client, deployed.l1ContractAddresses.rollupAddress);

  it('deploys without salt', async () => {
    await deploy();
  });

  it('deploys initializing validators', async () => {
    const deployed = await deploy({ initialValidators });
    const rollup = getRollup(deployed);
    await Promise.all(
      initialValidators.map(async validator => {
        await retryUntil(
          async () => {
            const view = await rollup.getAttesterView(validator.attester);
            return view.status > 0;
          },
          `attester ${validator.attester} is attesting`,
          DefaultL1ContractsConfig.ethereumSlotDuration * 3,
          1,
        );
      }),
    );
  });

  it('deploys with salt on different addresses', async () => {
    const first = await deploy({ salt: 42 });
    const second = await deploy({ salt: 43 });

    expect(first.l1ContractAddresses).not.toEqual(second.l1ContractAddresses);
  });

  it('deploys twice with salt on same addresses', async () => {
    const first = await deploy({ salt: 44 });
    const second = await deploy({ salt: 44 });

    expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);
  });

  it('deploys twice with salt on same addresses initializing validators', async () => {
    const first = await deploy({ salt: 44, initialValidators });
    const second = await deploy({ salt: 44, initialValidators });

    expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);

    const rollup = getRollup(first);
    for (const validator of initialValidators) {
      await retryUntil(
        async () => {
          const view = await rollup.getAttesterView(validator.attester);
          return view.status > 0;
        },
        'attester is attesting',
        DefaultL1ContractsConfig.ethereumSlotDuration * 3,
        1,
      );
    }
  });
});
