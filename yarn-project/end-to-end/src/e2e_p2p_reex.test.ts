import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeConfig, type AztecNodeService } from '@aztec/aztec-node';
import {
    AccountWalletWithSecretKey,
  CompleteAddress,
  type DebugLogger,
  type DeployL1Contracts,
  EthCheatCodes,
  Fr,
  GrumpkinScalar,
  type SentTx,
  TxStatus,
  sleep,
} from '@aztec/aztec.js';
import { ETHEREUM_SLOT_DURATION, EthAddress } from '@aztec/circuits.js';
import { RollupAbi } from '@aztec/l1-artifacts';
import { type BootstrapNode } from '@aztec/p2p';
import { type PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe';

import { jest } from '@jest/globals';
import fs from 'fs';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SpamContract, TokenContract } from '@aztec/noir-contracts.js';

import {
  createBootstrapNode,
  createNodes,
  generatePeerIdPrivateKey,
  generatePeerIdPrivateKeys,
} from './fixtures/setup_p2p_test.js';
import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';
import { createAccounts } from '@aztec/accounts/testing';
import { createDebugLogger } from '@aztec/foundation/log';
import { addAccounts, createSnapshotManager, ISnapshotManager, SubsystemsContext } from './fixtures/snapshot_manager.js';
import { getRandomPort } from '@aztec/foundation/testing';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 2;
const NUM_TXS_PER_BLOCK = 4;
const BOOT_NODE_UDP_PORT = 40400;

const PEER_ID_PRIVATE_KEYS = generatePeerIdPrivateKeys(NUM_NODES);

// const { E2E_DATA_PATH: dataPath } = process.env;
const dataPath = "./data-e2e_p2p_reex";

class ReExTest {
  private snapshotManager: ISnapshotManager;
  private logger: DebugLogger;
  private accounts: CompleteAddress[] = [];

  constructor(testName: string) {
    this.logger = createDebugLogger(`aztec:e2e_p2p_reex:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_p2p_reex/${testName}`, dataPath);
  }

  async applyBaseSnapshot() {
    await this.snapshotManager.snapshot("register validators", async () => {



    } )
  }
}

