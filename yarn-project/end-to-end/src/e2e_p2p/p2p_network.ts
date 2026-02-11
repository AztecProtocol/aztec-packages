import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import {
  type EmpireSlashingProposerContract,
  GSEContract,
  RollupContract,
  type TallySlashingProposerContract,
} from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { MultiAdderArtifact } from '@aztec/ethereum/l1-artifacts';
import { createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { ChainMonitor } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient, ViemClient } from '@aztec/ethereum/types';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { RollupAbi, SlasherAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import type { BootstrapNode } from '@aztec/p2p/bootstrap';
import { createBootstrapNodeFromPrivateKey, getBootstrapNodeEnr } from '@aztec/p2p/test-helpers';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { ZkPassportProofParams } from '@aztec/stdlib/zkpassport';
import type { TestWallet } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import getPort from 'get-port';
import { type GetContractReturnType, getAddress, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  type EndToEndContext,
  type SetupOptions,
  deployAccounts,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
  setup,
  teardown,
} from '../fixtures/setup.js';
import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  createValidatorConfig,
  generatePrivateKeys,
} from '../fixtures/setup_p2p_test.js';
import { getEndToEndTestTelemetryClient } from '../fixtures/with_telemetry_utils.js';

// Use a fixed bootstrap node private key so that we can re-use the same snapshot and the nodes can find each other
const BOOTSTRAP_NODE_PRIVATE_KEY = '080212208f988fc0899e4a73a5aee4d271a5f20670603a756ad8d84f2c94263a6427c591';
const l1ContractsConfig = getL1ContractsConfigEnvVars();
export const WAIT_FOR_TX_TIMEOUT = l1ContractsConfig.aztecSlotDuration * 3;

export const SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES = {
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  aztecProofSubmissionWindow: 640,
};

export class P2PNetworkTest {
  public context!: EndToEndContext;
  public baseAccountPrivateKey: `0x${string}`;
  public baseAccount;

  public logger: Logger;
  public monitor!: ChainMonitor;

  public ctx!: EndToEndContext;
  public attesterPrivateKeys: `0x${string}`[] = [];
  public attesterPublicKeys: string[] = [];
  public peerIdPrivateKeys: string[] = [];
  public validators: Operator[] = [];

  public deployedAccounts: InitialAccountData[] = [];
  public prefilledPublicData: PublicDataTreeLeaf[] = [];

  // The re-execution test needs a wallet and a spam contract
  public wallet?: TestWallet;
  public defaultAccountAddress?: AztecAddress;
  public spamContract?: SpamContract;

  public bootstrapNode?: BootstrapNode;

  // Store setup options for use in setup()
  private setupOptions: SetupOptions;
  private deployL1ContractsArgs: any;

