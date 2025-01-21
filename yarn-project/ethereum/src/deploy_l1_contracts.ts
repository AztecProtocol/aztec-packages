import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import {
  CoinIssuerAbi,
  CoinIssuerBytecode,
  ExtRollupLibAbi,
  ExtRollupLibBytecode,
  FeeJuicePortalAbi,
  FeeJuicePortalBytecode,
  GovernanceAbi,
  GovernanceBytecode,
  GovernanceProposerAbi,
  GovernanceProposerBytecode,
  InboxAbi,
  InboxBytecode,
  LeonidasLibAbi,
  LeonidasLibBytecode,
  OutboxAbi,
  OutboxBytecode,
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
} from '@aztec/l1-artifacts';

import type { Abi, Narrow } from 'abitype';
import {
  type Account,
  type Chain,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  getAddress,
  getContract,
  getContractAddress,
  http,
  numberToHex,
  padHex,
} from 'viem';
import { type HDAccount, type PrivateKeyAccount, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { type L1ContractsConfig } from './config.js';
import { isAnvilTestChain } from './ethereum_chain.js';
import { type L1ContractAddresses } from './l1_contract_addresses.js';
import { L1TxUtils } from './l1_tx_utils.js';

/**
 * Return type of the deployL1Contract function.
 */
export type DeployL1Contracts = {
  /**
   * Wallet Client Type.
   */
  walletClient: WalletClient<HttpTransport, Chain, Account>;
  /**
   * Public Client Type.
   */
  publicClient: PublicClient<HttpTransport, Chain>;
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
        LeonidasLib: {
          contractAbi: LeonidasLibAbi,
          contractBytecode: LeonidasLibBytecode as Hex,
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
};

export interface DeployL1ContractsArgs extends L1ContractsConfig {
  /** The address of the L2 Fee Juice contract. */
  l2FeeJuiceAddress: AztecAddress;
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The protocol contract tree root. */
  protocolContractTreeRoot: Fr;
  /** The block number to assume proven through. */
  assumeProvenThrough?: number;
  /** The salt for CREATE2 deployment. */
  salt: number | undefined;
  /** The initial validators for the rollup contract. */
  initialValidators?: EthAddress[];
}

export type L1Clients = {
  publicClient: PublicClient<HttpTransport, Chain>;
  walletClient: WalletClient<HttpTransport, Chain, Account>;
};

/**
 * Creates a wallet and a public viem client for interacting with L1.
 * @param rpcUrl - RPC URL to connect to L1.
 * @param mnemonicOrPrivateKeyOrHdAccount - Mnemonic or account for the wallet client.
 * @param chain - Optional chain spec (defaults to local foundry).
 * @returns - A wallet and a public client.
 */
export function createL1Clients(
  rpcUrl: string,
  mnemonicOrPrivateKeyOrHdAccount: string | `0x${string}` | HDAccount | PrivateKeyAccount,
  chain: Chain = foundry,
): L1Clients {
  const hdAccount =
    typeof mnemonicOrPrivateKeyOrHdAccount === 'string'
      ? mnemonicOrPrivateKeyOrHdAccount.startsWith('0x')
        ? privateKeyToAccount(mnemonicOrPrivateKeyOrHdAccount as `0x${string}`)
        : mnemonicToAccount(mnemonicOrPrivateKeyOrHdAccount)
      : mnemonicOrPrivateKeyOrHdAccount;

  const walletClient = createWalletClient({
    account: hdAccount,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
    pollingInterval: 100,
  });

  return { walletClient, publicClient };
}

/**
 * Deploys the aztec L1 contracts; Rollup & (optionally) Decoder Helper.
 * @param rpcUrl - URL of the ETH RPC to use for deployment.
 * @param account - Private Key or HD Account that will deploy the contracts.
 * @param chain - The chain instance to deploy to.
 * @param logger - A logger object.
 * @param args - Arguments for initialization of L1 contracts
 * @returns A list of ETH addresses of the deployed contracts.
 */
export const deployL1Contracts = async (
  rpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  chain: Chain,
  logger: Logger,
  args: DeployL1ContractsArgs,
): Promise<DeployL1Contracts> => {
  // We are assuming that you are running this on a local anvil node which have 1s block times
  // To align better with actual deployment, we update the block interval to 12s
  // The code is same as `setBlockInterval` in `cheat_codes.ts`
  const rpcCall = async (method: string, params: any[]) => {
    const paramsString = JSON.stringify(params);
    const content = {
      body: `{"jsonrpc":"2.0", "method": "${method}", "params": ${paramsString}, "id": 1}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    return await (await fetch(rpcUrl, content)).json();
  };
  if (isAnvilTestChain(chain.id)) {
    const res = await rpcCall('anvil_setBlockTimestampInterval', [args.ethereumSlotDuration]);
    if (res.error) {
      throw new Error(`Error setting block interval: ${res.error.message}`);
    }
    logger.warn(`Set block interval to ${args.ethereumSlotDuration}`);
  }

  logger.verbose(`Deploying contracts from ${account.address.toString()}`);

  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  // Governance stuff
  const govDeployer = new L1Deployer(walletClient, publicClient, args.salt, logger);

  const registryAddress = await govDeployer.deploy(l1Artifacts.registry, [account.address.toString()]);
  logger.verbose(`Deployed Registry at ${registryAddress}`);

  const feeAssetAddress = await govDeployer.deploy(l1Artifacts.feeAsset, [
    'FeeJuice',
    'FEE',
    account.address.toString(),
  ]);
  logger.verbose(`Deployed Fee Juice at ${feeAssetAddress}`);

  const stakingAssetAddress = await govDeployer.deploy(l1Artifacts.stakingAsset, [
    'Staking',
    'STK',
    account.address.toString(),
  ]);
  logger.verbose(`Deployed Staking Asset at ${stakingAssetAddress}`);

  const governanceProposerAddress = await govDeployer.deploy(l1Artifacts.governanceProposer, [
    registryAddress.toString(),
    args.governanceProposerQuorum,
    args.governanceProposerRoundSize,
  ]);
  logger.verbose(`Deployed GovernanceProposer at ${governanceProposerAddress}`);

  // @note @LHerskind the assets are expected to be the same at some point, but for better
  // configurability they are different for now.
  const governanceAddress = await govDeployer.deploy(l1Artifacts.governance, [
    feeAssetAddress.toString(),
    governanceProposerAddress.toString(),
  ]);
  logger.verbose(`Deployed Governance at ${governanceAddress}`);

  const coinIssuerAddress = await govDeployer.deploy(l1Artifacts.coinIssuer, [
    feeAssetAddress.toString(),
    1n * 10n ** 18n, // @todo  #8084
    governanceAddress.toString(),
  ]);
  logger.verbose(`Deployed CoinIssuer at ${coinIssuerAddress}`);

  const rewardDistributorAddress = await govDeployer.deploy(l1Artifacts.rewardDistributor, [
    feeAssetAddress.toString(),
    registryAddress.toString(),
    governanceAddress.toString(),
  ]);
  logger.verbose(`Deployed RewardDistributor at ${rewardDistributorAddress}`);

  logger.verbose(`Waiting for governance contracts to be deployed`);
  await govDeployer.waitForDeployments();
  logger.verbose(`All governance contracts deployed`);

  const deployer = new L1Deployer(walletClient, publicClient, args.salt, logger);

  const feeJuicePortalAddress = await deployer.deploy(l1Artifacts.feeJuicePortal, [
    registryAddress.toString(),
    feeAssetAddress.toString(),
    args.l2FeeJuiceAddress.toString(),
  ]);
  logger.verbose(`Deployed Fee Juice Portal at ${feeJuicePortalAddress}`);

  const rollupConfigArgs = {
    aztecSlotDuration: args.aztecSlotDuration,
    aztecEpochDuration: args.aztecEpochDuration,
    targetCommitteeSize: args.aztecTargetCommitteeSize,
    aztecEpochProofClaimWindowInL2Slots: args.aztecEpochProofClaimWindowInL2Slots,
    minimumStake: args.minimumStake,
    slashingQuorum: args.slashingQuorum,
    slashingRoundSize: args.slashingRoundSize,
  };
  const rollupArgs = [
    feeJuicePortalAddress.toString(),
    rewardDistributorAddress.toString(),
    stakingAssetAddress.toString(),
    args.vkTreeRoot.toString(),
    args.protocolContractTreeRoot.toString(),
    account.address.toString(),
    rollupConfigArgs,
  ];
  await deployer.waitForDeployments();

  const rollupAddress = await deployer.deploy(l1Artifacts.rollup, rollupArgs);
  logger.verbose(`Deployed Rollup at ${rollupAddress}`, rollupConfigArgs);

  const slashFactoryAddress = await deployer.deploy(l1Artifacts.slashFactory, [rollupAddress.toString()]);
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);

  await deployer.waitForDeployments();
  logger.verbose(`All core contracts have been deployed`);

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

  const stakingAsset = getContract({
    address: stakingAssetAddress.toString(),
    abi: l1Artifacts.stakingAsset.contractAbi,
    client: walletClient,
  });

  const rollup = getContract({
    address: getAddress(rollupAddress.toString()),
    abi: l1Artifacts.rollup.contractAbi,
    client: walletClient,
  });

  // Transaction hashes to await
  const txHashes: Hex[] = [];

  {
    const txHash = await feeAsset.write.setFreeForAll([true], {} as any);
    logger.verbose(`Fee asset set to free for all in ${txHash}`);
    txHashes.push(txHash);
  }

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
      // Mint tokens, approve them, use cheat code to initialise validator set without setting up the epoch.
      const stakeNeeded = args.minimumStake * BigInt(newValidatorsAddresses.length);
      await Promise.all(
        [
          await stakingAsset.write.mint([walletClient.account.address, stakeNeeded], {} as any),
          await stakingAsset.write.approve([rollupAddress.toString(), stakeNeeded], {} as any),
        ].map(txHash => publicClient.waitForTransactionReceipt({ hash: txHash })),
      );

      const initiateValidatorSetTxHash = await rollup.write.cheat__InitialiseValidatorSet([
        newValidatorsAddresses.map(v => ({
          attester: v,
          proposer: v,
          withdrawer: v,
          amount: args.minimumStake,
        })),
      ]);
      txHashes.push(initiateValidatorSetTxHash);
      logger.info(
        `Initialized validator set (${newValidatorsAddresses.join(', ')}) in tx ${initiateValidatorSetTxHash}`,
      );
    }
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

  if (isAnvilTestChain(chain.id)) {
    // @note  We make a time jump PAST the very first slot to not have to deal with the edge case of the first slot.
    //        The edge case being that the genesis block is already occupying slot 0, so we cannot have another block.
    try {
      // Need to get the time
      const currentSlot = (await rollup.read.getCurrentSlot()) as bigint;

      if (BigInt(currentSlot) === 0n) {
        const ts = Number(await rollup.read.getTimestampForSlot([1n]));
        await rpcCall('evm_setNextBlockTimestamp', [ts]);
        await rpcCall('hardhat_mine', [1]);
        const currentSlot = (await rollup.read.getCurrentSlot()) as bigint;

        if (BigInt(currentSlot) !== 1n) {
          throw new Error(`Error jumping time: current slot is ${currentSlot}`);
        }
        logger.info(`Jumped to slot 1`);
      }
    } catch (e) {
      throw new Error(`Error jumping time: ${e}`);
    }
  }

  // Set initial blocks as proven if requested
  if (args.assumeProvenThrough && args.assumeProvenThrough > 0) {
    await rollup.write.setAssumeProvenThroughBlockNumber([BigInt(args.assumeProvenThrough)], { account });
    logger.warn(`Rollup set to assumedProvenUntil to ${args.assumeProvenThrough}`);
  }

  // Inbox and Outbox are immutable and are deployed from Rollup's constructor so we just fetch them from the contract.
  const inboxAddress = EthAddress.fromString((await rollup.read.INBOX()) as any);
  logger.verbose(`Inbox available at ${inboxAddress}`);

  const outboxAddress = EthAddress.fromString((await rollup.read.OUTBOX()) as any);
  logger.verbose(`Outbox available at ${outboxAddress}`);

  // We need to call a function on the registry to set the various contract addresses.
  const registryContract = getContract({
    address: getAddress(registryAddress.toString()),
    abi: l1Artifacts.registry.contractAbi,
    client: walletClient,
  });
  if (!(await registryContract.read.isRollupRegistered([getAddress(rollupAddress.toString())]))) {
    const upgradeTxHash = await registryContract.write.upgrade([getAddress(rollupAddress.toString())], { account });
    logger.verbose(
      `Upgrading registry contract at ${registryAddress} to rollup ${rollupAddress} in tx ${upgradeTxHash}`,
    );
    txHashes.push(upgradeTxHash);
  } else {
    logger.verbose(`Registry ${registryAddress} has already registered rollup ${rollupAddress}`);
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

  const l1Contracts: L1ContractAddresses = {
    rollupAddress,
    registryAddress,
    inboxAddress,
    outboxAddress,
    feeJuiceAddress: feeAssetAddress,
    stakingAssetAddress,
    feeJuicePortalAddress,
    coinIssuerAddress,
    rewardDistributorAddress,
    governanceProposerAddress,
    governanceAddress,
    slashFactoryAddress,
  };

  logger.info(`Aztec L1 contracts initialized`, l1Contracts);

  return {
    walletClient,
    publicClient,
    l1ContractAddresses: l1Contracts,
  };
};

class L1Deployer {
  private salt: Hex | undefined;
  private txHashes: Hex[] = [];
  constructor(
    private walletClient: WalletClient<HttpTransport, Chain, Account>,
    private publicClient: PublicClient<HttpTransport, Chain>,
    maybeSalt: number | undefined,
    private logger: Logger,
  ) {
    this.salt = maybeSalt ? padHex(numberToHex(maybeSalt), { size: 32 }) : undefined;
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

/**
 * Compiles a contract source code using the provided solc compiler.
 * @param fileName - Contract file name (eg UltraHonkVerifier.sol)
 * @param contractName - Contract name within the file (eg HonkVerifier)
 * @param source - Source code to compile
 * @param solc - Solc instance
 * @returns ABI and bytecode of the compiled contract
 */
export function compileContract(
  fileName: string,
  contractName: string,
  source: string,
  solc: { compile: (source: string) => string },
): { abi: Narrow<Abi | readonly unknown[]>; bytecode: Hex } {
  const input = {
    language: 'Solidity',
    sources: {
      [fileName]: {
        content: source,
      },
    },
    settings: {
      // we require the optimizer
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'cancun',
      outputSelection: {
        '*': {
          '*': ['evm.bytecode.object', 'abi'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const abi = output.contracts[fileName][contractName].abi;
  const bytecode: `0x${string}` = `0x${output.contracts[fileName][contractName].evm.bytecode.object}`;

  return { abi, bytecode };
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
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
  maybeSalt?: Hex,
  libraries?: Libraries,
  logger?: Logger,
): Promise<{ address: EthAddress; txHash: Hex | undefined }> {
  let txHash: Hex | undefined = undefined;
  let resultingAddress: Hex | null | undefined = undefined;

  const l1TxUtils = new L1TxUtils(publicClient, walletClient, logger);

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

    for (const libraryName in libraries?.libraryCode) {
      const lib = libraries.libraryCode[libraryName];

      const { address } = await deployL1Contract(
        walletClient,
        publicClient,
        lib.contractAbi,
        lib.contractBytecode,
        [],
        maybeSalt,
        undefined,
        logger,
      );

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
  }

  if (maybeSalt) {
    const salt = padHex(maybeSalt, { size: 32 });
    const deployer: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
    const calldata = encodeDeployData({ abi, bytecode, args });
    resultingAddress = getContractAddress({ from: deployer, salt, bytecode: calldata, opcode: 'CREATE2' });
    const existing = await publicClient.getBytecode({ address: resultingAddress });

    if (existing === undefined || existing === '0x') {
      const res = await l1TxUtils.sendTransaction({
        to: deployer,
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
// docs:end:deployL1Contract
