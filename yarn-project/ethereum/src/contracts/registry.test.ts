import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { Anvil } from '@viem/anvil';
import omit from 'lodash.omit';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { L1Deployer, createL1Clients, deployL1Contracts, deployRollup } from '../deploy_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { defaultL1TxUtilsConfig } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { L1Clients } from '../types.js';
import { RegistryContract } from './registry.js';
import { RollupContract } from './rollup.js';

const originalVersionSalt = 42;

describe('Registry', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let publicClient: L1Clients['publicClient'];
  let walletClient: L1Clients['walletClient'];
  let registry: RegistryContract;
  let deployedAddresses: L1ContractAddresses;
  let deployedVersion: number;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:registry');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    ({ publicClient, walletClient } = createL1Clients([rpcUrl], privateKey));

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
    });
    // Since the registry cannot "see" the slash factory, we omit it from the addresses for this test
    deployedAddresses = omit(
      deployed.l1ContractAddresses,
      'slashFactoryAddress',
      'feeAssetHandlerAddress',
      'stakingAssetHandlerAddress',
    );
    registry = new RegistryContract(publicClient, deployedAddresses.registryAddress);

    const rollup = new RollupContract(publicClient, deployedAddresses.rollupAddress);
    deployedVersion = Number(await rollup.getVersion());
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('gets rollup versions', async () => {
    const rollupAddress = deployedAddresses.rollupAddress;
    {
      const address = await registry.getCanonicalAddress();
      expect(address).toEqual(rollupAddress);
    }
    {
      const address = await registry.getRollupAddress('canonical');
      expect(address).toEqual(rollupAddress);
    }
    {
      const address = await registry.getRollupAddress(deployedVersion);
      expect(address).toEqual(rollupAddress);
    }
    {
      const address = await registry.getRollupAddress(0);
      expect(address).toEqual(rollupAddress);
    }
  });

  it('handles non-existent versions', async () => {
    await expect(registry.getRollupAddress(2n)).rejects.toThrow('Rollup address is undefined');
  });

  it('collects addresses', async () => {
    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 'canonical'),
    ).resolves.toEqual(deployedAddresses);

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, deployedVersion),
    ).resolves.toEqual(deployedAddresses);

    // Version 2 does not exist

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 2n),
    ).rejects.toThrow('Rollup address is undefined');
  });

  it('adds a version to the registry', async () => {
    const newVersionSalt = originalVersionSalt + 1;

    const deployer = new L1Deployer(
      walletClient,
      publicClient,
      newVersionSalt,
      undefined,
      logger,
      defaultL1TxUtilsConfig,
    );

    const { rollup: newRollup } = await deployRollup(
      {
        walletClient,
        publicClient,
      },
      deployer,
      {
        ...DefaultL1ContractsConfig,
        salt: newVersionSalt,
        vkTreeRoot,
        protocolContractTreeRoot,
        genesisArchiveRoot: Fr.random(),
      },
      deployedAddresses,
      logger,
    );

    const newAddresses = await newRollup.getRollupAddresses();

    const newCanonicalAddresses = await RegistryContract.collectAddresses(
      publicClient,
      deployedAddresses.registryAddress,
      'canonical',
    );

    expect(newCanonicalAddresses).toEqual({
      ...deployedAddresses,
      ...newAddresses,
    });

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, await newRollup.getVersion()),
    ).resolves.toEqual(newCanonicalAddresses);

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, deployedVersion),
    ).resolves.toEqual(deployedAddresses);
  });
});
