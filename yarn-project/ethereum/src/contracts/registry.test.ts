import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestERC20Abi as FeeJuiceAbi, GovernanceAbi } from '@aztec/l1-artifacts';

import { type Anvil } from '@viem/anvil';
import { getContract } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { createL1Clients, deployL1Contracts, deployRollupAndUpgradePayload } from '../deploy_l1_contracts.js';
import { EthCheatCodes } from '../eth_cheat_codes.js';
import { type L1ContractAddresses } from '../l1_contract_addresses.js';
import { defaultL1TxUtilsConfig } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { L1Clients } from '../types.js';
import { RegistryContract } from './registry.js';

const originalVersionSalt = 42;

describe('Registry', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let l2FeeJuiceAddress: AztecAddress;
  let publicClient: L1Clients['publicClient'];
  let walletClient: L1Clients['walletClient'];
  let registry: RegistryContract;
  let deployedAddresses: L1ContractAddresses;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:registry');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    l2FeeJuiceAddress = await AztecAddress.random();

    ({ anvil, rpcUrl } = await startAnvil());

    ({ publicClient, walletClient } = createL1Clients(rpcUrl, privateKey));

    const deployed = await deployL1Contracts(rpcUrl, privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      l2FeeJuiceAddress,
      genesisArchiveRoot: Fr.random(),
      genesisBlockHash: Fr.random(),
    });

    deployedAddresses = deployed.l1ContractAddresses;

    registry = new RegistryContract(publicClient, deployedAddresses.registryAddress);
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
      const address = await registry.getRollupAddress(1);
      expect(address).toEqual(rollupAddress);
    }
  });

  it('handles non-existent versions', async () => {
    const address = await registry.getRollupAddress(2);
    expect(address).toBeUndefined();
  });

  it('collects addresses', async () => {
    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 'canonical'),
    ).resolves.toEqual(deployedAddresses);

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 1),
    ).resolves.toEqual(deployedAddresses);

    // Version 2 does not exist

    await expect(RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 2)).rejects.toThrow(
      'Rollup address is undefined',
    );

    await expect(
      RegistryContract.collectAddressesSafe(publicClient, deployedAddresses.registryAddress, 2),
    ).resolves.toEqual({
      governanceAddress: deployedAddresses.governanceAddress,
      governanceProposerAddress: deployedAddresses.governanceProposerAddress,
      registryAddress: deployedAddresses.registryAddress,
    });
  });

  it('adds a version to the registry', async () => {
    const addresses = await RegistryContract.collectAddresses(
      publicClient,
      deployedAddresses.registryAddress,
      'canonical',
    );
    const newVersionSalt = originalVersionSalt + 1;

    const { rollup: newRollup, payloadAddress } = await deployRollupAndUpgradePayload(
      rpcUrl,
      foundry,
      privateKey,
      {
        ...DefaultL1ContractsConfig,
        salt: newVersionSalt,
        vkTreeRoot,
        protocolContractTreeRoot,
        l2FeeJuiceAddress,
        genesisArchiveRoot: Fr.random(),
        genesisBlockHash: Fr.random(),
      },
      {
        feeJuicePortalAddress: addresses.feeJuicePortalAddress,
        rewardDistributorAddress: addresses.rewardDistributorAddress,
        stakingAssetAddress: addresses.stakingAssetAddress,
        registryAddress: deployedAddresses.registryAddress,
      },
      logger,
      defaultL1TxUtilsConfig,
    );

    const { governance, voteAmount } = await createGovernanceProposal(
      payloadAddress.toString(),
      addresses,
      privateKey,
      publicClient,
      logger,
    );

    await executeGovernanceProposal(0n, governance, voteAmount, privateKey, publicClient, walletClient, rpcUrl, logger);

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
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 2),
    ).resolves.toEqual(newCanonicalAddresses);

    await expect(
      RegistryContract.collectAddresses(publicClient, deployedAddresses.registryAddress, 1),
    ).resolves.toEqual(deployedAddresses);
  });
});

async function executeGovernanceProposal(
  proposalId: bigint,
  governance: any,
  voteAmount: bigint,
  privateKey: PrivateKeyAccount,
  publicClient: L1Clients['publicClient'],
  walletClient: L1Clients['walletClient'],
  rpcUrl: string,
  logger: Logger,
) {
  const proposal = await governance.read.getProposal([proposalId]);

  const waitL1Block = async () => {
    await publicClient.waitForTransactionReceipt({
      hash: await walletClient.sendTransaction({
        to: privateKey.address,
        value: 1n,
        account: privateKey,
      }),
    });
  };

  const cheatCodes = new EthCheatCodes(rpcUrl, logger);

  const timeToActive = proposal.creation + proposal.config.votingDelay;
  logger.info(`Warping to ${timeToActive + 1n}`);
  await cheatCodes.warp(Number(timeToActive + 1n));
  logger.info(`Warped to ${timeToActive + 1n}`);
  await waitL1Block();

  logger.info(`Voting`);
  const voteTx = await governance.write.vote([proposalId, voteAmount, true], { account: privateKey });
  await publicClient.waitForTransactionReceipt({ hash: voteTx });
  logger.info(`Voted`);

  const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
  logger.info(`Warping to ${timeToExecutable}`);
  await cheatCodes.warp(Number(timeToExecutable));
  logger.info(`Warped to ${timeToExecutable}`);
  await waitL1Block();

  const executeTx = await governance.write.execute([proposalId], { account: privateKey });
  await publicClient.waitForTransactionReceipt({ hash: executeTx });
  logger.info(`Executed proposal`);
}

async function createGovernanceProposal(
  payloadAddress: `0x${string}`,
  addresses: L1ContractAddresses,
  privateKey: PrivateKeyAccount,
  publicClient: L1Clients['publicClient'],
  logger: Logger,
) {
  const token = getContract({
    address: addresses.feeJuiceAddress.toString(),
    abi: FeeJuiceAbi,
    client: publicClient,
  });

  const governance = getContract({
    address: addresses.governanceAddress.toString(),
    abi: GovernanceAbi,
    client: publicClient,
  });

  const lockAmount = 10000n * 10n ** 18n;
  const voteAmount = 10000n * 10n ** 18n;

  const mintTx = await token.write.mint([privateKey.address, lockAmount + voteAmount], { account: privateKey });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });
  logger.info(`Minted tokens`);

  const approveTx = await token.write.approve([addresses.governanceAddress.toString(), lockAmount + voteAmount], {
    account: privateKey,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  logger.info(`Approved tokens`);

  const depositTx = await governance.write.deposit([privateKey.address, lockAmount + voteAmount], {
    account: privateKey,
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  logger.info(`Deposited tokens`);

  await governance.write.proposeWithLock([payloadAddress, privateKey.address], {
    account: privateKey,
  });

  return { governance, voteAmount };
}
