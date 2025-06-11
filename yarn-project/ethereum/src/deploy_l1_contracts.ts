import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  CoinIssuerAbi,
  CoinIssuerBytecode,
  ExtRollupLibAbi,
  ExtRollupLibBytecode,
  FeeAssetHandlerAbi,
  FeeAssetHandlerBytecode,
  FeeJuicePortalAbi,
  FeeJuicePortalBytecode,
  GSEAbi,
  GSEBytecode,
  GovernanceAbi,
  GovernanceBytecode,
  GovernanceProposerAbi,
  GovernanceProposerBytecode,
  HonkVerifierAbi,
  HonkVerifierBytecode,
  InboxAbi,
  InboxBytecode,
  MockVerifierAbi,
  MockVerifierBytecode,
  MockZKPassportVerifierAbi,
  MockZKPassportVerifierBytecode,
  MultiAdderAbi,
  MultiAdderBytecode,
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
  StakingAssetHandlerAbi,
  StakingAssetHandlerBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
  ValidatorSelectionLibAbi,
  ValidatorSelectionLibBytecode,
} from '@aztec/l1-artifacts';

import type { Abi, Narrow } from 'abitype';
import {
  type Chain,
  type HDAccount,
  type Hex,
  type PrivateKeyAccount,
  concatHex,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContract,
  getContractAddress,
  numberToHex,
  padHex,
} from 'viem';
import { foundry } from 'viem/chains';

import { isAnvilTestChain } from './chain.js';
import { createExtendedL1Client } from './client.js';
import { DefaultRewardConfig, type L1ContractsConfig } from './config.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract } from './contracts/rollup.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import {
  type GasPrice,
  type L1GasConfig,
  type L1TxRequest,
  L1TxUtils,
  type L1TxUtilsConfig,
  getL1TxUtilsConfigEnvVars,
} from './l1_tx_utils.js';
import type { ExtendedViemWalletClient } from './types.js';
import { ZK_PASSPORT_SCOPE, ZK_PASSPORT_SUB_SCOPE, ZK_PASSPORT_VERIFIER_ADDRESS } from './zkPassportVerifierAddress.js';

export const DEPLOYER_ADDRESS: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

export type Operator = {
  attester: EthAddress;
  withdrawer: EthAddress;
};

/**
 * Return type of the deployL1Contract function.
 */
export type DeployL1ContractsReturnType = {
  /**
   * Extended Wallet Client Type.
   */
  l1Client: ExtendedViemWalletClient;
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
  feeAssetHandler: {
    contractAbi: FeeAssetHandlerAbi,
    contractBytecode: FeeAssetHandlerBytecode as Hex,
  },
  stakingAssetHandler: {
    contractAbi: StakingAssetHandlerAbi,
    contractBytecode: StakingAssetHandlerBytecode as Hex,
  },
  multiAdder: {
    contractAbi: MultiAdderAbi,
    contractBytecode: MultiAdderBytecode as Hex,
  },
  gse: {
    contractAbi: GSEAbi,
    contractBytecode: GSEBytecode as Hex,
  },
  honkVerifier: {
    contractAbi: HonkVerifierAbi,
    contractBytecode: HonkVerifierBytecode as Hex,
  },
  mockVerifier: {
    contractAbi: MockVerifierAbi,
    contractBytecode: MockVerifierBytecode as Hex,
  },
  mockZkPassportVerifier: {
    contractAbi: MockZKPassportVerifierAbi,
    contractBytecode: MockZKPassportVerifierBytecode as Hex,
  },
};

export interface DeployL1ContractsArgs extends L1ContractsConfig {
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The protocol contract tree root. */
  protocolContractTreeRoot: Fr;
  /** The genesis root of the archive tree. */
  genesisArchiveRoot: Fr;
  /** The salt for CREATE2 deployment. */
  salt: number | undefined;
  /** The initial validators for the rollup contract. */
  initialValidators?: Operator[];
  /** Configuration for the L1 tx utils module. */
  l1TxConfig?: Partial<L1TxUtilsConfig>;
  /** Enable fast mode for deployments (fire and forget transactions) */
  acceleratedTestDeployments?: boolean;
  /** The initial balance of the fee juice portal. This is the amount of fee juice that is prefunded to accounts */
  feeJuicePortalInitialBalance?: bigint;
  /** Whether to deploy the real verifier or the mock verifier */
  realVerifier: boolean;
  /** The zk passport args */
  zkPassportArgs?: ZKPassportArgs;
}

