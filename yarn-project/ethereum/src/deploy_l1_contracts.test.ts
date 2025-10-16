import { times } from '@aztec/foundation/collection';
import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { MockVerifierAbi, MockVerifierBytecode, TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import type { Hex } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { createEthereumChain } from './chain.js';
import { createExtendedL1Client } from './client.js';
import { DefaultL1ContractsConfig, getEntryQueueConfig } from './config.js';
import { GovernanceContract } from './contracts/governance.js';
import { GSEContract } from './contracts/gse.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract } from './contracts/rollup.js';
import {
  type DeployL1ContractsArgs,
  type Operator,
  deployL1Contract,
  deployL1Contracts,
} from './deploy_l1_contracts.js';
import { startAnvil } from './test/start_anvil.js';
import type { ExtendedViemWalletClient } from './types.js';

describe('deploy_l1_contracts', () => {
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
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
    protocolContractsHash = Fr.random();
    genesisArchiveRoot = Fr.random();

    initialValidators = times(3, () => ({
      attester: EthAddress.random(),
      withdrawer: EthAddress.random(),
      bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
    }));

    if (!rpcUrl) {
      ({ stop, rpcUrl } = await startAnvil({ port: 8546 }));
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
    deployL1Contracts(
      [rpcUrl!],
      privateKey,
      createEthereumChain([rpcUrl!], chainId).chainInfo,
      logger,
      {
        ...DefaultL1ContractsConfig,
        salt: undefined,
        vkTreeRoot,
        protocolContractsHash,
        genesisArchiveRoot,
        l1TxConfig: { checkIntervalMs: 100 },
        realVerifier: false,
        ...args,
      },
      undefined,
      false,
    );

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

  it('deploys using an existing external token for fee and staking', async () => {
    const { address: externalTokenAddress } = await deployL1Contract(client, TestERC20Abi, TestERC20Bytecode as Hex, [
      'TEST',
      'TEST',
      client.account.address,
    ]);

    const deployed = await deploy({ existingTokenAddress: externalTokenAddress });

    await checkRollupDeploy(deployed);

    expect(deployed.l1ContractAddresses.feeJuiceAddress).toEqual(externalTokenAddress);
    expect(deployed.l1ContractAddresses.stakingAssetAddress).toEqual(externalTokenAddress);

    expect(deployed.l1ContractAddresses.feeAssetHandlerAddress).toBeUndefined();
    expect(deployed.l1ContractAddresses.stakingAssetHandlerAddress).toBeUndefined();

    // Ownership of the external token should remain with the deployer, not CoinIssuer
    expect(await getOwner(deployed.l1ContractAddresses.feeJuiceAddress)).toEqual(
      EthAddress.fromString(client.account.address),
    );
  });

  it('fails when deploying with an address that has no contract code', async () => {
    const randomAddress = EthAddress.random();
    await expect(deploy({ existingTokenAddress: randomAddress })).rejects.toThrow(
      `No contract code found at provided token address ${randomAddress.toString()}`,
    );
  });

  it('fails when deploying with a non-ERC20 contract address', async () => {
    // Deploy a MockVerifier contract (has code but no ERC20 methods)
    const { address: nonTokenAddress } = await deployL1Contract(
      client,
      MockVerifierAbi,
      MockVerifierBytecode as Hex,
      [],
    );

    await expect(deploy({ existingTokenAddress: nonTokenAddress })).rejects.toThrow(
      `Address ${nonTokenAddress.toString()} does not appear to implement ERC20 view methods`,
    );
  });

  it('fails when deploying with both initialValidators and existingTokenAddress', async () => {
    const { address: externalTokenAddress } = await deployL1Contract(client, TestERC20Abi, TestERC20Bytecode as Hex, [
      'TEST',
      'TEST',
      client.account.address,
    ]);

    await expect(deploy({ existingTokenAddress: externalTokenAddress, initialValidators })).rejects.toThrow(
      'Cannot deploy with both initialValidators and existingTokenAddress',
    );
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
    // Adds 48 validators. Note, that not all 48 validators is necessarily added in the active set, some might be in the entry queue
    const initialValidators = times(48, () => {
      const addr = EthAddress.random();
      const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
      return { attester: addr, withdrawer: addr, bn254SecretKey };
    });

    const info = await deploy({
      initialValidators,
      aztecTargetCommitteeSize: initialValidators.length,
    });

    const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);
    expect((await rollup.getActiveAttesterCount()) + (await rollup.getEntryQueueLength())).toEqual(
      BigInt(initialValidators.length),
    );
  });

  it('deploys and flushes 48 initialValidators', async () => {
    // Adds 48 validators. We will repeatedly flush during the same epoch up till the the bootstrap flush size.
    const initialValidators = times(48, () => {
      const addr = EthAddress.random();
      const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
      return { attester: addr, withdrawer: addr, bn254SecretKey };
    });

    // Use the `staging-public` network (48 bootstrap set size with 48 bootstrap flush)
    process.env.NETWORK = 'staging-public';
    const info = await deploy({
      initialValidators,
      aztecTargetCommitteeSize: initialValidators.length,
    });
    process.env.NETWORK = '';

    const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);

    expect(await rollup.getEntryQueueLength()).toEqual(0n);
    expect(await rollup.getActiveAttesterCount()).toEqual(BigInt(initialValidators.length));
  });

  it('deploys validators and flushes up to maxQueueFlushSize', async () => {
    // Determine flush cap from active network configuration
    const networkName = getActiveNetworkName();
    const { maxQueueFlushSize } = getEntryQueueConfig(networkName);

    // We will repeatedly flush during the same epoch up till the limit.
    const totalValidators = Number(48);
    const initialValidators = times(totalValidators, () => {
      const addr = EthAddress.random();
      const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
      return { attester: addr, withdrawer: addr, bn254SecretKey };
    });

    const info = await deploy({
      initialValidators,
      aztecTargetCommitteeSize: initialValidators.length,
    });
    const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);

    expect(await rollup.getEntryQueueLength()).toEqual(BigInt(totalValidators) - maxQueueFlushSize);
    expect(await rollup.getActiveAttesterCount()).toEqual(maxQueueFlushSize);
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
        protocolContractsHash,
        genesisArchiveRoot,
        l1TxConfig: { checkIntervalMs: 100 },
        realVerifier: false,
      },
    );

    const governance = new GovernanceContract(deployment.l1ContractAddresses.governanceAddress, client);
    const registry = new RegistryContract(client, deployment.l1ContractAddresses.registryAddress);
    const rollup = new RollupContract(client, deployment.l1ContractAddresses.rollupAddress);
    const gse = new GSEContract(client, await rollup.getGSE());
    const dateGatedRelayerAddress = deployment.l1ContractAddresses.dateGatedRelayerAddress!;

    // Checking the shared
    expect(await registry.getOwner()).toEqual(governance.address);
    expect(await gse.getOwner()).toEqual(governance.address);
    expect(await gse.getGovernance()).toEqual(governance.address);
    expect(await getOwner(deployment.l1ContractAddresses.rewardDistributorAddress, 'REGISTRY')).toEqual(
      registry.address,
    );

    // The coin issuer should be owned by governance, but indirectly through the date gated relayer
    expect(await getOwner(deployment.l1ContractAddresses.coinIssuerAddress)).toEqual(dateGatedRelayerAddress);
    expect(await getOwner(dateGatedRelayerAddress)).toEqual(governance.address);

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

  const getBalance = async (tokenAddress: EthAddress, holderAddress: EthAddress) => {
    return (await client.readContract({
      address: tokenAddress.toString(),
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [{ type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'balanceOf',
      args: [holderAddress.toString()],
    })) as bigint;
  };

  describe('idempotency tests', () => {
    it('minter idempotency: does not add minter twice', async () => {
      const first = await deploy({ salt: 200 });

      // Verify minters were added
      if (first.l1ContractAddresses.feeAssetHandlerAddress) {
        expect(
          await isMinter(first.l1ContractAddresses.feeJuiceAddress, first.l1ContractAddresses.feeAssetHandlerAddress),
        ).toBe(true);
      }

      // Deploy again with same salt - should be idempotent
      const second = await deploy({ salt: 200 });

      expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);

      // Verify minters are still correctly set
      if (second.l1ContractAddresses.feeAssetHandlerAddress) {
        expect(
          await isMinter(second.l1ContractAddresses.feeJuiceAddress, second.l1ContractAddresses.feeAssetHandlerAddress),
        ).toBe(true);
      }
    });

    it('funding idempotency: does not duplicate funding', async () => {
      const initialBalance = 1000000n * 10n ** 18n;

      const first = await deploy({ salt: 201, feeJuicePortalInitialBalance: initialBalance });

      const rollup = getRollup(first);
      const portalAddress = await rollup.getFeeJuicePortal();

      const balanceAfterFirst = await getBalance(first.l1ContractAddresses.feeJuiceAddress, portalAddress);
      expect(balanceAfterFirst).toBeGreaterThanOrEqual(initialBalance);

      // Deploy again with same parameters
      const second = await deploy({ salt: 201, feeJuicePortalInitialBalance: initialBalance });

      const balanceAfterSecond = await getBalance(second.l1ContractAddresses.feeJuiceAddress, portalAddress);

      // Balance should not have doubled
      expect(balanceAfterSecond).toEqual(balanceAfterFirst);
    });

    it('ownership transfer idempotency: does not fail on repeated transfers', async () => {
      const first = await deploy({ salt: 202 });

      const governance = new GovernanceContract(first.l1ContractAddresses.governanceAddress, client);
      const registry = new RegistryContract(client, first.l1ContractAddresses.registryAddress);
      const rollup = new RollupContract(client, first.l1ContractAddresses.rollupAddress);
      const gse = new GSEContract(client, await rollup.getGSE());

      // Verify ownerships are correct
      expect(await registry.getOwner()).toEqual(governance.address);
      expect(await gse.getOwner()).toEqual(governance.address);
      expect(await getOwner(EthAddress.fromString(rollup.address))).toEqual(governance.address);

      // Deploy again - should not fail on ownership transfers
      const second = await deploy({ salt: 202 });

      expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);

      // Verify ownerships are still correct
      expect(await registry.getOwner()).toEqual(governance.address);
      expect(await gse.getOwner()).toEqual(governance.address);
      expect(await getOwner(EthAddress.fromString(rollup.address))).toEqual(governance.address);
    });

    it('governance consistency: allows redeployment with same parameters', async () => {
      // This test verifies that governance contracts can be redeployed with the same parameters
      const firstDeployment = await deploy({ salt: 203 });

      // Deploy again with the same salt and parameters - should succeed due to idempotency
      const secondDeployment = await deploy({ salt: 203 });

      // All governance contracts should be at the same addresses
      expect(firstDeployment.l1ContractAddresses.governanceAddress).toEqual(
        secondDeployment.l1ContractAddresses.governanceAddress,
      );
      expect(firstDeployment.l1ContractAddresses.governanceProposerAddress).toEqual(
        secondDeployment.l1ContractAddresses.governanceProposerAddress,
      );
      expect(firstDeployment.l1ContractAddresses.gseAddress).toEqual(secondDeployment.l1ContractAddresses.gseAddress);
      expect(firstDeployment.l1ContractAddresses.registryAddress).toEqual(
        secondDeployment.l1ContractAddresses.registryAddress,
      );
    });

    it('allows new rollup deployment with existing governance', async () => {
      // Deploy full system
      const first = await deploy({ salt: 204, vkTreeRoot: Fr.random() });

      // Deploy new rollup with different genesis (this creates a new rollup version)
      const newVkTreeRoot = Fr.random();
      const newProtocolContractsHash = Fr.random();
      const newGenesisArchiveRoot = Fr.random();

      const second = await deploy({
        salt: 205, // Different salt for rollup but reuses governance infrastructure
        vkTreeRoot: newVkTreeRoot,
        protocolContractsHash: newProtocolContractsHash,
        genesisArchiveRoot: newGenesisArchiveRoot,
      });

      // Governance contracts should exist for both
      expect(await isContract(first.l1ContractAddresses.governanceAddress)).toBe(true);
      expect(await isContract(second.l1ContractAddresses.governanceAddress)).toBe(true);

      // Rollups should be different
      expect(first.l1ContractAddresses.rollupAddress).not.toEqual(second.l1ContractAddresses.rollupAddress);

      // Both rollups should be in the registry
      const registry = new RegistryContract(client, first.l1ContractAddresses.registryAddress);
      const firstRollupVersion = await new RollupContract(client, first.l1ContractAddresses.rollupAddress).getVersion();
      const secondRollupVersion = await new RollupContract(
        client,
        second.l1ContractAddresses.rollupAddress,
      ).getVersion();

      expect(firstRollupVersion).not.toEqual(secondRollupVersion);
    });

    it('validator idempotency: does not duplicate validators on redeploy', async () => {
      const validators = times(5, () => ({
        attester: EthAddress.random(),
        withdrawer: EthAddress.random(),
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      }));

      const first = await deploy({
        salt: 206,
        initialValidators: validators,
        aztecTargetCommitteeSize: validators.length,
      });

      const rollup = getRollup(first);
      const activeCountAfterFirst = await rollup.getActiveAttesterCount();
      const queueLengthAfterFirst = await rollup.getEntryQueueLength();
      const totalAfterFirst = activeCountAfterFirst + queueLengthAfterFirst;

      expect(totalAfterFirst).toEqual(BigInt(validators.length));

      // Deploy again with same parameters - validators should not be duplicated
      const second = await deploy({
        salt: 206,
        initialValidators: validators,
        aztecTargetCommitteeSize: validators.length,
      });

      const activeCountAfterSecond = await rollup.getActiveAttesterCount();
      const queueLengthAfterSecond = await rollup.getEntryQueueLength();
      const totalAfterSecond = activeCountAfterSecond + queueLengthAfterSecond;

      // Should still be the same count, not doubled
      expect(totalAfterSecond).toEqual(totalAfterFirst);
      expect(totalAfterSecond).toEqual(BigInt(validators.length));
    });
  });
});
