import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import {
  CoinIssuerAbi,
  CoinIssuerBytecode,
  ExtRollupLibAbi,
  ExtRollupLibBytecode,
  FeeJuicePortalAbi,
  FeeJuicePortalBytecode,
  ForwarderAbi,
  ForwarderBytecode,
  GovernanceAbi,
  GovernanceBytecode,
  GovernanceProposerAbi,
  GovernanceProposerBytecode,
  InboxAbi,
  InboxBytecode,
  OutboxAbi,
  OutboxBytecode,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  RegistryAbi,
  RegistryBytecode,
  RewardDistributorAbi,
  RewardDistributorBytecode,
  RollupAbi,
  RollupBytecode,
  RollupLinkReferences,
  SlashFactoryAbi,
  SlashFactoryBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
  ValidatorSelectionLibAbi,
  ValidatorSelectionLibBytecode,
} from '@aztec/l1-artifacts';

import type { Abi, Narrow } from 'abitype';
import {
  type Chain,
  type Hex,
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  fallback,
  getAddress,
  getContract,
  getContractAddress,
  http,
  numberToHex,
  padHex,
  publicActions,
} from 'viem';
import { type HDAccount, type PrivateKeyAccount, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { isAnvilTestChain } from './chain.js';
import type { L1ContractsConfig } from './config.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract } from './contracts/rollup.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import { L1TxUtils, type L1TxUtilsConfig, defaultL1TxUtilsConfig } from './l1_tx_utils.js';
import type { L1Clients, ViemPublicClient, ViemWalletClient } from './types.js';

export const DEPLOYER_ADDRESS: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

/**
 * Return type of the deployL1Contract function.
 */
export type DeployL1ContractsReturnType = {
  /**
   * Wallet Client Type.
   */
  walletClient: ViemWalletClient;
  /**
   * Public Client Type.
   */
  publicClient: ViemPublicClient;
  /**
   * The currently deployed l1 contract addresses
   */
  l1ContractAddresses: L1ContractAddresses;
};

export interface LinkReferences {
  [fileName: string]: {
    [contractName: string]: ReadonlyArray<{
      start: number;
      length: number;
    }>;
  };
}

export interface Libraries {
  linkReferences: LinkReferences;
  libraryCode: Record<string, ContractArtifacts>;
}

/**
 * Contract artifacts
 */
export interface ContractArtifacts {
  /**
   * The contract abi.
   */
  contractAbi: Narrow<Abi | readonly unknown[]>;
  /**
   * The contract bytecode
   */
  contractBytecode: Hex;
  /**
   * The contract libraries
   */
  libraries?: Libraries;
}

export const l1Artifacts = {
  registry: {
    contractAbi: RegistryAbi,
    contractBytecode: RegistryBytecode as Hex,
  },
  inbox: {
    contractAbi: InboxAbi,
    contractBytecode: InboxBytecode as Hex,
  },
  outbox: {
    contractAbi: OutboxAbi,
    contractBytecode: OutboxBytecode as Hex,
  },
  rollup: {
    contractAbi: RollupAbi,
    contractBytecode: RollupBytecode as Hex,
    libraries: {
      linkReferences: RollupLinkReferences,
      libraryCode: {
        ValidatorSelectionLib: {
          contractAbi: ValidatorSelectionLibAbi,
          contractBytecode: ValidatorSelectionLibBytecode as Hex,
        },
        ExtRollupLib: {
          contractAbi: ExtRollupLibAbi,
          contractBytecode: ExtRollupLibBytecode as Hex,
        },
      },
    },
  },
  stakingAsset: {
    contractAbi: TestERC20Abi,
    contractBytecode: TestERC20Bytecode as Hex,
  },
  feeAsset: {
    contractAbi: TestERC20Abi,
    contractBytecode: TestERC20Bytecode as Hex,
  },
  feeJuicePortal: {
    contractAbi: FeeJuicePortalAbi,
    contractBytecode: FeeJuicePortalBytecode as Hex,
  },
  rewardDistributor: {
    contractAbi: RewardDistributorAbi,
    contractBytecode: RewardDistributorBytecode as Hex,
  },
  coinIssuer: {
    contractAbi: CoinIssuerAbi,
    contractBytecode: CoinIssuerBytecode as Hex,
  },
  governanceProposer: {
    contractAbi: GovernanceProposerAbi,
    contractBytecode: GovernanceProposerBytecode as Hex,
  },
  governance: {
    contractAbi: GovernanceAbi,
    contractBytecode: GovernanceBytecode as Hex,
  },
  slashFactory: {
    contractAbi: SlashFactoryAbi,
    contractBytecode: SlashFactoryBytecode as Hex,
  },
  registerNewRollupVersionPayload: {
    contractAbi: RegisterNewRollupVersionPayloadAbi,
    contractBytecode: RegisterNewRollupVersionPayloadBytecode as Hex,
  },
};

export interface DeployL1ContractsArgs extends L1ContractsConfig {
  /**
   * The address of the L2 Fee Juice contract.
   * It should be an AztecAddress, but the type is defined in stdlib,
   * which would create a circular import
   * */
  l2FeeJuiceAddress: Fr;
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The protocol contract tree root. */
  protocolContractTreeRoot: Fr;
  /** The genesis root of the archive tree. */
  genesisArchiveRoot: Fr;
  /** The hash of the genesis block header. */
  genesisBlockHash: Fr;
  /** The salt for CREATE2 deployment. */
  salt: number | undefined;
  /** The initial validators for the rollup contract. */
  initialValidators?: EthAddress[];
  /** Configuration for the L1 tx utils module. */
  l1TxConfig?: Partial<L1TxUtilsConfig>;
}

/**
 * Creates a wallet and a public viem client for interacting with L1.
 * @param rpcUrls - List of RPC URLs to connect to L1.
 * @param mnemonicOrPrivateKeyOrHdAccount - Mnemonic or account for the wallet client.
 * @param chain - Optional chain spec (defaults to local foundry).
 * @param addressIndex - Optional index of the address to use from the mnemonic.
 * @returns - A wallet and a public client.
 */
export function createL1Clients(
  rpcUrls: string[],
  mnemonicOrPrivateKeyOrHdAccount: string | `0x${string}` | HDAccount | PrivateKeyAccount,
  chain: Chain = foundry,
  addressIndex?: number,
): L1Clients {
  const hdAccount =
    typeof mnemonicOrPrivateKeyOrHdAccount === 'string'
      ? mnemonicOrPrivateKeyOrHdAccount.startsWith('0x')
        ? privateKeyToAccount(mnemonicOrPrivateKeyOrHdAccount as `0x${string}`)
        : mnemonicToAccount(mnemonicOrPrivateKeyOrHdAccount, { addressIndex })
      : mnemonicOrPrivateKeyOrHdAccount;

  // From what I can see, this is the difference between the HDAccount and the PrivateKeyAccount
  // and we don't need it for anything. This lets us use the same type for both.
  // eslint-disable-next-line camelcase
  hdAccount.experimental_signAuthorization ??= () => {
    throw new Error('experimental_signAuthorization not implemented for HDAccount');
  };

  const walletClient = createWalletClient({
    account: hdAccount,
    chain,
    transport: fallback(rpcUrls.map(url => http(url))),
  }).extend(publicActions);
  const publicClient = createPublicClient({
    chain,
    transport: fallback(rpcUrls.map(url => http(url))),
    pollingInterval: 100,
  });

  return { walletClient, publicClient } as L1Clients;
}

export const deployRollupAndPeriphery = async (
  clients: L1Clients,
  args: DeployL1ContractsArgs,
  registryAddress: EthAddress,
  logger: Logger,
  txUtilsConfig: L1TxUtilsConfig,
) => {
  const deployer = new L1Deployer(clients.walletClient, clients.publicClient, args.salt, logger, txUtilsConfig);

  const addresses = await RegistryContract.collectAddresses(clients.publicClient, registryAddress, 'canonical');

  const rollup = await deployRollup(clients, deployer, args, addresses, logger);
  const payloadAddress = await deployUpgradePayload(deployer, {
    registryAddress: addresses.registryAddress,
    rollupAddress: EthAddress.fromString(rollup.address),
  });
  const slashFactoryAddress = await deploySlashFactory(deployer, rollup.address, logger);

  await deployer.waitForDeployments();

  return { rollup, payloadAddress, slashFactoryAddress };
};

export const deploySlashFactory = async (deployer: L1Deployer, rollupAddress: Hex, logger: Logger) => {
  const slashFactoryAddress = await deployer.deploy(l1Artifacts.slashFactory, [rollupAddress]);
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);
  return slashFactoryAddress;
};