export interface ZKPassportArgs {
  /** Whether to use the mock zk passport verifier */
  mockZkPassportVerifier?: boolean;
  /** The scope of the zk passport - domain (url) */
  zkPassportScope?: string;
  /** The sub-scope of the zk passport - domain seperator (personhood, etc) */
  zkPassportSubScope?: string;
}

export const deploySharedContracts = async (
  l1Client: ExtendedViemWalletClient,
  deployer: L1Deployer,
  args: DeployL1ContractsArgs,
  logger: Logger,
) => {
  const txHashes: Hex[] = [];

  const feeAssetAddress = await deployer.deploy(l1Artifacts.feeAsset, [
    'FeeJuice',
    'FEE',
    l1Client.account.address.toString(),
  ]);
  logger.verbose(`Deployed Fee Asset at ${feeAssetAddress}`);

  const stakingAssetAddress = await deployer.deploy(l1Artifacts.stakingAsset, [
    'Staking',
    'STK',
    l1Client.account.address.toString(),
  ]);
  logger.verbose(`Deployed Staking Asset at ${stakingAssetAddress}`);

  const gseAddress = await deployer.deploy(l1Artifacts.gse, [
    l1Client.account.address.toString(),
    stakingAssetAddress.toString(),
  ]);
  logger.verbose(`Deployed GSE at ${gseAddress}`);

  const registryAddress = await deployer.deploy(l1Artifacts.registry, [
    l1Client.account.address.toString(),
    feeAssetAddress.toString(),
  ]);
  logger.verbose(`Deployed Registry at ${registryAddress}`);

  const governanceProposerAddress = await deployer.deploy(l1Artifacts.governanceProposer, [
    registryAddress.toString(),
    gseAddress.toString(),
    args.governanceProposerQuorum,
    args.governanceProposerRoundSize,
  ]);
  logger.verbose(`Deployed GovernanceProposer at ${governanceProposerAddress}`);

  // @note @LHerskind the assets are expected to be the same at some point, but for better
  // configurability they are different for now.
  const governanceAddress = await deployer.deploy(l1Artifacts.governance, [
    stakingAssetAddress.toString(),
    governanceProposerAddress.toString(),
    gseAddress.toString(),
  ]);
  logger.verbose(`Deployed Governance at ${governanceAddress}`);

  let needToSetGovernance = false;

  const existingCode = await l1Client.getCode({ address: gseAddress.toString() });
  if (!existingCode || existingCode === '0x') {
    needToSetGovernance = true;
  } else {
    const gseContract = getContract({
      address: getAddress(gseAddress.toString()),
      abi: l1Artifacts.gse.contractAbi,
      client: l1Client,
    });
    const existingGovernance = await gseContract.read.getGovernance();
    if (EthAddress.fromString(existingGovernance).equals(EthAddress.ZERO)) {
      needToSetGovernance = true;
    }
  }

  if (needToSetGovernance) {
    const { txHash } = await deployer.sendTransaction(
      {
        to: gseAddress.toString(),
        data: encodeFunctionData({
          abi: l1Artifacts.gse.contractAbi,
          functionName: 'setGovernance',
          args: [governanceAddress.toString()],
        }),
      },
      { gasLimit: 100_000n },
    );

    logger.verbose(`Set governance on GSE in ${txHash}`);
    txHashes.push(txHash);
  }

  const coinIssuerAddress = await deployer.deploy(l1Artifacts.coinIssuer, [
    feeAssetAddress.toString(),
    1n * 10n ** 18n, // @todo  #8084
    governanceAddress.toString(),
  ]);
  logger.verbose(`Deployed CoinIssuer at ${coinIssuerAddress}`);

  const feeAsset = getContract({
    address: feeAssetAddress.toString(),
    abi: l1Artifacts.feeAsset.contractAbi,
    client: l1Client,
  });

  logger.verbose(`Waiting for deployments to complete`);
  await deployer.waitForDeployments();

  if (args.acceleratedTestDeployments || !(await feeAsset.read.minters([coinIssuerAddress.toString()]))) {
    const { txHash } = await deployer.sendTransaction(
      {
        to: feeAssetAddress.toString(),
        data: encodeFunctionData({
          abi: l1Artifacts.feeAsset.contractAbi,
          functionName: 'addMinter',
          args: [coinIssuerAddress.toString()],
        }),
      },
      { gasLimit: 100_000n },
    );
    logger.verbose(`Added coin issuer ${coinIssuerAddress} as minter on fee asset in ${txHash}`);
    txHashes.push(txHash);
  }

  const { txHash: setGovernanceTxHash } = await deployer.sendTransaction({
    to: registryAddress.toString(),
    data: encodeFunctionData({
      abi: l1Artifacts.registry.contractAbi,
      functionName: 'updateGovernance',
      args: [governanceAddress.toString()],
    }),
  });

  txHashes.push(setGovernanceTxHash);

  let feeAssetHandlerAddress: EthAddress | undefined = undefined;
  let stakingAssetHandlerAddress: EthAddress | undefined = undefined;
  let zkPassportVerifierAddress: EthAddress | undefined = undefined;

  // Only if not on mainnet will we deploy the handlers
  if (l1Client.chain.id !== 1) {
    /* -------------------------------------------------------------------------- */
    /*                          CHEAT CODES START HERE                            */
    /* -------------------------------------------------------------------------- */

    feeAssetHandlerAddress = await deployer.deploy(l1Artifacts.feeAssetHandler, [
      l1Client.account.address,
      feeAssetAddress.toString(),
      BigInt(1e18),
    ]);
    logger.verbose(`Deployed FeeAssetHandler at ${feeAssetHandlerAddress}`);

    const { txHash } = await deployer.sendTransaction({
      to: feeAssetAddress.toString(),
      data: encodeFunctionData({
        abi: l1Artifacts.feeAsset.contractAbi,
        functionName: 'addMinter',
        args: [feeAssetHandlerAddress.toString()],
      }),
    });
    logger.verbose(`Added fee asset handler ${feeAssetHandlerAddress} as minter on fee asset in ${txHash}`);
    txHashes.push(txHash);

    // Only if on sepolia will we deploy the staking asset handler
    // Should not be deployed to devnet since it would cause caos with sequencers there etc.
    if ([11155111, foundry.id].includes(l1Client.chain.id)) {
      const AMIN = EthAddress.fromString('0x3b218d0F26d15B36C715cB06c949210a0d630637');
      zkPassportVerifierAddress = await getZkPassportVerifierAddress(deployer, args);
      const [scope, subscope] = getZkPassportScopes(args);

      stakingAssetHandlerAddress = await deployer.deploy(l1Artifacts.stakingAssetHandler, [
        l1Client.account.address,
        stakingAssetAddress.toString(),
        registryAddress.toString(),
        AMIN.toString(), // withdrawer,
        BigInt(60 * 60 * 24), // mintInterval,
        BigInt(10), // depositsPerMint,
        zkPassportVerifierAddress.toString(),
        [AMIN.toString()], // isUnhinged,
        // Scopes
        scope,
        subscope,
        args.zkPassportArgs?.mockZkPassportVerifier ?? false, // skip Address Bind check - needed for testing without generating proofs
      ]);
      logger.verbose(`Deployed StakingAssetHandler at ${stakingAssetHandlerAddress}`);

      const { txHash: stakingMinterTxHash } = await deployer.sendTransaction({
        to: stakingAssetAddress.toString(),
        data: encodeFunctionData({
          abi: l1Artifacts.stakingAsset.contractAbi,
          functionName: 'addMinter',
          args: [stakingAssetHandlerAddress.toString()],
        }),
      });
      logger.verbose(
        `Added staking asset handler ${stakingAssetHandlerAddress} as minter on staking asset in ${stakingMinterTxHash}`,
      );
      txHashes.push(stakingMinterTxHash);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                           CHEAT CODES END HERE                             */
  /* -------------------------------------------------------------------------- */

  logger.verbose(`Waiting for deployments to complete`);
  await deployer.waitForDeployments();
  await Promise.all(txHashes.map(txHash => l1Client.waitForTransactionReceipt({ hash: txHash })));

  logger.verbose(`Deployed shared contracts`);

  const registry = new RegistryContract(l1Client, registryAddress);

  /* -------------------------------------------------------------------------- */
  /*                      FUND REWARD DISTRIBUTOR START                         */
  /* -------------------------------------------------------------------------- */

  const rewardDistributorAddress = await registry.getRewardDistributor();

  const rewardDistributor = getContract({
    address: rewardDistributorAddress.toString(),
    abi: l1Artifacts.rewardDistributor.contractAbi,
    client: l1Client,
  });

  const blockReward = await rewardDistributor.read.BLOCK_REWARD();

  const funding = blockReward * 200000n;
  const { txHash: fundRewardDistributorTxHash } = await deployer.sendTransaction({
    to: feeAssetAddress.toString(),
    data: encodeFunctionData({
      abi: l1Artifacts.feeAsset.contractAbi,
      functionName: 'mint',
      args: [rewardDistributorAddress.toString(), funding],
    }),
  });

  logger.verbose(`Funded reward distributor with ${funding} fee asset in ${fundRewardDistributorTxHash}`);

  /* -------------------------------------------------------------------------- */
  /*                      FUND REWARD DISTRIBUTOR STOP                          */
  /* -------------------------------------------------------------------------- */

  return {
    feeAssetAddress,
    feeAssetHandlerAddress,
    stakingAssetAddress,
    stakingAssetHandlerAddress,
    zkPassportVerifierAddress,
    registryAddress,
    gseAddress,
    governanceAddress,
    governanceProposerAddress,
    coinIssuerAddress,
    rewardDistributorAddress: await registry.getRewardDistributor(),
  };
};

const getZkPassportVerifierAddress = async (deployer: L1Deployer, args: DeployL1ContractsArgs): Promise<EthAddress> => {
  if (args.zkPassportArgs?.mockZkPassportVerifier) {
    return await deployer.deploy(l1Artifacts.mockZkPassportVerifier);
  }
  return ZK_PASSPORT_VERIFIER_ADDRESS;
};

/**
 * Get the zk passport scopes - default to testnet values if not provided
 * @param args - The deployment arguments
 * @returns The zk passport scopes
 */
const getZkPassportScopes = (args: DeployL1ContractsArgs): [string, string] => {
  const scope = args.zkPassportArgs?.zkPassportScope ?? ZK_PASSPORT_SCOPE;
  const subscope = args.zkPassportArgs?.zkPassportSubScope ?? ZK_PASSPORT_SUB_SCOPE;
  return [scope, subscope];
};

/**
 * Deploys a new rollup, using the existing canonical version to derive certain values (addresses of assets etc).
 * @param clients - The L1 clients.
 * @param args - The deployment arguments.
 * @param registryAddress - The address of the registry.
 * @param logger - The logger.
 * @param txUtilsConfig - The L1 tx utils config.
 */
export const deployRollupForUpgrade = async (
  extendedClient: ExtendedViemWalletClient,
  args: Omit<
    DeployL1ContractsArgs,
    'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'minimumStake' | 'depositAmount'
  >,
  registryAddress: EthAddress,
  logger: Logger,
  txUtilsConfig: L1TxUtilsConfig,
) => {
  const deployer = new L1Deployer(extendedClient, args.salt, args.acceleratedTestDeployments, logger, txUtilsConfig);

  const addresses = await RegistryContract.collectAddresses(extendedClient, registryAddress, 'canonical');

  const { rollup, slashFactoryAddress } = await deployRollup(extendedClient, deployer, args, addresses, logger);

  await deployer.waitForDeployments();

  return { rollup, slashFactoryAddress };
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

/**
 * Deploys a new rollup contract, funds and initializes the fee juice portal, and initializes the validator set.
 */
export const deployRollup = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  args: Omit<
    DeployL1ContractsArgs,
    'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'minimumStake' | 'depositAmount'
  >,
  addresses: Pick<
    L1ContractAddresses,
    'feeJuiceAddress' | 'registryAddress' | 'rewardDistributorAddress' | 'stakingAssetAddress' | 'gseAddress'
  >,
  logger: Logger,
) => {
  if (!addresses.gseAddress) {
    throw new Error('GSE address is required when deploying');
  }

  const txHashes: Hex[] = [];

  let epochProofVerifier = EthAddress.ZERO;

  if (args.realVerifier) {
    epochProofVerifier = await deployer.deploy(l1Artifacts.honkVerifier);
    logger.verbose(`Rollup will use the real verifier at ${epochProofVerifier}`);
  } else {
    epochProofVerifier = await deployer.deploy(l1Artifacts.mockVerifier);
    logger.verbose(`Rollup will use the mock verifier at ${epochProofVerifier}`);
  }

  const rollupConfigArgs = {
    aztecSlotDuration: args.aztecSlotDuration,
    aztecEpochDuration: args.aztecEpochDuration,
    targetCommitteeSize: args.aztecTargetCommitteeSize,
    aztecProofSubmissionWindow: args.aztecProofSubmissionWindow,
    slashingQuorum: args.slashingQuorum,
    slashingRoundSize: args.slashingRoundSize,
    manaTarget: args.manaTarget,
    provingCostPerMana: args.provingCostPerMana,
    rewardConfig: DefaultRewardConfig,
  };
  const genesisStateArgs = {
    vkTreeRoot: args.vkTreeRoot.toString(),
    protocolContractTreeRoot: args.protocolContractTreeRoot.toString(),
    genesisArchiveRoot: args.genesisArchiveRoot.toString(),
  };
  logger.verbose(`Rollup config args`, rollupConfigArgs);

  const rollupArgs = [
    addresses.feeJuiceAddress.toString(),
    addresses.rewardDistributorAddress.toString(),
    addresses.stakingAssetAddress.toString(),
    addresses.gseAddress.toString(),
    epochProofVerifier.toString(),
    extendedClient.account.address.toString(),
    genesisStateArgs,
    rollupConfigArgs,
  ];

  const rollupAddress = await deployer.deploy(l1Artifacts.rollup, rollupArgs);
  logger.verbose(`Deployed Rollup at ${rollupAddress}`, rollupConfigArgs);

  const rollupContract = new RollupContract(extendedClient, rollupAddress);

  await deployer.waitForDeployments();
  logger.verbose(`All core contracts have been deployed`);

  if (args.feeJuicePortalInitialBalance && args.feeJuicePortalInitialBalance > 0n) {
    const feeJuicePortalAddress = await rollupContract.getFeeJuicePortal();

    // In fast mode, use the L1TxUtils to send transactions with nonce management
    const { txHash: mintTxHash } = await deployer.sendTransaction({
      to: addresses.feeJuiceAddress.toString(),
      data: encodeFunctionData({
        abi: l1Artifacts.feeAsset.contractAbi,
        functionName: 'mint',
        args: [feeJuicePortalAddress.toString(), args.feeJuicePortalInitialBalance],
      }),
    });
    logger.verbose(
      `Funding fee juice portal with ${args.feeJuicePortalInitialBalance} fee juice in ${mintTxHash} (accelerated test deployments)`,
    );
    txHashes.push(mintTxHash);
  }

  const slashFactoryAddress = await deployer.deploy(l1Artifacts.slashFactory, [rollupAddress.toString()]);
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);

  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(addresses.registryAddress.toString()),
    abi: l1Artifacts.registry.contractAbi,
    client: extendedClient,
  });

  // Only if we are the owner will we be sending these transactions
  if ((await registryContract.read.owner()) === getAddress(extendedClient.account.address)) {
    const version = await rollupContract.getVersion();
    try {
      const retrievedRollupAddress = await registryContract.read.getRollup([version]);
      logger.verbose(`Rollup ${retrievedRollupAddress} already exists in registry`);
    } catch {
      const { txHash: addRollupTxHash } = await deployer.sendTransaction({
        to: addresses.registryAddress.toString(),
        data: encodeFunctionData({
          abi: l1Artifacts.registry.contractAbi,
          functionName: 'addRollup',
          args: [getAddress(rollupContract.address)],
        }),
      });
      logger.verbose(
        `Adding rollup ${rollupContract.address} to registry ${addresses.registryAddress} in tx ${addRollupTxHash}`,
      );

      txHashes.push(addRollupTxHash);
    }
  } else {
    logger.verbose(`Not the owner of the registry, skipping rollup addition`);
  }

  // We need to call a function on the registry to set the various contract addresses.
  const gseContract = getContract({
    address: getAddress(addresses.gseAddress.toString()),
    abi: l1Artifacts.gse.contractAbi,
    client: extendedClient,
  });
  if ((await gseContract.read.owner()) === getAddress(extendedClient.account.address)) {
    if (!(await gseContract.read.isRollupRegistered([rollupContract.address]))) {
      const { txHash: addRollupTxHash } = await deployer.sendTransaction({
        to: addresses.gseAddress.toString(),
        data: encodeFunctionData({
          abi: l1Artifacts.gse.contractAbi,
          functionName: 'addRollup',
          args: [getAddress(rollupContract.address)],
        }),
      });
      logger.verbose(`Adding rollup ${rollupContract.address} to GSE ${addresses.gseAddress} in tx ${addRollupTxHash}`);

      // wait for this tx to land in case we have to register initialValidators
      await extendedClient.waitForTransactionReceipt({ hash: addRollupTxHash });
    } else {
      logger.verbose(`Rollup ${rollupContract.address} is already registered in GSE ${addresses.gseAddress}`);
    }
  } else {
    logger.verbose(`Not the owner of the gse, skipping rollup addition`);
  }

  if (args.initialValidators && (await gseContract.read.isRollupRegistered([rollupContract.address]))) {
    await addMultipleValidators(
      extendedClient,
      deployer,
      rollupAddress.toString(),
      addresses.stakingAssetAddress.toString(),
      args.initialValidators,
      args.acceleratedTestDeployments,
      logger,
    );
  }

  await deployer.waitForDeployments();
  await Promise.all(txHashes.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));
  logger.verbose(`Rollup deployed`);

  return { rollup: rollupContract, slashFactoryAddress };
};

