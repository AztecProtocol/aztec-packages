import type { InitialAccountData } from '@aztec/accounts/testing';
import { type Archiver, createArchiver } from '@aztec/archiver';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import {
  BBCircuitVerifier,
  type ClientProtocolCircuitVerifier,
  QueuedIVCVerifier,
  TestCircuitVerifier,
} from '@aztec/bb-prover';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import type { DeployL1ContractsReturnType } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { SecretValue } from '@aztec/foundation/config';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { type ProverNode, type ProverNodeConfig, createProverNode } from '@aztec/prover-node';
import { TestWallet } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type Hex, getContract } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

import { TokenSimulator } from '../simulators/token_simulator.js';
import { BaseEndToEndTest } from './base_end_to_end_test.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import {
  ensureAccountContractsPublished,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
  setupPXEAndGetWallet,
} from './utils.js';

type ProvenSetup = {
  wallet: TestWallet;
  teardown: () => Promise<void>;
};

/**
 * Largely taken from the e2e_token_contract test file. We deploy 2 accounts and a token contract.
 * However, we then setup a second PXE with a full prover instance.
 * We configure this instance with all of the accounts and contracts.
 * We then prove and verify transactions created via this full prover PXE.
 */

export class FullProverTest extends BaseEndToEndTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  provenWallet!: TestWallet;
  deployedAccounts!: InitialAccountData[];
  fakeProofsAsset!: TokenContract;
  tokenSim!: TokenSimulator;
  private provenComponents: ProvenSetup[] = [];
  private bbConfigCleanup?: () => Promise<void>;
  private acvmConfigCleanup?: () => Promise<void>;
  circuitProofVerifier?: ClientProtocolCircuitVerifier;
  provenAsset!: TokenContract;
  private proverNodeInstance!: ProverNode;
  private simulatedProverNode!: ProverNode;
  public proverAddress!: EthAddress;

  // Alias for compatibility with tests
  get l1Contracts(): DeployL1ContractsReturnType {
    return this.deployL1ContractsValues;
  }

  constructor(
    testName: string,
    private minNumberOfTxsPerBlock: number,
    private coinbase: EthAddress,
    private realProofs = true,
  ) {
    super(testName, createLogger(`e2e:full_prover_test:${testName}`));
  }

  /**
   * Sets up base state:
   * 1. Add 2 accounts.
   * 2. Publicly deploy accounts, deploy token contract
   * This is called internally by setup() and should not be called directly by tests.
   */
  private async setupContracts() {
    // Accounts are already deployed by setup(), just use the deployed ones
    this.deployedAccounts = this.initialFundedAccounts.slice(0, 2);
    this.accounts = this.deployedAccounts.map(a => a.address);

    // Public deploy accounts
    this.logger.verbose(`Public deploy accounts...`);
    await ensureAccountContractsPublished(this.wallet, this.accounts.slice(0, 2));

    // Deploy token contract
    this.logger.verbose(`Deploying TokenContract...`);
    const asset = await TokenContract.deploy(
      this.wallet,
      this.accounts[0],
      FullProverTest.TOKEN_NAME,
      FullProverTest.TOKEN_SYMBOL,
      FullProverTest.TOKEN_DECIMALS,
    )
      .send({ from: this.accounts[0] })
      .deployed();
    this.logger.verbose(`Token deployed to ${asset.address}`);

    this.fakeProofsAsset = await TokenContract.at(asset.address, this.wallet);
    this.logger.verbose(`Token contract address: ${this.fakeProofsAsset.address}`);

    this.tokenSim = new TokenSimulator(this.fakeProofsAsset, this.wallet, this.accounts[0], this.logger, this.accounts);

    expect(await this.fakeProofsAsset.methods.get_admin().simulate({ from: this.accounts[0] })).toBe(
      this.accounts[0].toBigInt(),
    );
  }

  override async setup() {
    await super.setup(2, {
      startProverNode: true,
      fundRewardDistributor: true,
      coinbase: this.coinbase,
      realProofs: this.realProofs,
    });

    // Initialize contracts and accounts
    await this.setupContracts();

    // We don't wish to mark as proven automatically, so we set the flag to false
    this.context.watcher!.setIsMarkingAsProven(false);

    this.simulatedProverNode = this.proverNode!;

    const blobSinkClient = createBlobSinkClient({ blobSinkUrl: `http://localhost:${this.blobSink!.port}` });

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

      const verifier = await BBCircuitVerifier.new(bbConfig);
      this.circuitProofVerifier = new QueuedIVCVerifier(bbConfig, verifier);

      this.logger.debug(`Configuring the node for real proofs...`);
      await this.aztecNodeAdmin!.setConfig({
        realProofs: true,
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    } else {
      this.logger.debug(`Configuring the node min txs per block ${this.minNumberOfTxsPerBlock}...`);
      this.circuitProofVerifier = new TestCircuitVerifier();
      await this.aztecNodeAdmin!.setConfig({
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    }

    this.logger.verbose(`Move to a clean epoch`);
    await this.context.cheatCodes.rollup.advanceToNextEpoch();

    this.logger.verbose(`Marking current block as proven`);
    await this.context.cheatCodes.rollup.markAsProven();

    this.logger.verbose(`Main setup completed, initializing full prover PXE, Node, and Prover Node`);
    const { wallet: provenWallet, teardown: provenTeardown } = await setupPXEAndGetWallet(
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
    await provenWallet.registerContract(this.fakeProofsAsset);

    for (let i = 0; i < 2; i++) {
      await provenWallet.createSchnorrAccount(this.deployedAccounts[i].secret, this.deployedAccounts[i].salt);
      await this.wallet.createSchnorrAccount(this.deployedAccounts[i].secret, this.deployedAccounts[i].salt);
    }

    const asset = await TokenContract.at(this.fakeProofsAsset.address, provenWallet);
    this.provenComponents.push({
      wallet: provenWallet,
      teardown: provenTeardown,
    });
    this.provenAsset = asset;
    this.provenWallet = provenWallet;
    this.logger.info(`Full prover PXE started`);

    // Shutdown the current, simulated prover node
    this.logger.verbose('Shutting down simulated prover node');
    await this.simulatedProverNode.stop();

    // Creating temp store and archiver for fully proven prover node
    this.logger.verbose('Starting archiver for new prover node');
    const archiver = await createArchiver(
      { ...this.context.config, dataDirectory: undefined },
      { blobSinkClient },
      { blockUntilSync: true },
    );

    // The simulated prover node (now shutdown) used private key index 2
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodeSenderAddress = privateKeyToAddress(new Buffer32(proverNodePrivateKey!).toString());
    this.proverAddress = EthAddress.fromString(proverNodeSenderAddress);

    this.logger.verbose(`Funding prover node at ${proverNodeSenderAddress}`);
    await this.mintFeeJuice(proverNodeSenderAddress);

    this.logger.verbose('Starting prover node');
    const proverConfig: ProverNodeConfig = {
      ...this.context.config,
      txCollectionNodeRpcUrls: [],
      dataDirectory: undefined,
      proverId: this.proverAddress,
      realProofs: this.realProofs,
      proverAgentCount: 2,
      publisherPrivateKeys: [new SecretValue(`0x${proverNodePrivateKey!.toString('hex')}` as const)],
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 100,
      txGatheringIntervalMs: 1000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 100,
      txGatheringTimeoutMs: 24_000,
      proverNodeFailedEpochStore: undefined,
      proverNodeEpochProvingDelayMs: undefined,
    };
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const { prefilledPublicData } = await getGenesisValues(
      this.initialFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
    );
    this.proverNodeInstance = await createProverNode(
      proverConfig,
      {
        aztecNodeTxProvider: this.aztecNode,
        archiver: archiver as Archiver,
        blobSinkClient,
      },
      { prefilledPublicData },
    );
    await this.proverNodeInstance.start();

    this.logger.warn(`Proofs are now enabled`);
    return this;
  }

  private async mintFeeJuice(recipient: Hex) {
    const handlerAddress = this.deployL1ContractsValues.l1ContractAddresses.feeAssetHandlerAddress!;
    this.logger.verbose(`Minting fee juice to ${recipient} using handler at ${handlerAddress}`);
    const client = this.deployL1ContractsValues.l1Client;
    const handler = getContract({ abi: FeeAssetHandlerAbi, address: handlerAddress.toString(), client });
    const hash = await handler.write.mint([recipient]);
    await this.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash });
  }

  override async teardown() {
    // Cleanup related to the full prover PXEs
    for (let i = 0; i < this.provenComponents.length; i++) {
      await this.provenComponents[i].teardown();
    }

    // clean up the full prover node
    await this.proverNodeInstance?.stop();

    await this.bbConfigCleanup?.();
    await this.acvmConfigCleanup?.();

    await super.teardown();
  }

  async mintTokens() {
    const { fakeProofsAsset: asset, accounts } = this;
    const privateAmount = 10000n;
    const publicAmount = 10000n;

    this.logger.verbose(`Minting ${privateAmount + publicAmount} publicly...`);
    await asset.methods
      .mint_to_public(accounts[0], privateAmount + publicAmount)
      .send({ from: accounts[0] })
      .wait();

    this.logger.verbose(`Transferring ${privateAmount} to private...`);
    await asset.methods.transfer_to_private(accounts[0], privateAmount).send({ from: accounts[0] }).wait();

    this.logger.verbose(`Minting complete.`);

    const {
      fakeProofsAsset,
      accounts: [address],
      tokenSim,
    } = this;
    tokenSim.mintPublic(address, publicAmount);

    const publicBalance = await fakeProofsAsset.methods.balance_of_public(address).simulate({ from: address });
    this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
    expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(address));

    tokenSim.mintPrivate(address, publicAmount);
    const privateBalance = await fakeProofsAsset.methods.balance_of_private(address).simulate({ from: address });
    this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
    expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(address));

    const totalSupply = await fakeProofsAsset.methods.total_supply().simulate({ from: address });
    this.logger.verbose(`Total supply: ${totalSupply}`);
    expect(totalSupply).toEqual(tokenSim.totalSupply);
  }
}
