import { SchnorrAccountContractArtifact, getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type Archiver, createArchiver } from '@aztec/archiver';
import {
  type AccountWalletWithSecretKey,
  type AztecNode,
  type CheatCodes,
  type CompleteAddress,
  type DeployL1Contracts,
  EthAddress,
  type Fq,
  Fr,
  type Logger,
  type PXE,
  createLogger,
  deployL1Contract,
} from '@aztec/aztec.js';
import {
  BBCircuitVerifier,
  type ClientProtocolCircuitVerifier,
  TestCircuitVerifier,
  type UltraKeccakHonkServerProtocolArtifact,
} from '@aztec/bb-prover';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { type BlobSinkServer } from '@aztec/blob-sink/server';
import { compileContract } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { type ProverNode, type ProverNodeConfig, createProverNode } from '@aztec/prover-node';
import { type PXEService } from '@aztec/pxe';
import { getTelemetryClient } from '@aztec/telemetry-client';

// TODO(#7373): Deploy honk solidity verifier
// @ts-expect-error solc-js doesn't publish its types https://github.com/ethereum/solc-js/issues/689
import solc from 'solc';
import { type Hex, getContract } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  addAccounts,
  createSnapshotManager,
  publicDeployAccounts,
} from '../fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex, setupPXEService } from '../fixtures/utils.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { E2E_DATA_PATH: dataPath } = process.env;

const SALT = 1;

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
  keys: Array<[Fr, Fq]> = [];
  wallets: AccountWalletWithSecretKey[] = [];
  accounts: CompleteAddress[] = [];
  fakeProofsAsset!: TokenContract;
  tokenSim!: TokenSimulator;
  aztecNode!: AztecNode;
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
  public l1Contracts!: DeployL1Contracts;
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
      { assumeProvenThrough: undefined },
    );
  }

  /**
   * Adds two state shifts to snapshot manager.
   * 1. Add 2 accounts.
   * 2. Publicly deploy accounts, deploy token contract
   */
  async applyBaseSnapshots() {
    await this.snapshotManager.snapshot('2_accounts', addAccounts(2, this.logger), async ({ accountKeys }, { pxe }) => {
      this.keys = accountKeys;
      const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], SALT));
      this.wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
      this.accounts = accountManagers.map(a => a.getCompleteAddress());
      this.wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
    });

    await this.snapshotManager.snapshot(
      'client_prover_integration',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallets[0], this.accounts.slice(0, 2), false);

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
    this.simulatedProverNode = this.context.proverNode!;
    ({
      pxe: this.pxe,
      aztecNode: this.aztecNode,
      deployL1ContractsValues: this.l1Contracts,
      cheatCodes: this.cheatCodes,
      blobSink: this.blobSink,
    } = this.context);

    const blobSinkClient = createBlobSinkClient(`http://localhost:${this.blobSink.port}`);

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
      await this.aztecNode.setConfig({
        realProofs: true,
        minTxsPerBlock: this.minNumberOfTxsPerBlock,
      });
    } else {
      this.logger.debug(`Configuring the node min txs per block ${this.minNumberOfTxsPerBlock}...`);
      this.circuitProofVerifier = new TestCircuitVerifier();
      await this.aztecNode.setConfig({
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
        await result.pxe.registerAccount(this.keys[i][0], this.wallets[i].getCompleteAddress().partialAddress);
        await this.pxe.registerAccount(this.keys[i][0], this.wallets[i].getCompleteAddress().partialAddress);
      }

      const account = getSchnorrAccount(result.pxe, this.keys[0][0], this.keys[0][1], SALT);

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
      proverCoordinationNodeUrl: undefined,
      dataDirectory: undefined,
      proverId: new Fr(81),
      realProofs: this.realProofs,
      proverAgentCount: 2,
      publisherPrivateKey: `0x${proverNodePrivateKey!.toString('hex')}`,
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 100,
      quoteProviderBasisPointFee: 100,
      quoteProviderBondAmount: 1000n,
      proverMinimumEscrowAmount: 3000n,
      proverTargetEscrowAmount: 6000n,
      txGatheringTimeoutMs: 60000,
      txGatheringIntervalMs: 1000,
      txGatheringMaxParallelRequests: 100,
    };
    this.proverNode = await createProverNode(proverConfig, {
      aztecNodeTxProvider: this.aztecNode,
      archiver: archiver as Archiver,
      blobSinkClient,
    });
    await this.proverNode.start();

    this.logger.warn(`Proofs are now enabled`);
    return this;
  }

  private async mintL1ERC20(recipient: Hex, amount: bigint) {
    const erc20Address = this.context.deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress;
    const client = this.context.deployL1ContractsValues.walletClient;
    const erc20 = getContract({ abi: TestERC20Abi, address: erc20Address.toString(), client });
    const hash = await erc20.write.mint([recipient, amount]);
    await this.context.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash });
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

        const waitOpts = { proven: false };

        this.logger.verbose(`Minting ${privateAmount + publicAmount} publicly...`);
        await asset.methods
          .mint_to_public(accounts[0].address, privateAmount + publicAmount)
          .send()
          .wait(waitOpts);

        this.logger.verbose(`Transferring ${privateAmount} to private...`);
        await asset.methods.transfer_to_private(accounts[0].address, privateAmount).send().wait(waitOpts);

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

  async deployVerifier() {
    if (!this.realProofs) {
      return;
    }

    if (!this.circuitProofVerifier) {
      throw new Error('No verifier');
    }

    const verifier = this.circuitProofVerifier as BBCircuitVerifier;
    const { walletClient, publicClient, l1ContractAddresses } = this.context.deployL1ContractsValues;
    const rollup = getContract({
      abi: RollupAbi,
      address: l1ContractAddresses.rollupAddress.toString(),
      client: walletClient,
    });

    // REFACTOR: Extract this method to a common package. We need a package that deals with L1
    // but also has a reference to L1 artifacts and bb-prover.
    const setupVerifier = async (artifact: UltraKeccakHonkServerProtocolArtifact) => {
      const contract = await verifier.generateSolidityContract(artifact, 'UltraHonkVerifier.sol');
      const { abi, bytecode } = compileContract('UltraHonkVerifier.sol', 'HonkVerifier', contract, solc);
      const { address: verifierAddress } = await deployL1Contract(walletClient, publicClient, abi, bytecode);
      this.logger.info(`Deployed real ${artifact} verifier at ${verifierAddress}`);

      await rollup.write.setEpochVerifier([verifierAddress.toString()]);
    };

    await setupVerifier('RootRollupArtifact');

    this.logger.info('Rollup only accepts valid proofs now');
  }
}