export const handoverToGovernance = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  registryAddress: EthAddress,
  gseAddress: EthAddress,
  governanceAddress: EthAddress,
  logger: Logger,
  acceleratedTestDeployments: boolean | undefined,
) => {
  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(registryAddress.toString()),
    abi: l1Artifacts.registry.contractAbi,
    client: extendedClient,
  });

  const gseContract = getContract({
    address: getAddress(gseAddress.toString()),
    abi: l1Artifacts.gse.contractAbi,
    client: extendedClient,
  });

  const txHashes: Hex[] = [];

  // If the owner is not the Governance contract, transfer ownership to the Governance contract
  if (
    acceleratedTestDeployments ||
    (await registryContract.read.owner()) !== getAddress(governanceAddress.toString())
  ) {
    // TODO(md): add send transaction to the deployer such that we do not need to manage tx hashes here
    const { txHash: transferOwnershipTxHash } = await deployer.sendTransaction({
      to: registryAddress.toString(),
      data: encodeFunctionData({
        abi: l1Artifacts.registry.contractAbi,
        functionName: 'transferOwnership',
        args: [getAddress(governanceAddress.toString())],
      }),
    });
    logger.verbose(
      `Transferring the ownership of the registry contract at ${registryAddress} to the Governance ${governanceAddress} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
  }

  // If the owner is not the Governance contract, transfer ownership to the Governance contract
  if (acceleratedTestDeployments || (await gseContract.read.owner()) !== getAddress(governanceAddress.toString())) {
    // TODO(md): add send transaction to the deployer such that we do not need to manage tx hashes here
    const { txHash: transferOwnershipTxHash } = await deployer.sendTransaction({
      to: gseContract.address,
      data: encodeFunctionData({
        abi: l1Artifacts.gse.contractAbi,
        functionName: 'transferOwnership',
        args: [getAddress(governanceAddress.toString())],
      }),
    });
    logger.verbose(
      `Transferring the ownership of the gse contract at ${gseAddress} to the Governance ${governanceAddress} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
  }

  // Wait for all actions to be mined
  await deployer.waitForDeployments();
  await Promise.all(txHashes.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));
};

