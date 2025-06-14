import {
  SchnorrAccountContractArtifact,
  getSchnorrAccount,
  getSchnorrWalletWithSecretKey,
} from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import { type Archiver, createArchiver } from '@aztec/archiver';
import {
  type AccountWalletWithSecretKey,
  type AztecNode,
  type CompleteAddress,
  EthAddress,
  type Logger,
  type PXE,
  createLogger,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { BBCircuitVerifier, type ClientProtocolCircuitVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import type { BlobSinkServer } from '@aztec/blob-sink/server';
import type { DeployL1ContractsReturnType } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { TestERC20Abi } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { type ProverNode, type ProverNodeConfig, createProverNode } from '@aztec/prover-node';
import type { PXEService } from '@aztec/pxe/server';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type Hex, getContract } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

import { TokenSimulator } from '../simulators/token_simulator.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
  publicDeployAccounts,
} from './snapshot_manager.js';
import { getPrivateKeyFromIndex, getSponsoredFPCAddress, setupPXEService } from './utils.js';

const { E2E_DATA_PATH: dataPath } = process.env;

type ProvenSetup = {
  pxe: PXE;
  teardown: () => Promise<void>;
};

/**
 * Largely taken from the e2e_token_contract test file. We deploy 2 accounts and a token contract.
 * However, we then setup a second PXE with a full prover instance.
 * We configure this instance with all of the accounts and contracts.
 * We then prove and verify transactions created via this full prover PXE.
 */

