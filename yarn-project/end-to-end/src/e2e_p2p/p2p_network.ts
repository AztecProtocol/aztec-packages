import { type AztecNodeConfig, type AztecNodeService } from '@aztec/aztec-node';
import { AccountWalletWithSecretKey, EthCheatCodes } from '@aztec/aztec.js';
import { ETHEREUM_SLOT_DURATION, EthAddress } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { BootnodeConfig, createLibP2PPeerId, type BootstrapNode } from '@aztec/p2p';

import getPort from 'get-port';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createBootstrapNode,
  createBootstrapNodeConfig,
  createBootstrapNodeConfigFromPrivateKey,
  createBootstrapNodeFromConfig,
  createBootstrapNodeFromPrivateKey,
  createValidatorConfig,
  generateNodePrivateKeys,
  generatePeerIdPrivateKeys,
} from '../fixtures/setup_p2p_test.js';
import { type ISnapshotManager, type SubsystemsContext, addAccounts, createSnapshotManager } from '../fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { SpamContract } from '@aztec/noir-contracts.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';

export class P2PNetworkTest {
  private snapshotManager: ISnapshotManager;
  private baseAccount;

  public logger: DebugLogger;

  public ctx!: SubsystemsContext;
  public nodePrivateKeys: `0x${string}`[] = [];
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

  static async create(testName: string, numberOfNodes: number, basePort?: number, baseBootnodePrivateKey?: Uint8Array) {
    const port = basePort || (await getPort());
    const bootnodePrivateKey = baseBootnodePrivateKey || ( await  createLibP2PPeerId()).privateKey!;

    const bootstrapNode = await createBootstrapNodeFromPrivateKey(bootnodePrivateKey, port);
    const bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    const initialValidatorConfig = await createValidatorConfig({} as AztecNodeConfig, bootstrapNodeEnr);
    const intiailValidatorAddress = privateKeyToAccount(initialValidatorConfig.publisherPrivateKey).address;

    return new P2PNetworkTest(
      testName,
      // TODO: clean up all of this bootnode stuff
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

      this.logger.verbose(`Adding ${this.numberOfNodes} validators`);

      const txHashes: `0x${string}`[] = [];
      for (let i = 0; i < this.numberOfNodes; i++) {
        const account = privateKeyToAccount(this.nodePrivateKeys[i]!);
        const txHash = await rollup.write.addValidator([account.address]);
        txHashes.push(txHash);

        this.logger.verbose(`Adding ${account.address} as validator`);
        console.log("Added validator", account.address);
      }
      await Promise.all(txHashes.map(txHash => deployL1ContractsValues.publicClient.waitForTransactionReceipt({
        hash: txHash
      })));


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
      await this.snapshotManager.snapshot("setup-account", addAccounts(1, this.logger, false), async ({accountKeys}, ctx) => {
        const accountManagers = accountKeys.map(ak => getSchnorrAccount(ctx.pxe, ak[0], ak[1], 1));
      await Promise.all(accountManagers.map(a => a.register()));
      const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
      this.wallet = wallets[0];
    });
  }

  async deploySpamContract() {
    await this.snapshotManager.snapshot("add-spam-contract", async () => {
      if (!this.wallet) {
        throw new Error('Call snapshot t.setupAccount before deploying account contract');
      }

      const spamContract = await SpamContract.deploy(this.wallet).send().deployed();
      return {contractAddress: spamContract.address};
    }, async ({contractAddress}) => {
      if (!this.wallet) {
        throw new Error('Call snapshot t.setupAccount before deploying account contract');
      }
      this.spamContract = await SpamContract.at(contractAddress, this.wallet);
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
