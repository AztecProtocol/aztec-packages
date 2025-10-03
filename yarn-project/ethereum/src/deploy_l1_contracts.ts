import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/constants';
import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
import { keccak256String } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import type { Abi, Narrow } from 'abitype';
import { mkdir, writeFile } from 'fs/promises';
import chunk from 'lodash.chunk';
import {
  type Chain,
  type ContractConstructorArgs,
  type HDAccount,
  type Hex,
  type PrivateKeyAccount,
  concatHex,
  encodeAbiParameters,
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
import {
  type L1ContractsConfig,
  getEntryQueueConfig,
  getGovernanceConfiguration,
  getRewardBoostConfig,
  getRewardConfig,
  validateConfig,
} from './config.js';
import { GSEContract } from './contracts/gse.js';
import { deployMulticall3 } from './contracts/multicall.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract, SlashingProposerType } from './contracts/rollup.js';
import {
  CoinIssuerArtifact,
  DateGatedRelayerArtifact,
  FeeAssetArtifact,
  FeeAssetHandlerArtifact,
  GSEArtifact,
  GovernanceArtifact,
  GovernanceProposerArtifact,
  MultiAdderArtifact,
  RegisterNewRollupVersionPayloadArtifact,
  RegistryArtifact,
  RollupArtifact,
  SlashFactoryArtifact,
  StakingAssetArtifact,
  StakingAssetHandlerArtifact,
  l1ArtifactsVerifiers,
  mockVerifiers,
} from './l1_artifacts.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import {
  type GasPrice,
  type L1TxConfig,
  type L1TxRequest,
  L1TxUtils,
  type L1TxUtilsConfig,
  createL1TxUtilsFromViemWallet,
  getL1TxUtilsConfigEnvVars,
} from './l1_tx_utils/index.js';
import type { ExtendedViemWalletClient } from './types.js';
import { formatViemError } from './utils.js';
import { ZK_PASSPORT_DOMAIN, ZK_PASSPORT_SCOPE, ZK_PASSPORT_VERIFIER_ADDRESS } from './zkPassportVerifierAddress.js';

export const DEPLOYER_ADDRESS: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

export type Operator = {
  attester: EthAddress;
  withdrawer: EthAddress;
  bn254SecretKey: SecretValue<bigint>;
};

/**
 * Return type of the deployL1Contract function.
 */