export const deployUpgradePayload = async (
  deployer: L1Deployer,
  addresses: Pick<L1ContractAddresses, 'registryAddress' | 'rollupAddress'>,
) => {
  const payloadAddress = await deployer.deploy(l1Artifacts.registerNewRollupVersionPayload, [
    addresses.registryAddress.toString(),
    addresses.rollupAddress.toString(),
  ]);

  return payloadAddress;
};

export const deployRollup = async (
  clients: L1Clients,
  deployer: L1Deployer,
  args: DeployL1ContractsArgs,
  addresses: Pick<L1ContractAddresses, 'feeJuicePortalAddress' | 'rewardDistributorAddress' | 'stakingAssetAddress'>,
  logger: Logger,
): Promise<RollupContract> => {
  const rollupConfigArgs = {
    aztecSlotDuration: args.aztecSlotDuration,
    aztecEpochDuration: args.aztecEpochDuration,
    targetCommitteeSize: args.aztecTargetCommitteeSize,
    aztecProofSubmissionWindow: args.aztecProofSubmissionWindow,
    minimumStake: args.minimumStake,
    slashingQuorum: args.slashingQuorum,
    slashingRoundSize: args.slashingRoundSize,
  };
  logger.verbose(`Rollup config args`, rollupConfigArgs);
  const rollupArgs = [
    addresses.feeJuicePortalAddress.toString(),
    addresses.rewardDistributorAddress.toString(),
    addresses.stakingAssetAddress.toString(),
    args.vkTreeRoot.toString(),
    args.protocolContractTreeRoot.toString(),
    args.genesisArchiveRoot.toString(),
    args.genesisBlockHash.toString(),
    clients.walletClient.account.address.toString(),
    rollupConfigArgs,
  ];

  const rollupAddress = await deployer.deploy(l1Artifacts.rollup, rollupArgs);
  logger.verbose(`Deployed Rollup at ${rollupAddress}`, rollupConfigArgs);

  await deployer.waitForDeployments();
  logger.verbose(`All core contracts have been deployed`);

  const rollup = getContract({
    address: getAddress(rollupAddress.toString()),
    abi: l1Artifacts.rollup.contractAbi,
    client: clients.walletClient,
  });

  const txHashes: Hex[] = [];

  if (args.initialValidators && args.initialValidators.length > 0) {
    // Check if some of the initial validators are already registered, so we support idempotent deployments
    const validatorsInfo = await Promise.all(
      args.initialValidators.map(async address => ({ address, ...(await rollup.read.getInfo([address.toString()])) })),
    );
    const existingValidators = validatorsInfo.filter(v => v.status !== 0);
    if (existingValidators.length > 0) {
      logger.warn(
        `Validators ${existingValidators.map(v => v.address).join(', ')} already exist. Skipping from initialization.`,
      );
    }

    const newValidatorsAddresses = validatorsInfo.filter(v => v.status === 0).map(v => v.address.toString());

    if (newValidatorsAddresses.length > 0) {
      const stakingAsset = getContract({
        address: addresses.stakingAssetAddress.toString(),
        abi: l1Artifacts.stakingAsset.contractAbi,
        client: clients.walletClient,
      });
      // Mint tokens, approve them, use cheat code to initialise validator set without setting up the epoch.
      const stakeNeeded = args.minimumStake * BigInt(newValidatorsAddresses.length);
      await Promise.all(
        [
          await stakingAsset.write.mint([clients.walletClient.account.address, stakeNeeded], {} as any),
          await stakingAsset.write.approve([rollupAddress.toString(), stakeNeeded], {} as any),
        ].map(txHash => clients.publicClient.waitForTransactionReceipt({ hash: txHash })),
      );

      const validators = newValidatorsAddresses.map(v => ({
        attester: v,
        proposer: getExpectedAddress(ForwarderAbi, ForwarderBytecode, [v], v).address,
        withdrawer: v,
        amount: args.minimumStake,
      }));
      const initiateValidatorSetTxHash = await rollup.write.cheat__InitialiseValidatorSet([validators]);
      txHashes.push(initiateValidatorSetTxHash);
      logger.info(`Initialized validator set`, {
        validators,
        txHash: initiateValidatorSetTxHash,
      });
    }
  }

  await Promise.all(txHashes.map(txHash => clients.publicClient.waitForTransactionReceipt({ hash: txHash })));

  return new RollupContract(clients.publicClient, rollupAddress);
};