  constructor(
    public readonly testName: string,
    public bootstrapNodeEnr: string,
    public bootNodePort: number,
    public numberOfValidators: number,
    initialValidatorConfig: SetupOptions,
    public numberOfNodes = 0,
    // If set enable metrics collection
    private metricsPort?: number,
    startProverNode?: boolean,
  ) {
    this.logger = createLogger(`e2e:e2e_p2p:${testName}`);

    // Set up the base account and node private keys for the initial network deployment
    this.baseAccountPrivateKey = `0x${getPrivateKeyFromIndex(1)!.toString('hex')}`;
    this.baseAccount = privateKeyToAccount(this.baseAccountPrivateKey);
    this.attesterPrivateKeys = generatePrivateKeys(
      ATTESTER_PRIVATE_KEYS_START_INDEX + numberOfNodes,
      numberOfValidators,
    );
    this.attesterPublicKeys = this.attesterPrivateKeys.map(privateKey => privateKeyToAccount(privateKey).address);

    const zkPassportParams = ZkPassportProofParams.random();

    // Store setup options for later use
    this.setupOptions = {
      ...initialValidatorConfig,
      ethereumSlotDuration: initialValidatorConfig.ethereumSlotDuration ?? l1ContractsConfig.ethereumSlotDuration,
      aztecEpochDuration: initialValidatorConfig.aztecEpochDuration ?? l1ContractsConfig.aztecEpochDuration,
      aztecSlotDuration: initialValidatorConfig.aztecSlotDuration ?? l1ContractsConfig.aztecSlotDuration,
      aztecProofSubmissionEpochs:
        initialValidatorConfig.aztecProofSubmissionEpochs ?? l1ContractsConfig.aztecProofSubmissionEpochs,
      slashingRoundSizeInEpochs:
        initialValidatorConfig.slashingRoundSizeInEpochs ?? l1ContractsConfig.slashingRoundSizeInEpochs,
      slasherFlavor: initialValidatorConfig.slasherFlavor ?? 'tally',
      aztecTargetCommitteeSize: numberOfValidators,
      metricsPort: metricsPort,
      numberOfInitialFundedAccounts: 2,
      startProverNode,
      walletMinFeePadding: 2.0,
    };

    this.deployL1ContractsArgs = {
      ...initialValidatorConfig,
      aztecEpochDuration: initialValidatorConfig.aztecEpochDuration ?? l1ContractsConfig.aztecEpochDuration,
      slashingRoundSizeInEpochs:
        initialValidatorConfig.slashingRoundSizeInEpochs ?? l1ContractsConfig.slashingRoundSizeInEpochs,
      slasherFlavor: initialValidatorConfig.slasherFlavor ?? 'tally',

      ethereumSlotDuration: initialValidatorConfig.ethereumSlotDuration ?? l1ContractsConfig.ethereumSlotDuration,
      aztecSlotDuration: initialValidatorConfig.aztecSlotDuration ?? l1ContractsConfig.aztecSlotDuration,
      aztecProofSubmissionEpochs:
        initialValidatorConfig.aztecProofSubmissionEpochs ?? l1ContractsConfig.aztecProofSubmissionEpochs,
      aztecTargetCommitteeSize: numberOfValidators,
      initialValidators: [],
      zkPassportArgs: {
        zkPassportDomain: zkPassportParams.domain,
        zkPassportScope: zkPassportParams.scope,
      },
    };
  }

  static async create({
    testName,
    numberOfNodes,
    numberOfValidators,
    basePort,
    metricsPort,
    initialConfig,
    startProverNode,
  }: {
    testName: string;
    numberOfNodes: number;
    numberOfValidators: number;
    basePort?: number;
    metricsPort?: number;
    initialConfig?: SetupOptions;
    startProverNode?: boolean;
  }) {
    const port = basePort || (await getPort());

    const bootstrapNodeENR = await getBootstrapNodeEnr(BOOTSTRAP_NODE_PRIVATE_KEY, port);
    const bootstrapNodeEnr = bootstrapNodeENR.encodeTxt();

    const initialValidatorConfig = await createValidatorConfig(
      (initialConfig ?? {}) as AztecNodeConfig,
      bootstrapNodeEnr,
    );

    return new P2PNetworkTest(
      testName,
      bootstrapNodeEnr,
      port,
      numberOfValidators,
      initialValidatorConfig,
      numberOfNodes,
      metricsPort,
      startProverNode,
    );
  }

  get fundedAccount() {
    if (!this.deployedAccounts[0]) {
      throw new Error('Call setupAccount to create a funded account.');
    }
    return this.deployedAccounts[0];
  }

  async addBootstrapNode() {
    this.logger.info('Adding bootstrap node');
    const telemetry = await getEndToEndTestTelemetryClient(this.metricsPort);
    this.bootstrapNode = await createBootstrapNodeFromPrivateKey(
      BOOTSTRAP_NODE_PRIVATE_KEY,
      this.bootNodePort,
      telemetry,
      this.context.config,
    );
    // Overwrite enr with updated info
    this.bootstrapNodeEnr = this.bootstrapNode.getENR().encodeTxt();
  }

  getValidators() {
    const validators: Operator[] = [];

    for (let i = 0; i < this.numberOfValidators; i++) {
      const keyIndex = i;
      const attester = privateKeyToAccount(this.attesterPrivateKeys[keyIndex]!);

      validators.push({
        attester: EthAddress.fromString(attester.address),
        withdrawer: EthAddress.fromString(attester.address),
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      });

      this.logger.info(`Adding attester ${attester.address} as validator`);
    }
    return { validators };
  }