export type DeployL1ContractsReturnType = {
  /** Extended Wallet Client Type. */
  l1Client: ExtendedViemWalletClient;
  /** The currently deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Version of the current rollup contract. */
  rollupVersion: number;
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
export interface ContractArtifacts<TAbi extends Abi | readonly unknown[] = Abi> {
  /**
   * The contract name.
   */
  name: string;
  /**
   * The contract abi.
   */
  contractAbi: Narrow<TAbi>;
  /**
   * The contract bytecode
   */
  contractBytecode: Hex;
  /**
   * The contract libraries
   */
  libraries?: Libraries;
}

export type VerificationLibraryEntry = {
  file: string;
  contract: string;
  address: string;
};

export type VerificationRecord = {
  name: string;
  address: string;
  constructorArgsHex: Hex;
  libraries: VerificationLibraryEntry[];
};

export interface DeployL1ContractsArgs extends Omit<L1ContractsConfig, keyof L1TxUtilsConfig> {
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The hash of the protocol contracts. */
  protocolContractsHash: Fr;
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
  /** If provided, use this token for BOTH fee and staking assets (skip deployments) */
  existingTokenAddress?: EthAddress;
}

export interface ZKPassportArgs {
  /** Whether to use the mock zk passport verifier */
  mockZkPassportVerifier?: boolean;
  /** The domain of the zk passport (url) */
  zkPassportDomain?: string;
  /** The scope of the zk passport (personhood, etc) */
  zkPassportScope?: string;
}

// Minimal ERC20 ABI for validation purposes. We only read view methods.
const ERC20_VALIDATION_ABI = [
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

/**
 * Validates that the provided address points to a contract that resembles an ERC20 token.
 * Checks for contract code and attempts common ERC20 view calls.
 * Throws an error if validation fails.
 */
export async function validateExistingErc20TokenAddress(
  l1Client: ExtendedViemWalletClient,
  tokenAddress: EthAddress,
  logger: Logger,
): Promise<void> {
  const addressString = tokenAddress.toString();

  // Ensure there is contract code at the address
  const code = await l1Client.getCode({ address: addressString });
  if (!code || code === '0x') {
    throw new Error(`No contract code found at provided token address ${addressString}`);
  }

  const contract = getContract({
    address: getAddress(addressString),
    abi: ERC20_VALIDATION_ABI,
    client: l1Client,
  });

  // Validate all required ERC20 methods in parallel
  const checks = [
    contract.read.totalSupply().then(total => typeof total === 'bigint'),
    contract.read.name().then(() => true),
    contract.read.symbol().then(() => true),
    contract.read.decimals().then(dec => typeof dec === 'number' || typeof dec === 'bigint'),
  ];

  const results = await Promise.allSettled(checks);
  const failedChecks = results.filter(result => result.status === 'rejected' || result.value !== true);

  if (failedChecks.length > 0) {
    throw new Error(`Address ${addressString} does not appear to implement ERC20 view methods`);
  }

  logger.verbose(`Validated existing token at ${addressString} appears to be ERC20-compatible`);
}

export const deploySharedContracts = async (
  l1Client: ExtendedViemWalletClient,
  deployer: L1Deployer,
  args: DeployL1ContractsArgs,
  logger: Logger,
) => {
  const networkName = getActiveNetworkName();

  logger.info(`Deploying shared contracts for network configuration: ${networkName}`);

  const txHashes: Hex[] = [];

  let feeAssetAddress: EthAddress;
  let stakingAssetAddress: EthAddress;
  if (args.existingTokenAddress) {
    await validateExistingErc20TokenAddress(l1Client, args.existingTokenAddress, logger);
    feeAssetAddress = args.existingTokenAddress;
    stakingAssetAddress = args.existingTokenAddress;
    logger.verbose(`Using existing token for fee and staking assets at ${args.existingTokenAddress}`);
  } else {
    const deployedFee = await deployer.deploy(FeeAssetArtifact, ['FeeJuice', 'FEE', l1Client.account.address]);
    feeAssetAddress = deployedFee.address;
    logger.verbose(`Deployed Fee Asset at ${feeAssetAddress}`);

    const deployedStaking = await deployer.deploy(StakingAssetArtifact, ['Staking', 'STK', l1Client.account.address]);
    stakingAssetAddress = deployedStaking.address;
    logger.verbose(`Deployed Staking Asset at ${stakingAssetAddress}`);
  }

  const gseAddress = (
    await deployer.deploy(GSEArtifact, [
      l1Client.account.address,
      stakingAssetAddress.toString(),
      args.activationThreshold,
      args.ejectionThreshold,
    ])
  ).address;
  logger.verbose(`Deployed GSE at ${gseAddress}`);

  const { address: registryAddress } = await deployer.deploy(RegistryArtifact, [
    l1Client.account.address,
    feeAssetAddress.toString(),
  ]);
  logger.verbose(`Deployed Registry at ${registryAddress}`);

  const { address: governanceProposerAddress } = await deployer.deploy(GovernanceProposerArtifact, [
    registryAddress.toString(),
    gseAddress.toString(),
    BigInt(args.governanceProposerQuorum ?? args.governanceProposerRoundSize / 2 + 1),
    BigInt(args.governanceProposerRoundSize),
  ]);
  logger.verbose(`Deployed GovernanceProposer at ${governanceProposerAddress}`);

  // @note @LHerskind the assets are expected to be the same at some point, but for better
  // configurability they are different for now.
  const { address: governanceAddress } = await deployer.deploy(GovernanceArtifact, [
    stakingAssetAddress.toString(),
    governanceProposerAddress.toString(),
    gseAddress.toString(),
    getGovernanceConfiguration(networkName),
  ]);
  logger.verbose(`Deployed Governance at ${governanceAddress}`);

  let needToSetGovernance = false;

  const existingCode = await l1Client.getCode({ address: gseAddress.toString() });
  if (!existingCode || existingCode === '0x') {
    needToSetGovernance = true;
  } else {
    const gseContract = getContract({
      address: getAddress(gseAddress.toString()),
      abi: GSEArtifact.contractAbi,
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
          abi: GSEArtifact.contractAbi,
          functionName: 'setGovernance',
          args: [governanceAddress.toString()],
        }),
      },
      { gasLimit: 100_000n },
    );

    logger.verbose(`Set governance on GSE in ${txHash}`);
    txHashes.push(txHash);
  }

  const coinIssuerAddress = (
    await deployer.deploy(CoinIssuerArtifact, [
      feeAssetAddress.toString(),
      (25_000_000_000n * 10n ** 18n) / (60n * 60n * 24n * 365n),
      l1Client.account.address,
    ])
  ).address;
  logger.verbose(`Deployed CoinIssuer at ${coinIssuerAddress}`);

  logger.verbose(`Waiting for deployments to complete`);
  await deployer.waitForDeployments();

  // Registry ownership will be transferred to governance later, after rollup is added

  let feeAssetHandlerAddress: EthAddress | undefined = undefined;
  let stakingAssetHandlerAddress: EthAddress | undefined = undefined;
  let zkPassportVerifierAddress: EthAddress | undefined = undefined;

  // Only if not on mainnet will we deploy the handlers, and only when we control the token
  if (l1Client.chain.id !== 1 && !args.existingTokenAddress) {
    /* -------------------------------------------------------------------------- */
    /*                          CHEAT CODES START HERE                            */
    /* -------------------------------------------------------------------------- */

    feeAssetHandlerAddress = (
      await deployer.deploy(FeeAssetHandlerArtifact, [
        l1Client.account.address,
        feeAssetAddress.toString(),
        BigInt(1000n * 10n ** 18n),
      ])
    ).address;
    logger.verbose(`Deployed FeeAssetHandler at ${feeAssetHandlerAddress}`);

    // Only if we are "fresh" will we be adding as a minter, otherwise above will simply get same address
    if (needToSetGovernance) {
      const { txHash } = await deployer.sendTransaction({
        to: feeAssetAddress.toString(),
        data: encodeFunctionData({
          abi: FeeAssetArtifact.contractAbi,
          functionName: 'addMinter',
          args: [feeAssetHandlerAddress.toString()],
        }),
      });
      logger.verbose(`Added fee asset handler ${feeAssetHandlerAddress} as minter on fee asset in ${txHash}`);
      txHashes.push(txHash);
    }

    // Only if on sepolia will we deploy the staking asset handler
    // Should not be deployed to devnet since it would cause caos with sequencers there etc.
    if ([11155111, foundry.id].includes(l1Client.chain.id)) {
      const AMIN = EthAddress.fromString('0x3b218d0F26d15B36C715cB06c949210a0d630637');
      zkPassportVerifierAddress = await getZkPassportVerifierAddress(deployer, args);
      const [domain, scope] = getZkPassportScopes(args);

      const stakingAssetHandlerDeployArgs = {
        owner: l1Client.account.address,
        stakingAsset: stakingAssetAddress.toString(),
        registry: registryAddress.toString(),
        withdrawer: AMIN.toString(),
        validatorsToFlush: 16n,
        mintInterval: BigInt(60 * 60 * 24),
        depositsPerMint: BigInt(10),
        depositMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        zkPassportVerifier: zkPassportVerifierAddress.toString(),
        unhinged: [AMIN.toString()], // isUnhinged,
        // Scopes
        domain: domain,
        scope: scope,
        // Skip checks
        skipBindCheck: args.zkPassportArgs?.mockZkPassportVerifier ?? false,
        skipMerkleCheck: true, // skip merkle check - needed for testing without generating proofs
      } as const;

      stakingAssetHandlerAddress = (await deployer.deploy(StakingAssetHandlerArtifact, [stakingAssetHandlerDeployArgs]))
        .address;
      logger.verbose(`Deployed StakingAssetHandler at ${stakingAssetHandlerAddress}`);

      const { txHash: stakingMinterTxHash } = await deployer.sendTransaction({
        to: stakingAssetAddress.toString(),
        data: encodeFunctionData({
          abi: StakingAssetArtifact.contractAbi,
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

  if (!args.existingTokenAddress) {
    const blockReward = getRewardConfig(networkName).blockReward;

    const funding = blockReward * 200000n;
    const { txHash: fundRewardDistributorTxHash } = await deployer.sendTransaction({
      to: feeAssetAddress.toString(),
      data: encodeFunctionData({
        abi: FeeAssetArtifact.contractAbi,
        functionName: 'mint',
        args: [rewardDistributorAddress.toString(), funding],
      }),
    });

    logger.verbose(`Funded reward distributor with ${funding} fee asset in ${fundRewardDistributorTxHash}`);
  } else {
    logger.verbose(`Skipping reward distributor funding as existing token is provided`);
  }

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
    return (await deployer.deploy(mockVerifiers.mockZkPassportVerifier)).address;
  }
  return ZK_PASSPORT_VERIFIER_ADDRESS;
};

/**
 * Get the zk passport scopes - default to testnet values if not provided
 * @param args - The deployment arguments
 * @returns The zk passport scopes
 */
const getZkPassportScopes = (args: DeployL1ContractsArgs): [string, string] => {
  const domain = args.zkPassportArgs?.zkPassportDomain ?? ZK_PASSPORT_DOMAIN;
  const scope = args.zkPassportArgs?.zkPassportScope ?? ZK_PASSPORT_SCOPE;
  return [domain, scope];
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
    'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'ejectionThreshold' | 'activationThreshold'
  >,
  registryAddress: EthAddress,
  logger: Logger,
  txUtilsConfig: L1TxUtilsConfig,
) => {
  const deployer = new L1Deployer(
    extendedClient,
    args.salt,
    undefined,
    args.acceleratedTestDeployments,
    logger,
    txUtilsConfig,
  );

  const addresses = await RegistryContract.collectAddresses(extendedClient, registryAddress, 'canonical');

  const { rollup, slashFactoryAddress } = await deployRollup(extendedClient, deployer, args, addresses, logger);

  await deployer.waitForDeployments();

  return { rollup, slashFactoryAddress };
};

export const deploySlashFactory = async (deployer: L1Deployer, rollupAddress: Hex, logger: Logger) => {
  const slashFactoryAddress = (await deployer.deploy(SlashFactoryArtifact, [rollupAddress])).address;
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);
  return slashFactoryAddress;
};

export const deployUpgradePayload = async (
  deployer: L1Deployer,
  addresses: Pick<L1ContractAddresses, 'registryAddress' | 'rollupAddress'>,
) => {
  const payloadAddress = (
    await deployer.deploy(RegisterNewRollupVersionPayloadArtifact, [
      addresses.registryAddress.toString(),
      addresses.rollupAddress.toString(),
    ])
  ).address;

  return payloadAddress;
};

function slasherFlavorToSolidityEnum(flavor: DeployL1ContractsArgs['slasherFlavor']): number {
  switch (flavor) {
    case 'none':
      return SlashingProposerType.None.valueOf();
    case 'tally':
      return SlashingProposerType.Tally.valueOf();
    case 'empire':
      return SlashingProposerType.Empire.valueOf();
    default: {
      const _: never = flavor;
      throw new Error(`Unexpected slasher flavor ${flavor}`);
    }
  }
}

/**
 * Deploys a new rollup contract, funds and initializes the fee juice portal, and initializes the validator set.
 */
export const deployRollup = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  args: Omit<
    DeployL1ContractsArgs,
    'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'ejectionThreshold' | 'activationThreshold'
  >,
  addresses: Pick<
    L1ContractAddresses,
    | 'feeJuiceAddress'
    | 'registryAddress'
    | 'rewardDistributorAddress'
    | 'stakingAssetAddress'
    | 'gseAddress'
    | 'governanceAddress'
  >,
  logger: Logger,
) => {
  if (!addresses.gseAddress) {
    throw new Error('GSE address is required when deploying');
  }
  const networkName = getActiveNetworkName();

  logger.info(`Deploying rollup using network configuration: ${networkName}`);

  const txHashes: Hex[] = [];

  let epochProofVerifier = EthAddress.ZERO;

  if (args.realVerifier) {
    epochProofVerifier = (await deployer.deploy(l1ArtifactsVerifiers.honkVerifier)).address;
    logger.verbose(`Rollup will use the real verifier at ${epochProofVerifier}`);
  } else {
    epochProofVerifier = (await deployer.deploy(mockVerifiers.mockVerifier)).address;
    logger.verbose(`Rollup will use the mock verifier at ${epochProofVerifier}`);
  }

  const rewardConfig = {
    ...getRewardConfig(networkName),
    rewardDistributor: addresses.rewardDistributorAddress.toString(),
  };

  const rollupConfigArgs: ContractConstructorArgs<typeof RollupAbi>[6] = {
    aztecSlotDuration: BigInt(args.aztecSlotDuration),
    aztecEpochDuration: BigInt(args.aztecEpochDuration),
    targetCommitteeSize: BigInt(args.aztecTargetCommitteeSize),
    lagInEpochs: BigInt(args.lagInEpochs),
    aztecProofSubmissionEpochs: BigInt(args.aztecProofSubmissionEpochs),
    slashingQuorum: BigInt(args.slashingQuorum ?? (args.slashingRoundSizeInEpochs * args.aztecEpochDuration) / 2 + 1),
    slashingRoundSize: BigInt(args.slashingRoundSizeInEpochs * args.aztecEpochDuration),
    slashingLifetimeInRounds: BigInt(args.slashingLifetimeInRounds),
    slashingExecutionDelayInRounds: BigInt(args.slashingExecutionDelayInRounds),
    slashingVetoer: args.slashingVetoer.toString(),
    manaTarget: args.manaTarget,
    provingCostPerMana: args.provingCostPerMana,
    rewardConfig: rewardConfig,
    version: 0,
    rewardBoostConfig: getRewardBoostConfig(),
    stakingQueueConfig: getEntryQueueConfig(networkName),
    exitDelaySeconds: BigInt(args.exitDelaySeconds),
    slasherFlavor: slasherFlavorToSolidityEnum(args.slasherFlavor),
    slashingOffsetInRounds: BigInt(args.slashingOffsetInRounds),
    slashAmounts: [args.slashAmountSmall, args.slashAmountMedium, args.slashAmountLarge],
    localEjectionThreshold: args.localEjectionThreshold,
    slashingDisableDuration: BigInt(args.slashingDisableDuration ?? 0n),
  };

  const genesisStateArgs = {
    vkTreeRoot: args.vkTreeRoot.toString(),
    protocolContractsHash: args.protocolContractsHash.toString(),
    genesisArchiveRoot: args.genesisArchiveRoot.toString(),
  };

  // Until there is an actual chain-id for the version, we will just draw a random value.
  // TODO(https://linear.app/aztec-labs/issue/TMNT-139/version-at-deployment)
  rollupConfigArgs.version = Buffer.from(
    keccak256String(
      jsonStringify({
        rollupConfigArgs,
        genesisStateArgs,
      }),
    ),
  ).readUint32BE(0);
  logger.verbose(`Rollup config args`, rollupConfigArgs);

  const rollupArgs = [
    addresses.feeJuiceAddress.toString(),
    addresses.stakingAssetAddress.toString(),
    addresses.gseAddress.toString(),
    epochProofVerifier.toString(),
    extendedClient.account.address,
    genesisStateArgs,
    rollupConfigArgs,
  ] as const;

  const { address: rollupAddress, existed: rollupExisted } = await deployer.deploy(RollupArtifact, rollupArgs, {
    gasLimit: 15_000_000n,
  });
  logger.verbose(`Deployed Rollup at ${rollupAddress}, already existed: ${rollupExisted}`, rollupConfigArgs);

  const rollupContract = new RollupContract(extendedClient, rollupAddress);

  await deployer.waitForDeployments();
  logger.verbose(`All core contracts have been deployed`);

  if (args.feeJuicePortalInitialBalance && args.feeJuicePortalInitialBalance > 0n) {
    // Skip funding when using an external token, as we likely don't have mint permissions
    if (!('existingTokenAddress' in args) || !args.existingTokenAddress) {
      const feeJuicePortalAddress = await rollupContract.getFeeJuicePortal();

      // In fast mode, use the L1TxUtils to send transactions with nonce management
      const { txHash: mintTxHash } = await deployer.sendTransaction({
        to: addresses.feeJuiceAddress.toString(),
        data: encodeFunctionData({
          abi: FeeAssetArtifact.contractAbi,
          functionName: 'mint',
          args: [feeJuicePortalAddress.toString(), args.feeJuicePortalInitialBalance],
        }),
      });
      logger.verbose(
        `Funding fee juice portal with ${args.feeJuicePortalInitialBalance} fee juice in ${mintTxHash} (accelerated test deployments)`,
      );
      txHashes.push(mintTxHash);
    } else {
      logger.verbose('Skipping fee juice portal funding due to external token usage');
    }
  }

  const slashFactoryAddress = (await deployer.deploy(SlashFactoryArtifact, [rollupAddress.toString()])).address;
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);

  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(addresses.registryAddress.toString()),
    abi: RegistryArtifact.contractAbi,
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
          abi: RegistryArtifact.contractAbi,
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
    abi: GSEArtifact.contractAbi,
    client: extendedClient,
  });
  if ((await gseContract.read.owner()) === getAddress(extendedClient.account.address)) {
    if (!(await gseContract.read.isRollupRegistered([rollupContract.address]))) {
      const { txHash: addRollupTxHash } = await deployer.sendTransaction({
        to: addresses.gseAddress.toString(),
        data: encodeFunctionData({
          abi: GSEArtifact.contractAbi,
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

  const activeAttestorCount = await rollupContract.getActiveAttesterCount();
  const queuedAttestorCount = await rollupContract.getEntryQueueLength();
  logger.info(`Rollup has ${activeAttestorCount} active attestors and ${queuedAttestorCount} queued attestors`);

  const shouldAddValidators = activeAttestorCount === 0n && queuedAttestorCount === 0n;

  if (
    args.initialValidators &&
    shouldAddValidators &&
    (await gseContract.read.isRollupRegistered([rollupContract.address]))
  ) {
    await addMultipleValidators(
      extendedClient,
      deployer,
      addresses.gseAddress.toString(),
      rollupAddress.toString(),
      addresses.stakingAssetAddress.toString(),
      args.initialValidators,
      args.acceleratedTestDeployments,
      logger,
    );
  }

  // If the owner is not the Governance contract, transfer ownership to the Governance contract
  logger.verbose(addresses.governanceAddress.toString());
  if (getAddress(await rollupContract.getOwner()) !== getAddress(addresses.governanceAddress.toString())) {
    // TODO(md): add send transaction to the deployer such that we do not need to manage tx hashes here
    const { txHash: transferOwnershipTxHash } = await deployer.sendTransaction({
      to: rollupContract.address,
      data: encodeFunctionData({
        abi: RegistryArtifact.contractAbi,
        functionName: 'transferOwnership',
        args: [getAddress(addresses.governanceAddress.toString())],
      }),
    });
    logger.verbose(
      `Transferring the ownership of the rollup contract at ${rollupContract.address} to the Governance ${addresses.governanceAddress} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
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
  coinIssuerAddress: EthAddress,
  feeAssetAddress: EthAddress,
  governanceAddress: EthAddress,
  logger: Logger,
  acceleratedTestDeployments: boolean | undefined,
  useExternalToken: boolean = false,
) => {
  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(registryAddress.toString()),
    abi: RegistryArtifact.contractAbi,
    client: extendedClient,
  });

  const gseContract = getContract({
    address: getAddress(gseAddress.toString()),
    abi: GSEArtifact.contractAbi,
    client: extendedClient,
  });

  const coinIssuerContract = getContract({
    address: getAddress(coinIssuerAddress.toString()),
    abi: CoinIssuerArtifact.contractAbi,
    client: extendedClient,
  });

  const feeAsset = getContract({
    address: getAddress(feeAssetAddress.toString()),
    abi: FeeAssetArtifact.contractAbi,
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
        abi: RegistryArtifact.contractAbi,
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
        abi: GSEArtifact.contractAbi,
        functionName: 'transferOwnership',
        args: [getAddress(governanceAddress.toString())],
      }),
    });
    logger.verbose(
      `Transferring the ownership of the gse contract at ${gseAddress} to the Governance ${governanceAddress} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
  }

  if (
    !useExternalToken &&
    (acceleratedTestDeployments || (await feeAsset.read.owner()) !== coinIssuerAddress.toString())
  ) {
    const { txHash } = await deployer.sendTransaction(
      {
        to: feeAssetAddress.toString(),
        data: encodeFunctionData({
          abi: FeeAssetArtifact.contractAbi,
          functionName: 'transferOwnership',
          args: [coinIssuerAddress.toString()],
        }),
      },
      { gasLimit: 500_000n },
    );
    logger.verbose(`Transfer ownership of fee asset to coin issuer ${coinIssuerAddress} in ${txHash}`);
    txHashes.push(txHash);

    const { txHash: acceptTokenOwnershipTxHash } = await deployer.sendTransaction(
      {
        to: coinIssuerAddress.toString(),
        data: encodeFunctionData({
          abi: CoinIssuerArtifact.contractAbi,
          functionName: 'acceptTokenOwnership',
        }),
      },
      { gasLimit: 500_000n },
    );
    logger.verbose(`Accept ownership of fee asset in ${acceptTokenOwnershipTxHash}`);
    txHashes.push(acceptTokenOwnershipTxHash);
  } else if (useExternalToken) {
    logger.verbose('Skipping fee asset ownership transfer due to external token usage');
  }

  // Either deploy or at least predict the address of the date gated relayer
  const dateGatedRelayer = await deployer.deploy(DateGatedRelayerArtifact, [
    governanceAddress.toString(),
    1798761600n, // 2027-01-01 00:00:00 UTC
  ]);

  // If the owner is not the Governance contract, transfer ownership to the Governance contract
  if (acceleratedTestDeployments || (await coinIssuerContract.read.owner()) === deployer.client.account.address) {
    const { txHash: transferOwnershipTxHash } = await deployer.sendTransaction({
      to: coinIssuerContract.address,
      data: encodeFunctionData({
        abi: CoinIssuerArtifact.contractAbi,
        functionName: 'transferOwnership',
        args: [getAddress(dateGatedRelayer.address.toString())],
      }),
    });
    logger.verbose(
      `Transferring the ownership of the coin issuer contract at ${coinIssuerAddress} to the DateGatedRelayer ${dateGatedRelayer.address} in tx ${transferOwnershipTxHash}`,
    );
    txHashes.push(transferOwnershipTxHash);
  }

  // Wait for all actions to be mined
  await deployer.waitForDeployments();
  await Promise.all(txHashes.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));

  return { dateGatedRelayerAddress: dateGatedRelayer.address };
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
  gseAddress: Hex,
  rollupAddress: Hex,
  stakingAssetAddress: Hex,
  validators: Operator[],
  acceleratedTestDeployments: boolean | undefined,
  logger: Logger,
) => {
  const rollup = new RollupContract(extendedClient, rollupAddress);
  const activationThreshold = await rollup.getActivationThreshold();
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

    if (validators.length === 0) {
      logger.warn('No validators to add. Skipping.');
      return;
    }

    const gseContract = new GSEContract(extendedClient, gseAddress);
    const multiAdder = (await deployer.deploy(MultiAdderArtifact, [rollupAddress, deployer.client.account.address]))
      .address;

    const makeValidatorTuples = async (validator: Operator) => {
      const registrationTuple = await gseContract.makeRegistrationTuple(validator.bn254SecretKey.getValue());
      return {
        attester: getAddress(validator.attester.toString()),
        withdrawer: getAddress(validator.withdrawer.toString()),
        ...registrationTuple,
      };
    };

    const validatorsTuples = await Promise.all(validators.map(makeValidatorTuples));

    // Mint tokens, approve them, use cheat code to initialize validator set without setting up the epoch.
    const stakeNeeded = activationThreshold * BigInt(validators.length);

    await deployer.l1TxUtils.sendAndMonitorTransaction({
      to: stakingAssetAddress,
      data: encodeFunctionData({
        abi: StakingAssetArtifact.contractAbi,
        functionName: 'mint',
        args: [multiAdder.toString(), stakeNeeded],
      }),
    });

    const entryQueueLengthBefore = await rollup.getEntryQueueLength();
    const validatorCountBefore = await rollup.getActiveAttesterCount();

    logger.info(`Adding ${validators.length} validators to the rollup`);

    const chunkSize = 16;

    // We will add `chunkSize` validators to the queue until we have covered all of our validators.
    // The `chunkSize` needs to be small enough to fit inside a single tx, therefore 16.
    for (const c of chunk(validatorsTuples, chunkSize)) {
      await deployer.l1TxUtils.sendAndMonitorTransaction(
        {
          to: multiAdder.toString(),
          data: encodeFunctionData({
            abi: MultiAdderArtifact.contractAbi,
            functionName: 'addValidators',
            args: [c, BigInt(0)],
          }),
        },
        {
          gasLimit: 16_000_000n,
        },
      );
    }

    // After adding to the queue, we will now try to flush from it.
    // We are explicitly doing this as a second step instead of as part of adding to benefit
    // from the accounting used to speed the process up.
    // As the queue computes the amount of possible flushes in an epoch when told to flush,
    // waiting until we have added all we want allows us to benefit in the case were we added
    // enough to pass the bootstrap set size without needing to wait another epoch.
    // This is useful when we are testing as it speeds up the tests slightly.
    while (true) {
      // If the queue is empty, we can break
      if ((await rollup.getEntryQueueLength()) == 0n) {
        break;
      }

      // If there are no available validator flushes, no need to even try
      if ((await rollup.getAvailableValidatorFlushes()) == 0n) {
        break;
      }

      // Note that we are flushing at most `chunkSize` at each call
      await deployer.l1TxUtils.sendAndMonitorTransaction(
        {
          to: rollup.address,
          data: encodeFunctionData({
            abi: RollupArtifact.contractAbi,
            functionName: 'flushEntryQueue',
            args: [BigInt(chunkSize)],
          }),
        },
        {
          gasLimit: 16_000_000n,
        },
      );
    }

    const entryQueueLengthAfter = await rollup.getEntryQueueLength();
    const validatorCountAfter = await rollup.getActiveAttesterCount();

    if (
      entryQueueLengthAfter + validatorCountAfter <
      entryQueueLengthBefore + validatorCountBefore + BigInt(validators.length)
    ) {
      throw new Error(
        `Failed to add ${validators.length} validators. Active validators: ${validatorCountBefore} -> ${validatorCountAfter}. Queue: ${entryQueueLengthBefore} -> ${entryQueueLengthAfter}. A likely issue is the bootstrap size.`,
      );
    }

    logger.info(
      `Added ${validators.length} validators. Active validators: ${validatorCountBefore} -> ${validatorCountAfter}. Queue: ${entryQueueLengthBefore} -> ${entryQueueLengthAfter}`,
    );
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
  const feeAssetHandlerAddress = (
    await deployer.deploy(FeeAssetHandlerArtifact, [
      extendedClient.account.address,
      feeAssetAddress.toString(),
      BigInt(1e18),
    ])
  ).address;
  logger.verbose(`Deployed FeeAssetHandler at ${feeAssetHandlerAddress}`);

  const { txHash } = await deployer.sendTransaction({
    to: feeAssetAddress.toString(),
    data: encodeFunctionData({
      abi: FeeAssetArtifact.contractAbi,
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
  createVerificationJson: string | false = false,
): Promise<DeployL1ContractsReturnType> => {
  logger.info(`Deploying L1 contracts with config: ${jsonStringify(args)}`);
  validateConfig(args);

  if (args.initialValidators && args.initialValidators.length > 0 && args.existingTokenAddress) {
    throw new Error(
      'Cannot deploy with both initialValidators and existingTokenAddress. ' +
        'Initial validator funding requires minting tokens, which is not possible with an external token.',
    );
  }

  const l1Client = createExtendedL1Client(rpcUrls, account, chain);

  // Deploy multicall3 if it does not exist in this network
  await deployMulticall3(l1Client, logger);

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

  const dateProvider = new DateProvider();
  const deployer = new L1Deployer(
    l1Client,
    args.salt,
    dateProvider,
    args.acceleratedTestDeployments,
    logger,
    txUtilsConfig,
    !!createVerificationJson,
  );

  const {
    feeAssetAddress,
    feeAssetHandlerAddress,
    stakingAssetAddress,
    stakingAssetHandlerAddress,
    registryAddress,
    gseAddress,
    governanceAddress,
    rewardDistributorAddress,
    zkPassportVerifierAddress,
    coinIssuerAddress,
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
      governanceAddress,
    },
    logger,
  );

  logger.verbose('Waiting for rollup and slash factory to be deployed');
  await deployer.waitForDeployments();

  // Now that the rollup has been deployed and added to the registry, transfer ownership to governance
  const { dateGatedRelayerAddress } = await handoverToGovernance(
    l1Client,
    deployer,
    registryAddress,
    gseAddress,
    coinIssuerAddress,
    feeAssetAddress,
    governanceAddress,
    logger,
    args.acceleratedTestDeployments,
    !!args.existingTokenAddress,
  );

  logger.info(`Handing over to governance complete`);

  logger.verbose(`All transactions for L1 deployment have been mined`);
  const l1Contracts = await RegistryContract.collectAddresses(l1Client, registryAddress, 'canonical');

  logger.info(`Aztec L1 contracts initialized`, l1Contracts);

  // Write verification data (constructor args + linked libraries) to file for later forge verify
  if (createVerificationJson) {
    try {
      // Add Inbox / Outbox verification records (constructor args are created inside RollupCore)
      const rollupAddr = l1Contracts.rollupAddress.toString();
      const inboxAddr = l1Contracts.inboxAddress.toString();
      const outboxAddr = l1Contracts.outboxAddress.toString();
      const feeAsset = l1Contracts.feeJuiceAddress.toString();
      const version = await rollup.getVersion();

      const inboxCtor = encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
        [rollupAddr, feeAsset, version, BigInt(L1_TO_L2_MSG_SUBTREE_HEIGHT)],
      );

      const outboxCtor = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [rollupAddr, version]);

      deployer.verificationRecords.push(
        { name: 'Inbox', address: inboxAddr, constructorArgsHex: inboxCtor, libraries: [] },
        { name: 'Outbox', address: outboxAddr, constructorArgsHex: outboxCtor, libraries: [] },
      );

      // Include Slasher and SlashingProposer (if deployed) in verification data
      try {
        const slasherAddrHex = await rollup.getSlasherAddress();
        const slasherAddr = EthAddress.fromString(slasherAddrHex);
        if (!slasherAddr.isZero()) {
          // Slasher constructor: (address _vetoer, address _governance)
          const slasherCtor = encodeAbiParameters(
            [{ type: 'address' }, { type: 'address' }],
            [args.slashingVetoer.toString(), l1Client.account.address],
          );
          deployer.verificationRecords.push({
            name: 'Slasher',
            address: slasherAddr.toString(),
            constructorArgsHex: slasherCtor,
            libraries: [],
          });

          // Proposer address is stored in Slasher.PROPOSER()
          const proposerAddr = (await rollup.getSlashingProposerAddress()).toString();

          // Compute constructor args matching deployment path in RollupCore
          const computedRoundSize = BigInt(args.slashingRoundSizeInEpochs * args.aztecEpochDuration);
          const computedQuorum = BigInt(
            args.slashingQuorum ?? (args.slashingRoundSizeInEpochs * args.aztecEpochDuration) / 2 + 1,
          );
          const lifetimeInRounds = BigInt(args.slashingLifetimeInRounds);
          const executionDelayInRounds = BigInt(args.slashingExecutionDelayInRounds);

          if (args.slasherFlavor === 'tally') {
            const slashAmounts: readonly [bigint, bigint, bigint] = [
              args.slashAmountSmall,
              args.slashAmountMedium,
              args.slashAmountLarge,
            ];
            const committeeSize = BigInt(args.aztecTargetCommitteeSize);
            const epochDuration = BigInt(args.aztecEpochDuration);
            const slashOffsetInRounds = BigInt(args.slashingOffsetInRounds);

            const proposerCtor = encodeAbiParameters(
              [
                { type: 'address' },
                { type: 'address' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256[3]' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256' },
              ],
              [
                rollup.address,
                slasherAddr.toString(),
                computedQuorum,
                computedRoundSize,
                lifetimeInRounds,
                executionDelayInRounds,
                slashAmounts,
                committeeSize,
                epochDuration,
                slashOffsetInRounds,
              ],
            );

            deployer.verificationRecords.push({
              name: 'TallySlashingProposer',
              address: proposerAddr,
              constructorArgsHex: proposerCtor,
              libraries: [],
            });
          } else if (args.slasherFlavor === 'empire') {
            const proposerCtor = encodeAbiParameters(
              [
                { type: 'address' },
                { type: 'address' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256' },
                { type: 'uint256' },
              ],
              [
                rollup.address,
                slasherAddr.toString(),
                computedQuorum,
                computedRoundSize,
                lifetimeInRounds,
                executionDelayInRounds,
              ],
            );

            deployer.verificationRecords.push({
              name: 'EmpireSlashingProposer',
              address: proposerAddr,
              constructorArgsHex: proposerCtor,
              libraries: [],
            });
          }
        }
      } catch (e) {
        logger.warn(`Failed to add Slasher/Proposer verification records: ${String(e)}`);
      }
      const date = new Date();
      const formattedDate = date.toISOString().slice(2, 19).replace(/[-T:]/g, '');
      // Ensure the verification output directory exists
      await mkdir(createVerificationJson, { recursive: true });
      const verificationOutputPath = `${createVerificationJson}/l1-verify-${chain.id}-${formattedDate.slice(0, 6)}-${formattedDate.slice(6)}.json`;
      const networkName = getActiveNetworkName();
      const verificationData = {
        chainId: chain.id,
        network: networkName,
        records: deployer.verificationRecords,
      };
      await writeFile(verificationOutputPath, JSON.stringify(verificationData, null, 2));
      logger.info(`Wrote L1 verification data to ${verificationOutputPath}`);
    } catch (e) {
      logger.warn(`Failed to write L1 verification data file: ${String(e)}`);
    }
  }

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
    rollupVersion: Number(await rollup.getVersion()),
    l1Client: l1Client,
    l1ContractAddresses: {
      ...l1Contracts,
      slashFactoryAddress,
      feeAssetHandlerAddress,
      stakingAssetHandlerAddress,
      zkPassportVerifierAddress,
      coinIssuerAddress,
      dateGatedRelayerAddress,
    },
  };
};

export class L1Deployer {
  private salt: Hex | undefined;
  private txHashes: Hex[] = [];
  public readonly l1TxUtils: L1TxUtils;
  public readonly verificationRecords: VerificationRecord[] = [];

  constructor(
    public readonly client: ExtendedViemWalletClient,
    maybeSalt: number | undefined,
    dateProvider: DateProvider = new DateProvider(),
    private acceleratedTestDeployments: boolean = false,
    private logger: Logger = createLogger('L1Deployer'),
    private txUtilsConfig?: L1TxUtilsConfig,
    private createVerificationJson: boolean = false,
  ) {
    this.salt = maybeSalt ? padHex(numberToHex(maybeSalt), { size: 32 }) : undefined;
    this.l1TxUtils = createL1TxUtilsFromViemWallet(
      this.client,
      { logger: this.logger, dateProvider },
      { ...this.txUtilsConfig, debugMaxGasLimit: acceleratedTestDeployments },
    );
  }

  async deploy<const TAbi extends Abi>(
    params: ContractArtifacts<TAbi>,
    args?: ContractConstructorArgs<TAbi>,
    opts: { gasLimit?: bigint } = {},
  ): Promise<{ address: EthAddress; existed: boolean }> {
    this.logger.debug(`Deploying ${params.name} contract`, { args });
    try {
      const { txHash, address, deployedLibraries, existed } = await deployL1Contract(
        this.client,
        params.contractAbi,
        params.contractBytecode,
        (args ?? []) as readonly unknown[],
        {
          salt: this.salt,
          libraries: params.libraries,
          logger: this.logger,
          l1TxUtils: this.l1TxUtils,
          acceleratedTestDeployments: this.acceleratedTestDeployments,
          gasLimit: opts.gasLimit,
        },
      );
      if (txHash) {
        this.txHashes.push(txHash);
      }
      this.logger.debug(`Deployed ${params.name} at ${address}`, { args });

      if (this.createVerificationJson) {
        // Encode constructor args for verification
        let constructorArgsHex: Hex = '0x';
        try {
          const abiItem: any = (params.contractAbi as any[]).find((x: any) => x && x.type === 'constructor');
          const inputDefs: any[] = abiItem && Array.isArray(abiItem.inputs) ? abiItem.inputs : [];
          constructorArgsHex =
            inputDefs.length > 0 ? (encodeAbiParameters(inputDefs as any, (args ?? []) as any) as Hex) : ('0x' as Hex);
        } catch {
          constructorArgsHex = '0x' as Hex;
        }

        this.verificationRecords.push({
          name: params.name,
          address: address.toString(),
          constructorArgsHex,
          libraries: deployedLibraries ?? [],
        });
      }
      return {
        address,
        existed,
      };
    } catch (error) {
      throw new Error(`Failed to deploy ${params.name}`, { cause: formatViemError(error) });
    }
  }

  async waitForDeployments(): Promise<void> {
    if (this.acceleratedTestDeployments) {
      this.logger.info('Accelerated test deployments - skipping waiting for deployments');
      return;
    }
    if (this.txHashes.length === 0) {
      return;
    }

    this.logger.verbose(`Waiting for ${this.txHashes.length} transactions to be mined`, { txHashes: this.txHashes });
    const receipts = await Promise.all(
      this.txHashes.map(txHash => this.client.waitForTransactionReceipt({ hash: txHash })),
    );
    const failed = receipts.filter(r => r.status !== 'success');
    if (failed.length > 0) {
      throw new Error(`Some deployment txs have failed: ${failed.map(f => f.transactionHash).join(', ')}`);
    }
    this.logger.info('All transactions mined successfully', { txHashes: this.txHashes });
  }

  sendTransaction(
    tx: L1TxRequest,
    options?: L1TxConfig,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    return this.l1TxUtils.sendTransaction(tx, options).then(({ txHash, state }) => ({
      txHash,
      gasLimit: state.gasLimit,
      gasPrice: state.gasPrice,
    }));
  }
}

/**
 * Helper function to deploy ETH contracts.
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param abi - The ETH contract's ABI (as abitype's Abi).
 * @param bytecode  - The ETH contract's bytecode.
 * @param args - Constructor arguments for the contract.
 * @param salt - Optional salt for CREATE2 deployment (does not wait for deployment tx to be mined if set, does not send tx if contract already exists).
 * @returns The ETH address the contract was deployed to.
 */
export async function deployL1Contract(
  extendedClient: ExtendedViemWalletClient,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
  opts: {
    salt?: Hex;
    libraries?: Libraries;
    logger?: Logger;
    l1TxUtils?: L1TxUtils;
    gasLimit?: bigint;
    acceleratedTestDeployments?: boolean;
  } = {},
): Promise<{
  address: EthAddress;
  txHash: Hex | undefined;
  deployedLibraries?: VerificationLibraryEntry[];
  existed: boolean;
}> {
  let txHash: Hex | undefined = undefined;
  let resultingAddress: Hex | null | undefined = undefined;
  const deployedLibraries: VerificationLibraryEntry[] = [];

  const { salt: saltFromOpts, libraries, logger, gasLimit, acceleratedTestDeployments } = opts;
  let { l1TxUtils } = opts;

  if (!l1TxUtils) {
    const config = getL1TxUtilsConfigEnvVars();
    l1TxUtils = createL1TxUtilsFromViemWallet(
      extendedClient,
      { logger },
      { ...config, debugMaxGasLimit: acceleratedTestDeployments },
    );
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
      const { libraries: _libraries, ...optsWithoutLibraries } = opts;
      const { address, txHash } = await deployL1Contract(
        extendedClient,
        lib.contractAbi,
        lib.contractBytecode,
        [],
        optsWithoutLibraries,
      );

      // Log deployed library name and address for easier verification/triage
      logger?.verbose(`Linked library deployed`, { library: libraryName, address: address.toString(), txHash });

      if (txHash) {
        libraryTxs.push(txHash);
      }

      // Try to find the source file for this library from linkReferences
      let fileNameForLibrary: string | undefined = undefined;
      for (const fileName in libraries.linkReferences) {
        if (libraries.linkReferences[fileName] && libraries.linkReferences[fileName][libraryName]) {
          fileNameForLibrary = fileName;
          break;
        }
      }
      if (fileNameForLibrary) {
        deployedLibraries.push({
          file: fileNameForLibrary,
          contract: libraryName,
          address: address.toString(),
        });
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

  let existed = false;

  if (saltFromOpts) {
    logger?.info(`Deploying contract with salt ${saltFromOpts}`);
    const { address, paddedSalt: salt, calldata } = getExpectedAddress(abi, bytecode, args, saltFromOpts);
    resultingAddress = address;
    const existing = await extendedClient.getCode({ address: resultingAddress });
    if (existing === undefined || existing === '0x') {
      try {
        await l1TxUtils.simulate({ to: DEPLOYER_ADDRESS, data: concatHex([salt, calldata]) }, { gasLimit });
      } catch (err) {
        logger?.error(`Failed to simulate deployment tx using universal deployer`, err);
        await l1TxUtils.simulate({ to: null, data: encodeDeployData({ abi, bytecode, args }) });
      }
      const res = await l1TxUtils.sendTransaction(
        { to: DEPLOYER_ADDRESS, data: concatHex([salt, calldata]) },
        { gasLimit },
      );
      txHash = res.txHash;

      logger?.verbose(`Deployed contract with salt ${salt} to address ${resultingAddress} in tx ${txHash}.`);
    } else {
      logger?.verbose(`Skipping existing deployment of contract with salt ${salt} to address ${resultingAddress}`);
      existed = true;
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

  return { address: EthAddress.fromString(resultingAddress!), txHash, deployedLibraries, existed };
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