// TODO: really need to setup a snapshot for this
describe('e2e_p2p_network', () => {
  let ctx: SubsystemsContext;
  let logger: DebugLogger;
  let teardown: () => Promise<void>;
  let bootstrapNode: BootstrapNode;
  let bootstrapNodeEnr: string;
  let wallet: AccountWalletWithSecretKey;

  let snapshotManager: ISnapshotManager;

  let spam: SpamContract;

  beforeEach(async () => {
    logger = createDebugLogger('aztec:e2e_p2p_reex');

    bootstrapNode = await createBootstrapNode(BOOT_NODE_UDP_PORT);
    bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    // Put the original node on the bootstrap list so that it transactions we send to it are gossiped to other nodes
    const port = await getRandomPort() || BOOT_NODE_UDP_PORT - 1;
    const peerIdPrivateKey = generatePeerIdPrivateKey();
    const bootstrapConfig = {
      p2pEnabled: true,
      bootstrapNodes: [bootstrapNodeEnr],
      peerIdPrivateKey,
      udpListenAddress: `0.0.0.0:${port}`,
      tcpListenAddress: `0.0.0.0:${port}`,
      tcpAnnounceAddress: `127.0.0.1:${port}`,
      udpAnnounceAddress: `127.0.0.1:${port}`,
    };

    const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    const initialValidators = [EthAddress.fromString(account.address)];
    // If we give the initial node a bootstrap node, then we can attempt to connect through it

    snapshotManager = createSnapshotManager(`e2e_p2p_reex`, dataPath, bootstrapConfig, {
      assumeProvenThrough: undefined,
      initialValidators,
    });

    await snapshotManager.snapshot("setup-account", addAccounts(1, logger, false), async ({accountKeys}, ctx) => {
      const accountManagers = accountKeys.map(ak => getSchnorrAccount(ctx.pxe, ak[0], ak[1], 1));
      await Promise.all(accountManagers.map(a => a.register()));
      const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
      wallet = wallets[0];
    });

    await snapshotManager.snapshot("add-spam-contract", async () => {
      const spamContract = await SpamContract.deploy(wallet).send().deployed();
      return {contractAddress: spamContract.address};
    }, async ({contractAddress}) => {
      spam = await SpamContract.at(contractAddress, wallet);
    });

    // await snapshotManager.snapshot(
    //   "Add Nodes as validators",
      // async ({deployL1ContractsValues}) => {
        // const rollup = getContract({
        //   address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        //   abi: RollupAbi,
        //   client: deployL1ContractsValues.walletClient,
        // });

        // As a snapshot gets sent before hand, our account nonce may have increased.
        // const nonce = await deployL1ContractsValues.publicClient.getTransactionCount({ address:  });
        // const senderAddress = deployL1ContractsValues.walletClient.account.address;
        // const nonce = await deployL1ContractsValues.publicClient.getTransactionCount({ address: senderAddress });
        // for (let i = 0; i < NUM_NODES; i++) {
        //   const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(i + 1)!.toString('hex')}`);
        //   // await rollup.write.addValidator([account.address], { nonce: nonce + i });
        //   // console.log("nonce", nonce + i);
        //   await rollup.write.addValidator([account.address]);
        // }
      // }
      // No need to do anything after setup is complete
    // )

    ctx = await snapshotManager.setup();

    // TODO: could i setup this timejump?
    //@note   Now we jump ahead to the next epoch such that the validator committee is picked
    //        INTERVAL MINING: If we are using anvil interval mining this will NOT progress the time!
    //        Which means that the validator set will still be empty! So anyone can propose.
    const rollup = getContract({
      address: ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: ctx.deployL1ContractsValues.walletClient,
    });

    // TODO(md): we want this also in a snapshot but i am having nonce issues
    for (let i = 0; i < NUM_NODES; i++) {
      const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(i + 1)!.toString('hex')}`);
      // await rollup.write.addValidator([account.address], { nonce: nonce + i });
      // console.log("nonce", nonce + i);
      await rollup.write.addValidator([account.address]);
    }


    ctx.aztecNodeConfig.minTxsPerBlock = 1;
    ctx.aztecNodeConfig.maxTxsPerBlock = NUM_TXS_PER_BLOCK; //

    const slotsInEpoch = await rollup.read.EPOCH_DURATION();
    const timestamp = await rollup.read.getTimestampForSlot([slotsInEpoch]);
    const cheatCodes = new EthCheatCodes(ctx.aztecNodeConfig.l1RpcUrl);
    try {
      await cheatCodes.warp(Number(timestamp));
    } catch (err) {
      logger.debug('Warp failed, time already satisfied');
    }

    // Send and await a tx to make sure we mine a block for the warp to correctly progress.
    await ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({
      hash: await ctx.deployL1ContractsValues.walletClient.sendTransaction({ to: account.address, value: 1n, account }),
    });


  });

  const stopNodes = async (bootstrap: BootstrapNode, nodes: AztecNodeService[]) => {
    for (const node of nodes) {
      await node.stop();
    }
    await bootstrap.stop();
  };

  afterEach(() => teardown());

  afterAll(() => {
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`./data-${i}`, { recursive: true, force: true });
    }
  });

  it.only('should rollup txs from all peers with re-execution', async () => {
    // create the bootstrap node for the network
    if (!bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    ctx.aztecNodeConfig.validatorReEx = true;

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.

    const nodes: AztecNodeService[] = await createNodes(
      ctx.aztecNodeConfig,
      PEER_ID_PRIVATE_KEYS,
      bootstrapNodeEnr,
        NUM_NODES,
        BOOT_NODE_UDP_PORT,
      );


    console.log("writing nodes ", nodes.length);
    for (const node of nodes) {
      const enr = await node.getEncodedEnr();
      console.log("node enr", enr?.toString());
    }


    // spam = await SpamContract.deploy(wallet).send().deployed();

    // wait a bit for peers to discover each other
    await sleep(4000);

    // tODO: use a tx with nested calls
    const txs = await submitTxsTo(NUM_TXS_PER_BLOCK);
    nodes.forEach(node => {
      node.getSequencer()?.updateSequencerConfig( {
        minTxsPerBlock: NUM_TXS_PER_BLOCK,
        maxTxsPerBlock: NUM_TXS_PER_BLOCK,
      });
    });

    // now ensure that all txs were successfully mined
    await Promise.all(
      txs.map(async (tx, i) => {
          logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
    );

    // shutdown all nodes.
    await stopNodes(bootstrapNode, nodes);
  });

  // submits a set of transactions to the provided Private eXecution Environment (PXE)
  const submitTxsTo = async (numTxs: number) => {
    const txs: SentTx[] = [];

    const seed = 1234n
    const spamCount = 15
    for (let i = 0; i < numTxs; i++) {
      // TODO: check out batch call for deployments

      // Send a public mint tx - this will be minted from the token contract to the pxe account
      // const tx = token.methods.mint_public(accountManager.getCompleteAddress().address, 1n).send()
      const tx = spam.methods.spam(seed + BigInt(i * spamCount), spamCount, false, true ).send()
      const txHash = await tx.getTxHash();

      logger.info(`Tx sent with hash ${txHash}`);
      const receipt = await tx.getReceipt();
      expect(receipt).toEqual(
        expect.objectContaining({
          status: TxStatus.PENDING,
          error: '',
        }),
      );
      logger.info(`Receipt received for ${txHash}`);
      txs.push(tx);
    }
    return txs;
  };
});
