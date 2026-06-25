import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { AztecNodeService, createAztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import type { ClientProtocolCircuitVerifier } from '@aztec/bb-prover';
import { BackendType, Barretenberg } from '@aztec/bb.js';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { Buffer32 } from '@aztec/foundation/buffer';
import { SecretValue } from '@aztec/foundation/config';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type Hex, getContract } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

import { TokenSimulator } from '../simulators/token_simulator.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import {
  type EndToEndContext,
  type SetupOptions,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
  setup,
  setupPXEAndGetWallet,
  teardown,
} from './setup.js';

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

export class FullProverTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  logger: Logger;
  wallet!: TestWallet;
  provenWallet!: TestWallet;
  accounts: AztecAddress[] = [];
  fundedAccounts!: InitialAccountData[];
  fakeProofsAsset!: TokenContract;
  fakeProofsAssetInstance!: ContractInstanceWithAddress;
  tokenSim!: TokenSimulator;
  aztecNode!: AztecNode;
  aztecNodeAdmin!: AztecNodeAdmin;
  cheatCodes!: CheatCodes;
  private provenComponents: ProvenSetup[] = [];
  private bbConfigCleanup?: () => Promise<void>;
  private acvmConfigCleanup?: () => Promise<void>;
  /** Returns the proof verifier from the prover node (for test assertions). */
  get circuitProofVerifier(): ClientProtocolCircuitVerifier | undefined {
    return this.proverAztecNode?.getProofVerifier();
  }
  provenAsset!: TokenContract;
  context!: EndToEndContext;
  private proverAztecNode!: AztecNodeService;
  private simulatedProverAztecNode!: AztecNodeService;
  public l1Contracts!: DeployAztecL1ContractsReturnType;
  public proverAddress!: EthAddress;
  private minNumberOfTxsPerBlock: number;
  private coinbase: EthAddress;
  private realProofs: boolean;

  constructor(testName: string, minNumberOfTxsPerBlock: number, coinbase: EthAddress, realProofs = true) {
    this.logger = createLogger(`e2e:full_prover_test:${testName}`);
    this.minNumberOfTxsPerBlock = minNumberOfTxsPerBlock;
    this.coinbase = coinbase;
    this.realProofs = realProofs;
  }

  /**
   * Applies base setup: deploys 2 accounts and token contract.
   */
  private async applyBaseSetup() {
    this.logger.info('Applying base setup: registering funded accounts');
    this.fundedAccounts = this.context.additionallyFundedAccounts;
    this.accounts = this.fundedAccounts.map(a => a.address);
    this.wallet = this.context.wallet;
    for (const { secret, salt, signingKey } of this.fundedAccounts) {
      await this.wallet.createSchnorrInitializerlessAccount(secret, salt, signingKey);
    }

    this.logger.info('Applying base setup: deploying token contract');
    const { contract: asset, instance } = await TokenContract.deploy(
      this.wallet,
      this.accounts[0],
      FullProverTest.TOKEN_NAME,
      FullProverTest.TOKEN_SYMBOL,
      FullProverTest.TOKEN_DECIMALS,
    ).send({ from: this.accounts[0] });
    this.logger.verbose(`Token deployed to ${asset.address}`);

    this.fakeProofsAsset = asset;
    this.fakeProofsAssetInstance = instance;
    this.logger.verbose(`Token contract address: ${this.fakeProofsAsset.address}`);

    this.tokenSim = new TokenSimulator(this.fakeProofsAsset, this.wallet, this.accounts[0], this.logger, this.accounts);

    expect((await this.fakeProofsAsset.methods.get_admin().simulate({ from: this.accounts[0] })).result).toBe(
      this.accounts[0].toBigInt(),
    );
  }

  async setup(opts: Partial<SetupOptions> = {}) {
    this.logger.info('Setting up subsystems from fresh');
    this.context = await setup(0, {
      ...opts,
      startProverNode: true,
      coinbase: this.coinbase,
      fundSponsoredFPC: true,
      additionallyFundedAccounts: await generateSchnorrAccounts(2),
      l1ContractsArgs: { realVerifier: this.realProofs },
    });

    await this.applyBaseSetup();
    await this.applyMint();

    this.logger.info(`Enabling proving`, { realProofs: this.realProofs });

    this.simulatedProverAztecNode = this.context.proverNode!;
    ({
      aztecNode: this.aztecNode,
      deployL1ContractsValues: this.l1Contracts,
      cheatCodes: this.cheatCodes,
    } = this.context);
    this.aztecNodeAdmin = this.context.aztecNodeService;

    const config = this.context.aztecNodeConfig;

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

      await Barretenberg.initSingleton({ backend: BackendType.NativeUnixSocket });

      this.logger.debug(`Configuring the node for real proofs...`);
      await this.aztecNodeAdmin.setConfig({
        realProofs: true,
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    } else {
      this.logger.debug(`Configuring the node min txs per block ${this.minNumberOfTxsPerBlock}...`);
      await this.aztecNodeAdmin.setConfig({
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
      this.context.aztecNode,
      { proverEnabled: this.realProofs },
      undefined,
      'pxe-proven',
    );
    this.logger.debug(`Contract address ${this.fakeProofsAsset.address}`);
    await provenWallet.registerContract(this.fakeProofsAssetInstance, TokenContract.artifact);

    for (let i = 0; i < 2; i++) {
      // Mirror the initializerless funded accounts (created via createFundedAccounts) in both wallets so
      // their addresses match the genesis-funded ones.
      await provenWallet.createSchnorrInitializerlessAccount(
        this.fundedAccounts[i].secret,
        this.fundedAccounts[i].salt,
      );
      await this.wallet.createSchnorrInitializerlessAccount(this.fundedAccounts[i].secret, this.fundedAccounts[i].salt);
    }

    const asset = TokenContract.at(this.fakeProofsAsset.address, provenWallet);
    this.provenComponents.push({
      wallet: provenWallet,
      teardown: provenTeardown,
    });
    this.provenAsset = asset;
    this.provenWallet = provenWallet;
    this.logger.info(`Full prover PXE started`);

    // Shutdown the current, simulated prover node (by stopping its hosting aztec node)
    this.logger.verbose('Shutting down simulated prover node');
    await this.simulatedProverAztecNode.stop();

    // The simulated prover node (now shutdown) used private key index 2
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodePrivateKeyHex = `0x${proverNodePrivateKey!.toString('hex')}` as const;
    const proverNodeSenderAddress = privateKeyToAddress(new Buffer32(proverNodePrivateKey!).toString());
    this.proverAddress = EthAddress.fromString(proverNodeSenderAddress);

    this.logger.verbose(`Funding prover node at ${proverNodeSenderAddress}`);
    await this.mintFeeJuice(proverNodeSenderAddress);

    this.logger.verbose('Starting prover node');
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const { genesis } = await getGenesisValues(
      this.context.additionallyFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
      undefined,
      undefined,
      this.context.genesis!.genesisTimestamp,
    );

    const proverNodeConfig: Parameters<typeof createAztecNodeService>[0] = {
      ...config,
      enableProverNode: true,
      disableValidator: true,
      dataDirectory: undefined,
      txCollectionNodeRpcUrls: [],
      proverId: this.proverAddress,
      realProofs: this.realProofs,
      proverAgentCount: 2,
      proverPublisherPrivateKeys: [new SecretValue(proverNodePrivateKeyHex)],
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 100,
      txGatheringIntervalMs: 1000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 100,
      // The test warps the L1 clock forward a full epoch via cheatcodes; the prover-node
      // tracks L1 time, so an in-flight tx-gather would see its deadline jump into the
      // past. Use a generous window so the deadline survives the warp.
      txGatheringTimeoutMs: 10 * 60 * 1000,
      proverNodeFailedEpochStore: undefined,
      proverNodeEpochProvingDelayMs: undefined,
      validatorPrivateKeys: new SecretValue([]),
    };

    this.proverAztecNode = await createAztecNodeService(
      proverNodeConfig,
      { dateProvider: this.context.dateProvider, p2pClientDeps: { rpcTxProviders: [this.aztecNode] } },
      { genesis },
    );
    this.logger.warn(`Proofs are now enabled`, { realProofs: this.realProofs });
    return this;
  }

  private async mintFeeJuice(recipient: Hex) {
    const handlerAddress = this.context.deployL1ContractsValues.l1ContractAddresses.feeAssetHandlerAddress!;
    this.logger.verbose(`Minting fee juice to ${recipient} using handler at ${handlerAddress}`);
    const client = this.context.deployL1ContractsValues.l1Client;
    const handler = getContract({ abi: FeeAssetHandlerAbi, address: handlerAddress.toString(), client });
    const hash = await handler.write.mint([recipient]);
    await this.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash });
  }

  async teardown() {
    // Cleanup related to the full prover PXEs
    for (let i = 0; i < this.provenComponents.length; i++) {
      await this.provenComponents[i].teardown();
    }

    // clean up the full prover node (by stopping its hosting aztec node)
    await this.proverAztecNode.stop();

    await Barretenberg.destroySingleton();
    await this.bbConfigCleanup?.();
    await this.acvmConfigCleanup?.();

    await teardown(this.context);
  }

  private async applyMint() {
    this.logger.info('Applying mint setup');
    const { fakeProofsAsset: asset, accounts } = this;
    const privateAmount = 10000n;
    const publicAmount = 10000n;

    this.logger.verbose(`Minting ${privateAmount + publicAmount} publicly...`);
    await asset.methods.mint_to_public(accounts[0], privateAmount + publicAmount).send({ from: accounts[0] });

    this.logger.verbose(`Transferring ${privateAmount} to private...`);
    await asset.methods.transfer_to_private(accounts[0], privateAmount).send({ from: accounts[0] });

    this.logger.info(`Minting complete`);

    const {
      fakeProofsAsset,
      accounts: [address],
      tokenSim,
    } = this;
    tokenSim.mintPublic(address, publicAmount);

    const { result: publicBalance } = await fakeProofsAsset.methods
      .balance_of_public(address)
      .simulate({ from: address });
    this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
    expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(address));

    tokenSim.mintPrivate(address, publicAmount);
    const { result: privateBalance } = await fakeProofsAsset.methods
      .balance_of_private(address)
      .simulate({ from: address });
    this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
    expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(address));

    const { result: totalSupply } = await fakeProofsAsset.methods.total_supply().simulate({ from: address });
    this.logger.verbose(`Total supply: ${totalSupply}`);
    expect(totalSupply).toEqual(tokenSim.totalSupply);
  }
}