export class FullProverTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  private snapshotManager: ISnapshotManager;
  logger: Logger;
  deployedAccounts: InitialAccountData[] = [];
  wallets: AccountWalletWithSecretKey[] = [];
  accounts: CompleteAddress[] = [];
  fakeProofsAsset!: TokenContract;
  tokenSim!: TokenSimulator;
  aztecNode!: AztecNode;
  aztecNodeAdmin!: AztecNodeAdmin;
  pxe!: PXEService;
  cheatCodes!: CheatCodes;
  blobSink!: BlobSinkServer;
  private provenComponents: ProvenSetup[] = [];
  private bbConfigCleanup?: () => Promise<void>;
  private acvmConfigCleanup?: () => Promise<void>;
  circuitProofVerifier?: ClientProtocolCircuitVerifier;
  provenAssets: TokenContract[] = [];
  private context!: SubsystemsContext;
  private proverNode!: ProverNode;
  private simulatedProverNode!: ProverNode;
  public l1Contracts!: DeployL1ContractsReturnType;
  public proverAddress!: EthAddress;

  constructor(
    testName: string,
    private minNumberOfTxsPerBlock: number,
    coinbase: EthAddress,
    private realProofs = true,
  ) {
    this.logger = createLogger(`e2e:full_prover_test:${testName}`);
    this.snapshotManager = createSnapshotManager(
      `full_prover_integration/${testName}`,
      dataPath,
      { startProverNode: true, fundRewardDistributor: true, coinbase },
      {
        realVerifier: realProofs,
      },
    );
  }

  /**
   * Adds two state shifts to snapshot manager.
   * 1. Add 2 accounts.
   * 2. Publicly deploy accounts, deploy token contract
   */
  async applyBaseSnapshots() {
    await this.snapshotManager.snapshot(
      '2_accounts',
      deployAccounts(2, this.logger),
      async ({ deployedAccounts }, { pxe }) => {
        this.deployedAccounts = deployedAccounts;
        this.wallets = await Promise.all(
          deployedAccounts.map(a => getSchnorrWalletWithSecretKey(pxe, a.secret, a.signingKey, a.salt)),
        );
        this.accounts = this.wallets.map(w => w.getCompleteAddress());
        this.wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
      },
    );

    await this.snapshotManager.snapshot(
      'client_prover_integration',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallets[0], this.accounts.slice(0, 2));

        this.logger.verbose(`Deploying TokenContract...`);
        const asset = await TokenContract.deploy(
          this.wallets[0],
          this.accounts[0],
          FullProverTest.TOKEN_NAME,
          FullProverTest.TOKEN_SYMBOL,
          FullProverTest.TOKEN_DECIMALS,
        )
          .send()
          .deployed();
        this.logger.verbose(`Token deployed to ${asset.address}`);

        return { tokenContractAddress: asset.address };
      },
      async ({ tokenContractAddress }) => {
        // Restore the token contract state.
        this.fakeProofsAsset = await TokenContract.at(tokenContractAddress, this.wallets[0]);
        this.logger.verbose(`Token contract address: ${this.fakeProofsAsset.address}`);

        this.tokenSim = new TokenSimulator(
          this.fakeProofsAsset,
          this.wallets[0],
          this.logger,
          this.accounts.map(a => a.address),
        );

        expect(await this.fakeProofsAsset.methods.get_admin().simulate()).toBe(this.accounts[0].address.toBigInt());
      },
    );
  }

  async setup() {
    this.context = await this.snapshotManager.setup();

    // We don't wish to mark as proven automatically, so we set the flag to false
    this.context.watcher.setIsMarkingAsProven(false);

    this.simulatedProverNode = this.context.proverNode!;
    ({
      pxe: this.pxe,
      aztecNode: this.aztecNode,
      deployL1ContractsValues: this.l1Contracts,
      cheatCodes: this.cheatCodes,
      blobSink: this.blobSink,
    } = this.context);
    this.aztecNodeAdmin = this.context.aztecNode;

    const blobSinkClient = createBlobSinkClient({ blobSinkUrl: `http://localhost:${this.blobSink.port}` });

    // Configure a full prover PXE
    let acvmConfig: Awaited<ReturnType<typeof getACVMConfig>> | undefined;
    let bbConfig: Awaited<ReturnType<typeof getBBConfig>> | undefined;
    if (this.realProofs) {
      [acvmConfig, bbConfig] = await Promise.all([getACVMConfig(this.logger), getBBConfig(this.logger)]);
      if (!acvmConfig || !bbConfig) {
        throw new Error('Missing ACVM or BB config');
      }

      this.acvmConfigCleanup = acvmConfig.cleanup;
      this.bbConfigCleanup = bbConfig.cleanup;

      if (!bbConfig?.bbWorkingDirectory || !bbConfig?.bbBinaryPath) {
        throw new Error(`Test must be run with BB native configuration`);
      }

      this.circuitProofVerifier = await BBCircuitVerifier.new(bbConfig);

      this.logger.debug(`Configuring the node for real proofs...`);
      await this.aztecNodeAdmin.setConfig({
        realProofs: true,
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    } else {
      this.logger.debug(`Configuring the node min txs per block ${this.minNumberOfTxsPerBlock}...`);
      this.circuitProofVerifier = new TestCircuitVerifier();
      await this.aztecNodeAdmin.setConfig({
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    }

    this.logger.verbose(`Move to a clean epoch`);
    await this.context.cheatCodes.rollup.advanceToNextEpoch();

    this.logger.verbose(`Marking current block as proven`);
    await this.context.cheatCodes.rollup.markAsProven();

    this.logger.verbose(`Main setup completed, initializing full prover PXE, Node, and Prover Node`);
    for (let i = 0; i < 2; i++) {
      const result = await setupPXEService(
        this.aztecNode,
        {
          proverEnabled: this.realProofs,
          bbBinaryPath: bbConfig?.bbBinaryPath,
          bbWorkingDirectory: bbConfig?.bbWorkingDirectory,
        },
        undefined,
        true,
      );
      this.logger.debug(`Contract address ${this.fakeProofsAsset.address}`);
      await result.pxe.registerContract(this.fakeProofsAsset);

      for (let i = 0; i < 2; i++) {
        await result.pxe.registerAccount(
          this.deployedAccounts[i].secret,
          this.wallets[i].getCompleteAddress().partialAddress,
        );
        await this.pxe.registerAccount(
          this.deployedAccounts[i].secret,
          this.wallets[i].getCompleteAddress().partialAddress,
        );
      }

      const account = await getSchnorrAccount(
        result.pxe,
        this.deployedAccounts[0].secret,
        this.deployedAccounts[0].signingKey,
        this.deployedAccounts[0].salt,
      );

      await result.pxe.registerContract({
        instance: account.getInstance(),
        artifact: SchnorrAccountContractArtifact,
      });

      const provenWallet = await account.getWallet();
      const asset = await TokenContract.at(this.fakeProofsAsset.address, provenWallet);
      this.provenComponents.push({
        pxe: result.pxe,
        teardown: result.teardown,
      });
      this.provenAssets.push(asset);
    }
    this.logger.info(`Full prover PXE started`);

    // Shutdown the current, simulated prover node
    this.logger.verbose('Shutting down simulated prover node');
    await this.simulatedProverNode.stop();

    // Creating temp store and archiver for fully proven prover node
    this.logger.verbose('Starting archiver for new prover node');
    const archiver = await createArchiver(
      { ...this.context.aztecNodeConfig, dataDirectory: undefined },
      blobSinkClient,
      { blockUntilSync: true },
    );

    // The simulated prover node (now shutdown) used private key index 2
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodeSenderAddress = privateKeyToAddress(new Buffer32(proverNodePrivateKey!).toString());
    this.proverAddress = EthAddress.fromString(proverNodeSenderAddress);

    this.logger.verbose(`Funding prover node at ${proverNodeSenderAddress}`);
    await this.mintL1ERC20(proverNodeSenderAddress, 100_000_000n);

    this.logger.verbose('Starting prover node');
    const proverConfig: ProverNodeConfig = {
      ...this.context.aztecNodeConfig,
      proverCoordinationNodeUrls: [],
      dataDirectory: undefined,
      proverId: this.proverAddress.toField(),
      realProofs: this.realProofs,
      proverAgentCount: 2,
      publisherPrivateKey: `0x${proverNodePrivateKey!.toString('hex')}`,
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 100,
      txGatheringIntervalMs: 1000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 100,
      proverNodeFailedEpochStore: undefined,
    };
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const { prefilledPublicData } = await getGenesisValues(
      this.context.initialFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
    );
    this.proverNode = await createProverNode(
      proverConfig,
      {
        aztecNodeTxProvider: this.aztecNode,
        archiver: archiver as Archiver,
        blobSinkClient,
      },
      { prefilledPublicData },
    );
    await this.proverNode.start();

    this.logger.warn(`Proofs are now enabled`);
    return this;
  }

  private async mintL1ERC20(recipient: Hex, amount: bigint) {
    const erc20Address = this.context.deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress;
    const client = this.context.deployL1ContractsValues.l1Client;
    const erc20 = getContract({ abi: TestERC20Abi, address: erc20Address.toString(), client });
    const hash = await erc20.write.mint([recipient, amount]);
    await this.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash });
  }

  snapshot = <T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ): Promise<void> => this.snapshotManager.snapshot(name, apply, restore);

  async teardown() {
    await this.snapshotManager.teardown();

    // Cleanup related to the full prover PXEs
    for (let i = 0; i < this.provenComponents.length; i++) {
      await this.provenComponents[i].teardown();
    }

    // clean up the full prover node
    await this.proverNode.stop();

    await this.bbConfigCleanup?.();
    await this.acvmConfigCleanup?.();
  }

  async applyMintSnapshot() {
    await this.snapshotManager.snapshot(
      'mint',
      async () => {
        const { fakeProofsAsset: asset, accounts } = this;
        const privateAmount = 10000n;
        const publicAmount = 10000n;

        this.logger.verbose(`Minting ${privateAmount + publicAmount} publicly...`);
        await asset.methods
          .mint_to_public(accounts[0].address, privateAmount + publicAmount)
          .send()
          .wait();

        this.logger.verbose(`Transferring ${privateAmount} to private...`);
        await asset.methods.transfer_to_private(accounts[0].address, privateAmount).send().wait();

        this.logger.verbose(`Minting complete.`);

        return { amount: publicAmount };
      },
      async ({ amount }) => {
        const {
          fakeProofsAsset: asset,
          accounts: [{ address }],
          tokenSim,
        } = this;
        tokenSim.mintPublic(address, amount);

        const publicBalance = await asset.methods.balance_of_public(address).simulate();
        this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
        expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(address));

        tokenSim.mintPrivate(address, amount);
        const privateBalance = await asset.methods.balance_of_private(address).simulate();
        this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
        expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(address));

        const totalSupply = await asset.methods.total_supply().simulate();
        this.logger.verbose(`Total supply: ${totalSupply}`);
        expect(totalSupply).toEqual(tokenSim.totalSupply);

        return Promise.resolve();
      },
    );
  }
}
