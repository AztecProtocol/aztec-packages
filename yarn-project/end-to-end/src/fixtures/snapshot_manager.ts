import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { getContractClassFromArtifact } from '@aztec/aztec.js/contracts';
import { BatchCall, type ContractFunctionInteraction, waitForProven } from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { deployMulticall3 } from '@aztec/ethereum/contracts';
import {
  type DeployAztecL1ContractsArgs,
  type DeployAztecL1ContractsReturnType,
  deployAztecL1Contracts,
} from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { EthCheatCodesWithState, startAnvil } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { tryRmDir } from '@aztec/foundation/fs';
import { TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ProverNode } from '@aztec/prover-node';
import { getPXEConfig } from '@aztec/pxe/server';
import type { SequencerClient } from '@aztec/sequencer-client';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { TestWallet } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Anvil } from '@viem/anvil';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, TEST_MAX_PENDING_TX_POOL_COUNT, TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import {
  type SetupOptions,
  createAndSyncProverNode,
  getLogger,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
  setupSharedBlobStorage,
} from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

export type SubsystemsContext = {
  anvil: Anvil;
  acvmConfig: any;
  bbConfig: any;
  aztecNode: AztecNodeService;
  aztecNodeConfig: AztecNodeConfig;
  wallet: TestWallet;
  deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  proverNode?: ProverNode;
  watcher: AnvilTestWatcher;
  cheatCodes: CheatCodes;
  sequencer: SequencerClient;
  dateProvider: TestDateProvider;
  initialFundedAccounts: InitialAccountData[];
  directoryToCleanup?: string;
};

/**
 * Destroys the current subsystem context.
 */
export async function teardown(context: SubsystemsContext | undefined) {
  if (!context) {
    return;
  }
  const logger = getLogger();
  try {
    logger.info('Tearing down subsystems');
    await tryStop(context.proverNode);
    await tryStop(context.aztecNode);
    await context.acvmConfig?.cleanup();
    await context.bbConfig?.cleanup();
    await tryStop(context.anvil);
    await tryStop(context.watcher);
    await tryRmDir(context.directoryToCleanup, logger);
  } catch (err) {
    logger.error('Error during teardown', err);
  }
}

/**
 * Initializes a fresh set of subsystems.
 * State is stored in temporary in-memory locations.
 */
export async function setupFromFresh(
  logger: Logger,
  { numberOfInitialFundedAccounts = 10, ...opts }: SetupOptions = {},
  deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = {
    initialValidators: [],
  },
): Promise<SubsystemsContext> {
  logger.verbose(`Initializing state...`);

  // Default to no slashing
  opts.slasherFlavor ??= 'none';
  deployL1ContractsArgs.slasherFlavor ??= opts.slasherFlavor;

  // Fetch the AztecNode config.
  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const aztecNodeConfig: AztecNodeConfig & SetupOptions = { ...getConfigEnvVars(), ...opts };
  aztecNodeConfig.peerCheckIntervalMS = TEST_PEER_CHECK_INTERVAL_MS;
  aztecNodeConfig.maxPendingTxCount = opts.maxPendingTxCount ?? TEST_MAX_PENDING_TX_POOL_COUNT;
  // Only enable proving if specifically requested.
  aztecNodeConfig.realProofs = !!opts.realProofs;
  // Only enforce the time table if requested
  aztecNodeConfig.enforceTimeTable = !!opts.enforceTimeTable;
  // Only set the target committee size if it is explicitly set
  aztecNodeConfig.aztecTargetCommitteeSize = opts.aztecTargetCommitteeSize ?? 0;
  aztecNodeConfig.listenAddress = '127.0.0.1';

  deployL1ContractsArgs.aztecTargetCommitteeSize ??= aztecNodeConfig.aztecTargetCommitteeSize;

  // Create a temp directory for all ephemeral state and cleanup afterwards
  const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
  await fs.mkdir(directoryToCleanup, { recursive: true });
  aztecNodeConfig.dataDirectory = directoryToCleanup;

  await setupSharedBlobStorage(aztecNodeConfig);

  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
  const publisherPrivKeyRaw = hdAccount.getHdKey().privateKey;
  const publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);
  const publisherPrivKeyHex = `0x${publisherPrivKey!.toString('hex')}` satisfies `0x${string}`;

  const l1Client = createExtendedL1Client([aztecNodeConfig.l1RpcUrls[0]], hdAccount, foundry);

  const validatorPrivKey = getPrivateKeyFromIndex(0);
  const proverNodePrivateKey = getPrivateKeyFromIndex(0);

  aztecNodeConfig.publisherPrivateKeys = [new SecretValue(publisherPrivKeyHex)];
  aztecNodeConfig.validatorPrivateKeys = new SecretValue([`0x${validatorPrivKey!.toString('hex')}`]);
  aztecNodeConfig.coinbase = opts.coinbase ?? EthAddress.fromString(`${hdAccount.address}`);

  logger.info(`Setting up environment with config`, aztecNodeConfig);

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  logger.verbose('Starting anvil...');
  const res = await startAnvil({ l1BlockTime: opts.ethereumSlotDuration });
  const anvil = res.anvil;
  aztecNodeConfig.l1RpcUrls = [res.rpcUrl];

  const dateProvider = new TestDateProvider();
  const ethCheatCodes = new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls, dateProvider);

  // Deploy our L1 contracts.
  logger.verbose('Deploying Aztec L1 contracts...');
  if (opts.l1StartTime) {
    await ethCheatCodes.warp(opts.l1StartTime, { resetBlockInterval: true });
  }

  const initialFundedAccounts = await generateSchnorrAccounts(numberOfInitialFundedAccounts);
  const sponsoredFPCAddress = await getSponsoredFPCAddress();
  const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(
    initialFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
    opts.initialAccountFeeJuice,
  );

  const vkTreeRoot = getVKTreeRoot();
  await deployMulticall3(l1Client, logger);

  // Define args, defaulted to our environment variables.
  const args: DeployAztecL1ContractsArgs = {
    ...getL1ContractsConfigEnvVars(),
    ...deployL1ContractsArgs,
    vkTreeRoot,
    genesisArchiveRoot,
    protocolContractsHash,
    initialValidators: opts.initialValidators,
    feeJuicePortalInitialBalance: fundingNeeded,
    realVerifier: false,
  };

  const deployL1ContractsValues = await deployAztecL1Contracts(
    aztecNodeConfig.l1RpcUrls[0],
    publisherPrivKeyHex,
    foundry.id,
    args,
  );

  aztecNodeConfig.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
  aztecNodeConfig.rollupVersion = deployL1ContractsValues.rollupVersion;

  const watcher = new AnvilTestWatcher(
    new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls, dateProvider),
    deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    deployL1ContractsValues.l1Client,
    dateProvider,
  );
  await watcher.start();

  const acvmConfig = await getACVMConfig(logger);
  if (acvmConfig) {
    aztecNodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
    aztecNodeConfig.acvmBinaryPath = acvmConfig.acvmBinaryPath;
  }

  const bbConfig = await getBBConfig(logger);
  if (bbConfig) {
    aztecNodeConfig.bbBinaryPath = bbConfig.bbBinaryPath;
    aztecNodeConfig.bbWorkingDirectory = bbConfig.bbWorkingDirectory;
  }

  const telemetry = await getEndToEndTestTelemetryClient(opts.metricsPort);

  logger.info('Creating and synching an aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(
    aztecNodeConfig,
    { telemetry, dateProvider },
    { prefilledPublicData },
  );

  let proverNode: ProverNode | undefined = undefined;
  if (opts.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node with p2p disabled...');
    proverNode = await createAndSyncProverNode(
      `0x${proverNodePrivateKey!.toString('hex')}`,
      aztecNodeConfig,
      {
        ...aztecNodeConfig.proverNodeConfig,
        dataDirectory: path.join(directoryToCleanup, randomBytes(8).toString('hex')),
        p2pEnabled: false,
      },
      aztecNode,
      prefilledPublicData,
    );
  }

  logger.verbose('Creating pxe...');
  const pxeConfig = getPXEConfig();
  pxeConfig.dataDirectory = path.join(directoryToCleanup, randomBytes(8).toString('hex'));
  // Only enable proving if specifically requested.
  pxeConfig.proverEnabled = !!opts.realProofs;
  const wallet = await TestWallet.create(aztecNode, pxeConfig);
  const cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, aztecNode, dateProvider);

  return {
    aztecNodeConfig,
    anvil,
    aztecNode,
    wallet,
    sequencer: aztecNode.getSequencer()!,
    acvmConfig,
    bbConfig,
    deployL1ContractsValues,
    proverNode,
    watcher,
    cheatCodes,
    dateProvider,
    initialFundedAccounts,
    directoryToCleanup,
  };
}

