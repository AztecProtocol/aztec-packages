import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { createEthereumChain } from './chain.js';
import { createExtendedL1Client } from './client.js';
import { DefaultL1ContractsConfig } from './config.js';
import { GovernanceContract } from './contracts/governance.js';
import { GSEContract } from './contracts/gse.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract } from './contracts/rollup.js';
import { type DeployL1ContractsArgs, type Operator, deployL1Contracts } from './deploy_l1_contracts.js';
import { startAnvil } from './test/start_anvil.js';
import type { ExtendedViemWalletClient } from './types.js';

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
  let client: ExtendedViemWalletClient;
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
      bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
    }));

    if (!rpcUrl) {
      ({ stop, rpcUrl } = await startAnvil());
    }

    client = createExtendedL1Client([rpcUrl], privateKey, createEthereumChain([rpcUrl], chainId).chainInfo);
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

  const checkRollupDeploy = async (deployed: Awaited<ReturnType<typeof deploy>>) => {
    const rollup = getRollup(deployed);
    expect(await rollup.getEpochDuration()).toEqual(BigInt(DefaultL1ContractsConfig.aztecEpochDuration));
    return rollup;
  };

  it('deploys without salt', async () => {
    const deployed = await deploy();
    await checkRollupDeploy(deployed);
  });

  it('deploys initializing validators', async () => {
    const deployed = await deploy({ initialValidators });
    const rollup = await checkRollupDeploy(deployed);
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
    await checkRollupDeploy(first);
    await checkRollupDeploy(second);
  });

  it('deploys twice with salt on same addresses', async () => {
    const first = await deploy({ salt: 44 });
    const second = await deploy({ salt: 44 });

    expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);
    await checkRollupDeploy(first);
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

  it('deploys and adds 48 initialValidators', async () => {
    // Adds 48 validators.
    // Note, that not all 48 validators is necessarily added in the active set, some might be in the entry queue

    const initialValidators = times(48, () => {
      const addr = EthAddress.random();
      const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
      return { attester: addr, withdrawer: addr, bn254SecretKey };
    });
    const info = await deploy({ initialValidators, aztecTargetCommitteeSize: initialValidators.length });
    const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);

    expect((await rollup.getActiveAttesterCount()) + (await rollup.getEntryQueueLength())).toEqual(
      BigInt(initialValidators.length),
    );
  });

  it('ensure governance is the owner', async () => {
    // Runs the deployment script and checks if we have handed over things correctly to the governance.

    const deployment = await deployL1Contracts(
      [rpcUrl!],
      privateKey,
      createEthereumChain([rpcUrl!], chainId).chainInfo,
      logger,
      {
        ...DefaultL1ContractsConfig,
        salt: undefined,
        vkTreeRoot,
        protocolContractTreeRoot,
        genesisArchiveRoot,
        l1TxConfig: { checkIntervalMs: 100 },
        realVerifier: false,
      },
    );

    const governance = new GovernanceContract(deployment.l1ContractAddresses.governanceAddress, client);
    const registry = new RegistryContract(client, deployment.l1ContractAddresses.registryAddress);
    const rollup = new RollupContract(client, deployment.l1ContractAddresses.rollupAddress);
    const gse = new GSEContract(client, await rollup.getGSE());

    // Checking the shared
    expect(await registry.getOwner()).toEqual(governance.address);
    expect(await gse.getOwner()).toEqual(governance.address);
    expect(await gse.getGovernance()).toEqual(governance.address);
    expect(await getOwner(deployment.l1ContractAddresses.rewardDistributorAddress, 'REGISTRY')).toEqual(
      registry.address,
    );
    expect(await getOwner(deployment.l1ContractAddresses.coinIssuerAddress)).toEqual(governance.address);

    expect(await getOwner(deployment.l1ContractAddresses.feeJuiceAddress)).toEqual(
      deployment.l1ContractAddresses.coinIssuerAddress,
    );

    // The rollup contract should be owned by the governance contract as well.
    expect(await getOwner(EthAddress.fromString(rollup.address))).toEqual(governance.address);

    // Make sure that the fee asset handler is the minter of the fee asset.
    expect(
      await isMinter(
        deployment.l1ContractAddresses.feeJuiceAddress,
        deployment.l1ContractAddresses.feeAssetHandlerAddress!,
      ),
    ).toBeTruthy();
  });

  const isContract = async (address: EthAddress) => {
    const bytecode = await client.getBytecode({ address: address.toString() });
    return bytecode !== undefined && bytecode !== '0x';
  };

  const getOwner = async (address: EthAddress, name: string = 'owner') => {
    if (!(await isContract(address))) {
      throw new Error(`Address ${address} have no bytecode, is it deployed?`);
    }
    return EthAddress.fromString(
      await client.readContract({
        address: address.toString(),
        abi: [
          {
            name: name,
            type: 'function',
            inputs: [],
            outputs: [{ type: 'address' }],
            stateMutability: 'view',
          },
        ],
        functionName: name,
      }),
    );
  };

  const isMinter = async (address: EthAddress, minter: EthAddress) => {
    if (!(await isContract(address))) {
      throw new Error(`Address ${address} have no bytecode, is it deployed?`);
    }
    return await client.readContract({
      address: address.toString(),
      abi: [
        {
          name: 'minters',
          type: 'function',
          inputs: [{ type: 'address' }],
          outputs: [{ type: 'bool' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'minters',
      args: [minter.toString()],
    });
  };
});
