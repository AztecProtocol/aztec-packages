import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeConfig, type AztecNodeService } from '@aztec/aztec-node';
import { type AccountWalletWithSecretKey, EthCheatCodes } from '@aztec/aztec.js';
import { MINIMUM_STAKE, getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { SpamContract } from '@aztec/noir-contracts.js';
import { type BootstrapNode } from '@aztec/p2p';
import { createBootstrapNodeFromPrivateKey } from '@aztec/p2p/mocks';

import getPort from 'get-port';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  PROPOSER_PRIVATE_KEYS_START_INDEX,
  createValidatorConfig,
  generatePrivateKeys,
} from '../fixtures/setup_p2p_test.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  addAccounts,
  createSnapshotManager,
} from '../fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { getEndToEndTestTelemetryClient } from '../fixtures/with_telemetry_utils.js';

// Use a fixed bootstrap node private key so that we can re-use the same snapshot and the nodes can find each other
const BOOTSTRAP_NODE_PRIVATE_KEY = '080212208f988fc0899e4a73a5aee4d271a5f20670603a756ad8d84f2c94263a6427c591';
const l1ContractsConfig = getL1ContractsConfigEnvVars();
export const WAIT_FOR_TX_TIMEOUT = l1ContractsConfig.aztecSlotDuration * 3;

export class P2PNetworkTest {
  private snapshotManager: ISnapshotManager;
  private baseAccount;

  public logger: DebugLogger;

  public ctx!: SubsystemsContext;
  public attesterPrivateKeys: `0x${string}`[] = [];
  public attesterPublicKeys: string[] = [];
  public proposerPrivateKeys: `0x${string}`[] = [];
  public peerIdPrivateKeys: string[] = [];

  public bootstrapNodeEnr: string = '';

  // The re-execution test needs a wallet and a spam contract
  public wallet?: AccountWalletWithSecretKey;
  public spamContract?: SpamContract;

  constructor(
    testName: string,
    public bootstrapNode: BootstrapNode,
    public bootNodePort: number,
    private numberOfNodes: number,
    initialValidatorConfig: AztecNodeConfig,
    // If set enable metrics collection
    metricsPort?: number,
  ) {
    this.logger = createDebugLogger(`aztec:e2e_p2p:${testName}`);

    // Set up the base account and node private keys for the initial network deployment
    this.baseAccount = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    this.proposerPrivateKeys = generatePrivateKeys(PROPOSER_PRIVATE_KEYS_START_INDEX, numberOfNodes);
    this.attesterPrivateKeys = generatePrivateKeys(ATTESTER_PRIVATE_KEYS_START_INDEX, numberOfNodes);
    this.attesterPublicKeys = this.attesterPrivateKeys.map(privateKey => privateKeyToAccount(privateKey).address);

    this.bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    this.snapshotManager = createSnapshotManager(`e2e_p2p_network/${testName}`, process.env.E2E_DATA_PATH, {
      ...initialValidatorConfig,
      ethereumSlotDuration: l1ContractsConfig.ethereumSlotDuration,
      salt: 420,
      metricsPort: metricsPort,
    });
  }

  static async create({
    testName,
    numberOfNodes,
    basePort,
    metricsPort,
  }: {
    testName: string;
    numberOfNodes: number;
    basePort?: number;
    metricsPort?: number;
  }) {
    const port = basePort || (await getPort());

    const telemetry = await getEndToEndTestTelemetryClient(metricsPort, /*service name*/ `bootstrapnode`);
    const bootstrapNode = await createBootstrapNodeFromPrivateKey(BOOTSTRAP_NODE_PRIVATE_KEY, port, telemetry);
    const bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    const initialValidatorConfig = await createValidatorConfig({} as AztecNodeConfig, bootstrapNodeEnr);

    return new P2PNetworkTest(testName, bootstrapNode, port, numberOfNodes, initialValidatorConfig);
  }

  async applyBaseSnapshots() {
    await this.snapshotManager.snapshot('add-validators', async ({ deployL1ContractsValues, aztecNodeConfig }) => {
      const rollup = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: deployL1ContractsValues.walletClient,
      });

      this.logger.verbose(`Adding ${this.numberOfNodes} validators`);

      const stakingAsset = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
        abi: TestERC20Abi,
        client: deployL1ContractsValues.walletClient,
      });

      const stakeNeeded = MINIMUM_STAKE * BigInt(this.numberOfNodes);
      await Promise.all(
        [
          await stakingAsset.write.mint([deployL1ContractsValues.walletClient.account.address, stakeNeeded], {} as any),
          await stakingAsset.write.approve(
            [deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(), stakeNeeded],
            {} as any,
          ),
        ].map(txHash => deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: txHash })),
      );

      const validators = [];

      for (let i = 0; i < this.numberOfNodes; i++) {
        const attester = privateKeyToAccount(this.attesterPrivateKeys[i]!);
        const proposer = privateKeyToAccount(this.proposerPrivateKeys[i]!);
        validators.push({
          attester: attester.address,
          proposer: proposer.address,
          withdrawer: attester.address,
          amount: MINIMUM_STAKE,
        } as const);

        this.logger.verbose(
          `Adding (attester, proposer) pair: (${attester.address}, ${proposer.address}) as validator`,
        );
      }

      await deployL1ContractsValues.publicClient.waitForTransactionReceipt({
        hash: await rollup.write.cheat__InitialiseValidatorSet([validators]),
      });

      //@note   Now we jump ahead to the next epoch such that the validator committee is picked
      //        INTERVAL MINING: If we are using anvil interval mining this will NOT progress the time!
      //        Which means that the validator set will still be empty! So anyone can propose.
      const slotsInEpoch = await rollup.read.EPOCH_DURATION();
      const timestamp = await rollup.read.getTimestampForSlot([slotsInEpoch]);
      const cheatCodes = new EthCheatCodes(aztecNodeConfig.l1RpcUrl);
      try {
        await cheatCodes.warp(Number(timestamp));
      } catch (err) {
        this.logger.debug('Warp failed, time already satisfied');
      }

      // Send and await a tx to make sure we mine a block for the warp to correctly progress.
      await deployL1ContractsValues.publicClient.waitForTransactionReceipt({
        hash: await deployL1ContractsValues.walletClient.sendTransaction({
          to: this.baseAccount.address,
          value: 1n,
          account: this.baseAccount,
        }),
      });
    });
  }

  async setupAccount() {
    await this.snapshotManager.snapshot(
      'setup-account',
      addAccounts(1, this.logger, false),
      async ({ accountKeys }, ctx) => {
        const accountManagers = accountKeys.map(ak => getSchnorrAccount(ctx.pxe, ak[0], ak[1], 1));
        await Promise.all(accountManagers.map(a => a.register()));
        const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
        this.wallet = wallets[0];
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
    await this.snapshotManager.snapshot('remove-inital-validator', async () => {
      await this.ctx.aztecNode.stop();
    });
  }

  async setup() {
    this.ctx = await this.snapshotManager.setup();
  }

  async stopNodes(nodes: AztecNodeService[]) {
    this.logger.info('Stopping nodes');

    if (!nodes || !nodes.length) {
      this.logger.info('No nodes to stop');
      return;
    }

    for (const node of nodes) {
      await node.stop();
    }
    this.logger.info('Nodes stopped');
  }

  async teardown() {
    await this.bootstrapNode.stop();
    await this.snapshotManager.teardown();
  }
}