/**
 * Helper function to deploy accounts.
 * Returns deployed account data that can be used by tests.
 */
export const deployAccounts =
  (numberOfAccounts: number, logger: Logger) =>
  async ({ wallet, initialFundedAccounts }: { wallet: TestWallet; initialFundedAccounts: InitialAccountData[] }) => {
    if (initialFundedAccounts.length < numberOfAccounts) {
      throw new Error(`Cannot deploy more than ${initialFundedAccounts.length} initial accounts.`);
    }

    logger.verbose('Deploying accounts funded with fee juice...');
    const deployedAccounts = initialFundedAccounts.slice(0, numberOfAccounts);
    // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
    for (let i = 0; i < deployedAccounts.length; i++) {
      const accountManager = await wallet.createSchnorrAccount(
        deployedAccounts[i].secret,
        deployedAccounts[i].salt,
        deployedAccounts[i].signingKey,
      );
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod
        .send({
          from: AztecAddress.ZERO,
          skipClassPublication: i !== 0, // Publish the contract class at most once.
        })
        .wait();
    }

    return { deployedAccounts };
  };

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 * @param sender - Wallet to send the deployment tx.
 * @param accountsToDeploy - Which accounts to publicly deploy.
 * @param waitUntilProven - Whether to wait for the tx to be proven.
 * @param node - AztecNode used to wait for proven tx.
 */
export async function publicDeployAccounts(
  wallet: Wallet,
  accountsToDeploy: AztecAddress[],
  waitUntilProven = false,
  node?: AztecNode,
) {
  const instances = (await Promise.all(accountsToDeploy.map(account => wallet.getContractMetadata(account)))).map(
    metadata => metadata.contractInstance,
  );

  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  const alreadyRegistered = (await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered;

  const calls: ContractFunctionInteraction[] = await Promise.all([
    ...(!alreadyRegistered ? [publishContractClass(wallet, SchnorrAccountContractArtifact)] : []),
    ...instances.map(instance => publishInstance(wallet, instance!)),
  ]);

  const batch = new BatchCall(wallet, calls);

  const txReceipt = await batch.send({ from: accountsToDeploy[0] }).wait();
  if (waitUntilProven) {
    if (!node) {
      throw new Error('Need to provide an AztecNode to wait for proven.');
    } else {
      await waitForProven(node, txReceipt);
    }
  }
}
