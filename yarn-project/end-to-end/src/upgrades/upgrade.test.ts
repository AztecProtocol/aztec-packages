import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type AztecNode, ContractDeployer, type DeployL1Contracts, Fr, type Wallet } from '@aztec/aztec.js';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import {
  DefaultL1ContractsConfig,
  RegistryContract,
  defaultL1TxUtilsConfig,
  deployRollupAndUpgradePayload,
} from '@aztec/ethereum';
import { createGovernanceProposal, executeGovernanceProposal } from '@aztec/ethereum/test';
import type { Logger } from '@aztec/foundation/log';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { StatefulTestContractArtifact } from '@aztec/noir-contracts.js/StatefulTest';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import { jest } from '@jest/globals';
import 'jest-extended';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'os';
import { foundry } from 'viem/chains';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { type SetupOptions, setup } from '../fixtures/utils.js';

const originalVersionSalt = 1;

describe('upgrade', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let teardown: () => Promise<void>;
  let deployL1ContractsValues: DeployL1Contracts;
  let logger: Logger;
  let originalNode: AztecNode;
  let upgradedNode: AztecNodeService;
  afterEach(() => {
    jest.restoreAllMocks();
  });

  let owner: Wallet;
  let config: AztecNodeConfig;
  let dateProvider: TestDateProvider | undefined;
  const artifact = StatefulTestContractArtifact;
  let directoryToCleanup: string;
  beforeAll(async () => {
    ({
      teardown,
      wallets: [owner],
      aztecNode: originalNode,
      config,
      dateProvider,
      deployL1ContractsValues,
      logger,
    } = await setup(1, {
      archiverPollingIntervalMS: 200,
      transactionPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      minTxsPerBlock: 1,
      aztecEpochDuration: 4,
      aztecProofSubmissionWindow: 8,
      aztecSlotDuration: 12,
      ethereumSlotDuration: 12,
      startProverNode: true,
      salt: originalVersionSalt,
    }));
  });

  afterAll(async () => {
    await teardown();
    await upgradedNode.stop();
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  });

  it('upgrades the rollup', async () => {
    // Should be able to deploy a contract on the original node
    const deployer = new ContractDeployer(artifact, owner);
    const ownerAddress = owner.getCompleteAddress().address;
    const sender = ownerAddress;
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassRegistration: true,
      skipPublicDeployment: true,
    });
    const tx = await provenTx.send().wait({ proven: true });
    expect(tx.blockNumber).toBeDefined();

    const publicClient = deployL1ContractsValues.publicClient;
    const walletClient = deployL1ContractsValues.walletClient;
    const account = deployL1ContractsValues.walletClient.account;
    const registryAddress = deployL1ContractsValues.l1ContractAddresses.registryAddress;
    const rpcUrl = config.l1RpcUrl;

    const addresses = await RegistryContract.collectAddresses(publicClient, registryAddress, 'canonical');
    const newVersionSalt = originalVersionSalt + 1;

    const opts: SetupOptions = {
      numberOfInitialFundedAccounts: 1,
    };

    const initialFundedAccounts = await generateSchnorrAccounts(opts.numberOfInitialFundedAccounts!);
    const { genesisBlockHash, genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(
      initialFundedAccounts.map(a => a.address),
      opts.initialAccountFeeJuice,
      opts.genesisPublicData,
    );

    const { payloadAddress } = await deployRollupAndUpgradePayload(
      rpcUrl,
      foundry,
      account,
      {
        ...DefaultL1ContractsConfig,
        salt: newVersionSalt,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractTreeRoot,
        l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
        genesisArchiveRoot,
        genesisBlockHash,
      },
      registryAddress,
      logger,
      defaultL1TxUtilsConfig,
    );

    const { governance, voteAmount } = await createGovernanceProposal(
      payloadAddress.toString(),
      addresses,
      account,
      publicClient,
      logger,
    );

    await executeGovernanceProposal(0n, governance, voteAmount, account, publicClient, walletClient, rpcUrl, logger);

    const newCanonicalAddresses = await RegistryContract.collectAddresses(publicClient, registryAddress, 'canonical');

    const blobSinkClient = createBlobSinkClient(config);
    logger.info('Creating and syncing upgraded node', config);

    directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
    await fs.mkdir(directoryToCleanup, { recursive: true });

    const acvmConfig = await getACVMConfig(logger);
    if (!acvmConfig) {
      throw new Error('ACVM config not found');
    }

    const bbConfig = await getBBConfig(logger);
    if (!bbConfig) {
      throw new Error('BB config not found');
    }

    upgradedNode = await AztecNodeService.createAndSync(
      {
        ...config,
        dataDirectory: directoryToCleanup,
        version: 2,
        l1Contracts: newCanonicalAddresses,
        acvmBinaryPath: acvmConfig.acvmBinaryPath,
        acvmWorkingDirectory: acvmConfig.acvmWorkingDirectory,
        bbBinaryPath: bbConfig.bbBinaryPath,
        bbWorkingDirectory: bbConfig.bbWorkingDirectory,
      },
      {
        dateProvider,
        blobSinkClient,
      },
      { prefilledPublicData },
    );

    {
      expect(await upgradedNode.isReady()).toBe(true);
      expect(await upgradedNode.getVersion()).toBe(2);
      const l2Tips = await upgradedNode.getL2Tips();
      expect(l2Tips.latest.number).toBe(0);
      await expect(upgradedNode.getArchiveSiblingPath(1, 1n)).rejects.toThrow(/Block 1 not yet synced/);
    }

    {
      expect(await originalNode.isReady()).toBe(true);
      expect(await originalNode.getVersion()).toBe(1);
      const originalL2Tips = await originalNode.getL2Tips();
      expect(originalL2Tips.latest.number).toBeGreaterThan(0);
      const siblingPath = await originalNode.getArchiveSiblingPath(1, 1n);
      expect(siblingPath).toBeDefined();
      expect(siblingPath.toFields()[0]).not.toBe(Fr.ZERO);
    }
  });
});