/*
 * Adds multiple validators to the rollup
 *
 * @param extendedClient - The L1 clients.
 * @param deployer - The L1 deployer.
 * @param rollupAddress - The address of the rollup.
 * @param stakingAssetAddress - The address of the staking asset.
 * @param validators - The validators to initialize.
 * @param acceleratedTestDeployments - Whether to use accelerated test deployments.
 * @param logger - The logger.
 */
export const addMultipleValidators = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  rollupAddress: Hex,
  stakingAssetAddress: Hex,
  validators: Operator[],
  acceleratedTestDeployments: boolean | undefined,
  logger: Logger,
) => {
  const rollup = new RollupContract(extendedClient, rollupAddress);
  const depositAmount = await rollup.getDepositAmount();
  if (validators && validators.length > 0) {
    // Check if some of the initial validators are already registered, so we support idempotent deployments
    if (!acceleratedTestDeployments) {
      const enrichedValidators = await Promise.all(
        validators.map(async operator => ({
          operator,
          status: await rollup.getStatus(operator.attester),
        })),
      );
      const existingValidators = enrichedValidators.filter(v => v.status !== 0);
      if (existingValidators.length > 0) {
        logger.warn(
          `Validators ${existingValidators
            .map(v => v.operator.attester)
            .join(', ')} already exist. Skipping from initialization.`,
        );
      }

      validators = enrichedValidators.filter(v => v.status === 0).map(v => v.operator);
    }

    if (validators.length > 0) {
      const multiAdder = await deployer.deploy(l1Artifacts.multiAdder, [
        rollupAddress,
        deployer.client.account.address,
      ]);

      const validatorsTuples = validators.map(v => ({
        attester: getAddress(v.attester.toString()),
        withdrawer: getAddress(v.withdrawer.toString()),
      }));

      // Mint tokens, approve them, use cheat code to initialise validator set without setting up the epoch.
      const stakeNeeded = depositAmount * BigInt(validators.length);
      const { txHash } = await deployer.sendTransaction({
        to: stakingAssetAddress,
        data: encodeFunctionData({
          abi: l1Artifacts.stakingAsset.contractAbi,
          functionName: 'mint',
          args: [multiAdder.toString(), stakeNeeded],
        }),
      });
      const receipt = await extendedClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== 'success') {
        throw new Error(`Failed to mint staking assets for validators: ${receipt.status}`);
      }

      const addValidatorsTxHash = await deployer.client.writeContract({
        address: multiAdder.toString(),
        abi: l1Artifacts.multiAdder.contractAbi,
        functionName: 'addValidators',
        args: [validatorsTuples],
      });
      await extendedClient.waitForTransactionReceipt({ hash: addValidatorsTxHash });
      logger.info(`Initialized validator set`, {
        validators,
        txHash: addValidatorsTxHash,
      });
    }
  }
};

