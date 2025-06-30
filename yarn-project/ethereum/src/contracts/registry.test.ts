import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RegistryAbi } from '@aztec/l1-artifacts/RegistryAbi';

import type { Anvil } from '@viem/anvil';
import omit from 'lodash.omit';
import { createPublicClient, getContract, http } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { L1Deployer, deployL1Contracts, deployRollup } from '../deploy_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { defaultL1TxUtilsConfig } from '../l1_tx_utils.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
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
  let l1Client: ExtendedViemWalletClient;
  let registry: RegistryContract;
  let deployedAddresses: L1ContractAddresses;
  let deployedVersion: number;
  let ethCheatCodes: EthCheatCodes;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:registry');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    l1Client = createExtendedL1Client([rpcUrl], privateKey, foundry);

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });
    // Since the registry cannot "see" the slash factory, we omit it from the addresses for this test
    deployedAddresses = omit(
      deployed.l1ContractAddresses,
      'slashFactoryAddress',
      'feeAssetHandlerAddress',
      'stakingAssetHandlerAddress',
      'zkPassportVerifierAddress',
    );
    registry = new RegistryContract(l1Client, deployedAddresses.registryAddress);

    const rollup = new RollupContract(l1Client, deployedAddresses.rollupAddress);
    deployedVersion = Number(await rollup.getVersion());

    ethCheatCodes = new EthCheatCodes([rpcUrl]);
    await ethCheatCodes.setBalance(deployedAddresses.governanceAddress, 1000000000000000000000000000000000000000n);
  });

  afterAll(async () => {
    await anvil.stop().catch(logger.error);
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
      RegistryContract.collectAddresses(l1Client, deployedAddresses.registryAddress, 'canonical'),
    ).resolves.toEqual(deployedAddresses);

    await expect(
      RegistryContract.collectAddresses(l1Client, deployedAddresses.registryAddress, deployedVersion),
    ).resolves.toEqual(deployedAddresses);

    // Version 2 does not exist

    await expect(RegistryContract.collectAddresses(l1Client, deployedAddresses.registryAddress, 2n)).rejects.toThrow(
      'Rollup address is undefined',
    );
  });

  it('adds a version to the registry', async () => {
    const newVersionSalt = originalVersionSalt + 1;

    const deployer = new L1Deployer(l1Client, newVersionSalt, undefined, logger, defaultL1TxUtilsConfig);

    // We need to steal ownership of the registry to add a rollup without going through governance
    await setRegistryOwnership(EthAddress.fromString(deployer.client.account.address));

    const { rollup: newRollup } = await deployRollup(
      l1Client,
      deployer,
      {
        ...DefaultL1ContractsConfig,
        salt: newVersionSalt,
        vkTreeRoot,
        protocolContractTreeRoot,
        genesisArchiveRoot: Fr.random(),
        realVerifier: false,
      },
      deployedAddresses,
      logger,
    );

    // We need to return ownership of the registry to the governance address to collect the addresses
    await setRegistryOwnership(deployedAddresses.governanceAddress);

    const newAddresses = await newRollup.getRollupAddresses();

    const newCanonicalAddresses = await RegistryContract.collectAddresses(
      l1Client,
      deployedAddresses.registryAddress,
      'canonical',
    );

    expect(newCanonicalAddresses).toEqual({
      ...deployedAddresses,
      ...newAddresses,
    });

    await expect(
      RegistryContract.collectAddresses(l1Client, deployedAddresses.registryAddress, await newRollup.getVersion()),
    ).resolves.toEqual(newCanonicalAddresses);

    await expect(
      RegistryContract.collectAddresses(l1Client, deployedAddresses.registryAddress, deployedVersion),
    ).resolves.toEqual(deployedAddresses);
  });

  async function setRegistryOwnership(address: EthAddress) {
    const owner = await registry.getOwner();
    await ethCheatCodes.startImpersonating(owner);
    await l1Client.waitForTransactionReceipt({
      hash: await getContract({
        address: deployedAddresses.registryAddress.toString(),
        abi: RegistryAbi,
        client: createPublicClient({
          chain: foundry,
          transport: http(),
        }),
      }).write.transferOwnership([address.toString()], {
        account: owner.toString(),
      }),
    });
    await ethCheatCodes.stopImpersonating(owner);
  }
});
