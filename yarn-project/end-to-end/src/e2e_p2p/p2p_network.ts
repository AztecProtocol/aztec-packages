import { getSchnorrWalletWithSecretKey } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type AccountWalletWithSecretKey, EthAddress } from '@aztec/aztec.js';
import {
  type ExtendedViemWalletClient,
  L1TxUtils,
  type Operator,
  RollupContract,
  deployL1Contract,
  getL1ContractsConfigEnvVars,
  l1Artifacts,
} from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import type { BootstrapNode } from '@aztec/p2p/bootstrap';
import { createBootstrapNodeFromPrivateKey, getBootstrapNodeEnr } from '@aztec/p2p/test-helpers';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { getGenesisValues } from '@aztec/world-state/testing';

import getPort from 'get-port';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  createValidatorConfig,
  generatePrivateKeys,
} from '../fixtures/setup_p2p_test.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
} from '../fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex, getSponsoredFPCAddress } from '../fixtures/utils.js';
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
  private snapshotManager: ISnapshotManager;
  public baseAccountPrivateKey: `0x${string}`;
  public baseAccount;

  public logger: Logger;
  public monitor!: ChainMonitor;

  public ctx!: SubsystemsContext;
  public attesterPrivateKeys: `0x${string}`[] = [];
  public attesterPublicKeys: string[] = [];
  public peerIdPrivateKeys: string[] = [];
  public validators: Operator[] = [];

  public deployedAccounts: InitialAccountData[] = [];
  public prefilledPublicData: PublicDataTreeLeaf[] = [];
  // The re-execution test needs a wallet and a spam contract
  public wallet?: AccountWalletWithSecretKey;
  public spamContract?: SpamContract;

  public bootstrapNode?: BootstrapNode;

  constructor(
    testName: string,
    public bootstrapNodeEnr: string,
    public bootNodePort: number,
    private numberOfNodes: number,
    initialValidatorConfig: AztecNodeConfig,
    // If set enable metrics collection
    private metricsPort?: number,
    startProverNode?: boolean,
  ) {
    this.logger = createLogger(`e2e:e2e_p2p:${testName}`);

    // Set up the base account and node private keys for the initial network deployment
    this.baseAccountPrivateKey = `0x${getPrivateKeyFromIndex(1)!.toString('hex')}`;
    this.baseAccount = privateKeyToAccount(this.baseAccountPrivateKey);
    this.attesterPrivateKeys = generatePrivateKeys(ATTESTER_PRIVATE_KEYS_START_INDEX, numberOfNodes);
    this.attesterPublicKeys = this.attesterPrivateKeys.map(privateKey => privateKeyToAccount(privateKey).address);

    this.snapshotManager = createSnapshotManager(
      `e2e_p2p_network/${testName}`,
      process.env.E2E_DATA_PATH,
      {
        ...initialValidatorConfig,
        ethereumSlotDuration: initialValidatorConfig.ethereumSlotDuration ?? l1ContractsConfig.ethereumSlotDuration,
        aztecEpochDuration: initialValidatorConfig.aztecEpochDuration ?? l1ContractsConfig.aztecEpochDuration,
        aztecSlotDuration: initialValidatorConfig.aztecSlotDuration ?? l1ContractsConfig.aztecSlotDuration,
        aztecProofSubmissionWindow:
          initialValidatorConfig.aztecProofSubmissionWindow ?? l1ContractsConfig.aztecProofSubmissionWindow,
        salt: 420,
        metricsPort: metricsPort,
        numberOfInitialFundedAccounts: 2,
        startProverNode,
      },
      {
        ...initialValidatorConfig,
        aztecEpochDuration: initialValidatorConfig.aztecEpochDuration ?? l1ContractsConfig.aztecEpochDuration,
        ethereumSlotDuration: initialValidatorConfig.ethereumSlotDuration ?? l1ContractsConfig.ethereumSlotDuration,
        aztecSlotDuration: initialValidatorConfig.aztecSlotDuration ?? l1ContractsConfig.aztecSlotDuration,
        aztecProofSubmissionWindow:
          initialValidatorConfig.aztecProofSubmissionWindow ?? l1ContractsConfig.aztecProofSubmissionWindow,
        initialValidators: [],
      },
    );
  }

  static async create({
    testName,
    numberOfNodes,
    basePort,
    metricsPort,
    initialConfig,
    startProverNode,
  }: {
    testName: string;
    numberOfNodes: number;
    basePort?: number;
    metricsPort?: number;
    initialConfig?: Partial<AztecNodeConfig>;
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
      numberOfNodes,
      initialValidatorConfig,
      metricsPort,
      startProverNode,
    );
  }

  get fundedAccount() {
    if (!this.deployedAccounts[0]) {
      throw new Error('Call snapshot t.setupAccount to create a funded account.');
    }
    return this.deployedAccounts[0];
  }

  async addBootstrapNode() {
    await this.snapshotManager.snapshot('add-bootstrap-node', async ({ aztecNodeConfig }) => {
      const telemetry = getEndToEndTestTelemetryClient(this.metricsPort);
      this.bootstrapNode = await createBootstrapNodeFromPrivateKey(
        BOOTSTRAP_NODE_PRIVATE_KEY,
        this.bootNodePort,
        telemetry,
        aztecNodeConfig,
      );
      // Overwrite enr with updated info
      this.bootstrapNodeEnr = this.bootstrapNode.getENR().encodeTxt();
    });
  }

  getValidators() {
    const validators: Operator[] = [];

    for (let i = 0; i < this.numberOfNodes; i++) {
      const attester = privateKeyToAccount(this.attesterPrivateKeys[i]!);

      validators.push({
        attester: EthAddress.fromString(attester.address),
        withdrawer: EthAddress.fromString(attester.address),
      });

      this.logger.info(`Adding attester ${attester.address} as validator`);
    }
    return { validators };
  }

  async applyBaseSnapshots() {
    await this.addBootstrapNode();
    await this.snapshotManager.snapshot(
      'add-validators',
      async ({ deployL1ContractsValues, dateProvider, cheatCodes }) => {
        const rollup = getContract({
          address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
          abi: RollupAbi,
          client: deployL1ContractsValues.l1Client,
        });

        this.logger.verbose(`Adding ${this.numberOfNodes} validators`);

        const stakingAsset = getContract({
          address: deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
          abi: TestERC20Abi,
          client: deployL1ContractsValues.l1Client,
        });

        const { address: multiAdderAddress } = await deployL1Contract(
          deployL1ContractsValues.l1Client,
          l1Artifacts.multiAdder.contractAbi,
          l1Artifacts.multiAdder.contractBytecode,
          [rollup.address, deployL1ContractsValues.l1Client.account.address],
        );

        const multiAdder = getContract({
          address: multiAdderAddress.toString(),
          abi: l1Artifacts.multiAdder.contractAbi,
          client: deployL1ContractsValues.l1Client,
        });

        const stakeNeeded = l1ContractsConfig.minimumStake * BigInt(this.numberOfNodes);
        await Promise.all(
          [await stakingAsset.write.mint([multiAdder.address, stakeNeeded], {} as any)].map(txHash =>
            deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: txHash }),
          ),
        );

        const { validators } = this.getValidators();
        this.validators = validators;

        await deployL1ContractsValues.l1Client.waitForTransactionReceipt({
          hash: await multiAdder.write.addValidators([
            this.validators.map(
              v =>
                ({
                  attester: v.attester.toString() as `0x${string}`,
                  withdrawer: v.withdrawer.toString() as `0x${string}`,
                }) as const,
            ),
          ]),
        });

        const timestamp = await cheatCodes.rollup.advanceToEpoch(2n);

        // Send and await a tx to make sure we mine a block for the warp to correctly progress.
        await this._sendDummyTx(deployL1ContractsValues.l1Client);

        // Set the system time in the node, only after we have warped the time and waited for a block
        // Time is only set in the NEXT block
        dateProvider.setTime(Number(timestamp) * 1000);
      },
    );
  }

  async setupAccount() {
    await this.snapshotManager.snapshot(
      'setup-account',
      deployAccounts(1, this.logger, false),
      async ({ deployedAccounts }, { pxe }) => {
        this.deployedAccounts = deployedAccounts;
        const [account] = deployedAccounts;
        this.wallet = await getSchnorrWalletWithSecretKey(pxe, account.secret, account.signingKey, account.salt);
      },
    );
  }

  async deploySpamContract() {
    await this.snapshotManager.snapshot(
      'add-spam-contract',
      async () => {
        if (!this.wallet) {
          throw new Error('Call snapshot t.setupAccount before deploying account contract');
        }

        const spamContract = await SpamContract.deploy(this.wallet).send().deployed();
        return { contractAddress: spamContract.address };
      },
      async ({ contractAddress }) => {
        if (!this.wallet) {
          throw new Error('Call snapshot t.setupAccount before deploying account contract');
        }
        this.spamContract = await SpamContract.at(contractAddress, this.wallet);
      },
    );
  }

  async removeInitialNode() {
    await this.snapshotManager.snapshot(
      'remove-inital-validator',
      async ({ deployL1ContractsValues, aztecNode, dateProvider }) => {
        // Send and await a tx to make sure we mine a block for the warp to correctly progress.
        const { receipt } = await this._sendDummyTx(deployL1ContractsValues.l1Client);
        const block = await deployL1ContractsValues.l1Client.getBlock({
          blockNumber: receipt.blockNumber,
        });
        dateProvider.setTime(Number(block.timestamp) * 1000);

        await aztecNode.stop();
      },
    );
  }

  async sendDummyTx() {
    return await this._sendDummyTx(this.ctx.deployL1ContractsValues.l1Client);
  }

  private async _sendDummyTx(l1Client: ExtendedViemWalletClient) {
    const l1TxUtils = new L1TxUtils(l1Client);
    return await l1TxUtils.sendAndMonitorTransaction({
      to: l1Client.account!.address,
      value: 1n,
    });
  }

  async setup() {
    this.ctx = await this.snapshotManager.setup();

    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = [...this.ctx.initialFundedAccounts.map(a => a.address), sponsoredFPCAddress];

    const { prefilledPublicData } = await getGenesisValues(initialFundedAccounts);
    this.prefilledPublicData = prefilledPublicData;

    this.monitor = new ChainMonitor(RollupContract.getFromL1ContractsValues(this.ctx.deployL1ContractsValues)).start();
    this.monitor.on('l1-block', ({ timestamp }) => this.ctx.dateProvider.setTime(Number(timestamp) * 1000));
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

  async teardown() {
    await this.monitor.stop();
    await tryStop(this.bootstrapNode, this.logger);
    await this.snapshotManager.teardown();
  }
}