/**
 * Initialize the fee asset handler and make it a minter on the fee asset.
 * @note This function will only be used for testing purposes.
 *
 * @param extendedClient - The L1 clients.
 * @param deployer - The L1 deployer.
 * @param feeAssetAddress - The address of the fee asset.
 * @param logger - The logger.
 */
// eslint-disable-next-line camelcase
export const cheat_initializeFeeAssetHandler = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  feeAssetAddress: EthAddress,
  logger: Logger,
): Promise<{
  feeAssetHandlerAddress: EthAddress;
  txHash: Hex;
}> => {
  const feeAssetHandlerAddress = await deployer.deploy(l1Artifacts.feeAssetHandler, [
    extendedClient.account.address,
    feeAssetAddress.toString(),
    BigInt(1e18),
  ]);
  logger.verbose(`Deployed FeeAssetHandler at ${feeAssetHandlerAddress}`);

  const { txHash } = await deployer.sendTransaction({
    to: feeAssetAddress.toString(),
    data: encodeFunctionData({
      abi: l1Artifacts.feeAsset.contractAbi,
      functionName: 'addMinter',
      args: [feeAssetHandlerAddress.toString()],
    }),
  });
  logger.verbose(`Added fee asset handler ${feeAssetHandlerAddress} as minter on fee asset in ${txHash}`);
  return { feeAssetHandlerAddress, txHash };
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
  txUtilsConfig: L1TxUtilsConfig = getL1TxUtilsConfigEnvVars(),
): Promise<DeployL1ContractsReturnType> => {
  const l1Client = createExtendedL1Client(rpcUrls, account, chain);

  // We are assuming that you are running this on a local anvil node which have 1s block times
  // To align better with actual deployment, we update the block interval to 12s

  const rpcCall = async (method: string, params: any[]) => {
    logger.info(`Calling ${method} with params: ${JSON.stringify(params)}`);
    return (await l1Client.transport.request({
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

  const deployer = new L1Deployer(l1Client, args.salt, args.acceleratedTestDeployments, logger, txUtilsConfig);

  const {
    feeAssetAddress,
    feeAssetHandlerAddress,
    stakingAssetAddress,
    stakingAssetHandlerAddress,
    registryAddress,
    gseAddress,
    rewardDistributorAddress,
    zkPassportVerifierAddress,
  } = await deploySharedContracts(l1Client, deployer, args, logger);
  const { rollup, slashFactoryAddress } = await deployRollup(
    l1Client,
    deployer,
    args,
    {
      feeJuiceAddress: feeAssetAddress,
      registryAddress,
      gseAddress,
      rewardDistributorAddress,
      stakingAssetAddress,
    },
    logger,
  );

  logger.verbose('Waiting for rollup and slash factory to be deployed');
  await deployer.waitForDeployments();

  logger.verbose(`All transactions for L1 deployment have been mined`);
  const l1Contracts = await RegistryContract.collectAddresses(l1Client, registryAddress, 'canonical');

  logger.info(`Aztec L1 contracts initialized`, l1Contracts);

  logger.info(`Handing over to governance`);

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
    l1Client: l1Client,
    l1ContractAddresses: {
      ...l1Contracts,
      slashFactoryAddress,
      feeAssetHandlerAddress,
      stakingAssetHandlerAddress,
      zkPassportVerifierAddress,
    },
  };
};

export class L1Deployer {
  private salt: Hex | undefined;
  private txHashes: Hex[] = [];
  public readonly l1TxUtils: L1TxUtils;

  constructor(
    public readonly client: ExtendedViemWalletClient,
    maybeSalt: number | undefined,
    private acceleratedTestDeployments: boolean = false,
    private logger: Logger = createLogger('L1Deployer'),
    private txUtilsConfig?: L1TxUtilsConfig,
  ) {
    this.salt = maybeSalt ? padHex(numberToHex(maybeSalt), { size: 32 }) : undefined;
    this.l1TxUtils = new L1TxUtils(this.client, this.logger, this.txUtilsConfig, this.acceleratedTestDeployments);
  }

  async deploy(params: ContractArtifacts, args: readonly unknown[] = []): Promise<EthAddress> {
    const { txHash, address } = await deployL1Contract(
      this.client,
      params.contractAbi,
      params.contractBytecode,
      args,
      this.salt,
      params.libraries,
      this.logger,
      this.l1TxUtils,
      this.acceleratedTestDeployments,
    );
    if (txHash) {
      this.txHashes.push(txHash);
    }
    return address;
  }

  async waitForDeployments(): Promise<void> {
    if (this.acceleratedTestDeployments) {
      this.logger.info('Accelerated test deployments - skipping waiting for deployments');
      return;
    }
    if (this.txHashes.length === 0) {
      return;
    }

    this.logger.info(`Waiting for ${this.txHashes.length} transactions to be mined...`);
    await Promise.all(this.txHashes.map(txHash => this.client.waitForTransactionReceipt({ hash: txHash })));
    this.logger.info('All transactions mined successfully');
  }

  sendTransaction(
    tx: L1TxRequest,
    options?: L1GasConfig,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    return this.l1TxUtils.sendTransaction(tx, options);
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
  extendedClient: ExtendedViemWalletClient,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
  maybeSalt?: Hex,
  libraries?: Libraries,
  logger?: Logger,
  l1TxUtils?: L1TxUtils,
  acceleratedTestDeployments: boolean = false,
): Promise<{ address: EthAddress; txHash: Hex | undefined }> {
  let txHash: Hex | undefined = undefined;
  let resultingAddress: Hex | null | undefined = undefined;

  if (!l1TxUtils) {
    const config = getL1TxUtilsConfigEnvVars();
    l1TxUtils = new L1TxUtils(extendedClient, logger, config, acceleratedTestDeployments);
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
        extendedClient,
        lib.contractAbi,
        lib.contractBytecode,
        [],
        maybeSalt,
        undefined,
        logger,
        l1TxUtils,
        acceleratedTestDeployments,
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
    // However, if we are in fast mode or using debugMaxGasLimit, we will skip simulation, so we can skip waiting.
    if (libraryTxs.length > 0 && !acceleratedTestDeployments) {
      logger?.verbose(`Awaiting for linked libraries to be deployed`);
      await Promise.all(libraryTxs.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));
    } else {
      logger?.verbose(
        `Skipping waiting for linked libraries to be deployed ${
          acceleratedTestDeployments ? '(accelerated test deployments)' : ''
        }`,
      );
    }
  }

  if (maybeSalt) {
    const { address, paddedSalt: salt, calldata } = getExpectedAddress(abi, bytecode, args, maybeSalt);
    resultingAddress = address;
    const existing = await extendedClient.getBytecode({ address: resultingAddress });
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
