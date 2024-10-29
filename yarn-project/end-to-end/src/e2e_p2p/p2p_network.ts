import { type AztecNodeConfig, type AztecNodeService } from '@aztec/aztec-node';
import { EthCheatCodes } from '@aztec/aztec.js';
import { AZTEC_SLOT_DURATION, ETHEREUM_SLOT_DURATION, EthAddress } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { type BootstrapNode } from '@aztec/p2p';
import { createBootstrapNodeFromPrivateKey } from '@aztec/p2p/mocks';

import getPort from 'get-port';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createValidatorConfig,
  generateNodePrivateKeys,
  generatePeerIdPrivateKeys,
} from '../fixtures/setup_p2p_test.js';
import { type ISnapshotManager, type SubsystemsContext, createSnapshotManager } from '../fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';

// Use a fixed bootstrap node private key so that we can re-use the same snapshot and the nodes can find each other
const BOOTSTRAP_NODE_PRIVATE_KEY = '080212208f988fc0899e4a73a5aee4d271a5f20670603a756ad8d84f2c94263a6427c591';
export const WAIT_FOR_TX_TIMEOUT = AZTEC_SLOT_DURATION * 3;

export class P2PNetworkTest {
  private snapshotManager: ISnapshotManager;
  private baseAccount;

  public logger: DebugLogger;

  public ctx!: SubsystemsContext;
  public nodePrivateKeys: `0x${string}`[] = [];
  public peerIdPrivateKeys: string[] = [];

  public bootstrapNodeEnr: string = '';

  constructor(
    testName: string,
    public bootstrapNode: BootstrapNode,
    public bootNodePort: number,
    private numberOfNodes: number,
    initialValidatorAddress: string,
    initialValidatorConfig: AztecNodeConfig,
  ) {
    this.logger = createDebugLogger(`aztec:e2e_p2p:${testName}`);

    // Set up the base account and node private keys for the initial network deployment
    this.baseAccount = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    this.nodePrivateKeys = generateNodePrivateKeys(1, numberOfNodes);
    this.peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfNodes);

    this.bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    const initialValidators = [EthAddress.fromString(initialValidatorAddress)];

    this.snapshotManager = createSnapshotManager(`e2e_p2p_network/${testName}`, process.env.E2E_DATA_PATH, {
      ...initialValidatorConfig,
      l1BlockTime: ETHEREUM_SLOT_DURATION,
      salt: 420,
      initialValidators,
    });
  }

  static async create(testName: string, numberOfNodes: number, basePort?: number) {
    const port = basePort || (await getPort());

    const bootstrapNode = await createBootstrapNodeFromPrivateKey(BOOTSTRAP_NODE_PRIVATE_KEY, port);
    const bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    const initialValidatorConfig = await createValidatorConfig({} as AztecNodeConfig, bootstrapNodeEnr);
    const intiailValidatorAddress = privateKeyToAccount(initialValidatorConfig.publisherPrivateKey).address;

    return new P2PNetworkTest(
      testName,
      bootstrapNode,
      port,
      numberOfNodes,
      intiailValidatorAddress,
      initialValidatorConfig,
    );
  }

  async applyBaseSnapshots() {
    await this.snapshotManager.snapshot('add-validators', async ({ deployL1ContractsValues, aztecNodeConfig }) => {
      const rollup = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: deployL1ContractsValues.walletClient,
      });

      const txHashes: `0x${string}`[] = [];
      for (let i = 0; i < this.numberOfNodes; i++) {
        const account = privateKeyToAccount(this.nodePrivateKeys[i]!);
        const txHash = await rollup.write.addValidator([account.address]);
        txHashes.push(txHash);
        this.logger.debug(`Adding ${account.address} as validator`);
      }

      // Remove the setup validator
      const initialValidatorAddress = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`).address;
      const txHash = await rollup.write.removeValidator([initialValidatorAddress]);
      txHashes.push(txHash);

      // Wait for all the transactions adding validators to be mined
      await Promise.all(
        txHashes.map(txHash =>
          deployL1ContractsValues.publicClient.waitForTransactionReceipt({
            hash: txHash,
          }),
        ),
      );

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

  async setup() {
    this.ctx = await this.snapshotManager.setup();

    // TODO(md): make it such that the test can set these up
    this.ctx.aztecNodeConfig.minTxsPerBlock = 4;
    this.ctx.aztecNodeConfig.maxTxsPerBlock = 4;
  }

  async stopNodes(nodes: AztecNodeService[]) {
    this.logger.info('Stopping nodes');
    for (const node of nodes) {
      await node.stop();
    }
    await this.bootstrapNode.stop();
    this.logger.info('Nodes stopped');
  }

  async teardown() {
    await this.snapshotManager.teardown();
  }
}