/**
 * Deploys the aztec L1 contracts; Rollup & (optionally) Decoder Helper.
 * @param rpcUrls - List of URLs of the ETH RPC to use for deployment.
 * @param account - Private Key or HD Account that will deploy the contracts.
 * @param chain - The chain instance to deploy to.
 * @param logger - A logger object.
 * @param args - Arguments for initialization of L1 contracts
 * @returns A list of ETH addresses of the deployed contracts.
 */
export const deployL1Contracts = async (
  rpcUrls: string[],
  account: HDAccount | PrivateKeyAccount,
  chain: Chain,
  logger: Logger,
  args: DeployL1ContractsArgs,
  txUtilsConfig: L1TxUtilsConfig = defaultL1TxUtilsConfig,
): Promise<DeployL1ContractsReturnType> => {
  // We are assuming that you are running this on a local anvil node which have 1s block times
  // To align better with actual deployment, we update the block interval to 12s
  const { walletClient, publicClient } = createL1Clients(rpcUrls, account, chain);

  const rpcCall = async (method: string, params: any[]) => {
    logger.info(`Calling ${method} with params: ${JSON.stringify(params)}`);
    return (await publicClient.transport.request({
      method,
      params,
    })) as any;
  };

  if (isAnvilTestChain(chain.id)) {
    try {
      await rpcCall('anvil_setBlockTimestampInterval', [args.ethereumSlotDuration]);
      logger.warn(`Set block interval to ${args.ethereumSlotDuration}`);
    } catch (e) {
      logger.error(`Error setting block interval: ${e}`);
    }
  }

  logger.verbose(`Deploying contracts from ${account.address.toString()}`);

  // Governance stuff
  const deployer = new L1Deployer(walletClient, publicClient, args.salt, logger, txUtilsConfig);

  const registryAddress = await deployer.deploy(l1Artifacts.registry, [account.address.toString()]);
  logger.verbose(`Deployed Registry at ${registryAddress}`);

  const feeAssetAddress = await deployer.deploy(l1Artifacts.feeAsset, ['FeeJuice', 'FEE', account.address.toString()]);
  logger.verbose(`Deployed Fee Juice at ${feeAssetAddress}`);

  const stakingAssetAddress = await deployer.deploy(l1Artifacts.stakingAsset, [
    'Staking',
    'STK',
    account.address.toString(),
  ]);
  logger.verbose(`Deployed Staking Asset at ${stakingAssetAddress}`);

  const governanceProposerAddress = await deployer.deploy(l1Artifacts.governanceProposer, [
    registryAddress.toString(),
    args.governanceProposerQuorum,
    args.governanceProposerRoundSize,
  ]);
  logger.verbose(`Deployed GovernanceProposer at ${governanceProposerAddress}`);

  // @note @LHerskind the assets are expected to be the same at some point, but for better
  // configurability they are different for now.
  const governanceAddress = await deployer.deploy(l1Artifacts.governance, [
    feeAssetAddress.toString(),
    governanceProposerAddress.toString(),
  ]);
  logger.verbose(`Deployed Governance at ${governanceAddress}`);

  const coinIssuerAddress = await deployer.deploy(l1Artifacts.coinIssuer, [
    feeAssetAddress.toString(),
    1n * 10n ** 18n, // @todo  #8084
    governanceAddress.toString(),
  ]);
  logger.verbose(`Deployed CoinIssuer at ${coinIssuerAddress}`);

  const rewardDistributorAddress = await deployer.deploy(l1Artifacts.rewardDistributor, [
    feeAssetAddress.toString(),
    registryAddress.toString(),
    governanceAddress.toString(),
  ]);
  logger.verbose(`Deployed RewardDistributor at ${rewardDistributorAddress}`);

  const feeJuicePortalAddress = await deployer.deploy(l1Artifacts.feeJuicePortal, [
    registryAddress.toString(),
    feeAssetAddress.toString(),
    args.l2FeeJuiceAddress.toString(),
  ]);
  logger.verbose(`Deployed Fee Juice Portal at ${feeJuicePortalAddress}`);

  logger.verbose(`Waiting for governance contracts to be deployed`);
  await deployer.waitForDeployments();
  logger.verbose(`All governance contracts deployed`);

  const feeJuicePortal = getContract({
    address: feeJuicePortalAddress.toString(),
    abi: l1Artifacts.feeJuicePortal.contractAbi,
    client: walletClient,
  });

  const feeAsset = getContract({
    address: feeAssetAddress.toString(),
    abi: l1Artifacts.feeAsset.contractAbi,
    client: walletClient,
  });
  // Transaction hashes to await
  const txHashes: Hex[] = [];

  if (!(await feeAsset.read.freeForAll())) {
    const txHash = await feeAsset.write.setFreeForAll([true], {} as any);
    logger.verbose(`Fee asset set to free for all in ${txHash}`);
    txHashes.push(txHash);
  }

  if ((await feeAsset.read.owner()) !== getAddress(coinIssuerAddress.toString())) {
    const txHash = await feeAsset.write.transferOwnership([coinIssuerAddress.toString()], { account });
    logger.verbose(`Fee asset transferred ownership to coin issuer in ${txHash}`);
    txHashes.push(txHash);
  }

  // @note  This value MUST match what is in `constants.nr`. It is currently specified here instead of just importing
  //        because there is circular dependency hell. This is a temporary solution. #3342
  // @todo  #8084
  // fund the portal contract with Fee Juice
  const FEE_JUICE_INITIAL_MINT = 200000000000000000000000n;
  const mintTxHash = await feeAsset.write.mint([feeJuicePortalAddress.toString(), FEE_JUICE_INITIAL_MINT], {} as any);

  // @note  This is used to ensure we fully wait for the transaction when running against a real chain
  //        otherwise we execute subsequent transactions too soon
  await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
  logger.verbose(`Funding fee juice portal contract with fee juice in ${mintTxHash}`);

  if (!(await feeJuicePortal.read.initialized())) {
    const initPortalTxHash = await feeJuicePortal.write.initialize();
    txHashes.push(initPortalTxHash);
    logger.verbose(`Fee juice portal initializing in tx ${initPortalTxHash}`);
  } else {
    logger.verbose(`Fee juice portal is already initialized`);
  }

  logger.verbose(
    `Initialized Fee Juice Portal at ${feeJuicePortalAddress} to bridge between L1 ${feeAssetAddress} to L2 ${args.l2FeeJuiceAddress}`,
  );

  const rollup = await deployRollup(
    {
      walletClient,
      publicClient,
    },
    deployer,
    args,
    { feeJuicePortalAddress, rewardDistributorAddress, stakingAssetAddress },
    logger,
  );
  const slashFactoryAddress = await deploySlashFactory(deployer, rollup.address, logger);

  logger.verbose('Waiting for rollup and slash factory to be deployed');
  await deployer.waitForDeployments();
  logger.verbose(`Rollup and slash factory deployed`);

  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(registryAddress.toString()),
    abi: l1Artifacts.registry.contractAbi,
    client: walletClient,
  });

  if (!(await registryContract.read.isRollupRegistered([getAddress(rollup.address.toString())]))) {
    const upgradeTxHash = await registryContract.write.upgrade([getAddress(rollup.address.toString())], { account });
    logger.verbose(
      `Upgrading registry contract at ${registryAddress} to rollup ${rollup.address} in tx ${upgradeTxHash}`,
    );
    txHashes.push(upgradeTxHash);
  } else {
    logger.verbose(`Registry ${registryAddress} has already registered rollup ${rollup.address}`);
  }

  // If the owner is not the Governance contract, transfer ownership to the Governance contract
  if ((await registryContract.read.owner()) !== getAddress(governanceAddress.toString())) {
    const transferOwnershipTxHash = await registryContract.write.transferOwnership(
      [getAddress(governanceAddress.toString())],
      {
        account,
      },
    );
    logger.verbose(
      `Transferring the ownership of the registry contract at ${registryAddress} to the Governance ${governanceAddress} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
  }

  // Wait for all actions to be mined
  await Promise.all(txHashes.map(txHash => publicClient.waitForTransactionReceipt({ hash: txHash })));
  logger.verbose(`All transactions for L1 deployment have been mined`);
  const l1Contracts = await RegistryContract.collectAddresses(publicClient, registryAddress, 'canonical');

  logger.info(`Aztec L1 contracts initialized`, l1Contracts);

  if (isAnvilTestChain(chain.id)) {
    // @note  We make a time jump PAST the very first slot to not have to deal with the edge case of the first slot.
    //        The edge case being that the genesis block is already occupying slot 0, so we cannot have another block.
    try {
      // Need to get the time
      const currentSlot = await rollup.getSlotNumber();

      if (BigInt(currentSlot) === 0n) {
        const ts = Number(await rollup.getTimestampForSlot(1n));
        await rpcCall('evm_setNextBlockTimestamp', [ts]);
        await rpcCall('hardhat_mine', [1]);
        const currentSlot = await rollup.getSlotNumber();

        if (BigInt(currentSlot) !== 1n) {
          throw new Error(`Error jumping time: current slot is ${currentSlot}`);
        }
        logger.info(`Jumped to slot 1`);
      }
    } catch (e) {
      throw new Error(`Error jumping time: ${e}`);
    }
  }

  return {
    walletClient,
    publicClient,
    l1ContractAddresses: {
      ...l1Contracts,
      slashFactoryAddress,
    },
  };
};

class L1Deployer {
  private salt: Hex | undefined;
  private txHashes: Hex[] = [];
  private l1TxUtils: L1TxUtils;
  constructor(
    private walletClient: ViemWalletClient,
    private publicClient: ViemPublicClient,
    maybeSalt: number | undefined,
    private logger: Logger,
    private txUtilsConfig?: L1TxUtilsConfig,
  ) {
    this.salt = maybeSalt ? padHex(numberToHex(maybeSalt), { size: 32 }) : undefined;
    this.l1TxUtils = new L1TxUtils(this.publicClient, this.walletClient, this.logger, this.txUtilsConfig);
  }

  async deploy(params: ContractArtifacts, args: readonly unknown[] = []): Promise<EthAddress> {
    const { txHash, address } = await deployL1Contract(
      this.walletClient,
      this.publicClient,
      params.contractAbi,
      params.contractBytecode,
      args,
      this.salt,
      params.libraries,
      this.logger,
      this.l1TxUtils,
    );
    if (txHash) {
      this.txHashes.push(txHash);
    }
    return address;
  }

  async waitForDeployments(): Promise<void> {
    await Promise.all(this.txHashes.map(txHash => this.publicClient.waitForTransactionReceipt({ hash: txHash })));
  }
}

// docs:start:deployL1Contract
/**
 * Helper function to deploy ETH contracts.
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param abi - The ETH contract's ABI (as abitype's Abi).
 * @param bytecode  - The ETH contract's bytecode.
 * @param args - Constructor arguments for the contract.
 * @param maybeSalt - Optional salt for CREATE2 deployment (does not wait for deployment tx to be mined if set, does not send tx if contract already exists).
 * @returns The ETH address the contract was deployed to.
 */
export async function deployL1Contract(
  walletClient: ViemWalletClient,
  publicClient: ViemPublicClient,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
  maybeSalt?: Hex,
  libraries?: Libraries,
  logger?: Logger,
  _l1TxUtils?: L1TxUtils,
): Promise<{ address: EthAddress; txHash: Hex | undefined }> {
  let txHash: Hex | undefined = undefined;
  let resultingAddress: Hex | null | undefined = undefined;
  let l1TxUtils: L1TxUtils | undefined = _l1TxUtils;

  if (!l1TxUtils) {
    l1TxUtils = new L1TxUtils(publicClient, walletClient, logger);
  }

  if (libraries) {
    // Note that this does NOT work well for linked libraries having linked libraries.

    // Verify that all link references have corresponding code
    for (const linkRef in libraries.linkReferences) {
      for (const contractName in libraries.linkReferences[linkRef]) {
        if (!libraries.libraryCode[contractName]) {
          throw new Error(`Missing library code for ${contractName}`);
        }
      }
    }

    const replacements: Record<string, EthAddress> = {};
    const libraryTxs: Hex[] = [];
    for (const libraryName in libraries?.libraryCode) {
      const lib = libraries.libraryCode[libraryName];

      const { address, txHash } = await deployL1Contract(
        walletClient,
        publicClient,
        lib.contractAbi,
        lib.contractBytecode,
        [],
        maybeSalt,
        undefined,
        logger,
        l1TxUtils,
      );

      if (txHash) {
        libraryTxs.push(txHash);
      }

      for (const linkRef in libraries.linkReferences) {
        for (const contractName in libraries.linkReferences[linkRef]) {
          // If the library name matches the one we just deployed, we replace it.
          if (contractName !== libraryName) {
            continue;
          }

          // We read the first instance to figure out what we are to replace.
          const start = 2 + 2 * libraries.linkReferences[linkRef][contractName][0].start;
          const length = 2 * libraries.linkReferences[linkRef][contractName][0].length;

          const toReplace = bytecode.slice(start, start + length);
          replacements[toReplace] = address;
        }
      }
    }

    const escapeRegExp = (s: string) => {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special characters
    };

    for (const toReplace in replacements) {
      const replacement = replacements[toReplace].toString().slice(2);
      bytecode = bytecode.replace(new RegExp(escapeRegExp(toReplace), 'g'), replacement) as Hex;
    }

    // Reth fails gas estimation if the deployed contract attempts to call a library that is not yet deployed,
    // so we wait for all library deployments to be mined before deploying the contract.
    if (libraryTxs.length > 0) {
      logger?.verbose(`Awaiting for linked libraries to be deployed`);
      await Promise.all(libraryTxs.map(txHash => publicClient.waitForTransactionReceipt({ hash: txHash })));
    }
  }

  if (maybeSalt) {
    const { address, paddedSalt: salt, calldata } = getExpectedAddress(abi, bytecode, args, maybeSalt);
    resultingAddress = address;
    const existing = await publicClient.getBytecode({ address: resultingAddress });
    if (existing === undefined || existing === '0x') {
      const res = await l1TxUtils.sendTransaction({
        to: DEPLOYER_ADDRESS,
        data: concatHex([salt, calldata]),
      });
      txHash = res.txHash;

      logger?.verbose(`Deployed contract with salt ${salt} to address ${resultingAddress} in tx ${txHash}.`);
    } else {
      logger?.verbose(`Skipping existing deployment of contract with salt ${salt} to address ${resultingAddress}`);
    }
  } else {
    // Regular deployment path
    const deployData = encodeDeployData({ abi, bytecode, args });
    const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
      to: null,
      data: deployData,
    });

    txHash = receipt.transactionHash;
    resultingAddress = receipt.contractAddress;
    if (!resultingAddress) {
      throw new Error(
        `No contract address found in receipt: ${JSON.stringify(receipt, (_, val) =>
          typeof val === 'bigint' ? String(val) : val,
        )}`,
      );
    }
  }

  return { address: EthAddress.fromString(resultingAddress!), txHash };
}

export function getExpectedAddress(
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[],
  salt: Hex,
) {
  const paddedSalt = padHex(salt, { size: 32 });
  const calldata = encodeDeployData({ abi, bytecode, args });
  const address = getContractAddress({
    from: DEPLOYER_ADDRESS,
    salt: paddedSalt,
    bytecode: calldata,
    opcode: 'CREATE2',
  });
  return {
    address,
    paddedSalt,
    calldata,
  };
}

// docs:end:deployL1Contract