  async applyBaseSetup() {
    await this.addBootstrapNode();

    this.logger.info('Adding validators');
    const rollup = getContract({
      address: this.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: this.context.deployL1ContractsValues.l1Client,
    });

    this.logger.info(`Adding ${this.numberOfValidators} validators`);

    const stakingAsset = getContract({
      address: this.context.deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
      abi: TestERC20Abi,
      client: this.context.deployL1ContractsValues.l1Client,
    });

    const { address: multiAdderAddress } = await deployL1Contract(
      this.context.deployL1ContractsValues.l1Client,
      MultiAdderArtifact.contractAbi,
      MultiAdderArtifact.contractBytecode,
      [rollup.address, this.context.deployL1ContractsValues.l1Client.account.address],
    );

    const multiAdder = getContract({
      address: multiAdderAddress.toString(),
      abi: MultiAdderArtifact.contractAbi,
      client: this.context.deployL1ContractsValues.l1Client,
    });

    const stakeNeeded = (await rollup.read.getActivationThreshold()) * BigInt(this.numberOfValidators);
    await Promise.all(
      [await stakingAsset.write.mint([multiAdder.address, stakeNeeded], {} as any)].map(txHash =>
        this.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: txHash }),
      ),
    );

    const { validators } = this.getValidators();
    this.validators = validators;

    const gseAddress = this.context.deployL1ContractsValues.l1ContractAddresses.gseAddress!;
    if (!gseAddress) {
      throw new Error('GSE contract not deployed');
    }

    const gseContract = new GSEContract(this.context.deployL1ContractsValues.l1Client, gseAddress.toString());

    const makeValidatorTuples = async (validator: Operator) => {
      const registrationTuple = await gseContract.makeRegistrationTuple(validator.bn254SecretKey.getValue());
      return {
        attester: validator.attester.toString() as `0x${string}`,
        withdrawer: validator.withdrawer.toString() as `0x${string}`,
        ...registrationTuple,
      };
    };
    const validatorTuples = await Promise.all(validators.map(makeValidatorTuples));

    await this.context.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
      hash: await multiAdder.write.addValidators([validatorTuples]),
    });

    await this.context.cheatCodes.rollup.advanceToEpoch(
      EpochNumber.fromBigInt(
        BigInt(await this.context.cheatCodes.rollup.getEpoch()) +
          (await rollup.read.getLagInEpochsForValidatorSet()) +
          1n,
      ),
    );

    // Send and await a tx to make sure we mine a block for the warp to correctly progress.
    await this._sendDummyTx(this.context.deployL1ContractsValues.l1Client);
  }

  async setupAccount() {
    this.logger.info('Setting up account');
    const { deployedAccounts } = await deployAccounts(
      1,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });
    this.deployedAccounts = deployedAccounts;
    [{ address: this.defaultAccountAddress }] = deployedAccounts;
    this.wallet = this.context.wallet;
  }

  async deploySpamContract() {
    this.logger.info('Deploying spam contract');
    if (!this.wallet) {
      throw new Error('Call setupAccount before deploying spam contract');
    }

    const spamContract = await SpamContract.deploy(this.wallet).send({ from: this.defaultAccountAddress! });
    this.spamContract = spamContract;
  }

  async removeInitialNode() {
    this.logger.info('Removing initial node');
    // Send and await a tx to make sure we mine a block for the warp to correctly progress.
    const { receipt } = await this._sendDummyTx(this.context.deployL1ContractsValues.l1Client);
    const block = await this.context.deployL1ContractsValues.l1Client.getBlock({
      blockNumber: receipt.blockNumber,
    });
    this.context.dateProvider.setTime(Number(block.timestamp) * 1000);

    await this.context.aztecNodeService.stop();
  }

  async sendDummyTx() {
    return await this._sendDummyTx(this.ctx.deployL1ContractsValues.l1Client);
  }

  private async _sendDummyTx(l1Client: ExtendedViemWalletClient) {
    const l1TxUtils = createL1TxUtils(l1Client);
    return await l1TxUtils.sendAndMonitorTransaction({
      to: l1Client.account!.address,
      value: 1n,
    });
  }

  async setup() {
    this.logger.info('Setting up subsystems from fresh');
    this.context = await setup(
      0,
      {
        ...this.setupOptions,
        fundSponsoredFPC: true,
        skipAccountDeployment: true,
        slasherFlavor: this.setupOptions.slasherFlavor ?? this.deployL1ContractsArgs.slasherFlavor ?? 'none',
        aztecTargetCommitteeSize: 0,
        l1ContractsArgs: this.deployL1ContractsArgs,
      },
      // Use checkpointed chain tip for PXE to avoid issues with blocks being dropped due to pruned anchor blocks.
      { syncChainTip: 'checkpointed' },
    );
    this.ctx = this.context;

    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = [...this.context.initialFundedAccounts.map(a => a.address), sponsoredFPCAddress];

    const { prefilledPublicData } = await getGenesisValues(initialFundedAccounts);
    this.prefilledPublicData = prefilledPublicData;

    const rollupContract = RollupContract.getFromL1ContractsValues(this.context.deployL1ContractsValues);
    this.monitor = new ChainMonitor(rollupContract, this.context.dateProvider).start();
    this.monitor.on('l1-block', ({ timestamp }) => this.context.dateProvider.setTime(Number(timestamp) * 1000));
  }

  async stopNodes(nodes: AztecNodeService[]) {
    this.logger.info('Stopping nodes');

    if (!nodes || !nodes.length) {
      this.logger.info('No nodes to stop');
      return;
    }

    await Promise.all(nodes.map(node => node.stop()));

    this.logger.info('Nodes stopped');
  }

  /**
   * Wait for P2P mesh to be fully formed across all nodes.
   * This ensures that all nodes are connected to each other before proceeding,
   * preventing race conditions where validators propose blocks before the network is ready.
   *
   * @param nodes - Array of nodes to check for P2P connectivity
   * @param expectedNodeCount - Expected number of nodes in the network (defaults to nodes.length)
   * @param timeoutSeconds - Maximum time to wait for connections (default: 30 seconds)
   * @param checkIntervalSeconds - How often to check connectivity (default: 0.1 seconds)
   */
  async waitForP2PMeshConnectivity(
    nodes: AztecNodeService[],
    expectedNodeCount?: number,
    timeoutSeconds = 30,
    checkIntervalSeconds = 0.1,
  ) {
    const nodeCount = expectedNodeCount ?? nodes.length;
    const minPeerCount = nodeCount - 1;

    this.logger.warn(
      `Waiting for all ${nodeCount} nodes to connect to P2P mesh (at least ${minPeerCount} peers each)...`,
    );

    await Promise.all(
      nodes.map(async (node, index) => {
        const p2p = node.getP2P();
        await retryUntil(
          async () => {
            const peers = await p2p.getPeers();
            // Each node should be connected to at least N-1 other nodes
            return peers.length >= minPeerCount ? true : undefined;
          },
          `Node ${index} to connect to at least ${minPeerCount} peers`,
          timeoutSeconds,
          checkIntervalSeconds,
        );
      }),
    );

    this.logger.warn('All nodes connected to P2P mesh');
  }

  async teardown() {
    await this.monitor.stop();
    await tryStop(this.bootstrapNode, this.logger);
    await teardown(this.context);
  }

  async getContracts(): Promise<{
    rollup: RollupContract;
    slasherContract: GetContractReturnType<typeof SlasherAbi, ViemClient>;
    slashingProposer: EmpireSlashingProposerContract | TallySlashingProposerContract | undefined;
    slashFactory: SlashFactoryContract;
  }> {
    if (!this.ctx.deployL1ContractsValues) {
      throw new Error('DeployAztecL1ContractsValues not set');
    }

    const rollup = new RollupContract(
      this.ctx.deployL1ContractsValues!.l1Client,
      this.ctx.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
    );

    const slasherContract = getContract({
      address: getAddress((await rollup.getSlasherAddress()).toString()),
      abi: SlasherAbi,
      client: this.ctx.deployL1ContractsValues.l1Client,
    });

    // Get the actual slashing proposer from rollup (which handles both empire and tally)
    const slashingProposer = await rollup.getSlashingProposer();

    const slashFactory = new SlashFactoryContract(
      this.ctx.deployL1ContractsValues.l1Client,
      getAddress(this.ctx.deployL1ContractsValues.l1ContractAddresses.slashFactoryAddress!.toString()),
    );

    return { rollup, slasherContract, slashingProposer, slashFactory };
  }
}
