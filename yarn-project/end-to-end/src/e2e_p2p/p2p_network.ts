import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { AztecNodeConfig } from '@aztec/aztec-node';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { GSEContract, RollupContract, type SlashingProposerContract } from '@aztec/ethereum/contracts';
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
import type { EluSummaryStats } from '@aztec/foundation/testing/elu_monitor';
import { writeAggregateEluSummary } from '@aztec/foundation/testing/elu_monitor';
import { RollupAbi, SlasherAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { privateKeyFromHex } from '@aztec/p2p';
import type { BootstrapNode } from '@aztec/p2p/bootstrap';
import { createBootstrapNodeFromPrivateKey, getBootstrapNodeEnr } from '@aztec/p2p/test-helpers';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { AztecNode, PeerInfo } from '@aztec/stdlib/interfaces/server';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { TopicType } from '@aztec/stdlib/p2p';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { ZkPassportProofParams } from '@aztec/stdlib/zkpassport';
import { getGenesisValues } from '@aztec/world-state/testing';

import getPort from 'get-port';
import { type GetContractReturnType, getAddress, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  SCHNORR_HARDCODED_PRIVATE_KEY,
  SchnorrHardcodedKeyAccountContract,
} from '../fixtures/schnorr_hardcoded_account_contract.js';
import {
  type EndToEndContext,
  type SetupOptions,
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
import type { TestWallet } from '../test-wallet/test_wallet.js';
import type { WorkerAztecNode } from './worker_node.js';

// Use a fixed bootstrap node private key so that we can re-use the same snapshot and the nodes can find each other
const BOOTSTRAP_NODE_PRIVATE_KEY_HEX = '080212208f988fc0899e4a73a5aee4d271a5f20670603a756ad8d84f2c94263a6427c591';
const BOOTSTRAP_NODE_PRIVATE_KEY = privateKeyFromHex(BOOTSTRAP_NODE_PRIVATE_KEY_HEX);
const l1ContractsConfig = getL1ContractsConfigEnvVars();
export const WAIT_FOR_TX_TIMEOUT = l1ContractsConfig.aztecSlotDuration * 3;

export const SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES = {
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  aztecProofSubmissionEpochs: 640,
};

/**
 * Minimal node interface satisfied by both AztecNodeService (in-process) and WorkerAztecNode (worker thread).
 * Used by P2PNetworkTest helpers that need to operate on either type of node.
 */
export type P2PTestNode = AztecNode &
  AztecNodeAdmin & {
    getP2P(): {
      getPeers(includePending?: boolean): Promise<PeerInfo[]>;
      getGossipMeshPeerCount(topicType: TopicType): Promise<number>;
    };
    stop(): Promise<void>;
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

  public hardcodedAccountData!: InitialAccountData;
  public genesis: GenesisData | undefined;

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
      slasherEnabled: initialValidatorConfig.slasherEnabled ?? true,
      aztecTargetCommitteeSize: numberOfValidators,
      metricsPort: metricsPort,
      numberOfInitialFundedAccounts: 2,
      startProverNode,
    };

    this.deployL1ContractsArgs = {
      ...initialValidatorConfig,
      aztecEpochDuration: initialValidatorConfig.aztecEpochDuration ?? l1ContractsConfig.aztecEpochDuration,
      slashingRoundSizeInEpochs:
        initialValidatorConfig.slashingRoundSizeInEpochs ?? l1ContractsConfig.slashingRoundSizeInEpochs,
      slasherEnabled: initialValidatorConfig.slasherEnabled ?? true,

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

    const bootstrapNodeENR = getBootstrapNodeEnr(BOOTSTRAP_NODE_PRIVATE_KEY, port);
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
    if (!this.hardcodedAccountData) {
      throw new Error('Call setup to initialize the hardcoded account.');
    }
    return this.hardcodedAccountData;
  }

  async addBootstrapNode() {
    this.logger.info('Adding bootstrap node');
    const telemetry = await getEndToEndTestTelemetryClient(this.metricsPort);
    this.bootstrapNode = await createBootstrapNodeFromPrivateKey(
      BOOTSTRAP_NODE_PRIVATE_KEY_HEX,
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

  /** Points the wallet to a P2P-enabled node so transactions can propagate through the network. */
  setupWalletOnNode(node: AztecNode) {
    this.logger.info('Pointing wallet to a P2P-enabled node');
    this.context.wallet.updateNode(node);
  }

  /** Registers the hardcoded account in PXE without on-chain deployment. No sequencer needed. */
  async setupAccount() {
    this.logger.info('Registering hardcoded account (no deployment)');
    const contract = new SchnorrHardcodedKeyAccountContract();
    const accountManager = await (this.context.wallet as TestWallet).createAccount({
      secret: this.hardcodedAccountData.secret,
      salt: this.hardcodedAccountData.salt,
      contract,
    });
    this.defaultAccountAddress = accountManager.address;
    this.wallet = this.context.wallet;
  }

  async deploySpamContract() {
    this.logger.info('Deploying spam contract');
    if (!this.wallet) {
      throw new Error('Call setupAccount before deploying spam contract');
    }

    ({ contract: this.spamContract } = await SpamContract.deploy(this.wallet).send({
      from: this.defaultAccountAddress!,
    }));
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

    // Pre-compute hardcoded account data so it gets funded in genesis.
    const contract = new SchnorrHardcodedKeyAccountContract();
    const secret = Fr.random();
    const salt = Fr.random();
    this.hardcodedAccountData = {
      secret,
      salt,
      signingKey: SCHNORR_HARDCODED_PRIVATE_KEY,
      address: await getAccountContractAddress(contract, secret, salt),
    };

    // Generate regular Schnorr accounts for tests that need deployable accounts (e.g. add_rollup).
    const regularAccounts = await generateSchnorrAccounts(this.setupOptions.numberOfInitialFundedAccounts ?? 2);

    this.context = await setup(
      0,
      {
        ...this.setupOptions,
        fundSponsoredFPC: true,
        skipAccountDeployment: true,
        skipInitialSequencer: true,
        initialFundedAccounts: [...regularAccounts, this.hardcodedAccountData],
        slasherEnabled: this.setupOptions.slasherEnabled ?? this.deployL1ContractsArgs.slasherEnabled ?? false,
        aztecTargetCommitteeSize: 0,
        l1ContractsArgs: this.deployL1ContractsArgs,
      },
      // Use checkpointed chain tip for PXE to avoid issues with blocks being dropped due to pruned anchor blocks.
      { syncChainTip: 'checkpointed' },
    );
    this.ctx = this.context;

    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = [...this.context.initialFundedAccounts.map(a => a.address), sponsoredFPCAddress];

    const { genesis } = await getGenesisValues(
      initialFundedAccounts,
      undefined,
      undefined,
      this.context.genesis!.genesisTimestamp,
    );
    this.genesis = genesis;

    const rollupContract = RollupContract.getFromL1ContractsValues(this.context.deployL1ContractsValues);
    this.monitor = new ChainMonitor(rollupContract, this.context.dateProvider).start();
    this.monitor.on('l1-block', ({ timestamp }) => {
      const timeMs = Number(timestamp) * 1000;
      this.context.dateProvider.setTime(timeMs);
      // Also broadcast to any registered worker nodes (fire-and-forget)
      for (const wn of this.workerNodes) {
        wn.setTime(timeMs).catch(() => {});
      }
    });
  }

  /** Worker nodes registered for time sync broadcasts. */
  private workerNodes: WorkerAztecNode[] = [];

  /** Registers worker nodes so setTime calls are broadcast to their DateProviders. */
  registerWorkerNodes(nodes: WorkerAztecNode[]) {
    this.workerNodes = nodes;
  }

  /**
   * Sets time on the shared DateProvider AND broadcasts to all registered worker nodes.
   * Use this instead of context.dateProvider.setTime() when worker nodes are active.
   */
  async setTimeOnAllNodes(timeMs: number) {
    this.context.dateProvider.setTime(timeMs);
    await Promise.all(this.workerNodes.map(wn => wn.setTime(timeMs).catch(() => {})));
  }

  async stopNodes(nodes: P2PTestNode[]) {
    this.logger.info('Stopping nodes');

    if (!nodes || !nodes.length) {
      this.logger.info('No nodes to stop');
      return;
    }

    // Stop all nodes first. For worker nodes, stop() also captures the ELU summary just before
    // terminating the worker thread (the summary isn't available until eluMonitor.stop() runs
    // inside the worker, which happens as part of the stopNode RPC).
    await Promise.all(nodes.map(node => node.stop()));

    // Now collect the captured ELU stats from each worker (served from in-memory cache on the
    // proxy since the worker thread is already terminated).
    const eluStats: EluSummaryStats[] = [];
    for (const wn of this.workerNodes) {
      try {
        const stats = await wn.getEluStats();
        if (stats) {
          eluStats.push(stats);
        }
      } catch {
        // Worker may already be dead
      }
    }

    // Write aggregate ELU summary to the shared file after all workers are stopped
    const eluFilePath = process.env.ELU_MONITOR_FILE;
    if (eluFilePath && eluStats.length > 0) {
      writeAggregateEluSummary(eluFilePath, eluStats);
    }

    this.workerNodes = [];
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
  /**
   * Wait for gossipsub mesh to form for all specified topics across all nodes.
   * Each node must have at least 1 mesh peer per topic before this resolves.
   *
   * @param skipNodeIndices - Indices of nodes to skip the mesh check for. This is needed for
   *   nodes whose only gossipsub peers are configured as `directPeers` (e.g. via `preferredPeers`).
   *   Gossipsub's `directPeers` bypass the mesh entirely: they are excluded from mesh candidacy
   *   during heartbeats and GRAFT attempts from directPeers are rejected with PRUNE. This means
   *   nodes that ONLY connect to peers that have them as `directPeers` will never form mesh links,
   *   even though message delivery still works via the directPeers relay path.
   */
  async waitForGossipSubMesh(
    nodes: P2PTestNode[],
    topics: TopicType[] = [TopicType.tx],
    timeoutSeconds = 30,
    checkIntervalSeconds = 0.1,
    skipNodeIndices: Set<number> = new Set(),
  ) {
    for (const topic of topics) {
      this.logger.warn(`Waiting for GossipSub mesh to form for ${topic} topic...`);
      await Promise.all(
        nodes.map(async (node, index) => {
          if (skipNodeIndices.has(index)) {
            this.logger.warn(`Skipping gossip mesh check for node ${index} (directPeers-only node)`);
            return;
          }
          const p2p = node.getP2P();
          await retryUntil(
            async () => {
              const meshPeers = await p2p.getGossipMeshPeerCount(topic);
              this.logger.debug(`Node ${index} has ${meshPeers} gossip mesh peers for ${topic} topic`);
              return meshPeers >= 1 ? true : undefined;
            },
            `Node ${index} to have gossip mesh peers for ${topic} topic`,
            timeoutSeconds,
            checkIntervalSeconds,
          );
        }),
      );
      this.logger.warn(`All nodes have gossip mesh peers for ${topic} topic`);
    }
  }

  async waitForP2PMeshConnectivity(
    nodes: P2PTestNode[],
    expectedNodeCount?: number,
    timeoutSeconds = 30,
    checkIntervalSeconds = 0.1,
    topics: TopicType[] = [TopicType.tx],
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

    await this.waitForGossipSubMesh(nodes, topics, timeoutSeconds, checkIntervalSeconds);
  }

  async teardown() {
    await this.monitor.stop();
    await tryStop(this.bootstrapNode, this.logger);
    await teardown(this.context);
  }

  async getContracts(): Promise<{
    rollup: RollupContract;
    slasherContract: GetContractReturnType<typeof SlasherAbi, ViemClient>;
    slashingProposer: SlashingProposerContract | undefined;
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

    // Get the actual slashing proposer from rollup
    const slashingProposer = await rollup.getSlashingProposer();

    return { rollup, slasherContract, slashingProposer };
  }
}
